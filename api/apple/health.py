"""Apple Health data endpoint.

POST /api/apple/health?athlete=lori
- Receives health data pushed from the iOS companion app
- Body: { "date": "2026-04-17", "hrv": 42.5, "rhr": 58, "sleepHours": 7.2,
          "deepMinutes": 90, "remMinutes": 105, "lightMinutes": 180, "awakeMinutes": 15 }
- Stores per-date in Upstash KV

GET /api/apple/health?days=N&athlete=lori
- Returns last N days in same shape as Garmin health endpoint
- Response: { "dates": [ { "date": "...", "hrv": {...}, "rhr": N, "sleep": {...}, "bodyBattery": null } ] }

POST /api/apple/health/batch?athlete=lori
- Batch upload: { "records": [ { date, hrv, rhr, ... }, ... ] }
"""

import json
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from ._storage import (
    store_health_record, get_health_record, get_date_index,
    get_athlete_from_query,
)


def _normalize_record(raw: dict) -> dict:
    """Normalize iOS app payload to GarminHealthData shape."""
    date_str = raw.get("date", "")

    record: dict = {"date": date_str}

    # HRV
    hrv_val = raw.get("hrv") or raw.get("hrvRMSSD")
    if hrv_val is not None and hrv_val > 0:
        record["hrv"] = {
            "weeklyAvg": 0,
            "lastNightAvg": round(float(hrv_val), 1),
            "status": "UNKNOWN",
        }
    else:
        record["hrv"] = None

    # Resting HR
    rhr = raw.get("rhr") or raw.get("restingHR")
    record["rhr"] = int(rhr) if rhr else None

    # Sleep
    sleep_hours = raw.get("sleepHours")
    sleep_seconds = raw.get("sleepSeconds")
    if sleep_seconds:
        duration = int(sleep_seconds)
    elif sleep_hours:
        duration = int(float(sleep_hours) * 3600)
    else:
        duration = 0

    if duration > 0:
        deep = int((raw.get("deepMinutes") or raw.get("deepSeconds", 0) / 60 if raw.get("deepSeconds") else 0) * 60) if raw.get("deepMinutes") else int(raw.get("deepSeconds", 0))
        rem = int((raw.get("remMinutes") or 0) * 60) if raw.get("remMinutes") else int(raw.get("remSeconds", 0))
        light = int((raw.get("lightMinutes") or 0) * 60) if raw.get("lightMinutes") else int(raw.get("lightSeconds", 0))
        awake = int((raw.get("awakeMinutes") or 0) * 60) if raw.get("awakeMinutes") else int(raw.get("awakeSeconds", 0))

        hours = duration / 3600
        quality = "EXCELLENT" if hours >= 8 else "GOOD" if hours >= 7 else "FAIR" if hours >= 6 else "POOR"

        record["sleep"] = {
            "durationSeconds": duration,
            "quality": quality,
            "deepSeconds": deep,
            "remSeconds": rem,
            "lightSeconds": light,
            "awakeSeconds": awake,
            "score": raw.get("sleepScore"),
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
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        try:
            athlete = get_athlete_from_query(self.path)
            if not athlete:
                self._send_json(400, {"error": "athlete query param required"})
                return

            content_length = int(self.headers.get("Content-Length", 0))
            if content_length == 0:
                self._send_json(400, {"error": "Request body required"})
                return

            body = json.loads(self.rfile.read(content_length).decode())

            # Handle batch upload
            records = body.get("records") if "records" in body else [body]
            stored = 0

            for raw in records:
                date_str = raw.get("date")
                if not date_str:
                    continue

                record = _normalize_record(raw)
                store_health_record(athlete, date_str, record)
                stored += 1

            self._send_json(200, {"ok": True, "stored": stored, "athlete": athlete})

        except Exception as e:
            self._send_json(500, {"error": f"Failed to store health data: {str(e)}"})

    def do_GET(self):
        try:
            query = parse_qs(urlparse(self.path).query)
            days = min(int(query.get("days", ["7"])[0]), 120)
            athlete = get_athlete_from_query(self.path)

            if not athlete:
                self._send_json(400, {"error": "athlete query param required"})
                return

            # Get stored dates for this athlete
            date_index = get_date_index(athlete)
            today = datetime.utcnow().date()
            cutoff = (today - timedelta(days=days)).isoformat()

            results = []
            for date_str in date_index:
                if date_str < cutoff:
                    break
                record = get_health_record(athlete, date_str)
                if record:
                    results.append(record)

            self._send_json(200, {"dates": results})

        except Exception as e:
            self._send_json(500, {"error": f"Failed to fetch health data: {str(e)}"})

    def _send_json(self, status: int, data: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
