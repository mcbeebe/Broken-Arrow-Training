"""Debug endpoint to inspect raw Garmin API responses.

GET /api/garmin/debug?date=YYYY-MM-DD&athlete=mike
Returns raw responses from all health-related Garmin API calls.
"""

import json
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from ._session import get_client, get_athlete_from_query


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
            athlete = get_athlete_from_query(self.path)

            client = get_client(athlete)
            results = {"athlete": athlete}

            try:
                results["hrv_data"] = client.get_hrv_data(date_str)
            except Exception as e:
                results["hrv_data"] = f"ERROR: {e}"

            try:
                results["rhr_day"] = client.get_rhr_day(date_str)
            except Exception as e:
                results["rhr_day"] = f"ERROR: {e}"

            try:
                results["heart_rates"] = client.get_heart_rates(date_str)
            except Exception as e:
                results["heart_rates"] = f"ERROR: {e}"

            try:
                results["sleep_data"] = client.get_sleep_data(date_str)
            except Exception as e:
                results["sleep_data"] = f"ERROR: {e}"

            try:
                results["body_battery"] = client.get_body_battery(date_str, date_str)
            except Exception as e:
                results["body_battery"] = f"ERROR: {e}"

            try:
                results["training_readiness"] = client.get_training_readiness(date_str)
            except Exception as e:
                results["training_readiness"] = f"ERROR: {e}"

            try:
                results["morning_readiness"] = client.get_morning_training_readiness(date_str)
            except Exception as e:
                results["morning_readiness"] = f"ERROR: {e}"

            try:
                results["stats"] = client.get_stats(date_str)
            except Exception as e:
                results["stats"] = f"ERROR: {e}"

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            def default_serializer(obj):
                return str(obj)

            self.wfile.write(json.dumps(results, default=default_serializer, indent=2).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
