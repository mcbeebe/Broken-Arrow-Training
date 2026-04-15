"""Garmin activity stream (per-second time series) endpoint.

GET /api/garmin/activity_stream?activityId=<id>&athlete=<name>
Returns the detailed time-series data for a single Garmin activity —
heart rate, pace/speed, elevation, distance, cadence — in the same
shape as Strava's StreamData so the existing HRChart can render it
unchanged.

Garmin's details response contains:
  - metricDescriptors: array of { metricsIndex, key: { unitKey, key } }
    describing which slot of the activityDetailMetrics row carries which
    metric. The key we care about is the nested `.key` (e.g.,
    `directHeartRate`, `directSpeed`, `directElevation`,
    `sumElapsedDuration`, `sumDistance`, `directRunCadence`).
  - activityDetailMetrics: array of { metrics: [ ... ] } rows, one per
    sample point. Values may be None.

We map those into simple parallel arrays. Garmin's speed is in m/s;
we convert to m/s velocity matching Strava. Distance is in meters,
elevation in meters, time in seconds from start.
"""

import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from ._session import get_client, get_athlete_from_query


# Garmin metric keys → our StreamData field names.
# (Garmin sometimes nests the key under .key.key; we try a couple paths.)
METRIC_KEY_MAP = {
    "directHeartRate": "heartrate",
    "directSpeed": "velocity",           # m/s
    "directElevation": "altitude",       # m
    "sumElapsedDuration": "time",        # seconds from start
    "sumDuration": "time",               # fallback
    "sumDistance": "distance",           # m
    "directRunCadence": "cadence",       # strides/min
    "directBikeCadence": "cadence",
}


def _metric_key(descriptor):
    """Extract the key string from a metricDescriptor, which may be
    either { key: "directHeartRate" } or { key: { key: "directHeartRate" }}."""
    k = descriptor.get("key")
    if isinstance(k, str):
        return k
    if isinstance(k, dict):
        return k.get("key") or ""
    return ""


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
            activity_id = query.get("activityId", [None])[0]
            if not activity_id:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "activityId parameter required"}).encode())
                return

            athlete = get_athlete_from_query(self.path)
            client = get_client(athlete)

            # maxchart controls sample resolution. 2000 is Garmin's default
            # and gives ~1s resolution for a typical 30-60 min workout.
            details = client.get_activity_details(
                activity_id,
                maxchart=2000,
                maxpoly=4000,
            )

            descriptors = details.get("metricDescriptors", []) or []
            rows = details.get("activityDetailMetrics", []) or []

            # Map each of our target metrics to the correct slot index
            slot_for_field: dict[str, int] = {}
            for desc in descriptors:
                idx = desc.get("metricsIndex")
                key = _metric_key(desc)
                if idx is None or not key:
                    continue
                target = METRIC_KEY_MAP.get(key)
                if target and target not in slot_for_field:
                    slot_for_field[target] = idx

            # Initialize output arrays
            out = {
                "time": [],
                "heartrate": [],
                "distance": [],
                "altitude": [],
                "velocity": [],
                "cadence": [],
            }

            for row in rows:
                metrics = row.get("metrics") or []
                for field, idx in slot_for_field.items():
                    if idx < len(metrics):
                        val = metrics[idx]
                        out[field].append(0 if val is None else val)
                    else:
                        out[field].append(0)

            # If no explicit time stream, synthesize from sample index.
            # Garmin typically samples at 1Hz so index = seconds.
            if not out["time"] and rows:
                out["time"] = list(range(len(rows)))

            # Normalize time to start at 0 and be integer seconds.
            if out["time"]:
                t0 = out["time"][0]
                out["time"] = [int(round(t - t0)) for t in out["time"]]

            # Coerce heartrate to int (charts expect ints)
            out["heartrate"] = [int(round(v)) if v else 0 for v in out["heartrate"]]
            out["cadence"] = [int(round(v)) if v else 0 for v in out["cadence"]]

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            # Cache for 1 day — streams for completed activities are immutable
            self.send_header("Cache-Control", "public, max-age=86400")
            self.end_headers()

            self.wfile.write(json.dumps({
                "activityId": activity_id,
                "sampleCount": len(rows),
                "stream": out,
            }).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
