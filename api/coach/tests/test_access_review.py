"""One-click review links in the admin's access-request email.

The email carries signed Approve and Dismiss links to
GET /api/auth/google?review=...&email=...&exp=...&sig=... . These tests pin:

- a link can't be forged, re-aimed at another email or action, or used
  after 7 days, and the page never says "expired" to a forger;
- opening a link (GET) changes nothing, so a mail scanner that fetches every
  link can't approve anyone; only the confirm page's form POST does;
- approving twice adds once and emails the athlete once;
- a new athlete never inherits someone else's athlete ID (mike@elsewhere
  must not sign in as `mike`), from the link or from Settings;
- an allowlist that can't be read is never written back as empty.

Network is faked at urlopen by test_access_request's FakeWorld.
"""

import email.message
import io
import json
import urllib.parse

import pytest

from api.auth import _helpers as H
from api.auth import google as G
from api.coach.tests.test_access_request import FakeWorld, post, req

SECRET = "test-jwt-secret"
API = "https://api.example.test"
ALLOWLIST_KEY = H.KV_ATHLETE_EMAILS_KEY


@pytest.fixture()
def world(monkeypatch):
    w = FakeWorld()
    monkeypatch.setattr(H.urllib.request, "urlopen", w.urlopen)
    monkeypatch.setenv("KV_REST_API_URL", "https://kv.test")
    monkeypatch.setenv("KV_REST_API_TOKEN", "kv-token")
    monkeypatch.setenv("RESEND_API_KEY", "re-key")
    monkeypatch.setenv("NOTIFY_EMAIL", "admin@example.com")
    monkeypatch.setenv("ATHLETE_EMAILS", "mike:mike@example.com")
    monkeypatch.setenv("ACCESS_REQUEST_SALT", "salt")
    monkeypatch.setenv("OAUTH_JWT_SECRET", SECRET)
    monkeypatch.setenv("API_URL", API)
    monkeypatch.delenv("VERCEL_PROJECT_PRODUCTION_URL", raising=False)
    monkeypatch.delenv("APP_URL", raising=False)
    return w


def allowlist(w: FakeWorld) -> dict:
    raw = w.store.get(ALLOWLIST_KEY)
    return json.loads(raw) if raw else {}


def link_params(url: str) -> dict:
    assert url.startswith(f"{API}/api/auth/google?")
    return {k: v[0] for k, v in urllib.parse.parse_qs(urllib.parse.urlsplit(url).query).items()}


class Page:
    def __init__(self):
        self.status = None
        self.headers: dict[str, str] = {}
        self.wfile = io.BytesIO()

    @property
    def html(self) -> str:
        return self.wfile.getvalue().decode()


def _handler(page: Page, path: str, headers: email.message.Message, body: bytes):
    h = G.handler.__new__(G.handler)
    h.path = path
    h.headers = headers
    h.rfile = io.BytesIO(body)
    h.wfile = page.wfile
    h.send_response = lambda code, message=None: setattr(page, "status", code)
    h.send_header = lambda k, v: page.headers.__setitem__(k, v)
    h.end_headers = lambda: None
    h._send_json = lambda status, data: pytest.fail(f"review flow answered JSON {status} {data}")
    return h


def get(url_or_params) -> Page:
    """Open a review link, as a browser (or a mail scanner) would."""
    if isinstance(url_or_params, dict):
        path = "/api/auth/google?" + urllib.parse.urlencode(url_or_params)
    else:
        parts = urllib.parse.urlsplit(url_or_params)
        path = f"{parts.path}?{parts.query}"
    page = Page()
    _handler(page, path, email.message.Message(), b"").do_GET()
    return page


def submit(params: dict) -> Page:
    """The confirm page's button: a form POST of the same four fields."""
    raw = urllib.parse.urlencode(params).encode()
    headers = email.message.Message()
    headers["Content-Type"] = "application/x-www-form-urlencoded"
    headers["Content-Length"] = str(len(raw))
    page = Page()
    _handler(page, "/api/auth/google", headers, raw).do_POST()
    return page


def queue_request(w, addr="new@example.com", note=""):
    status, _ = post(req(addr, note=note))
    assert status == 200
    w.emails.clear()


def params_for(action, addr="new@example.com", now=None):
    return link_params(H.review_url(action, addr, now=now))


# ── signing ─────────────────────────────────────────────────────────────

