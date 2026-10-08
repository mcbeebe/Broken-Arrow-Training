"""Read an athlete's own training plan from a file (initiative 004).

POST /api/coach/plan_import
{ kind: "pdf" | "image" | "text" | "csv" | "docx" | "xlsx",
  data?: base64 file (pdf, image), mediaType?: "image/jpeg" | ... (image),
  text?: the document as text (text, csv, docx, xlsx — Word and Excel are
         read in the browser), hint?: a short note from the athlete }

AUTH: requires `Authorization: Bearer <session>`; the athlete is the token
subject. Owner-only until PLAN_IMPORT_OPEN=true (D8).

Returns 200 { extraction, warnings, usage: {input, output}, importsLeft }.
`extraction.status` is "ok", "not_a_plan" or "unreadable"; the app checks it
and the athlete reviews every week before the plan is used.

Errors are a short code, never any of the document:
  400 bad_request | data_required | bad_data | text_required
  403 not_available        413 too_large | too_long
  415 unsupported_kind | not_a_pdf | unsupported_image
  422 plan_too_long | file_unreadable
  429 import_limit | budget_exceeded
  502 read_failed | llm_unavailable    503 busy | llm_unavailable   504 timeout

Privacy (D10): the file is read once and dropped. Nothing here stores it,
logs it, or calls log_sample_event. Failures log the error's class and
status code, never its message.
"""

from __future__ import annotations

from http.server import BaseHTTPRequestHandler

from ._core import (
    check_and_increment_budget,
    read_json_body,
    send_cors_preflight,
    send_json,
)
from ._plan_import import (
    MAX_BODY_BYTES,
    ModelReplyError,
    PlanTooLong,
    RequestError,
    daily_import_limit,
    extract_plan,
    give_back_import,
    import_allowed,
    imports_used_today,
    parse_request,
    take_daily_import,
)
from ..auth._helpers import ADMIN_ATHLETE_ID, athlete_from_bearer


def _content_length(headers) -> int | None:
    try:
        return int(headers.get("Content-Length", "0") or "0")
    except (TypeError, ValueError):
        return None


# Failures where the model read nothing: the upload is given back.
NOT_READ = {"busy", "llm_unavailable"}


def model_error_response(e: Exception) -> tuple[int, str]:
    """The status and code for a failed model call. Never uses the message."""
    if isinstance(e, PlanTooLong):
        return 422, "plan_too_long"
    if isinstance(e, ModelReplyError):
        return 502, "read_failed"
    try:
        import anthropic
    except ImportError:
        return 503, "llm_unavailable"
    if isinstance(e, anthropic.APITimeoutError):
        return 504, "timeout"
    if isinstance(e, anthropic.APIStatusError):
        if e.status_code in (429, 529):
            return 503, "busy"
        if e.status_code == 400:
            # The model service refused the input itself: a password-protected
            # or damaged PDF, or one past the page limit.
            return 422, "file_unreadable"
    if isinstance(e, RuntimeError) and "ANTHROPIC_API_KEY" in str(e):
        return 503, "llm_unavailable"
    return 502, "llm_unavailable"


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def do_POST(self):
        ok, _auth_status, _auth_err, athlete_id = athlete_from_bearer(self.headers)
        if not ok:
            send_json(self, _auth_status, {"error": _auth_err})
            return
        if not import_allowed(athlete_id, ADMIN_ATHLETE_ID):
            send_json(self, 403, {"error": "not_available"})
            return

        # Refuse an oversized body before reading it.
        length = _content_length(self.headers)
        if length is None or length <= 0:
            send_json(self, 400, {"error": "bad_request"})
            return
        if length > MAX_BODY_BYTES:
            send_json(self, 413, {"error": "too_large"})
            return

        try:
            req = parse_request(read_json_body(self))
        except RequestError as e:
            send_json(self, e.status, {"error": e.code})
            return
        except Exception:
            send_json(self, 400, {"error": "bad_request"})
            return

        # Cheapest refusal first: a look at today's uploads costs nothing.
        # The budget comes before the upload is counted, so an athlete out of
        # budget keeps their uploads; the count itself is one atomic step.
        limit = daily_import_limit()
        used = imports_used_today(athlete_id)
        if used >= limit:
            send_json(self, 429, {"error": "import_limit", "used": used, "limit": limit})
            return
        within, b_used, budget = check_and_increment_budget(athlete_id)
        if not within:
            send_json(self, 429, {"error": "budget_exceeded", "used": b_used, "budget": budget})
            return
        allowed, used, limit, counter_key = take_daily_import(athlete_id)
        if not allowed:
            send_json(self, 429, {"error": "import_limit", "used": used, "limit": limit})
            return

        try:
            result = extract_plan(req, athlete_id=athlete_id)
        except Exception as e:
            status, code = model_error_response(e)
            if code in NOT_READ:
                give_back_import(counter_key)
            status_code = getattr(e, "status_code", "")
            print(f"[plan_import] {req.kind} failed: {type(e).__name__} {status_code}".rstrip(), flush=True)
            send_json(self, status, {"error": code})
            return

        send_json(self, 200, {
            "extraction": result["plan"],
            "warnings": result["warnings"],
            "usage": result["usage"],
            "importsLeft": max(0, limit - used),
        })
