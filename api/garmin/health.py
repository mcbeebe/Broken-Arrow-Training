"""Garmin health data endpoint.

GET /api/garmin/health?days=N
- Fetches HRV, RHR, sleep, and Body Battery for the last N days (default: 1, max: 30)
- Returns array of daily health records
- Uses saved session from Upstash KV (set via /api/garmin/auth)
"""

import json
import os
import math
import urllib.request
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from garminconnect import Garmin

_garmin_client = None


def _kv_get(key: str):
    """Get a value from Upstash KV."""
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
    """Get an authenticated Garmin client using saved session from KV."""
    global _garmin_client

    email = os.environ.get("GARMIN_EMAIL", "")
    password = os.environ.get("GARMIN_PASSWORD", "")

    if not email or not password:
        raise ValueError("GARMIN_EMAIL and GARMIN_PASSWORD must be set")

    # Try module-level cache first (warm invocation)
    if _garmin_client is not None:
        try:
            _garmin_client.get_full_name()
            return _garmin_client
        except Exception:
            _garmin_client = None

    # Try saved session from KV
    saved_token = _kv_get("garmin_session")
    if saved_token:
        try:
            client = Garmin(email, password)
            client.login(tokenstore=saved_token)
            _garmin_client = client
            return client
        except Exception:
            pass

    raise RuntimeError(
        "No valid Garmin session found. "
        "Please authenticate first via POST /api/garmin/auth"
    )


def _safe_get(func, *args):
    """Safely call a Garmin API function, returning None on failure."""
    try:
        return func(*args)
    except Exception:
        return None


def _extract_hrv(hrv_data) -> dict | None:
    """Extract HRV metrics from Garmin response."""
    if not hrv_data:
        return None

    if isinstance(hrv_data, dict):
        weekly_avg = hrv_data.get("weeklyAvg", 0)
        last_night = hrv_data.get("lastNightAvg", 0) or hrv_data.get("lastNight5MinHigh", 0)
        status = hrv_data.get("status", "UNKNOWN")
        if weekly_avg or last_night:
            return {
                "weeklyAvg": weekly_avg or 0,
                "lastNightAvg": last_night or 0,
                "status": status,
            }
    return None


def _extract_sleep(sleep_data) -> dict | None:
    """Extract sleep metrics from Garmin response."""
    if not sleep_data:
        return None

    if isinstance(sleep_data, dict):
        daily = sleep_data.get("dailySleepDTO", sleep_data)
        duration = daily.get("sleepTimeSeconds", 0)
        if duration > 0:
            return {
                "durationSeconds": duration,
                "quality": daily.get("sleepQualityType", "UNKNOWN"),
                "deepSeconds": daily.get("deepSleepSeconds", 0),
                "remSeconds": daily.get("remSleepSeconds", 0),
                "lightSeconds": daily.get("lightSleepSeconds", 0),
                "awakeSeconds": daily.get("awakeSleepSeconds", 0),
                "score": daily.get("sleepScores", {}).get("overall", {}).get("value"),
            }
    return None


def _extract_body_battery(bb_data) -> dict | None:
    """Extract Body Battery metrics from Garmin response."""
    if not bb_data:
        return None

    if isinstance(bb_data, list) and len(bb_data) > 0:
        bb = bb_data[0] if isinstance(bb_data[0], dict) else {}
    elif isinstance(bb_data, dict):
        bb = bb_data
    else:
        return None

    charged = bb.get("charged", 0)
    drained = bb.get("drained", 0)
    highest = bb.get("bodyBatteryHighestValue", bb.get("highest", 0))
    lowest = bb.get("bodyBatteryLowestValue", bb.get("lowest", 0))
    current = bb.get("bodyBatteryMostRecentValue", bb.get("current", 0))

    if highest or current:
        return {
            "highest": highest or 0,
            "lowest": lowest or 0,
            "current": current or 0,
            "charged": charged or 0,
            "drained": drained or 0,
        }
    return None


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
            days = min(int(query.get("days", ["1"])[0]), 30)

            client = _get_client()
            today = datetime.now().date()
            results = []

            for i in range(days):
                date = today - timedelta(days=i)
                date_str = date.isoformat()

                record = {"date": date_str}

                hrv_data = _safe_get(client.get_hrv_data, date_str)
                record["hrv"] = _extract_hrv(hrv_data)

                rhr_data = _safe_get(client.get_rhr_day, date_str)
                if rhr_data and isinstance(rhr_data, dict):
                    rhr_val = rhr_data.get("restingHeartRate", None)
                    if not rhr_val:
                        rhr_val = rhr_data.get("value", None)
                    record["rhr"] = rhr_val
                else:
                    record["rhr"] = None

                sleep_data = _safe_get(client.get_sleep_data, date_str)
                record["sleep"] = _extract_sleep(sleep_data)

                bb_data = _safe_get(client.get_body_battery, date_str)
                record["bodyBattery"] = _extract_body_battery(bb_data)

                results.append(record)

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"dates": results}).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "error": f"Failed to fetch health data: {str(e)}",
            }).encode())
