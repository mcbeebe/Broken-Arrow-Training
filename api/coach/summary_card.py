"""Coach "knows about you" home-card.

GET  /api/coach/summary_card?athleteId=X
GET  /api/coach/summary_card?athleteId=X&force=1   (bypass cache)

Returns a small JSON payload the Summary tab uses to render the
"Coach knows about you" card — 3 to 5 short, second-person facts
distilled from the full `aboutMeFacts` list by a Haiku pass and
cached by content hash so the LLM only runs when memory changes.
"""

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from ._core import (
    build_summary_card,
    load_memory,
    send_cors_preflight,
    send_json,
)


def _qs(handler) -> dict[str, list[str]]:
    return parse_qs(urlparse(handler.path).query)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def do_GET(self):
        q = _qs(self)
        athlete_id = (q.get("athleteId", [""])[0] or "").strip()
        if not athlete_id:
            send_json(self, 400, {"error": "athleteId required"})
            return
        force = (q.get("force", ["0"])[0] or "0") in ("1", "true", "yes")
        mem = load_memory(athlete_id)
        facts = mem.get("aboutMeFacts") or []
        payload = build_summary_card(athlete_id, facts, force=force)
        send_json(self, 200, payload)
