"""Garmin activities endpoint.

GET /api/garmin/activities?start=YYYY-MM-DD&end=YYYY-MM-DD&athlete=mike
- Fetches activities with HR, elevation, and type data for TRIMP calculation
- Uses per-athlete session from Upstash KV

POST /api/garmin/activities?athlete=mike
- Pushes a structured workout to Garmin Connect and (when scheduleDate is
  given) schedules it on the calendar so the watch surfaces it on next sync.
- Co-located here rather than in its own file because the Vercel Hobby plan
  caps a deployment at 12 serverless functions and the API is already at the
  limit; "push a workout" is activity-adjacent enough to share this endpoint.
- Body shape is built by src/engines/planGenerator/garminWorkout.ts.

AUTH: every method requires `Authorization: Bearer <session-jwt>`. The
athlete is the token's subject, not the `athlete` query parameter — that
parameter is now a request, honoured only for the admin account and
otherwise ignored in favour of the caller's own id. See
`athlete_for_request` in ._session.
"""

import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from ._session import get_client, athlete_for_request, GarminSessionExpired


def _meters_to_feet(meters: float) -> float:
    return meters * 3.28084


# ─── Garmin Connect workout-service constants ──────────────────────
# (id, key) tuples matching the JSON the Garmin web app posts. Run-family
# workouts get full structured fidelity (pace/HR targets, time/distance steps,
# repeats); strength/cardio degrade to timed steps — Garmin's workout API can't
# represent reps — and their sport ids are best-effort.
_STEP_TYPE = {
    "warmup": (1, "warmup"),
    "cooldown": (2, "cooldown"),
    "interval": (3, "interval"),
    "recovery": (4, "recovery"),
    "rest": (5, "rest"),
}
_END_CONDITION = {
    "lap.button": (1, "lap.button"),
    "time": (2, "time"),
    "distance": (3, "distance"),
}
_ITERATIONS_CONDITION = (7, "iterations")
_REPEAT_STEP = (6, "repeat")

_TARGET_NO = (1, "no.target")
_TARGET_HR = (4, "heart.rate.zone")
_TARGET_PACE = (6, "pace.zone")

_SPORT_TYPE = {
    "running": (1, "running"),
    "cycling": (2, "cycling"),
    "strength": (5, "strength_training"),
    "cardio": (8, "cardio_training"),
}

_WORKOUT_URL = "/workout-service/workout"
_SCHEDULE_URL = "/workout-service/schedule"  # POST {SCHEDULE_URL}/{workoutId}


def _sport_dict(sport):
    sid, skey = _SPORT_TYPE.get(sport, _SPORT_TYPE["running"])
    return {"sportTypeId": sid, "sportTypeKey": skey, "displayOrder": sid}


def _target_dict(target):
    """Translate our {type, low, high} target into a Garmin target block.

    Pace bounds arrive as seconds-per-meter; Garmin's pace.zone wants speed in
    meters-per-second. Anything unparseable degrades to no.target so a single
    bad target never fails the whole upload.
    """
    base = {"targetValueOne": None, "targetValueTwo": None, "zoneNumber": None}
    if not target:
        tid, tkey = _TARGET_NO
        base["targetType"] = {"workoutTargetTypeId": tid, "workoutTargetTypeKey": tkey, "displayOrder": tid}
        return base

    ttype = target.get("type")
    low = target.get("low")
    high = target.get("high")

    if ttype == "heart.rate" and low is not None and high is not None:
        tid, tkey = _TARGET_HR
        base["targetValueOne"] = min(low, high)
        base["targetValueTwo"] = max(low, high)
    elif ttype == "pace" and low and high:
        # sec/m → m/s, then order low→high speed.
        s1, s2 = 1.0 / low, 1.0 / high
        tid, tkey = _TARGET_PACE
        base["targetValueOne"] = min(s1, s2)
        base["targetValueTwo"] = max(s1, s2)
    else:
        tid, tkey = _TARGET_NO

    base["targetType"] = {"workoutTargetTypeId": tid, "workoutTargetTypeKey": tkey, "displayOrder": tid}
    return base


def _executable_step(step, order):
    st_id, st_key = _STEP_TYPE.get(step.get("stepType"), _STEP_TYPE["interval"])
    ec = step.get("endCondition") or {"type": "lap.button"}
    ec_id, ec_key = _END_CONDITION.get(ec.get("type"), _END_CONDITION["lap.button"])

    out = {
        "type": "ExecutableStepDTO",
        "stepOrder": order,
        "stepType": {"stepTypeId": st_id, "stepTypeKey": st_key, "displayOrder": st_id},
        "endCondition": {"conditionTypeId": ec_id, "conditionTypeKey": ec_key, "displayable": True},
        "endConditionValue": ec.get("value"),
        "description": step.get("description"),
    }
    out.update(_target_dict(step.get("target")))
    return out


def _build_steps(steps, counter):
    """Flatten our step list into Garmin step DTOs, assigning a unique,
    monotonically increasing stepOrder across nested repeat children."""
    built = []
    for step in steps:
        repeat = step.get("repeat")
        if repeat and repeat.get("steps"):
            counter[0] += 1
            group_order = counter[0]
            children = _build_steps(repeat["steps"], counter)
            cond_id, cond_key = _ITERATIONS_CONDITION
            rep_id, rep_key = _REPEAT_STEP
            built.append({
                "type": "RepeatGroupDTO",
                "stepOrder": group_order,
                "stepType": {"stepTypeId": rep_id, "stepTypeKey": rep_key, "displayOrder": rep_id},
                "numberOfIterations": repeat.get("count", 1),
                "smartRepeat": False,
                "endCondition": {"conditionTypeId": cond_id, "conditionTypeKey": cond_key, "displayable": False},
                "endConditionValue": float(repeat.get("count", 1)),
                "workoutSteps": children,
            })
        else:
            counter[0] += 1
            built.append(_executable_step(step, counter[0]))
    return built


