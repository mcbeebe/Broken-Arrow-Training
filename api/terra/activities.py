"""Terra activities endpoint.

GET /api/terra/activities?start=YYYY-MM-DD&end=YYYY-MM-DD&athlete=mike
- Fetches activities with HR, elevation, and type data
- Returns in same shape as Garmin activities endpoint
"""

import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from ._session import (
    is_configured, get_athlete_from_query, get_user_id, terra_api_get,
)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        try:
            if not is_configured():
                self._send_json(500, {"error": "Terra not configured"})
                return

            query = parse_qs(urlparse(self.path).query)
            start = query.get("start", [None])[0]
            end = query.get("end", [None])[0]

            if not start or not end:
                self._send_json(400, {"error": "start and end required"})
                return

            athlete = get_athlete_from_query(self.path)
            user_id = get_user_id(athlete)

            if not user_id:
                self._send_json(401, {"error": "Not connected"})
                return

            data = terra_api_get("/activity", {
                "user_id": user_id,
                "start_date": start,
                "end_date": end,
                "to_webhook": "false",
            })

            activities = []
            for act in (data.get("data", []) or []):
                metadata = act.get("metadata", {})
                date_str = (metadata.get("date") or metadata.get("start_time", ""))[:10]
                hr_data = act.get("heart_rate_data", {})
                dist_data = act.get("distance_data", {})
                cal_data = act.get("calories_data", {})
                dur_data = act.get("active_durations_data", {})

                elev_gain_m = 0
                elev = dist_data.get("elevation", {})
                if isinstance(elev, dict):
                    elev_gain_m = elev.get("gain_actual_meters", 0) or 0

                activities.append({
                    "date": date_str,
                    "type": metadata.get("type", "UNKNOWN"),
                    "name": metadata.get("name", "Activity"),
                    "durationMinutes": round(
                        (dur_data.get("activity_seconds", 0) or 0) / 60, 1
                    ),
                    "avgHR": hr_data.get("avg_hr_bpm"),
                    "maxHR": hr_data.get("max_hr_bpm"),
                    "elevationGainFt": round(elev_gain_m * 3.28084),
                    "trainingEffect": None,
                    "anaerobicTrainingEffect": None,
                    "activityTrainingLoad": None,
                    "calories": cal_data.get("total_burned_calories"),
                })

            self._send_json(200, {"activities": activities})

        except Exception as e:
            self._send_json(500, {"error": f"Failed to fetch activities: {str(e)}"})

    def _send_json(self, status: int, data: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
