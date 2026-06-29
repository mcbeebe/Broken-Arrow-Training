"""Apple Health data receiver and query endpoint.

POST /api/apple/health   — daily recovery (HRV/RHR/sleep)
- Receives health data from the iOS companion app
- Body: { "records": [ { "date": "2026-04-17", "hrv": 42.5, "rhr": 58,
          "sleepSeconds": 27000, "deepSeconds": 9000, "remSeconds": 5400,
          "lightSeconds": 10800, "awakeSeconds": 1800 }, ... ] }
- Stores per-athlete per-date in Upstash KV
- Returns: { "ok": true, "stored": N }

PUT /api/apple/health    — Apple Watch workouts (activities)
- Receives a batch of HKWorkouts from the iOS companion app
- Body: { "workouts": [ { activityId, startTimeMs, date, name, sport,
          durationSeconds, distanceMeters, avgHR, maxHR, activeEnergyKcal,
          elevationGainMeters, hardDescentVerticalMeters }, ... ] }
- Normalizes each to the GarminActivity shape and stores per-activity in KV
- Co-located here (not a new file) to stay under the Vercel Hobby 12-function
  cap — same pattern as api/garmin/activities.py.

GET /api/apple/health?days=7                 — recovery (GarminHealthData shape)
GET /api/apple/health?kind=activities&days=N — workouts (GarminActivity shape)
- Both mirror the Garmin endpoints so the readiness engine works unchanged.
- Recovery response:   { "dates": [ { date, hrv?, rhr?, sleep?, bodyBattery?:null }, ... ] }
- Activities response: { "activities": [ { date, activityId, appleId, type, name, ... }, ... ] }

Auth: all of POST, PUT and GET require an Authorization: Bearer <jwt> header
where <jwt> is a session token minted by /api/auth/google. The athlete
identity is derived from the token, not the query string, so a signed-in
user can't read or write another user's data. Fails closed (503) if
OAUTH_JWT_SECRET is not configured.
"""

import json
import os
import urllib.request
import urllib.parse
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from ._helpers import authenticate


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


def _query_athlete(path: str) -> str | None:
    """Legacy: some callers still pass ?athlete=mike. We compare it to
    the JWT's athleteId and reject mismatches."""
    q = parse_qs(urlparse(path).query)
    v = q.get("athlete", [None])
    return v[0] if v and v[0] else None


