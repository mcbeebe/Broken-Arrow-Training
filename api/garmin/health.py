"""Garmin health data endpoint.

GET /api/garmin/health?days=N&tz=offset&athlete=mike
- Fetches HRV, RHR, sleep, and Body Battery for the last N days (default: 1, max: 30)
- Returns array of daily health records
- Uses per-athlete session from Upstash KV
"""

import json
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from ._session import get_client, get_athlete_from_query, GarminSessionExpired


def _safe_get(func, *args):
    """Safely call a Garmin API function, returning None on failure."""
    try:
        return func(*args)
    except Exception:
        return None


def _extract_hrv(hrv_data) -> dict | None:
    """Extract HRV from Garmin response."""
    if not hrv_data or not isinstance(hrv_data, dict):
        return None

    summary = hrv_data.get("hrvSummary")
    if not summary:
        return None

    weekly_avg = summary.get("weeklyAvg") or 0
    last_night = summary.get("lastNightAvg") or 0
    last_night_high = summary.get("lastNight5MinHigh") or 0
    status = summary.get("status") or "UNKNOWN"
    baseline = summary.get("baseline") or {}

    if weekly_avg or last_night:
        return {
            "weeklyAvg": weekly_avg or 0,
            "lastNightAvg": last_night or 0,
            "lastNight5MinHigh": last_night_high or 0,
            "status": status,
            "baselineLow": baseline.get("balancedLow") or 0,
            "baselineHigh": baseline.get("balancedUpper") or 0,
        }
    return None


def _extract_rhr(rhr_data, heart_rates_data) -> int | None:
    """Extract RHR from Garmin response."""
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

    if heart_rates_data and isinstance(heart_rates_data, dict):
        rhr = heart_rates_data.get("restingHeartRate")
        if rhr:
            return int(rhr)

    return None


def _extract_sleep(sleep_data) -> dict | None:
    """Extract sleep metrics from Garmin response."""
    if not sleep_data or not isinstance(sleep_data, dict):
        return None

    daily = sleep_data.get("dailySleepDTO") or sleep_data
    duration = daily.get("sleepTimeSeconds") or 0
    if duration > 0:
        return {
            "durationSeconds": duration,
            "quality": daily.get("sleepQualityType") or "UNKNOWN",
            "deepSeconds": daily.get("deepSleepSeconds") or 0,
            "remSeconds": daily.get("remSleepSeconds") or 0,
            "lightSeconds": daily.get("lightSleepSeconds") or 0,
            "awakeSeconds": daily.get("awakeSleepSeconds") or 0,
            "score": (daily.get("sleepScores") or {}).get("overall", {}).get("value"),
        }
    return None


def _extract_body_battery(bb_data) -> dict | None:
    """Extract Body Battery from Garmin response."""
    if not bb_data:
        return None

    entry = None
    if isinstance(bb_data, list) and len(bb_data) > 0:
        entry = bb_data[0]
    elif isinstance(bb_data, dict):
        entry = bb_data

    if not entry or not isinstance(entry, dict):
        return None

    charged = entry.get("charged") or 0
    drained = entry.get("drained") or 0

    values_array = entry.get("bodyBatteryValuesArray") or []
    highest = 0
    lowest = 100
    current = 0
    for item in values_array:
        if isinstance(item, list) and len(item) >= 2:
            val = item[1]
            if val is not None:
                highest = max(highest, val)
                lowest = min(lowest, val)
                current = val

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
            tz_offset = int(query.get("tz", ["0"])[0])
            athlete = get_athlete_from_query(self.path)

            client = get_client(athlete)
            today = (datetime.utcnow() + timedelta(hours=tz_offset)).date()
            results = []

            for i in range(days):
                date = today - timedelta(days=i)
                date_str = date.isoformat()

                record = {"date": date_str}

                hrv_data = _safe_get(client.get_hrv_data, date_str)
                record["hrv"] = _extract_hrv(hrv_data)

                rhr_data = _safe_get(client.get_rhr_day, date_str)
                heart_rates_data = _safe_get(client.get_heart_rates, date_str)
                record["rhr"] = _extract_rhr(rhr_data, heart_rates_data)

                sleep_data = _safe_get(client.get_sleep_data, date_str)
                record["sleep"] = _extract_sleep(sleep_data)

                bb_data = _safe_get(client.get_body_battery, date_str, date_str)
                record["bodyBattery"] = _extract_body_battery(bb_data)

                results.append(record)

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"dates": results}).encode())

        except GarminSessionExpired:
            self.send_response(401)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "error": "Garmin session expired. Please reconnect your Garmin account.",
                "reauth": True,
            }).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "error": f"Failed to fetch health data: {str(e)}",
            }).encode())
