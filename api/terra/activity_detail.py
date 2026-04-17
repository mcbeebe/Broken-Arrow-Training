"""Terra activity detail endpoint.

GET /api/terra/activity_detail?date=YYYY-MM-DD&athlete=mike
- Fetches detailed activity data for a specific date
- Returns in same shape as Garmin activity_detail endpoint
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
                self._send_json(200, {"activities": []})
                return

            query = parse_qs(urlparse(self.path).query)
            date = query.get("date", [None])[0]
            if not date:
                self._send_json(400, {"error": "date required"})
                return

            athlete = get_athlete_from_query(self.path)
            user_id = get_user_id(athlete)
            if not user_id:
                self._send_json(200, {"activities": []})
                return

            data = terra_api_get("/activity", {
                "user_id": user_id,
                "start_date": date,
                "end_date": date,
                "to_webhook": "false",
            })

            activities = []
            for act in (data.get("data", []) or []):
                metadata = act.get("metadata", {})
                act_date = (metadata.get("date") or metadata.get("start_time", ""))[:10]
                if act_date != date:
                    continue

                hr_data = act.get("heart_rate_data", {})
                dist_data = act.get("distance_data", {})
                cal_data = act.get("calories_data", {})
                dur_data = act.get("active_durations_data", {})

                elev = dist_data.get("elevation", {})
                elev_gain = (elev.get("gain_actual_meters", 0) or 0) if isinstance(elev, dict) else 0
                elev_loss = (elev.get("loss_actual_meters", 0) or 0) if isinstance(elev, dict) else 0

                # HR zones
                hr_zones = None
                zone_data = hr_data.get("hr_zone_data")
                if zone_data and isinstance(zone_data, list):
                    hr_zones = []
                    for i, z in enumerate(zone_data):
                        hr_zones.append({
                            "zoneNumber": z.get("zone_number", i + 1),
                            "zoneLowBoundary": z.get("min_hr", 0),
                            "secsInZone": z.get("duration_seconds", 0),
                        })

                # Generate a stable numeric ID from the Terra activity ID
                terra_id = metadata.get("id", "")
                activity_id = abs(hash(str(terra_id))) % (10**9)

                activities.append({
                    "activityId": activity_id,
                    "name": metadata.get("name", "Activity"),
                    "type": metadata.get("type", "UNKNOWN"),
                    "startTimeLocal": metadata.get("start_time", ""),
                    "durationSeconds": dur_data.get("activity_seconds", 0) or 0,
                    "movingDurationSeconds": dur_data.get("moving_time_seconds", 0) or 0,
                    "averageHR": hr_data.get("avg_hr_bpm"),
                    "maxHR": hr_data.get("max_hr_bpm"),
                    "distanceMeters": dist_data.get("distance_meters", 0) or 0,
                    "elevationGainMeters": elev_gain,
                    "elevationLossMeters": elev_loss,
                    "calories": cal_data.get("total_burned_calories", 0) or 0,
                    "hrZones": hr_zones,
                    "aerobicTrainingEffect": None,
                    "anaerobicTrainingEffect": None,
                    "activityTrainingLoad": None,
                    "vO2MaxValue": None,
                    "recoveryTime": None,
                })

            self._send_json(200, {"activities": activities})

        except Exception as e:
            self._send_json(500, {"error": f"Failed to fetch activity detail: {str(e)}"})

    def _send_json(self, status: int, data: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
