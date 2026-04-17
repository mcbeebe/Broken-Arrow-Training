"""Terra health data endpoint.

GET /api/terra/health?days=N&athlete=mike
- Fetches daily health data (HRV, RHR, sleep) via Terra API
- Returns array of daily records in same shape as Garmin health endpoint
"""

import json
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from ._session import (
    is_configured, get_athlete_from_query, get_user_id, terra_api_get,
)


def _extract_health_day(daily: dict, date_str: str) -> dict:
    """Extract health metrics from a Terra daily data object."""
    record: dict = {"date": date_str}

    # HRV
    hrv_data = daily.get("heart_rate_data", {})
    hrv_rmssd = hrv_data.get("avg_hrv_rmssd") or hrv_data.get("rmssd")
    if hrv_rmssd:
        record["hrv"] = {
            "weeklyAvg": 0,
            "lastNightAvg": round(hrv_rmssd, 1),
            "status": "UNKNOWN",
        }
    else:
        record["hrv"] = None

    # Resting HR
    rhr = hrv_data.get("resting_hr_bpm")
    record["rhr"] = int(rhr) if rhr else None

    # Sleep
    sleep_data = daily.get("sleep_data")
    if sleep_data and sleep_data.get("duration_seconds"):
        efficiency = sleep_data.get("sleep_efficiency")
        quality = "UNKNOWN"
        if efficiency:
            if efficiency >= 85:
                quality = "EXCELLENT"
            elif efficiency >= 70:
                quality = "GOOD"
            elif efficiency >= 50:
                quality = "FAIR"
            else:
                quality = "POOR"

        record["sleep"] = {
            "durationSeconds": sleep_data.get("duration_seconds", 0),
            "quality": quality,
            "deepSeconds": sleep_data.get("deep_seconds", 0),
            "remSeconds": sleep_data.get("rem_seconds", 0),
            "lightSeconds": sleep_data.get("light_seconds", 0),
            "awakeSeconds": sleep_data.get("awake_seconds", 0),
            "score": sleep_data.get("sleep_efficiency"),
        }
    else:
        record["sleep"] = None

    # No Body Battery from Apple Health
    record["bodyBattery"] = None

    return record


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
            days = min(int(query.get("days", ["7"])[0]), 120)
            athlete = get_athlete_from_query(self.path)
            user_id = get_user_id(athlete)

            if not user_id:
                self._send_json(401, {"error": "Not connected. Connect Apple Health first."})
                return

            end_date = datetime.utcnow()
            start_date = end_date - timedelta(days=days)

            results = []

            # Terra daily endpoint returns health data
            try:
                data = terra_api_get("/daily", {
                    "user_id": user_id,
                    "start_date": start_date.strftime("%Y-%m-%d"),
                    "end_date": end_date.strftime("%Y-%m-%d"),
                    "to_webhook": "false",
                })
                for daily in (data.get("data", []) or []):
                    metadata = daily.get("metadata", {})
                    date_str = (metadata.get("date") or metadata.get("start_time", ""))[:10]
                    if date_str:
                        results.append(_extract_health_day(daily, date_str))
            except Exception:
                pass

            # Also fetch sleep data separately (Terra has a dedicated sleep endpoint)
            try:
                sleep_resp = terra_api_get("/sleep", {
                    "user_id": user_id,
                    "start_date": start_date.strftime("%Y-%m-%d"),
                    "end_date": end_date.strftime("%Y-%m-%d"),
                    "to_webhook": "false",
                })
                sleep_by_date = {}
                for sleep_entry in (sleep_resp.get("data", []) or []):
                    metadata = sleep_entry.get("metadata", {})
                    date_str = (metadata.get("date") or metadata.get("start_time", ""))[:10]
                    if date_str:
                        sleep_data = sleep_entry.get("sleep_durations_data", {})
                        duration = (
                            sleep_data.get("sleep_duration_asleep_state_seconds")
                            or sleep_data.get("duration_asleep_seconds")
                            or sleep_data.get("total_seconds", 0)
                        )
                        if duration:
                            efficiency = sleep_entry.get("sleep_efficiency")
                            quality = "UNKNOWN"
                            if efficiency:
                                if efficiency >= 85: quality = "EXCELLENT"
                                elif efficiency >= 70: quality = "GOOD"
                                elif efficiency >= 50: quality = "FAIR"
                                else: quality = "POOR"

                            other = sleep_data.get("other", {})
                            sleep_by_date[date_str] = {
                                "durationSeconds": int(duration),
                                "quality": quality,
                                "deepSeconds": int(other.get("duration_deep_sleep_state_seconds", 0)),
                                "remSeconds": int(other.get("duration_REM_sleep_state_seconds", 0)),
                                "lightSeconds": int(other.get("duration_light_sleep_state_seconds", 0)),
                                "awakeSeconds": int(other.get("duration_awake_state_seconds", 0)),
                                "score": efficiency,
                            }

                # Merge sleep data into daily results
                dates_with_results = {r["date"] for r in results}
                for r in results:
                    if r["date"] in sleep_by_date and not r.get("sleep"):
                        r["sleep"] = sleep_by_date[r["date"]]

                # Add sleep-only days
                for date_str, sleep in sleep_by_date.items():
                    if date_str not in dates_with_results:
                        results.append({
                            "date": date_str,
                            "hrv": None,
                            "rhr": None,
                            "sleep": sleep,
                            "bodyBattery": None,
                        })
            except Exception:
                pass

            self._send_json(200, {"dates": results})

        except Exception as e:
            self._send_json(500, {"error": f"Failed to fetch health data: {str(e)}"})

    def _send_json(self, status: int, data: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