def _normalize(raw: dict) -> dict:
    """Convert iOS payload to GarminHealthData shape (what the frontend expects)."""
    record: dict = {"date": raw.get("date", "")}

    hrv_val = raw.get("hrv")
    if hrv_val and hrv_val > 0:
        # Apple Health reports HRV as SDNN (ms). The readiness engine and
        # Garmin both work in RMSSD, so convert with the standard heuristic
        # RMSSD ≈ 1.4 × SDNN. Without this the value is mislabeled and skews
        # the shared baseline the moment Apple and Garmin HRV coexist.
        rmssd = round(float(hrv_val) * 1.4, 1)
        record["hrv"] = {
            # No true 7-day trailing average at write time — use the night's
            # value as a non-zero proxy. The old `0` was a latent
            # divide-by-zero trap for any consumer treating it as a denominator.
            "weeklyAvg": rmssd,
            "lastNightAvg": rmssd,
            # Apple supplies no balance status; the engine derives its own from
            # the baseline, so a neutral default is honest enough.
            "status": "BALANCED",
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


# ─── Apple Watch workouts (activities) ──────────────────────────────

def _activity_key(athlete: str, activity_id: str) -> str:
    return f"apple_activity_{athlete}_{activity_id}"


def _activity_index_key(athlete: str) -> str:
    return f"apple_activity_index_{athlete}"


def _query_kind(path: str) -> str | None:
    q = parse_qs(urlparse(path).query)
    v = q.get("kind", [None])
    return v[0] if v and v[0] else None


_M_TO_FT = 3.28084
_M_TO_MI = 1.0 / 1609.344


def _normalize_activity(raw: dict) -> dict:
    """Convert an iOS HKWorkout payload to the GarminActivity shape so the web
    training-load + descent pipeline consumes Apple workouts unchanged.

    iOS sends SI units (meters, seconds); we convert to the feet/miles/minutes
    the GarminActivity contract uses (mirrors api/garmin/activities). The real
    HKWorkout UUID rides along as `appleId` for dedup while `activityId` stays a
    number (derived from the start epoch) to honor the typed GarminActivity
    contract. `hardDescentVerticalMeters` is computed on-device from the route
    and passed through to drive readiness load-dampening."""
    uuid = str(raw.get("activityId") or raw.get("uuid") or "").strip()
    start_ms = raw.get("startTimeMs")
    try:
        numeric_id = int(int(start_ms) // 1000) if start_ms else (abs(hash(uuid)) % (10 ** 12))
    except Exception:
        numeric_id = abs(hash(uuid)) % (10 ** 12)

    dist_m = float(raw.get("distanceMeters") or 0)
    dur_s = float(raw.get("durationSeconds") or 0)
    elev_gain_m = raw.get("elevationGainMeters")
    descent_m = raw.get("hardDescentVerticalMeters")

    record: dict = {
        "date": str(raw.get("date") or "")[:10],
        "activityId": numeric_id,
        "appleId": uuid or None,
        "source": "apple",
        "type": str(raw.get("sport") or "other"),
        "name": str(raw.get("name") or "Apple Workout"),
        "durationMinutes": round(dur_s / 60.0, 1) if dur_s else 0,
        "elevationGainFt": round(float(elev_gain_m) * _M_TO_FT) if elev_gain_m else 0,
    }
    if dist_m > 0:
        record["distanceMi"] = round(dist_m * _M_TO_MI, 2)
    if raw.get("avgHR"):
        record["avgHR"] = int(round(float(raw["avgHR"])))
    if raw.get("maxHR"):
        record["maxHR"] = int(round(float(raw["maxHR"])))
    if raw.get("activeEnergyKcal"):
        record["calories"] = int(round(float(raw["activeEnergyKcal"])))
    if raw.get("avgPowerW"):
        record["avgPowerW"] = float(raw["avgPowerW"])
    # Descent passthrough for the eccentric/DOMS engine. The web turns
    # hardDescentVerticalMeters → doseAU → readiness load-dampening.
    if descent_m is not None:
        record["hardDescentVerticalMeters"] = round(float(descent_m), 1)
    return record


def _read_activities(athlete: str, days: int) -> list:
    cutoff = (datetime.utcnow() - timedelta(days=days)).date().isoformat()
    index_raw = _kv_get(_activity_index_key(athlete))
    try:
        index = json.loads(index_raw) if index_raw else []
    except Exception:
        index = []
    out = []
    for entry in index:
        date = entry.get("date", "") if isinstance(entry, dict) else ""
        if date and date < cutoff:
            continue
        aid = entry.get("id") if isinstance(entry, dict) else entry
        raw = _kv_get(_activity_key(athlete, str(aid)))
        if raw:
            try:
                out.append(json.loads(raw))
            except Exception:
                pass
    return out


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_POST(self):
        try:
            ok, status, msg, athlete = authenticate(self)
            if not ok:
                self._json(status, {"error": msg})
                return

            # If a legacy client passes ?athlete=..., make sure it matches
            # the identity in the token — never let a signed-in user write
            # data under someone else's athleteId.
            q_athlete = _query_athlete(self.path)
            if q_athlete and q_athlete != athlete:
                self._json(403, {"error": "athlete query param does not match authenticated user"})
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

    def do_PUT(self):
        """Store a batch of Apple Watch workouts (normalized to GarminActivity
        shape). Co-located with the recovery POST handler to stay under the
        Vercel Hobby 12-function cap."""
        try:
            ok, status, msg, athlete = authenticate(self)
            if not ok:
                self._json(status, {"error": msg})
                return

            q_athlete = _query_athlete(self.path)
            if q_athlete and q_athlete != athlete:
                self._json(403, {"error": "athlete query param does not match authenticated user"})
                return

            content_length = int(self.headers.get("Content-Length", 0))
            if content_length == 0:
                self._json(400, {"error": "body required"})
                return

            body = json.loads(self.rfile.read(content_length).decode())
            workouts = body.get("workouts") if "workouts" in body else [body]

            index_raw = _kv_get(_activity_index_key(athlete))
            try:
                index = json.loads(index_raw) if index_raw else []
            except Exception:
                index = []
            by_id = {str(e.get("id")): e for e in index if isinstance(e, dict) and e.get("id")}

            stored = 0
            for raw in workouts:
                normalized = _normalize_activity(raw)
                aid = str(normalized.get("activityId") or "")
                date_str = normalized.get("date") or ""
                if not aid or not date_str:
                    continue
                _kv_set(_activity_key(athlete, aid), json.dumps(normalized))
                by_id[aid] = {"id": aid, "date": date_str}
                stored += 1

            # Keep the most recent ~365 activities, newest first.
            index = sorted(by_id.values(), key=lambda e: e.get("date", ""), reverse=True)[:365]
            _kv_set(_activity_index_key(athlete), json.dumps(index))

            self._json(200, {"ok": True, "stored": stored, "athlete": athlete})

        except Exception as e:
            self._json(500, {"error": f"Failed to store activities: {str(e)}"})

    def do_GET(self):
        try:
            ok, status, msg, athlete = authenticate(self)
            if not ok:
                self._json(status, {"error": msg})
                return

            q_athlete = _query_athlete(self.path)
            if q_athlete and q_athlete != athlete:
                self._json(403, {"error": "athlete query param does not match authenticated user"})
                return

            q = parse_qs(urlparse(self.path).query)
            days = min(int(q.get("days", ["7"])[0]), 365)

            # Activities are stored under their own keys; recovery uses the
            # date index below. Branch on ?kind=activities.
            if _query_kind(self.path) == "activities":
                self._json(200, {"activities": _read_activities(athlete, days)})
                return

            days = min(days, 180)
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
