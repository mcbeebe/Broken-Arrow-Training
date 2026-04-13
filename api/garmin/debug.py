"""Debug endpoint to inspect raw Garmin API responses.

GET /api/garmin/debug?date=YYYY-MM-DD
Returns raw responses from all health-related Garmin API calls.
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
    global _garmin_client
    email = os.environ.get("GARMIN_EMAIL", "")
    password = os.environ.get("GARMIN_PASSWORD", "")
    if _garmin_client:
        try:
            _garmin_client.get_full_name()
            return _garmin_client
        except Exception:
            _garmin_client = None
    saved_token = _kv_get("garmin_session")
    if saved_token:
        client = Garmin(email, password)
        client.login(tokenstore=saved_token)
        _garmin_client = client
        return client
    raise RuntimeError("No session")


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
            date_str = query.get("date", [datetime.now().date().isoformat()])[0]

            client = _get_client()
            results = {}

            # HRV
            try:
                results["hrv_data"] = client.get_hrv_data(date_str)
            except Exception as e:
                results["hrv_data"] = f"ERROR: {e}"

            # RHR
            try:
                results["rhr_day"] = client.get_rhr_day(date_str)
            except Exception as e:
                results["rhr_day"] = f"ERROR: {e}"

            # Heart rates (may contain RHR)
            try:
                results["heart_rates"] = client.get_heart_rates(date_str)
            except Exception as e:
                results["heart_rates"] = f"ERROR: {e}"

            # Sleep
            try:
                results["sleep_data"] = client.get_sleep_data(date_str)
            except Exception as e:
                results["sleep_data"] = f"ERROR: {e}"

            # Body battery (needs start/end date)
            try:
                results["body_battery"] = client.get_body_battery(date_str, date_str)
            except Exception as e:
                results["body_battery"] = f"ERROR: {e}"

            # Training readiness
            try:
                results["training_readiness"] = client.get_training_readiness(date_str)
            except Exception as e:
                results["training_readiness"] = f"ERROR: {e}"

            # Morning training readiness
            try:
                results["morning_readiness"] = client.get_morning_training_readiness(date_str)
            except Exception as e:
                results["morning_readiness"] = f"ERROR: {e}"

            # Stats (daily summary)
            try:
                results["stats"] = client.get_stats(date_str)
            except Exception as e:
                results["stats"] = f"ERROR: {e}"

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            # Custom serializer to handle non-serializable types
            def default_serializer(obj):
                return str(obj)

            self.wfile.write(json.dumps(results, default=default_serializer, indent=2).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
