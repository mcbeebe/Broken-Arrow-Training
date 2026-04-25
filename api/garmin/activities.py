"""Garmin activities endpoint.

GET /api/garmin/activities?start=YYYY-MM-DD&end=YYYY-MM-DD&athlete=mike
- Fetches activities with HR, elevation, and type data for TRIMP calculation
- Uses per-athlete session from Upstash KV
"""

import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from ._session import get_client, get_athlete_from_query


def _meters_to_feet(meters: float) -> float:
    return meters * 3.28084


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

            athlete = get_athlete_from_query(self.path)
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
                })

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"activities": activities}).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "error": f"Failed to fetch activities: {str(e)}",
            }).encode())
