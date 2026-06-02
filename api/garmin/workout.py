"""Push a structured workout to Garmin Connect and schedule it on the watch.

POST /api/garmin/workout?athlete=mike

Body (built by the frontend from a PlannedWorkout — see
src/engines/planGenerator/garminWorkout.ts):

    {
      "name": "Tempo 4mi",
      "sport": "running",            // running | cycling | strength | cardio
      "scheduleDate": "2026-06-03",  // ISO; optional
      "estimatedDurationSecs": 2700,
      "steps": [
        { "stepType": "warmup|interval|recovery|cooldown",
          "endCondition": { "type": "time|distance|lap.button", "value": 600 },
          "target": { "type": "pace|heart.rate|open", "low": .., "high": .. },
          "repeat": { "count": 5, "steps": [ ... ] },
          "description": "optional" }
      ]
    }

"Push to watch" = create the workout in Garmin Connect, then (when a
scheduleDate is given) schedule it on the calendar so the watch surfaces it as
that day's workout on its next sync.

The Garmin Connect workout-service is undocumented; the IDs below are the
canonical values its own web app uses. Run-family workouts get full structured
fidelity (pace/HR targets, distance/time steps, repeats). Strength and cardio
degrade to timed steps — Garmin's workout API can't represent reps — and their
sport IDs are best-effort.
"""

import json
from http.server import BaseHTTPRequestHandler
from ._session import get_client, get_athlete_from_query, GarminSessionExpired

# ─── Garmin Connect workout-service constants ──────────────────────
# (id, key) tuples matching the JSON the Garmin web app posts.
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

# Workout-service sportType ids. running/cycling are reliable; strength/cardio
# are best-effort (degraded fidelity was accepted for non-run workouts).
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


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        try:
            athlete = get_athlete_from_query(self.path)

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
            created = client.connectapi(_WORKOUT_URL, method="POST", json=workout_dict)
            workout_id = (created or {}).get("workoutId")
            if not workout_id:
                self._send_json(502, {"error": "Garmin did not return a workout id.", "garmin": created})
                return

            scheduled = False
            schedule_date = body.get("scheduleDate")
            if schedule_date:
                client.connectapi(
                    f"{_SCHEDULE_URL}/{workout_id}",
                    method="POST",
                    json={"date": schedule_date},
                )
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
