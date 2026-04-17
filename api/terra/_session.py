"""Shared Terra API session management.

Terra uses API-key auth (not user credentials). The API key + dev-id
authenticate server-side requests. Each athlete's Terra user_id is
stored in Upstash KV.

Environment variables:
  - TERRA_API_KEY: Your Terra API key
  - TERRA_DEV_ID: Your Terra developer ID
  - KV_REST_API_URL / KV_REST_API_TOKEN: Upstash KV (shared with Garmin)
"""

import json
import os
import urllib.request

TERRA_API_BASE = "https://api.tryterra.co/v2"


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
        f"{url}/get/{key}",
        headers=_get_kv_headers(),
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
            return data.get("result")
    except Exception:
        return None


def _kv_set(key: str, value: str, ex: int = 86400 * 30):
    url = os.environ.get("KV_REST_API_URL", "")
    token = os.environ.get("KV_REST_API_TOKEN", "")
    if not url or not token:
        return
    encoded_value = urllib.request.quote(value, safe='')
    set_url = f"{url}/set/{key}/{encoded_value}/EX/{ex}"
    req = urllib.request.Request(
        set_url,
        headers={"Authorization": f"Bearer {token}"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req).read()
    except Exception:
        pass


def _kv_del(key: str):
    url = os.environ.get("KV_REST_API_URL", "")
    token = os.environ.get("KV_REST_API_TOKEN", "")
    if not url or not token:
        return
    req = urllib.request.Request(
        f"{url}/del/{key}",
        headers={"Authorization": f"Bearer {token}"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req).read()
    except Exception:
        pass


def _user_key(athlete: str | None) -> str:
    if athlete:
        return f"terra_user_{athlete}"
    return "terra_user"


def get_terra_headers() -> dict:
    api_key = os.environ.get("TERRA_API_KEY", "")
    dev_id = os.environ.get("TERRA_DEV_ID", "")
    return {
        "x-api-key": api_key,
        "dev-id": dev_id,
        "Content-Type": "application/json",
    }


def is_configured() -> bool:
    return bool(os.environ.get("TERRA_API_KEY")) and bool(os.environ.get("TERRA_DEV_ID"))


def get_user_id(athlete: str | None) -> str | None:
    return _kv_get(_user_key(athlete))


def save_user_id(user_id: str, athlete: str | None):
    _kv_set(_user_key(athlete), user_id)


def clear_user(athlete: str | None):
    _kv_del(_user_key(athlete))


def get_athlete_from_query(path: str) -> str | None:
    from urllib.parse import urlparse, parse_qs
    query = parse_qs(urlparse(path).query)
    values = query.get("athlete", [None])
    return values[0] if values and values[0] else None


def terra_api_get(endpoint: str, params: dict | None = None) -> dict:
    """Make a GET request to the Terra API."""
    url = f"{TERRA_API_BASE}{endpoint}"
    if params:
        query_string = "&".join(f"{k}={urllib.request.quote(str(v), safe='')}" for k, v in params.items())
        url = f"{url}?{query_string}"

    req = urllib.request.Request(url, headers=get_terra_headers())
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def terra_api_post(endpoint: str, body: dict | None = None) -> dict:
    """Make a POST request to the Terra API."""
    url = f"{TERRA_API_BASE}{endpoint}"
    data = json.dumps(body or {}).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers=get_terra_headers(),
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())
