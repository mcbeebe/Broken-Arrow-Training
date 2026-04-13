"""Garmin activities endpoint.

GET /api/garmin/activities?start=YYYY-MM-DD&end=YYYY-MM-DD
- Fetches activities with HR, elevation, and type data for TRIMP calculation
- Supplements Strava for non-Strava activities (strength, yoga, etc.)
"""

import json
import os
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from garminconnect import Garmin

_garmin_client = None


def _get_client() -> Garmin:
    """Get or create a Garmin client with cached session."""
    global _garmin_client

    email = os.environ.get("GARMIN_EMAIL", "")
    password = os.environ.get("GARMIN_PASSWORD", "")

    if not email or not password:
        raise ValueError("GARMIN_EMAIL and GARMIN_PASSWORD must be set")

    if _garmin_client is not None:
        try:
            _garmin_client.get_full_name()
            return _garmin_client
        except Exception:
            _garmin_client = None

    client = Garmin(email, password)
    client.login()
    _garmin_client = client
    return client


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

            client = _get_client()
            raw_activities = client.get_activities_by_date(start, end)

            activities = []
            for act in (raw_activities or []):
                activity_type = (act.get("activityType", {}).get("typeKey", "other")
                                 if isinstance(act.get("activityType"), dict)
                                 else str(act.get("activityType", "other")))

                duration_seconds = act.get("duration", 0)
                avg_hr = act.get("averageHR", None)
                max_hr = act.get("maxHR", None)
                elevation_m = act.get("elevationGain", 0) or 0
                training_effect = act.get("aerobicTrainingEffect", None)
                start_local = act.get("startTimeLocal", "")

                # Extract date from start time
                date_str = ""
                if start_local:
                    try:
                        date_str = start_local[:10]  # YYYY-MM-DD
                    except Exception:
                        date_str = ""

                activities.append({
                    "date": date_str,
                    "type": activity_type,
                    "name": act.get("activityName", "Activity"),
                    "durationMinutes": round(duration_seconds / 60, 1),
                    "avgHR": avg_hr,
                    "maxHR": max_hr,
                    "elevationGainFt": round(_meters_to_feet(elevation_m), 0),
                    "trainingEffect": training_effect,
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
