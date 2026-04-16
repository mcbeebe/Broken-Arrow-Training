"""Coach memory CRUD.

GET  /api/coach/memory?athleteId=X
POST /api/coach/memory?athleteId=X  { action, ... }
"""

import time
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from ._core import (
    load_memory,
    save_memory,
    new_inference_id,
    new_turn_id,
    read_json_body,
    send_cors_preflight,
    send_json,
)


def _athlete_id(handler) -> str:
    q = parse_qs(urlparse(handler.path).query)
    v = q.get("athleteId", [""])
    return (v[0] or "").strip()


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def do_GET(self):
        athlete_id = _athlete_id(self)
        if not athlete_id:
            send_json(self, 400, {"error": "athleteId required"})
            return
        mem = load_memory(athlete_id)
        send_json(self, 200, mem)

    def do_POST(self):
        athlete_id = _athlete_id(self)
        if not athlete_id:
            send_json(self, 400, {"error": "athleteId required"})
            return
        body = read_json_body(self)
        action = body.get("action", "")
        mem = load_memory(athlete_id)

        if action == "save_about_me":
            text = str(body.get("text", ""))
            mem["aboutMe"] = text
            save_memory(athlete_id, mem)
            send_json(self, 200, mem)
            return

        if action == "clear_about_me":
            mem["aboutMe"] = ""
            save_memory(athlete_id, mem)
            send_json(self, 200, mem)
            return

        if action == "append_turn":
            role = str(body.get("role", "user"))
            content = str(body.get("content", ""))
            trigger = body.get("trigger")
            if role not in ("user", "assistant", "coach", "system-handoff"):
                send_json(self, 400, {"error": "invalid role"})
                return
            turn = {
                "id": new_turn_id(),
                "role": role,
                "content": content,
                "ts": int(time.time() * 1000),
            }
            if role == "coach":
                turn["unread"] = True
            if trigger and isinstance(trigger, str):
                turn["trigger"] = trigger
            mem["conversation"].append(turn)
            save_memory(athlete_id, mem)
            send_json(self, 200, mem)
            return

        if action == "mark_read":
            # Clear unread on all coach turns up to (and including) turnId
            turn_id = body.get("turnId")
            for t in mem["conversation"]:
                if t.get("role") == "coach" and t.get("unread"):
                    t["unread"] = False
                    if turn_id and t.get("id") == turn_id:
                        break
            save_memory(athlete_id, mem)
            send_json(self, 200, mem)
            return

        if action == "accept_inference":
            inf_id = body.get("id")
            pending = mem.get("pendingInferences", [])
            kept = []
            accepted_text = None
            for p in pending:
                if p.get("id") == inf_id:
                    accepted_text = p.get("text", "")
                else:
                    kept.append(p)
            if accepted_text:
                existing = (mem.get("aboutMe") or "").rstrip()
                sep = "\n" if existing else ""
                mem["aboutMe"] = f"{existing}{sep}- {accepted_text}"
            mem["pendingInferences"] = kept
            save_memory(athlete_id, mem)
            send_json(self, 200, mem)
            return

        if action == "dismiss_inference":
            inf_id = body.get("id")
            mem["pendingInferences"] = [
                p for p in mem.get("pendingInferences", []) if p.get("id") != inf_id
            ]
            save_memory(athlete_id, mem)
            send_json(self, 200, mem)
            return

        if action == "add_inference":
            # Admin/test hook — inject an inference directly
            text = str(body.get("text", "")).strip()
            if not text:
                send_json(self, 400, {"error": "text required"})
                return
            mem.setdefault("pendingInferences", []).append(
                {
                    "id": new_inference_id(),
                    "text": text,
                    "sourceTurnId": body.get("sourceTurnId"),
                    "proposedAt": int(time.time() * 1000),
                }
            )
            save_memory(athlete_id, mem)
            send_json(self, 200, mem)
            return

        if action == "save_coach_persona":
            persona = body.get("persona", {})
            mem["coachPersona"] = {
                "name": str(persona.get("name", "")).strip(),
                "traits": [str(t).strip() for t in (persona.get("traits") or []) if str(t).strip()],
            }
            save_memory(athlete_id, mem)
            send_json(self, 200, mem)
            return

        if action == "clear_conversation":
            mem["conversation"] = []
            mem["conversationSummary"] = None
            save_memory(athlete_id, mem)
            send_json(self, 200, mem)
            return

        send_json(self, 400, {"error": f"unknown action: {action}"})