def test_a_fresh_link_checks_out(world):
    p = params_for("approve")
    assert H.check_review(p["review"], p["email"], p["exp"], p["sig"]) == "ok"
    assert p["email"] == "new@example.com"


@pytest.mark.parametrize("field, value", [
    ("email", "other@example.com"),
    ("review", "dismiss"),
    ("exp", "9999999999"),
    ("sig", "0" * 64),
    ("sig", ""),
    ("exp", "12ab"),
    ("review", "delete"),
])
def test_any_changed_field_is_invalid(world, field, value):
    p = params_for("approve")
    p[field] = value
    assert H.check_review(p["review"], p["email"], p["exp"], p["sig"]) == "invalid"


def test_the_email_is_compared_case_insensitively(world):
    p = params_for("approve", "New@Example.com")
    assert H.check_review("approve", "NEW@example.COM", p["exp"], p["sig"]) == "ok"


def test_a_link_expires_after_seven_days(world):
    issued = 1_800_000_000
    p = params_for("approve", now=issued)
    args = (p["review"], p["email"], p["exp"], p["sig"])
    assert H.check_review(*args, now=issued + 7 * 86400) == "ok"
    assert H.check_review(*args, now=issued + 7 * 86400 + 1) == "expired"


def test_a_forged_expired_link_reads_invalid_not_expired(world):
    assert H.check_review("approve", "new@example.com", "1", "f" * 64) == "invalid"


def test_another_secret_invalidates_every_link(world, monkeypatch):
    p = params_for("approve")
    monkeypatch.setenv("OAUTH_JWT_SECRET", "rotated")
    assert H.check_review(p["review"], p["email"], p["exp"], p["sig"]) == "invalid"


def test_without_a_secret_there_are_no_links_and_nothing_verifies(world, monkeypatch):
    p = params_for("approve")
    monkeypatch.setenv("OAUTH_JWT_SECRET", "")
    assert H.review_url("approve", "new@example.com") is None
    assert H.check_review(p["review"], p["email"], p["exp"], p["sig"]) == "invalid"


def test_a_review_signature_is_not_a_session_signature(world):
    """The review key is derived, not the raw JWT secret: a session token's
    HMAC over the same bytes must not match."""
    import hashlib
    import hmac
    exp = 2_000_000_000
    raw = hmac.new(SECRET.encode(), f"approve\nnew@example.com\n{exp}".encode(),
                   hashlib.sha256).hexdigest()
    assert H.check_review("approve", "new@example.com", str(exp), raw) == "invalid"


def test_api_url_prefers_the_override_then_vercels_production_domain(monkeypatch):
    monkeypatch.setenv("API_URL", "https://api.attune.test/")
    monkeypatch.setenv("VERCEL_PROJECT_PRODUCTION_URL", "broken-arrow-training.vercel.app")
    assert H.api_url() == "https://api.attune.test"
    monkeypatch.delenv("API_URL")
    assert H.api_url() == "https://broken-arrow-training.vercel.app"
    monkeypatch.delenv("VERCEL_PROJECT_PRODUCTION_URL")
    assert H.api_url() is None


# ── the admin's email ───────────────────────────────────────────────────

def test_the_admin_email_carries_working_approve_and_dismiss_links(world):
    post(req("new@example.com", note="Boston '27"))
    [mail] = world.emails
    assert mail["to"] == ["admin@example.com"]
    urls = [u for u in mail["text"].split() if u.startswith(API)]
    assert len(urls) == 2
    actions = set()
    for u in urls:
        p = link_params(u)
        assert H.check_review(p["review"], p["email"], p["exp"], p["sig"]) == "ok"
        actions.add(p["review"])
        assert H._esc(u) in mail["html"]
    assert actions == {"approve", "dismiss"}
    assert "Boston &#39;27" in mail["html"]
    assert "Settings → Athletes" in mail["text"]


def test_without_an_api_url_the_email_still_goes_with_the_settings_route(world, monkeypatch):
    monkeypatch.delenv("API_URL")
    post(req("new@example.com"))
    [mail] = world.emails
    assert "Approve:" not in mail["text"]
    assert "/api/auth/google" not in mail["html"]
    assert "Settings → Athletes" in mail["html"]


# ── opening a link changes nothing ──────────────────────────────────────

