"""Google OAuth callback endpoint.

POST /api/auth/google
Body: { "credential": "..." }  (Google ID token from Sign In with Google)

Verifies the Google ID token, maps email to athlete ID,
returns a signed session token.
"""

import json
import os
import re
import urllib.request
from http.server import BaseHTTPRequestHandler
from ._helpers import (
    lookup_athlete,
    create_session_token,
    get_email_to_athlete_map,
    verify_admin,
    get_env_email_map,
    get_kv_email_map,
    set_kv_email_map,
    get_access_requests,
    add_access_request,
    remove_access_request,
    notify_admin_of_request,
    notify_user_approved,
)
from ._entitlements import (
    default_tier,
    get_entitlements_map,
    set_athlete_tier,
    FEATURE_TIERS,
)

# Admin allowlist management is served from this same function (routed here
# from /api/auth/athletes via a vercel.json rewrite) to stay within the
# Hobby-plan 12-function limit. Admin ops are dispatched by the "action"
# field and carry the caller's session token in the body, so they ride the
# existing POST + Content-Type CORS config — no extra method/header needed.
# The billing_* actions manage the BACKEND-ONLY entitlements scaffold
# (api/auth/_entitlements.py): admin-gated, never surfaced in any user
# response or client code by explicit product decision.
ADMIN_ACTIONS = {"list", "add", "remove", "requests_approve", "requests_dismiss",
                 "billing_list", "billing_set_tier"}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ATHLETE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(content_length).decode()) if content_length > 0 else {}

            action = body.get("action")
            # Public, unauthenticated: a would-be athlete asks Mike for access
            # from the login screen. Dispatched before the admin gate so it
            # needs no token — it just lands in the review queue.
            if action == "request_access":
                self._handle_access_request(body)
                return

            if action in ADMIN_ACTIONS:
                self._handle_admin(body)
                return

            credential = body.get("credential", "")
            if not credential:
                self._send_json(400, {"error": "credential required"})
                return

            # Verify the Google ID token via Google's tokeninfo endpoint
            verify_url = f"https://oauth2.googleapis.com/tokeninfo?id_token={urllib.parse.quote(credential)}"
            req = urllib.request.Request(verify_url)
            with urllib.request.urlopen(req, timeout=10) as resp:
                token_data = json.loads(resp.read().decode())

            email = token_data.get("email", "").lower()
            email_verified = token_data.get("email_verified", "false")

            if email_verified != "true" or not email:
                self._send_json(401, {"error": "Email not verified"})
                return

            # Accept Google ID tokens from either the web client or the iOS
            # companion app. The web Google Sign-In button is audienced to
            # GOOGLE_CLIENT_ID; the native iOS SDK is audienced to
            # GOOGLE_CLIENT_ID_IOS. Both are legitimate — we just need one
            # of them to match.
            allowed_auds = {
                aud for aud in (
                    os.environ.get("GOOGLE_CLIENT_ID", ""),
                    os.environ.get("GOOGLE_CLIENT_ID_IOS", ""),
                ) if aud
            }
            if allowed_auds and token_data.get("aud") not in allowed_auds:
                self._send_json(401, {"error": "Invalid client ID"})
                return

            # Map email to athlete
            athlete_id = lookup_athlete(email)
            if not athlete_id:
                configured_count = len(get_email_to_athlete_map())
                self._send_json(403, {
                    "error": f"No athlete account found for {email}. {configured_count} athlete(s) configured. Contact Mike to get set up.",
                    "email": email,
                })
                return

            # Create session token
            session_token = create_session_token(athlete_id, email, "google")

            self._send_json(200, {
                "authenticated": True,
                "athleteId": athlete_id,
                "email": email,
                "name": token_data.get("name", ""),
                "token": session_token,
            })

        except Exception as e:
            self._send_json(500, {"error": f"Google auth failed: {str(e)}"})

    def _handle_access_request(self, body: dict):
        """Public: queue an access request for the admin to review.

        Always answers 200 for a valid email — without revealing whether the
        email is already on the roster — so this endpoint can't be used to
        probe membership. Invalid emails get a 400 so the form can correct."""
        email = str(body.get("email", "")).strip().lower()
        note = str(body.get("note", ""))
        if not EMAIL_RE.match(email):
            self._send_json(400, {"error": "Please enter a valid email address."})
            return
        # Already permitted → nothing to queue, but don't disclose that.
        if email in get_email_to_athlete_map():
            self._send_json(200, {"ok": True})
            return
        try:
            add_access_request(email, note)
        except RuntimeError:
            self._send_json(503, {"error": "Requests are temporarily unavailable — please email Mike directly."})
            return
        # Best-effort: alert the admin. The request is already safely queued, so
        # an email failure must not turn into an error for the requester.
        try:
            notify_admin_of_request(email, note)
        except Exception:
            pass
        self._send_json(200, {"ok": True})

    def _handle_admin(self, body: dict):
        """Owner-only allowlist + request-queue management
        (list / add / remove / requests_approve / requests_dismiss)."""
        if not verify_admin(body.get("token")):
            self._send_json(403, {"error": "Admin access required"})
            return

        action = body.get("action")

        # ── Backend-only billing/entitlements (admin-gated, no user surface).
        # Responds with the billing payload and returns early — these actions
        # don't touch (or re-send) the allowlist/requests state below.
        if action == "billing_list":
            self._send_json(200, {
                "defaultTier": default_tier(),
                "entitlements": get_entitlements_map(),
                "features": FEATURE_TIERS,
            })
            return

        if action == "billing_set_tier":
            athlete_id = str(body.get("athleteId", "")).strip().lower()
            tier = str(body.get("tier", "")).strip().lower()
            if not ATHLETE_ID_RE.match(athlete_id):
                self._send_json(400, {"error": "athleteId must be lowercase letters, numbers, or hyphens"})
                return
            try:
                entitlements = set_athlete_tier(athlete_id, tier, str(body.get("note", "")))
            except ValueError as e:
                self._send_json(400, {"error": str(e)})
                return
            except RuntimeError:
                self._send_json(503, {"error": "Entitlements storage (KV) is not configured"})
                return
            self._send_json(200, {
                "defaultTier": default_tier(),
                "entitlements": entitlements,
                "features": FEATURE_TIERS,
            })
            return

        if action == "add":
            email = str(body.get("email", "")).strip().lower()
            athlete_id = str(body.get("athleteId", "")).strip().lower()
            if not EMAIL_RE.match(email):
                self._send_json(400, {"error": "A valid email is required"})
                return
            if not ATHLETE_ID_RE.match(athlete_id):
                self._send_json(400, {"error": "athleteId must be lowercase letters, numbers, or hyphens"})
                return
            if email in get_env_email_map():
                self._send_json(409, {"error": f"{email} is configured in the env seed and can't be edited here"})
                return
            try:
                kv_map = get_kv_email_map()
                kv_map[email] = athlete_id
                set_kv_email_map(kv_map)
            except RuntimeError:
                self._send_json(503, {"error": "Allowlist storage (KV) is not configured"})
                return

        elif action == "remove":
            email = str(body.get("email", "")).strip().lower()
            kv_map = get_kv_email_map()
            if email not in kv_map:
                self._send_json(404, {"error": f"{email} is not an admin-managed athlete"})
                return
            try:
                del kv_map[email]
                set_kv_email_map(kv_map)
            except RuntimeError:
                self._send_json(503, {"error": "Allowlist storage (KV) is not configured"})
                return

        elif action == "requests_approve":
            # Approve a pending request: add to the allowlist, then clear it
            # from the queue. athleteId is supplied by the caller (derived from
            # the email client-side) and validated here.
            email = str(body.get("email", "")).strip().lower()
            athlete_id = str(body.get("athleteId", "")).strip().lower()
            if not EMAIL_RE.match(email):
                self._send_json(400, {"error": "A valid email is required"})
                return
            if not ATHLETE_ID_RE.match(athlete_id):
                self._send_json(400, {"error": "athleteId must be lowercase letters, numbers, or hyphens"})
                return
            try:
                # Env-seeded emails can already sign in; only KV needs the add.
                if email not in get_env_email_map():
                    kv_map = get_kv_email_map()
                    kv_map[email] = athlete_id
                    set_kv_email_map(kv_map)
                remove_access_request(email)
            except RuntimeError:
                self._send_json(503, {"error": "Allowlist storage (KV) is not configured"})
                return
            # Best-effort: tell the athlete they're in. Already approved, so an
            # email failure must not fail the request.
            try:
                notify_user_approved(email)
            except Exception:
                pass

        elif action == "requests_dismiss":
            email = str(body.get("email", "")).strip().lower()
            try:
                remove_access_request(email)
            except RuntimeError:
                self._send_json(503, {"error": "Allowlist storage (KV) is not configured"})
                return

        self._send_json(200, {"athletes": self._athlete_list(), "requests": get_access_requests()})

    def _athlete_list(self) -> list:
        env_map = get_env_email_map()
        kv_map = get_kv_email_map()
        rows = [
            {"email": email, "athleteId": athlete_id, "source": "env", "managed": False}
            for email, athlete_id in env_map.items()
        ]
        rows += [
            {"email": email, "athleteId": athlete_id, "source": "kv", "managed": True}
            for email, athlete_id in kv_map.items()
            if email not in env_map
        ]
        rows.sort(key=lambda r: r["athleteId"])
        return rows

    def _send_json(self, status: int, data: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
