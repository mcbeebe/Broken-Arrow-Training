"""Garmin activity endpoint — detail (by date) + stream (by activityId).

Both modes are served by this single handler to stay under the Vercel
Hobby plan's 12-function cap. The mode is determined by which query
param is present:

GET /api/garmin/activity_detail?date=YYYY-MM-DD&athlete=mike
  Returns full raw activity data for all activities on a given date
  (HR zones, training effect, splits, exercise sets).

GET /api/garmin/activity_detail?activityId=<id>&athlete=mike
  Returns per-second time-series data for a single activity — HR,
  pace/speed, elevation, distance, cadence — in the same shape as
  Strava's StreamData so HRChart can render it unchanged.

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


# ─── Stream mode (per-second time series) ─────────────────────────

# Garmin metric keys → our StreamData field names. (Garmin sometimes
# nests the key under .key.key; we try a couple paths.)
METRIC_KEY_MAP = {
    "directHeartRate": "heartrate",
    "directSpeed": "velocity",           # m/s
    "directElevation": "altitude",       # m
    "sumElapsedDuration": "time",        # seconds from start
    "sumDuration": "time",               # fallback
    "sumDistance": "distance",           # m
    "directRunCadence": "cadence",       # strides/min
    "directBikeCadence": "cadence",
}


def _metric_key(descriptor):
    """Extract the key string from a metricDescriptor, which may be
    either { key: 'directHeartRate' } or { key: { key: 'directHeartRate' }}."""
    k = descriptor.get("key")
    if isinstance(k, str):
        return k
    if isinstance(k, dict):
        return k.get("key") or ""
    return ""


def _safe_get(func, *args):
    try:
        return func(*args)
    except Exception as e:
        return f"ERROR: {e}"


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        try:
            query = parse_qs(urlparse(self.path).query)
            activity_id = query.get("activityId", [None])[0]
            date_str = query.get("date", [None])[0]

            ok, status, err, athlete = athlete_for_request(self)
            if not ok:
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": err}).encode())
                return

            if activity_id:
                return self._handle_stream(activity_id, athlete)
            if date_str:
                return self._handle_detail(date_str, athlete)

            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(
                {"error": "activityId or date parameter required"}
            ).encode())
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
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def _handle_stream(self, activity_id: str, athlete: str):
        client = get_client(athlete)

        # maxchart controls sample resolution. 2000 is Garmin's default
        # and gives ~1s resolution for a typical 30-60 min workout.
        details = client.get_activity_details(
            activity_id,
            maxchart=2000,
            maxpoly=4000,
        )

        descriptors = details.get("metricDescriptors", []) or []
        rows = details.get("activityDetailMetrics", []) or []

        slot_for_field: dict[str, int] = {}
        for desc in descriptors:
            idx = desc.get("metricsIndex")
            key = _metric_key(desc)
            if idx is None or not key:
                continue
            target = METRIC_KEY_MAP.get(key)
            if target and target not in slot_for_field:
                slot_for_field[target] = idx

        out = {
            "time": [],
            "heartrate": [],
            "distance": [],
            "altitude": [],
            "velocity": [],
            "cadence": [],
        }

        for row in rows:
            metrics = row.get("metrics") or []
            for field, idx in slot_for_field.items():
                if idx < len(metrics):
                    val = metrics[idx]
                    out[field].append(0 if val is None else val)
                else:
                    out[field].append(0)

        if not out["time"] and rows:
            out["time"] = list(range(len(rows)))

        if out["time"]:
            t0 = out["time"][0]
            out["time"] = [int(round(t - t0)) for t in out["time"]]

        out["heartrate"] = [int(round(v)) if v else 0 for v in out["heartrate"]]
        out["cadence"] = [int(round(v)) if v else 0 for v in out["cadence"]]

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "public, max-age=86400")
        self.end_headers()
        self.wfile.write(json.dumps({
            "activityId": activity_id,
            "sampleCount": len(rows),
            "stream": out,
        }).encode())

    def _handle_detail(self, date_str: str, athlete: str):
        client = get_client(athlete)

        raw_activities = client.get_activities_by_date(date_str, date_str) or []

        activities = []
        for act in raw_activities:
            activity_id = act.get("activityId")
            activity_type = (act.get("activityType", {}).get("typeKey", "other")
                            if isinstance(act.get("activityType"), dict)
                            else str(act.get("activityType", "other")))

            detail = {
                "activityId": activity_id,
                "name": act.get("activityName", "Activity"),
                "type": activity_type,
                "startTimeLocal": act.get("startTimeLocal", ""),
                "startTimeGMT": act.get("startTimeGMT", ""),

                "durationSeconds": act.get("duration") or 0,
                "elapsedDurationSeconds": act.get("elapsedDuration") or 0,
                "movingDurationSeconds": act.get("movingDuration") or 0,

                "averageHR": act.get("averageHR"),
                "maxHR": act.get("maxHR"),

                "distanceMeters": act.get("distance") or 0,
                "elevationGainMeters": act.get("elevationGain") or 0,
                "elevationLossMeters": act.get("elevationLoss") or 0,

                "aerobicTrainingEffect": act.get("aerobicTrainingEffect"),
                "anaerobicTrainingEffect": act.get("anaerobicTrainingEffect"),
                "trainingEffectLabel": act.get("trainingEffectLabel"),
                "activityTrainingLoad": act.get("activityTrainingLoad"),

                "calories": act.get("calories") or 0,
                "bmrCalories": act.get("bmrCalories") or 0,
                "activeCalories": act.get("activeDuration") or 0,

                "averageSpeed": act.get("averageSpeed"),
                "maxSpeed": act.get("maxSpeed"),

                "vO2MaxValue": act.get("vO2MaxValue"),
                "moderateIntensityMinutes": act.get("moderateIntensityMinutes"),
                "vigorousIntensityMinutes": act.get("vigorousIntensityMinutes"),

                "recoveryTime": act.get("recoveryTime"),
                "minActivityLapDuration": act.get("minActivityLapDuration"),
            }

            if activity_id:
                hr_zones = _safe_get(client.get_activity_hr_in_timezones, activity_id)
                detail["hrZones"] = hr_zones

                # Fallback: if summary didn't provide avgHR, compute it from
                # HR zones (which work for all activity types including elliptical).
                if not detail.get("averageHR") and hr_zones and isinstance(hr_zones, list):
                    total_secs = 0
                    weighted_hr = 0
                    for z in hr_zones:
                        if isinstance(z, dict):
                            secs = z.get("secsInZone", 0) or 0
                            low = z.get("zoneLowBoundary", 0) or 0
                            if secs > 0 and low > 0:
                                mid = low + 10
                                weighted_hr += mid * secs
                                total_secs += secs
                    if total_secs > 0:
                        detail["averageHR"] = round(weighted_hr / total_secs)

                # Second fallback: try the per-second HR stream to compute exact avg
                if not detail.get("averageHR") and activity_id:
                    try:
                        stream_details = client.get_activity_details(activity_id, maxchart=2000, maxpoly=100)
                        descriptors = stream_details.get("metricDescriptors", []) or []
                        metrics = stream_details.get("activityDetailMetrics", []) or []
                        hr_idx = next((d["metricsIndex"] for d in descriptors if d.get("key") == "directHeartRate"), None)
                        if hr_idx is not None and metrics:
                            hr_values = [row["metrics"][hr_idx] for row in metrics if row.get("metrics") and len(row["metrics"]) > hr_idx and row["metrics"][hr_idx]]
                            if hr_values:
                                detail["averageHR"] = round(sum(hr_values) / len(hr_values))
                                detail["maxHR"] = max(hr_values)
                    except Exception:
                        pass

                exercise_sets = _safe_get(client.get_activity_exercise_sets, activity_id)
                if exercise_sets and not isinstance(exercise_sets, str):
                    detail["exerciseSets"] = exercise_sets

                splits = _safe_get(client.get_activity_splits, activity_id)
                detail["splits"] = splits

            activities.append(detail)

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        def default_ser(obj):
            return str(obj)

        self.wfile.write(json.dumps({
            "date": date_str,
            "activityCount": len(activities),
            "activities": activities,
        }, default=default_ser, indent=2).encode())