def test_opening_the_approve_link_only_shows_a_confirm_page(world):
    queue_request(world, note="Training for Boston")
    before = dict(world.store)
    page = get(H.review_url("approve", "new@example.com"))
    assert page.status == 200
    assert "Approve <strong>new@example.com</strong>?" in page.html
    assert "Training for Boston" in page.html
    assert "<form method='post' action='/api/auth/google'>" in page.html
    assert world.store == before
    assert world.emails == []


def test_the_confirm_page_is_not_cached_framed_indexed_or_leaked(world):
    queue_request(world)
    page = get(H.review_url("approve", "new@example.com"))
    assert page.headers["Content-Type"] == "text/html; charset=utf-8"
    assert page.headers["Cache-Control"] == "no-store"
    assert page.headers["Referrer-Policy"] == "no-referrer"
    assert page.headers["X-Frame-Options"] == "DENY"
    assert "frame-ancestors 'none'" in page.headers["Content-Security-Policy"]
    assert "default-src 'none'" in page.headers["Content-Security-Policy"]
    assert page.headers["X-Robots-Tag"] == "noindex"


def test_the_confirm_form_escapes_a_quote_in_the_email(world):
    addr = "o'brien@example.com"
    queue_request(world, addr)
    page = get(H.review_url("approve", addr))
    assert page.status == 200
    assert "value='o&#39;brien@example.com'" in page.html
    assert "o'brien" not in page.html


@pytest.mark.parametrize("mutate", [
    lambda p: p.update(email="someone@else.com"),
    lambda p: p.update(sig="0" * 64),
    lambda p: p.pop("sig"),
    lambda p: p.update(review="dismiss"),
])
def test_a_tampered_link_is_403_and_changes_nothing(world, mutate):
    queue_request(world)
    before = dict(world.store)
    p = params_for("approve")
    mutate(p)
    for page in (get(p), submit(p)):
        assert page.status == 403
        assert "isn't valid" in page.html
    assert world.store == before
    assert world.emails == []


def test_an_expired_link_is_410_and_changes_nothing(world):
    queue_request(world)
    before = dict(world.store)
    p = params_for("approve", now=1_000_000_000)
    for page in (get(p), submit(p)):
        assert page.status == 410
        assert "expired" in page.html
    assert world.store == before


def test_an_empty_form_post_is_403(world):
    assert submit({}).status == 403


# ── approving ───────────────────────────────────────────────────────────

def test_confirming_approves_clears_the_queue_and_emails_the_athlete(world):
    queue_request(world)
    page = submit(params_for("approve"))
    assert page.status == 200
    assert "<h1>Approved</h1>" in page.html
    assert "We've emailed them" in page.html
    assert allowlist(world) == {"new@example.com": "new"}
    assert world.queue() == []
    [mail] = world.emails
    assert mail["to"] == ["new@example.com"]
    assert "https://attune.coach/app" in mail["text"]
    assert H.lookup_athlete("new@example.com") == "new"


def test_confirming_twice_adds_once_and_emails_once(world):
    queue_request(world)
    p = params_for("approve")
    submit(p)
    world.emails.clear()
    writes = len(world.kv_requests)
    page = submit(p)
    assert page.status == 200
    assert "Already approved" in page.html
    assert world.emails == []
    assert allowlist(world) == {"new@example.com": "new"}
    # the second press reads, it never writes
    assert not any("/set/" in url for url, _ in world.kv_requests[writes:])


def test_opening_the_link_after_approving_says_already_approved(world):
    queue_request(world)
    submit(params_for("approve"))
    page = get(H.review_url("approve", "new@example.com"))
    assert "Already approved" in page.html
    assert "<form" not in page.html


def test_a_stranger_never_gets_the_admins_athlete_id(world):
    queue_request(world, "mike@elsewhere.com")
    submit(params_for("approve", "mike@elsewhere.com"))
    assert allowlist(world) == {"mike@elsewhere.com": "mike-2"}
    assert H.lookup_athlete("mike@example.com") == "mike"


def test_an_email_already_on_the_env_seed_reads_already_approved(world):
    page = get(H.review_url("approve", "mike@example.com"))
    assert "Already approved" in page.html
    assert "<code>mike</code>" in page.html


def test_approve_still_works_after_a_dismiss(world):
    queue_request(world)
    submit(params_for("dismiss"))
    page = get(H.review_url("approve", "new@example.com"))
    assert "no longer in the queue" in page.html
    submit(params_for("approve"))
    assert allowlist(world) == {"new@example.com": "new"}