def _build_workout(body):
    sport = body.get("sport", "running")
    sport_dict = _sport_dict(sport)
    steps = _build_steps(body.get("steps") or [], [0])

    return {
        "sportType": sport_dict,
        "workoutName": body.get("name") or "Broken Arrow Workout",
        "estimatedDurationInSecs": body.get("estimatedDurationSecs"),
        "workoutSegments": [{
            "segmentOrder": 1,
            "sportType": sport_dict,
            "workoutSteps": steps,
        }],
    }


def _post_json(client, path, payload):
    """POST a JSON body to a Connect path and return the parsed JSON (or None).

    Mirrors how garminconnect's own write methods (add_weigh_in,
    set_blood_pressure) issue POSTs: the bundled HTTP client's
    post(subdomain, path, json=...). `client.client` is that HTTP client
    (same object _session.py serializes via client.client.dumps()).
    """
    resp = client.client.post("connectapi", path, json=payload)
    if resp is None:
        return None
    try:
        return resp.json()
    except Exception:
        return None


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        try:
            ok, status, err, athlete = athlete_for_request(self)
            if not ok:
                self._send_json(status, {"error": err})
                return

            query = parse_qs(urlparse(self.path).query)
            start = query.get("start", [None])[0]
            end = query.get("end", [None])[0]

            if not start or not end:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({
                    "error": "start and end query parameters required (YYYY-MM-DD)",
                }).encode())
                return

            client = get_client(athlete)
            raw_activities = client.get_activities_by_date(start, end)

            activities = []
            for act in (raw_activities or []):
                activity_type = (act.get("activityType", {}).get("typeKey", "other")
                                 if isinstance(act.get("activityType"), dict)
                                 else str(act.get("activityType", "other")))

                duration_seconds = act.get("duration") or 0
                avg_hr = act.get("averageHR", None)
                max_hr = act.get("maxHR", None)
                elevation_m = act.get("elevationGain", 0) or 0
                distance_m = act.get("distance", 0) or 0
                training_effect = act.get("aerobicTrainingEffect", None)
                start_local = act.get("startTimeLocal", "")

                date_str = ""
                if start_local:
                    try:
                        date_str = start_local[:10]
                    except Exception:
                        date_str = ""

                activities.append({
                    "date": date_str,
                    "activityId": act.get("activityId"),
                    "type": activity_type,
                    "name": act.get("activityName", "Activity"),
                    "durationMinutes": round(duration_seconds / 60, 1),
                    "avgHR": avg_hr,
                    "maxHR": max_hr,
                    "elevationGainFt": round(_meters_to_feet(elevation_m), 0),
                    "distanceMi": round(distance_m / 1609.344, 2) if distance_m else 0,
                    "trainingEffect": training_effect,
                    "anaerobicTrainingEffect": act.get("anaerobicTrainingEffect"),
                    "activityTrainingLoad": act.get("activityTrainingLoad"),
                    "calories": act.get("calories"),
                    "vigorousIntensityMinutes": act.get("vigorousIntensityMinutes"),
                    "moderateIntensityMinutes": act.get("moderateIntensityMinutes"),
                    "avgPowerW": act.get("averagePower"),
                    "normalizedPowerW": act.get("normalizedPower"),
                })

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"activities": activities}).encode())

        except GarminSessionExpired:
            self.send_response(401)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "error": "Garmin session expired. Please reconnect your Garmin account.",
                "reauth": True,
            }).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "error": f"Failed to fetch activities: {str(e)}",
            }).encode())

    def do_POST(self):
        """Push a structured workout to Garmin Connect and schedule it on the
        planned date so the watch surfaces it as that day's workout on the
        next sync."""
        try:
            ok, status, err, athlete = athlete_for_request(self)
            if not ok:
                self._send_json(status, {"error": err})
                return

            content_length = int(self.headers.get("Content-Length", 0))
            body = {}
            if content_length > 0:
                raw = self.rfile.read(content_length)
                body = json.loads(raw.decode())

            if not body.get("steps"):
                self._send_json(400, {"error": "Workout must include at least one step."})
                return

            client = get_client(athlete)  # raises GarminSessionExpired

            workout_dict = _build_workout(body)
            # POST via the bundled HTTP client's `post` (signature:
            # post(subdomain, path, json=...)). The garminconnect client's
            # connectapi() helper is GET-only — passing method="POST" collides
            # with its internal call ("got multiple values for argument
            # 'method'"). This raw POST also keeps the function free of the
            # pydantic [workout] extra while giving full control over targets.
            created = _post_json(client, _WORKOUT_URL, workout_dict)
            workout_id = (created or {}).get("workoutId")
            if not workout_id:
                self._send_json(502, {"error": "Garmin did not return a workout id.", "garmin": created})
                return

            scheduled = False
            schedule_date = body.get("scheduleDate")
            if schedule_date:
                _post_json(client, f"{_SCHEDULE_URL}/{workout_id}", {"date": schedule_date})
                scheduled = True

            self._send_json(200, {
                "success": True,
                "workoutId": workout_id,
                "scheduled": scheduled,
            })

        except GarminSessionExpired:
            self._send_json(401, {
                "error": "Garmin session expired. Please reconnect your Garmin account.",
                "reauth": True,
            })
        except Exception as e:  # noqa: BLE001 — surface a clean error to the UI
            self._send_json(500, {"error": f"Failed to push workout to Garmin: {str(e)}"})

    def _send_json(self, status: int, data: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
