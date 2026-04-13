"""Garmin health data endpoint.

GET /api/garmin/health?days=N
- Fetches HRV, RHR, sleep, and Body Battery for the last N days (default: 1, max: 30)
- Returns array of daily health records
- Uses saved session from Upstash KV (set via /api/garmin/auth)
"""

import json
import os
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
    if _garmin_client is not None:
        try:
            _garmin_client.get_full_name()
            return _garmin_client
        except Exception:
            _garmin_client = None
    saved_token = _kv_get("garmin_session")
    if saved_token:
        try:
            client = Garmin(email, password)
            client.login(tokenstore=saved_token)
            _garmin_client = client
            return client
        except Exception:
            pass
    raise RuntimeError("No valid Garmin session. Authenticate via POST /api/garmin/auth")


def _safe_get(func, *args):
    """Safely call a Garmin API function, returning None on failure."""
    try:
        return func(*args)
    except Exception:
        return None


def _extract_hrv(hrv_data) -> dict | None:
    """Extract HRV from Garmin response.

    Actual structure:
    {
        "hrvSummary": {
            "weeklyAvg": 42,
            "lastNightAvg": 45,
            "lastNight5MinHigh": 68,
            "status": "BALANCED",
            "baseline": {"lowUpper": 34, "balancedLow": 37, "balancedUpper": 50, ...}
        },
        "hrvReadings": [{"hrvValue": 50, ...}, ...]
    }
    """
    if not hrv_data or not isinstance(hrv_data, dict):
        return None

    summary = hrv_data.get("hrvSummary")
    if not summary:
        return None

    weekly_avg = summary.get("weeklyAvg", 0)
    last_night = summary.get("lastNightAvg", 0)
    last_night_high = summary.get("lastNight5MinHigh", 0)
    status = summary.get("status", "UNKNOWN")
    baseline = summary.get("baseline", {})

    if weekly_avg or last_night:
        return {
            "weeklyAvg": weekly_avg or 0,
            "lastNightAvg": last_night or 0,
            "lastNight5MinHigh": last_night_high or 0,
            "status": status,
            "baselineLow": baseline.get("balancedLow", 0),
            "baselineHigh": baseline.get("balancedUpper", 0),
        }
    return None


def _extract_rhr(rhr_data, heart_rates_data) -> int | None:
    """Extract RHR from Garmin response.

    rhr_day structure:
    {"allMetrics": {"metricsMap": {"WELLNESS_RESTING_HEART_RATE": [{"value": 57.0, ...}]}}}

    heart_rates structure (fallback):
    {"restingHeartRate": 57, ...}
    """
    # Try rhr_day first
    if rhr_data and isinstance(rhr_data, dict):
        try:
            metrics = rhr_data.get("allMetrics", {}).get("metricsMap", {})
            rhr_list = metrics.get("WELLNESS_RESTING_HEART_RATE", [])
            if rhr_list and len(rhr_list) > 0:
                val = rhr_list[0].get("value")
                if val is not None:
                    return int(val)
        except Exception:
            pass

    # Fallback to heart_rates
    if heart_rates_data and isinstance(heart_rates_data, dict):
        rhr = heart_rates_data.get("restingHeartRate")
        if rhr:
            return int(rhr)

    return None


def _extract_sleep(sleep_data) -> dict | None:
    """Extract sleep metrics from Garmin response."""
    if not sleep_data or not isinstance(sleep_data, dict):
        return None

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
    """Extract Body Battery from Garmin response.

    Actual structure (list):
    [{"date": "2026-04-13", "charged": 40, "drained": 21,
      "bodyBatteryValuesArray": [[timestamp, level], ...], ...}]
    """
    if not bb_data:
        return None

    # It's a list — get first entry
    entry = None
    if isinstance(bb_data, list) and len(bb_data) > 0:
        entry = bb_data[0]
    elif isinstance(bb_data, dict):
        entry = bb_data

    if not entry or not isinstance(entry, dict):
        return None

    charged = entry.get("charged", 0)
    drained = entry.get("drained", 0)

    # Get highest and latest values from bodyBatteryValuesArray
    values_array = entry.get("bodyBatteryValuesArray", [])
    highest = 0
    lowest = 100
    current = 0
    for item in values_array:
        if isinstance(item, list) and len(item) >= 2:
            val = item[1]
            if val is not None:
                highest = max(highest, val)
                lowest = min(lowest, val)
                current = val  # Last value = most recent

    if highest > 0 or current > 0:
        return {
            "highest": highest,
            "lowest": lowest if lowest < 100 else 0,
            "current": current,
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

                # HRV — nested under hrvSummary
                hrv_data = _safe_get(client.get_hrv_data, date_str)
                record["hrv"] = _extract_hrv(hrv_data)

                # RHR — nested under allMetrics.metricsMap, with heart_rates fallback
                rhr_data = _safe_get(client.get_rhr_day, date_str)
                heart_rates_data = _safe_get(client.get_heart_rates, date_str)
                record["rhr"] = _extract_rhr(rhr_data, heart_rates_data)

                # Sleep
                sleep_data = _safe_get(client.get_sleep_data, date_str)
                record["sleep"] = _extract_sleep(sleep_data)

                # Body Battery — requires (startdate, enddate)
                bb_data = _safe_get(client.get_body_battery, date_str, date_str)
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
