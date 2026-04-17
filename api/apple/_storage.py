"""Shared helpers for Apple Health API endpoints.

Apple Health data is pushed from the iOS companion app via POST.
Per-athlete, per-date health records are stored in Upstash KV.

KV key format: apple_health_{athlete}_{YYYY-MM-DD}
"""

import json
import os
import urllib.request
import urllib.parse


def _get_kv_headers():
    token = os.environ.get("KV_REST_API_TOKEN", "")
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _kv_get(key: str):
    url = os.environ.get("KV_REST_API_URL", "")
    if not url:
        return None
    req = urllib.request.Request(
        f"{url}/get/{urllib.parse.quote(key, safe='')}",
        headers=_get_kv_headers(),
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            return data.get("result")
    except Exception:
        return None


def _kv_set(key: str, value: str, ex: int = 86400 * 90):
    url = os.environ.get("KV_REST_API_URL", "")
    token = os.environ.get("KV_REST_API_TOKEN", "")
    if not url or not token:
        return
    encoded_value = urllib.parse.quote(value, safe='')
    set_url = f"{url}/set/{key}/{encoded_value}/EX/{ex}"
    req = urllib.request.Request(
        set_url,
        headers={"Authorization": f"Bearer {token}"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=10).read()
    except Exception:
        pass


def _health_key(athlete: str, date_str: str) -> str:
    return f"apple_health_{athlete}_{date_str}"


def _index_key(athlete: str) -> str:
    return f"apple_health_dates_{athlete}"


def store_health_record(athlete: str, date_str: str, record: dict):
    """Store a single day's health data in KV."""
    _kv_set(_health_key(athlete, date_str), json.dumps(record))

    # Maintain an index of dates so GET can enumerate without scanning
    existing = get_date_index(athlete)
    if date_str not in existing:
        existing.append(date_str)
        existing.sort(reverse=True)
        # Keep last 120 days max
        existing = existing[:120]
        _kv_set(_index_key(athlete), json.dumps(existing))


def get_health_record(athlete: str, date_str: str) -> dict | None:
    raw = _kv_get(_health_key(athlete, date_str))
    if raw:
        try:
            return json.loads(raw)
        except Exception:
            return None
    return None


def get_date_index(athlete: str) -> list[str]:
    raw = _kv_get(_index_key(athlete))
    if raw:
        try:
            return json.loads(raw)
        except Exception:
            return []
    return []


def get_athlete_from_query(path: str) -> str | None:
    from urllib.parse import urlparse, parse_qs
    query = parse_qs(urlparse(path).query)
    values = query.get("athlete", [None])
    return values[0] if values and values[0] else None
