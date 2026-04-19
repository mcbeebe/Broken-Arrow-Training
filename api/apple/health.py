"""Apple Health data receiver and query endpoint.

POST /api/apple/health?athlete=mike
- Receives health data from the iOS companion app
- Body: { "records": [ { "date": "2026-04-17", "hrv": 42.5, "rhr": 58,
          "sleepSeconds": 27000, "deepSeconds": 9000, "remSeconds": 5400,
          "lightSeconds": 10800, "awakeSeconds": 1800 }, ... ] }
- Stores per-athlete per-date in Upstash KV
- Returns: { "ok": true, "stored": N }

GET /api/apple/health?athlete=mike&days=7
- Returns stored health data for this athlete in same shape as
  Garmin /api/garmin/health so the readiness engine works unchanged
- Response: { "dates": [ { date, hrv?, rhr?, sleep?, bodyBattery?:null }, ... ] }
"""

import json
import os
import urllib.request
import urllib.parse
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs


def _kv_headers():
    token = os.environ.get("KV_REST_API_TOKEN", "")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _kv_get(key: str):
    url = os.environ.get("KV_REST_API_URL", "")
    if not url:
        return None
    req = urllib.request.Request(
        f"{url}/get/{urllib.parse.quote(key, safe='')}",
        headers=_kv_headers(),
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode()).get("result")
    except Exception:
        return None


def _kv_set(key: str, value: str, ex: int = 86400 * 120):
    url = os.environ.get("KV_REST_API_URL", "")
    token = os.environ.get("KV_REST_API_TOKEN", "")
    if not url or not token:
        return
    encoded = urllib.parse.quote(value, safe='')
    req = urllib.request.Request(
        f"{url}/set/{urllib.parse.quote(key, safe='')}/{encoded}/EX/{ex}",
        headers={"Authorization": f"Bearer {token}"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=10).read()
    except Exception:
        pass


def _health_key(athlete: str, date: str) -> str:
    return f"apple_health_{athlete}_{date}"


def _index_key(athlete: str) -> str:
    return f"apple_health_dates_{athlete}"


def _athlete(path: str) -> str | None:
    q = parse_qs(urlparse(path).query)
    v = q.get("athlete", [None])
    return v[0] if v and v[0] else None


def _normalize(raw: dict) -> dict:
    """Convert iOS payload to GarminHealthData shape (what the frontend expects)."""
    record: dict = {"date": raw.get("date", "")}

    hrv_val = raw.get("hrv")
    if hrv_val and hrv_val > 0:
        record["hrv"] = {
            "weeklyAvg": 0,
            "lastNightAvg": round(float(hrv_val), 1),
            "status": "UNKNOWN",
        }
    else:
        record["hrv"] = None

    record["rhr"] = int(raw["rhr"]) if raw.get("rhr") else None

    sleep_sec = int(raw.get("sleepSeconds") or 0)
    if sleep_sec > 0:
        hours = sleep_sec / 3600
        quality = "EXCELLENT" if hours >= 8 else "GOOD" if hours >= 7 else "FAIR" if hours >= 6 else "POOR"
        record["sleep"] = {
            "durationSeconds": sleep_sec,
            "quality": quality,
            "deepSeconds": int(raw.get("deepSeconds") or 0),
            "remSeconds": int(raw.get("remSeconds") or 0),
            "lightSeconds": int(raw.get("lightSeconds") or 0),
            "awakeSeconds": int(raw.get("awakeSeconds") or 0),
            "score": raw.get("sleepScore"),
        }
    else:
        record["sleep"] = None

    record["bodyBattery"] = None  # Apple Health doesn't provide this
    return record


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_POST(self):
        try:
            athlete = _athlete(self.path)
            if not athlete:
                self._json(400, {"error": "athlete query param required"})
                return

            content_length = int(self.headers.get("Content-Length", 0))
            if content_length == 0:
                self._json(400, {"error": "body required"})
                return

            body = json.loads(self.rfile.read(content_length).decode())
            records = body.get("records") if "records" in body else [body]

            # Load existing index
            index_raw = _kv_get(_index_key(athlete))
            dates: list[str] = []
            try:
                dates = json.loads(index_raw) if index_raw else []
            except Exception:
                dates = []

            stored = 0
            for raw in records:
                date_str = raw.get("date")
                if not date_str:
                    continue
                normalized = _normalize(raw)
                _kv_set(_health_key(athlete, date_str), json.dumps(normalized))
                if date_str not in dates:
                    dates.append(date_str)
                stored += 1

            # Keep last 180 days, sorted desc
            dates = sorted(set(dates), reverse=True)[:180]
            _kv_set(_index_key(athlete), json.dumps(dates))

            self._json(200, {"ok": True, "stored": stored, "athlete": athlete})

        except Exception as e:
            self._json(500, {"error": f"Failed to store: {str(e)}"})

    def do_GET(self):
        try:
            q = parse_qs(urlparse(self.path).query)
            athlete = _athlete(self.path)
            if not athlete:
                self._json(400, {"error": "athlete required"})
                return

            days = min(int(q.get("days", ["7"])[0]), 180)
            cutoff = (datetime.utcnow() - timedelta(days=days)).date().isoformat()

            index_raw = _kv_get(_index_key(athlete))
            try:
                all_dates: list[str] = json.loads(index_raw) if index_raw else []
            except Exception:
                all_dates = []

            results = []
            for date in all_dates:
                if date < cutoff:
                    break
                raw = _kv_get(_health_key(athlete, date))
                if raw:
                    try:
                        results.append(json.loads(raw))
                    except Exception:
                        pass

            self._json(200, {"dates": results})

        except Exception as e:
            self._json(500, {"error": str(e)})

    def _json(self, status: int, data: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
