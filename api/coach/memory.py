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
    new_fact_id,
    new_inference_id,
    new_turn_id,
    read_json_body,
    send_cors_preflight,
    send_json,
    sync_about_me_string,
    _facts_from_text,
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
            # Wholesale-replace path used by the free-text AboutMe.tsx
            # editor. Re-parses the supplied text into structured facts so
            # subsequent edits/timestamps work, then re-derives the
            # canonical aboutMe string. Existing fact IDs are NOT
            # preserved — the legacy editor is "replace everything" by
            # design. Per-fact edit/delete uses the new fact-CRUD actions
            # below.
            text = str(body.get("text", ""))
            mem["aboutMeFacts"] = _facts_from_text(text)
            sync_about_me_string(mem)
            save_memory(athlete_id, mem)
            send_json(self, 200, mem)
            return

        if action == "clear_about_me":
            mem["aboutMeFacts"] = []
            mem["aboutMe"] = ""
            save_memory(athlete_id, mem)
            send_json(self, 200, mem)
            return

        # Sprint 4 — per-fact CRUD on About Me. Each action operates on a
        # single fact by id, then re-syncs the joined aboutMe string so
        # the prompt builder stays in lockstep.
        if action == "add_about_me_fact":
            text = str(body.get("text", "")).strip()
            if not text:
                send_json(self, 400, {"error": "text required"})
                return
            fact = {
                "id": new_fact_id(),
                "text": text,
                "learnedAt": int(time.time() * 1000),
            }
            source_turn = body.get("sourceTurnId")
            if isinstance(source_turn, str) and source_turn:
                fact["sourceTurnId"] = source_turn
            mem.setdefault("aboutMeFacts", []).append(fact)
            sync_about_me_string(mem)
            save_memory(athlete_id, mem)
            send_json(self, 200, mem)
            return

        if action == "edit_about_me_fact":
            fact_id = str(body.get("id", "")).strip()
            text = str(body.get("text", "")).strip()
            if not fact_id or not text:
                send_json(self, 400, {"error": "id and text required"})
                return
            updated = False
            for f in mem.get("aboutMeFacts", []) or []:
                if f.get("id") == fact_id:
                    f["text"] = text
                    f["editedAt"] = int(time.time() * 1000)
                    updated = True
                    break
            if not updated:
                send_json(self, 404, {"error": "fact not found"})
                return
            sync_about_me_string(mem)
            save_memory(athlete_id, mem)
            send_json(self, 200, mem)
            return

        if action == "delete_about_me_fact":
            fact_id = str(body.get("id", "")).strip()
            if not fact_id:
                send_json(self, 400, {"error": "id required"})
                return
            before = mem.get("aboutMeFacts", []) or []
            after = [f for f in before if f.get("id") != fact_id]
            if len(after) == len(before):
                send_json(self, 404, {"error": "fact not found"})
                return
            mem["aboutMeFacts"] = after
            sync_about_me_string(mem)
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
            kept: list = []
            accepted = None
            for p in pending:
                if p.get("id") == inf_id:
                    accepted = p
                else:
                    kept.append(p)
            if accepted and str(accepted.get("text", "")).strip():
                # Preserve provenance: when an inference is accepted, the
                # resulting fact carries the original proposedAt as its
                # learnedAt and remembers the source turn so anniversaries
                # / explainability surfaces can cite "you mentioned this
                # on <date>".
                fact: dict = {
                    "id": new_fact_id(),
                    "text": str(accepted.get("text", "")).strip(),
                    "learnedAt": int(accepted.get("proposedAt") or time.time() * 1000),
                }
                source_turn = accepted.get("sourceTurnId")
                if isinstance(source_turn, str) and source_turn:
                    fact["sourceTurnId"] = source_turn
                mem.setdefault("aboutMeFacts", []).append(fact)
                sync_about_me_string(mem)
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

        if action == "rollover_day":
            # Archive the current conversation under a specific date and
            # start fresh. Called by the client when it detects a new day
            # on first send. Keeps at most 30 archives to bound memory.
            date = str(body.get("date", "")).strip()
            if not date:
                send_json(self, 400, {"error": "date required"})
                return
            turns = mem.get("conversation") or []
            visible = [t for t in turns if t.get("role") != "system-handoff"]
            if visible:
                last = visible[-1]
                preview_src = str(last.get("content", "")).strip().replace("\n", " ")
                preview = preview_src[:100] + ("…" if len(preview_src) > 100 else "")
                archive = {
                    "date": date,
                    "turns": turns,
                    "preview": preview,
                    "turnCount": len(visible),
                }
                archives = mem.get("dailyArchives") or []
                # Merge: if an archive for this date already exists, replace it
                archives = [a for a in archives if a.get("date") != date]
                archives.insert(0, archive)
                # Cap at 30 archives to keep KV bounded
                mem["dailyArchives"] = archives[:30]
                mem["conversation"] = []
                mem["conversationSummary"] = None
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