def test_when_the_athlete_email_fails_the_page_says_so(world, monkeypatch):
    queue_request(world)
    monkeypatch.setattr(G, "notify_user_approved", lambda addr: False)
    page = submit(params_for("approve"))
    assert "<h1>Approved</h1>" in page.html
    assert "didn't send" in page.html
    assert "https://attune.coach/app" in page.html


def test_an_unreadable_allowlist_is_503_and_never_overwritten(world):
    queue_request(world)
    world.store[ALLOWLIST_KEY] = json.dumps({"joel@example.com": "joel"})
    world.fail_reads = True
    page = submit(params_for("approve"))
    assert page.status == 503
    world.fail_reads = False
    assert allowlist(world) == {"joel@example.com": "joel"}
    assert world.emails == []


# ── dismissing ──────────────────────────────────────────────────────────

def test_dismiss_confirms_then_removes_without_emailing_anyone(world):
    queue_request(world)
    page = get(H.review_url("dismiss", "new@example.com"))
    assert "Dismiss the request from <strong>new@example.com</strong>?" in page.html
    assert len(world.queue()) == 1
    page = submit(params_for("dismiss"))
    assert "<h1>Dismissed</h1>" in page.html
    assert world.queue() == []
    assert allowlist(world) == {}
    assert world.emails == []


def test_dismissing_nothing_says_so(world):
    page = get(H.review_url("dismiss", "nobody@example.com"))
    assert "Nothing to dismiss" in page.html
    assert "<form" not in page.html


# ── Settings → Athletes uses the same approve ───────────────────────────

def admin_token():
    return H.create_session_token("mike", "mike@example.com", "google")


def test_settings_approve_never_reuses_an_athlete_id(world):
    queue_request(world, "mike@elsewhere.com")
    status, body = post({"action": "requests_approve", "token": admin_token(),
                         "email": "mike@elsewhere.com", "athleteId": "mike"})
    assert status == 200
    assert allowlist(world) == {"mike@elsewhere.com": "mike-2"}
    assert body["requests"] == []
    assert [e["to"] for e in world.emails] == [["mike@elsewhere.com"]]


def test_settings_approve_never_wipes_an_unreadable_allowlist(world):
    queue_request(world)
    world.store[ALLOWLIST_KEY] = json.dumps({"joel@example.com": "joel"})
    world.fail_reads = True
    status, _ = post({"action": "requests_approve", "token": admin_token(),
                      "email": "new@example.com", "athleteId": "new"})
    assert status == 503
    world.fail_reads = False
    assert allowlist(world) == {"joel@example.com": "joel"}


# ── unique_athlete_id ───────────────────────────────────────────────────

@pytest.mark.parametrize("seed, taken, expected", [
    ("jane.doe+run@x.com", set(), "janedoerun"),
    ("Jane@x.com", {"jane"}, "jane-2"),
    ("jane@x.com", {"jane", "jane-2"}, "jane-3"),
    ("...@x.com", set(), "athlete"),
    ("-lead@x.com", set(), "lead"),
    ("a" * 50 + "@x.com", {"a" * 40}, "a" * 38 + "-2"),
    ("preferred", {"preferred"}, "preferred-2"),
])
def test_unique_athlete_id(seed, taken, expected):
    out = H.unique_athlete_id(seed, taken)
    assert out == expected
    assert G.ATHLETE_ID_RE.match(out)
    assert len(out) <= 40


# ── send_email says why it didn't ───────────────────────────────────────

def test_send_email_logs_when_resend_is_not_configured(monkeypatch, capsys):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    assert H.send_email("a@example.com", "s", "<p>h</p>") is False
    assert "RESEND_API_KEY unset" in capsys.readouterr().out


def test_send_email_logs_the_status_of_a_rejected_send(monkeypatch, capsys):
    import urllib.error

    def refuse(req, timeout=None):
        raise urllib.error.HTTPError(req.full_url, 403, "Forbidden", {}, None)

    monkeypatch.setenv("RESEND_API_KEY", "re-key")
    monkeypatch.setattr(H.urllib.request, "urlopen", refuse)
    assert H.send_email("a@example.com", "s", "<p>h</p>") is False
    out = capsys.readouterr().out
    assert "send failed (HTTPError 403)" in out
    assert "a@example.com" not in out
