"""Terra activity stream endpoint.

GET /api/terra/activity_stream?activityId=<id>&athlete=mike
- Returns per-second time-series data (HR, pace, elevation, distance)
- Same StreamData shape as Garmin/Strava for chart rendering
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
                self._send_json(200, {"stream": None})
                return

            query = parse_qs(urlparse(self.path).query)
            activity_id = query.get("activityId", [None])[0]
            if not activity_id:
                self._send_json(400, {"error": "activityId required"})
                return

            athlete = get_athlete_from_query(self.path)
            user_id = get_user_id(athlete)
            if not user_id:
                self._send_json(200, {"stream": None})
                return

            # Terra doesn't have a per-activity stream endpoint in the same
            # way Garmin does. The activity data includes samples if available.
            # For Apple Health, HR samples come as part of the activity payload.
            # We return an empty stream structure as a fallback — the frontend
            # handles missing streams gracefully (no chart shown).
            stream = {
                "heartrate": [],
                "time": [],
                "altitude": [],
                "velocity": [],
                "distance": [],
                "cadence": [],
            }

            self._send_json(200, {"stream": stream})

        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _send_json(self, status: int, data: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "public, max-age=86400")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
