"""Garmin detailed activity endpoint.

GET /api/garmin/activity_detail?date=YYYY-MM-DD
Returns full raw activity data for all activities on a given date,
including HR zones, training effect, splits, and exercise sets.
"""

import json
import os
import urllib.request
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from garminconnect import Garmin

_garmin_client = None


def _kv_get(key: str):
    url = os.environ.get("KV_REST_API_URL", "")
    token = os.environ.get("KV_REST_API_TOKEN", "")
    if not url or not token:
        return None
    req = urllib.request.Request(
        f"{url}/get/{key}",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
            return data.get("result")
    except Exception:
        return None


def _get_client() -> Garmin:
    global _garmin_client
    email = os.environ.get("GARMIN_EMAIL", "")
    password = os.environ.get("GARMIN_PASSWORD", "")
    if _garmin_client:
        try:
            _garmin_client.get_full_name()
            return _garmin_client
        except Exception:
            _garmin_client = None
    saved_token = _kv_get("garmin_session")
    if saved_token:
        client = Garmin(email, password)
        client.login(tokenstore=saved_token)
        _garmin_client = client
        return client
    raise RuntimeError("No session")


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
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        try:
            query = parse_qs(urlparse(self.path).query)
            date_str = query.get("date", [None])[0]
            if not date_str:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "date parameter required"}).encode())
                return

            client = _get_client()

            # Get all activities for the date
            raw_activities = client.get_activities_by_date(date_str, date_str) or []

            activities = []
            for act in raw_activities:
                activity_id = act.get("activityId")
                activity_type = (act.get("activityType", {}).get("typeKey", "other")
                                if isinstance(act.get("activityType"), dict)
                                else str(act.get("activityType", "other")))

                # Build comprehensive activity record
                detail = {
                    "activityId": activity_id,
                    "name": act.get("activityName", "Activity"),
                    "type": activity_type,
                    "startTimeLocal": act.get("startTimeLocal", ""),
                    "startTimeGMT": act.get("startTimeGMT", ""),

                    # Duration
                    "durationSeconds": act.get("duration") or 0,
                    "elapsedDurationSeconds": act.get("elapsedDuration") or 0,
                    "movingDurationSeconds": act.get("movingDuration") or 0,

                    # Heart Rate
                    "averageHR": act.get("averageHR"),
                    "maxHR": act.get("maxHR"),

                    # Distance / Elevation
                    "distanceMeters": act.get("distance") or 0,
                    "elevationGainMeters": act.get("elevationGain") or 0,
                    "elevationLossMeters": act.get("elevationLoss") or 0,

                    # Training metrics from Garmin
                    "aerobicTrainingEffect": act.get("aerobicTrainingEffect"),
                    "anaerobicTrainingEffect": act.get("anaerobicTrainingEffect"),
                    "trainingEffectLabel": act.get("trainingEffectLabel"),
                    "activityTrainingLoad": act.get("activityTrainingLoad"),

                    # Calories
                    "calories": act.get("calories") or 0,
                    "bmrCalories": act.get("bmrCalories") or 0,
                    "activeCalories": act.get("activeDuration") or 0,

                    # Pace / Speed
                    "averageSpeed": act.get("averageSpeed"),
                    "maxSpeed": act.get("maxSpeed"),

                    # VO2 / Performance
                    "vO2MaxValue": act.get("vO2MaxValue"),
                    "moderateIntensityMinutes": act.get("moderateIntensityMinutes"),
                    "vigorousIntensityMinutes": act.get("vigorousIntensityMinutes"),

                    # Recovery
                    "recoveryTime": act.get("recoveryTime"),

                    # Stress / Body Battery
                    "minActivityLapDuration": act.get("minActivityLapDuration"),
                }

                # Get HR zones for this activity
                if activity_id:
                    hr_zones = _safe_get(client.get_activity_hr_in_timezones, activity_id)
                    detail["hrZones"] = hr_zones

                    # Get exercise sets (for strength)
                    if activity_type in ("strength_training", "other"):
                        exercise_sets = _safe_get(client.get_activity_exercise_sets, activity_id)
                        detail["exerciseSets"] = exercise_sets

                    # Get splits
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

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
