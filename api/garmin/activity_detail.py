"""Garmin detailed activity endpoint.

GET /api/garmin/activity_detail?date=YYYY-MM-DD&athlete=mike
Returns full raw activity data for all activities on a given date,
including HR zones, training effect, splits, and exercise sets.
"""

import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from ._session import get_client, get_athlete_from_query


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

            athlete = get_athlete_from_query(self.path)
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

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
