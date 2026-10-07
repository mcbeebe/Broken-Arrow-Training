"""The public request-access endpoint, before the landing page makes it public.

POST /api/auth/athletes {"action": "request_access", ...} is the only
unauthenticated write in the API. Initiative 003 puts it behind a public
form, so these tests pin what it must do under a bot, a flood and a KV
outage (plan.md § PR 2):

- a KV read that fails is never mistaken for an empty queue (the queue-wipe
  bug: the next request used to overwrite every pending one);
- a KV failure answers 503, never the outer handler's 500 "Google auth
  failed";
- a filled honeypot, a 6th request from one IP in an hour, and the 21st admin
  email in a UTC day are each absorbed without touching what they shouldn't;
- the client's IP never reaches storage, only a salted hash of it.

Nothing here talks to the network. Upstash's REST API and Resend are both
replaced at `urllib.request.urlopen`, the one call every KV and email path
goes through, so the real URL building, the `/multi-exec` body and the
response parsing are all exercised.
"""

import email.message
import hashlib
import io
import json
import urllib.error
import urllib.parse
from datetime import datetime, timezone

import pytest

from api.auth import _helpers as H
from api.auth import google as G

KV_URL = "https://kv.test"
SALT = "test-salt-for-access-requests"
QUEUE_KEY = H.KV_ACCESS_REQUESTS_KEY
OK_MSG = {"ok": True}
BAD_EMAIL_MSG = {"error": "Please enter a valid email address."}
UNAVAILABLE_MSG = {"error": "Requests are temporarily unavailable — please email Mike directly."}


class FakeResponse(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeWorld:
    """Upstash REST (get / set / multi-exec) plus Resend, in memory.

    Every request is logged raw, so a test can search all traffic to KV for
    something that must never be there."""

    def __init__(self):
        self.store: dict[str, str] = {}
        self.ttl: dict[str, int] = {}
        self.kv_requests: list[tuple[str, str]] = []
        self.emails: list[dict] = []
        self.fail_reads = False
        self.fail_writes = False
        self.fail_multi = False
        self.multi_error = False

    # urlopen(req, timeout=...)
    def urlopen(self, req, timeout=None):
        url = req.full_url
        body = req.data.decode() if req.data else ""
        if url.startswith("https://api.resend.com/"):
            self.emails.append(json.loads(body))
            return FakeResponse(b"{}")
        assert url.startswith(KV_URL + "/"), f"unexpected network call: {url}"
        self.kv_requests.append((url, body))
        path = url[len(KV_URL) + 1:]
        if path == "multi-exec":
            if self.fail_multi:
                raise urllib.error.URLError("kv unreachable")
            return FakeResponse(json.dumps(self._multi(json.loads(body))).encode())
        if path == "pipeline":
            raise AssertionError("/pipeline is not transactional; use /multi-exec")
        cmd, _, rest = path.partition("/")
        if cmd == "get":
            if self.fail_reads:
                raise urllib.error.URLError("kv unreachable")
            key = urllib.parse.unquote(rest)
            return FakeResponse(json.dumps({"result": self.store.get(key)}).encode())
        if cmd == "set":
            if self.fail_writes:
                raise urllib.error.URLError("kv unreachable")
            key, _, value = rest.partition("/")
            self.store[urllib.parse.unquote(key)] = urllib.parse.unquote(value)
            return FakeResponse(b'{"result":"OK"}')
        raise AssertionError(f"unexpected KV command: {path}")

    def _multi(self, commands):
        assert isinstance(commands, list) and all(isinstance(c, list) for c in commands)
        if self.multi_error:
            return [{"error": "ERR something"} for _ in commands]
        out = []
        for c in commands:
            op = c[0].upper()
            if op == "SET":
                key, value, *opts = c[1:]
                opts = [str(o).upper() for o in opts]
                if "NX" in opts and key in self.store:
                    out.append({"result": None})
                    continue
                self.store[key] = str(value)
                if "EX" in opts:
                    self.ttl[key] = int(opts[opts.index("EX") + 1])
                out.append({"result": "OK"})
            elif op == "INCR":
                n = int(self.store.get(c[1], "0")) + 1
                self.store[c[1]] = str(n)
                out.append({"result": n})
            else:
                raise AssertionError(f"unexpected command in transaction: {c}")
        return out

    # helpers for assertions
    def queue(self) -> list[dict]:
        raw = self.store.get(QUEUE_KEY)
        return json.loads(raw) if raw else []

    def queue_writes(self) -> int:
        prefix = f"{KV_URL}/set/{urllib.parse.quote(QUEUE_KEY, safe='')}/"
        return sum(1 for url, _ in self.kv_requests if url.startswith(prefix))

    def admin_emails(self) -> list[dict]:
        return [e for e in self.emails if e["to"] == ["admin@example.com"]]


@pytest.fixture()
def world(monkeypatch):
    w = FakeWorld()
    monkeypatch.setattr(H.urllib.request, "urlopen", w.urlopen)
    monkeypatch.setenv("KV_REST_API_URL", KV_URL)
    monkeypatch.setenv("KV_REST_API_TOKEN", "kv-token")
    monkeypatch.setenv("RESEND_API_KEY", "re-key")
    monkeypatch.setenv("NOTIFY_EMAIL", "admin@example.com")
    monkeypatch.setenv("ATHLETE_EMAILS", "mike:mike@example.com")
    monkeypatch.setenv("ACCESS_REQUEST_SALT", SALT)
    monkeypatch.delenv("APP_URL", raising=False)
    return w


def post(body: dict, ip: str | None = "198.51.100.7", xff: str | None = None):
    """Drive google.py's do_POST without a socket; return (status, json)."""
    h = G.handler.__new__(G.handler)
    raw = json.dumps(body).encode()
    headers = email.message.Message()
    headers["Content-Length"] = str(len(raw))
    if xff is not None:
        headers["X-Forwarded-For"] = xff
    elif ip is not None:
        headers["X-Forwarded-For"] = ip
    h.headers = headers
    h.rfile = io.BytesIO(raw)
    sent: list[tuple[int, dict]] = []
    h._send_json = lambda status, data: sent.append((status, data))
    h.do_POST()
    assert len(sent) == 1, "handler must answer exactly once"
    return sent[0]


def req(email_addr="new@example.com", **extra):
    return {"action": "request_access", "email": email_addr, "note": "", **extra}


def ip_key(ip: str) -> str:
    return "access_req:ip:" + hashlib.sha256((SALT + ip).encode()).hexdigest()[:32]


def mail_key() -> str:
    return "access_req:mail:" + datetime.now(timezone.utc).strftime("%Y%m%d")


# ── the happy path and the contracts it keeps ───────────────────────────

def test_a_valid_request_queues_once_and_emails_the_admin_once(world):
    status, body = post(req("New@Example.com ", note="Training for Boston"))
    assert (status, body) == (200, OK_MSG)
    [entry] = world.queue()
    assert entry["email"] == "new@example.com"
    assert entry["note"] == "Training for Boston"
    assert isinstance(entry["ts"], int)
    [mail] = world.emails
    assert mail["to"] == ["admin@example.com"]
    assert "new@example.com" in mail["subject"]
    assert "Training for Boston" in mail["text"]


def test_an_invalid_email_is_400_with_the_existing_message_and_touches_nothing(world):
    status, body = post(req("not-an-email"))
    assert (status, body) == (400, BAD_EMAIL_MSG)
    assert world.queue() == []
    assert world.emails == []


def test_an_already_approved_email_gets_200_but_nothing_is_queued_or_sent(world):
    status, body = post(req("mike@example.com"))
    assert (status, body) == (200, OK_MSG)
    assert world.queue() == []
    assert world.emails == []


def test_a_request_appends_to_the_existing_queue(world):
    world.store[QUEUE_KEY] = json.dumps([{"email": "a@example.com", "note": "", "ts": 1}])
    assert post(req("b@example.com"))[0] == 200
    assert [r["email"] for r in world.queue()] == ["a@example.com", "b@example.com"]


# ── honeypot ────────────────────────────────────────────────────────────

def test_a_filled_honeypot_gets_200_and_nothing_else_happens(world, capsys):
    status, body = post(req(hp_contact_ref="https://spam.example"))
    assert (status, body) == (200, OK_MSG)
    assert world.queue() == []
    assert world.emails == []
    assert world.kv_requests == [], "a honeypot hit must not reach KV at all"
    out = capsys.readouterr().out
    assert out.count("\n") == 1, "one log line per hit"
    assert "honeypot" in out


def test_the_honeypot_log_line_counts_hits(world, capsys):
    post(req(hp_contact_ref="x"))
    first = capsys.readouterr().out
    post(req(hp_contact_ref="x"))
    second = capsys.readouterr().out
    n1 = int(first.split("#")[1].split()[0])
    n2 = int(second.split("#")[1].split()[0])
    assert n2 == n1 + 1


def test_an_empty_honeypot_is_a_normal_request(world):
    assert post(req(hp_contact_ref=""))[0] == 200
    assert len(world.queue()) == 1
    assert len(world.emails) == 1


def test_a_honeypot_hit_with_a_bad_email_is_still_a_silent_200(world):
    """A bot must not learn from a 400 that the honeypot was skipped."""
    assert post(req("junk", hp_contact_ref="x")) == (200, OK_MSG)
    assert world.kv_requests == []


# ── per-IP throttle ─────────────────────────────────────────────────────

def test_the_sixth_request_from_one_ip_in_an_hour_is_429(world):
    for i in range(5):
        assert post(req(f"u{i}@example.com"), ip="203.0.113.9")[0] == 200
    status, body = post(req("u5@example.com"), ip="203.0.113.9")
    assert (status, body) == (429, {"error": "Too many requests"})
    assert len(world.queue()) == 5, "the throttled request was not queued"
    assert len(world.emails) == 5


def test_a_different_ip_is_not_throttled_by_anothers_count(world):
    for i in range(6):
        post(req(f"u{i}@example.com"), ip="203.0.113.9")
    assert post(req("other@example.com"), ip="203.0.113.10") == (200, OK_MSG)


def test_the_throttle_keys_on_the_first_forwarded_for_entry(world):
    for i in range(5):
        post(req(f"u{i}@example.com"), xff=f"203.0.113.9, 10.0.0.{i}")
    assert post(req("u5@example.com"), xff="203.0.113.9,10.9.9.9")[0] == 429


def test_the_throttle_counter_always_has_a_one_hour_expiry(world):
    post(req(), ip="203.0.113.9")
    key = ip_key("203.0.113.9")
    assert world.store[key] == "1"
    assert world.ttl[key] == 3600


def test_the_throttle_is_one_multi_exec_transaction_set_nx_ex_then_incr(world):
    post(req(), ip="203.0.113.9")
    multi = [json.loads(b) for url, b in world.kv_requests if url.endswith("/multi-exec")]
    key = ip_key("203.0.113.9")
    assert [["SET", key, "0", "EX", "3600", "NX"], ["INCR", key]] in multi


def test_the_already_approved_answer_is_throttled_like_any_other(world):
    """Same 429 whether or not the email is on the roster, so the throttle
    can't be used to tell members from strangers either."""
    for _ in range(5):
        post(req("mike@example.com"), ip="203.0.113.9")
    assert post(req("mike@example.com"), ip="203.0.113.9")[0] == 429


def test_when_the_throttle_call_fails_the_request_still_queues(world):
    world.fail_multi = True
    for i in range(7):
        assert post(req(f"u{i}@example.com"), ip="203.0.113.9") == (200, OK_MSG)
    assert len(world.queue()) == 7


def test_a_transaction_that_answers_errors_also_fails_open(world):
    world.multi_error = True
    assert post(req(), ip="203.0.113.9") == (200, OK_MSG)
    assert len(world.queue()) == 1


def test_without_a_salt_the_throttle_is_off_rather_than_storing_a_guessable_hash(world, monkeypatch):
    monkeypatch.delenv("ACCESS_REQUEST_SALT")
    for i in range(7):
        assert post(req(f"u{i}@example.com"), ip="203.0.113.9")[0] == 200
    assert not any(k.startswith("access_req:ip:") for k in world.store)


def test_a_request_with_no_forwarded_for_is_not_throttled(world):
    for i in range(7):
        assert post(req(f"u{i}@example.com"), ip=None)[0] == 200


# ── the raw IP never reaches storage ────────────────────────────────────

@pytest.mark.parametrize("ip", ["203.0.113.77", "2001:db8::abcd:77"])
def test_the_raw_ip_never_appears_in_any_kv_key_or_value(world, ip):
    for i in range(7):
        post(req(f"u{i}@example.com", note=f"note {i}", source="tool-heat"), ip=ip)
    assert any(k.startswith("access_req:ip:") for k in world.store), "throttle ran"
    for url, body in world.kv_requests:
        for text in (url, urllib.parse.unquote(url), body):
            assert ip not in text
    for key, value in world.store.items():
        assert ip not in key and ip not in value
    assert ip_key(ip) in world.store
    assert len(ip_key(ip)) == len("access_req:ip:") + 32


# ── KV failures: 503, and the queue survives ────────────────────────────

def test_a_failed_queue_read_is_503_and_the_existing_queue_is_not_overwritten(world):
    existing = [{"email": f"p{i}@example.com", "note": "", "ts": i} for i in range(3)]
    world.store[QUEUE_KEY] = json.dumps(existing)
    world.fail_reads = True
    status, body = post(req())
    assert (status, body) == (503, UNAVAILABLE_MSG)
    assert world.queue() == existing
    assert world.queue_writes() == 0
    assert world.emails == []


def test_a_corrupt_queue_is_503_and_left_for_a_human_not_overwritten(world):
    world.store[QUEUE_KEY] = "{not json"
    assert post(req()) == (503, UNAVAILABLE_MSG)
    assert world.store[QUEUE_KEY] == "{not json"
    assert world.queue_writes() == 0


def test_a_queue_write_that_raises_urlerror_is_503_not_500(world):
    world.fail_writes = True
    status, body = post(req())
    assert status == 503
    assert body == UNAVAILABLE_MSG
    assert world.emails == []


def test_kv_unconfigured_is_still_503(world, monkeypatch):
    monkeypatch.delenv("KV_REST_API_URL")
    assert post(req()) == (503, UNAVAILABLE_MSG)


def test_the_strict_read_raises_where_the_lenient_one_returns_empty(world):
    world.store[QUEUE_KEY] = json.dumps([{"email": "a@example.com"}])
    world.fail_reads = True
    assert H.get_access_requests() == []  # the admin list view stays lenient
    with pytest.raises(urllib.error.URLError):
        H.get_access_requests_strict()
    with pytest.raises(urllib.error.URLError):
        H.add_access_request("b@example.com", "")
    world.fail_reads = False
    assert world.queue() == [{"email": "a@example.com"}]


def test_the_strict_read_of_an_empty_store_is_an_empty_queue(world):
    assert H.get_access_requests_strict() == []


# ── admin email cap ─────────────────────────────────────────────────────

def test_the_21st_admin_email_in_a_utc_day_is_queued_but_not_sent(world):
    for i in range(21):
        status, _ = post(req(f"u{i}@example.com"), ip=f"203.0.113.{i}")
        assert status == 200
    assert len(world.queue()) == 21
    assert len(world.admin_emails()) == 20
    assert world.queue()[-1]["email"] == "u20@example.com"
    assert world.ttl[mail_key()] == 2 * 86400


def test_the_email_cap_is_per_utc_day(world):
    world.store["access_req:mail:19990101"] = "500"
    assert post(req())[0] == 200
    assert len(world.admin_emails()) == 1


def test_a_request_past_the_cap_still_answers_200(world):
    world.store[mail_key()] = "20"
    assert post(req()) == (200, OK_MSG)
    assert len(world.queue()) == 1
    assert world.admin_emails() == []


# ── source ──────────────────────────────────────────────────────────────

def test_a_valid_source_is_stored_and_printed_in_the_admin_email(world):
    assert post(req(source="tool-heat"))[0] == 200
    assert world.queue()[0]["source"] == "tool-heat"
    [mail] = world.emails
    assert "Source: tool-heat" in mail["text"]
    assert "Source: tool-heat" in mail["html"]


@pytest.mark.parametrize("source", [
    None, "", "Tool-Heat", "tool heat", "a" * 41, "<script>", "tool_heat", 42, ["landing"],
    "tool-heat\n", "None",
])
def test_an_invalid_or_missing_source_is_dropped(world, source):
    assert post(req(source=source))[0] == 200
    entry = world.queue()[0]
    assert "source" not in entry
    assert "None" not in json.dumps(entry)
    assert "Source:" not in world.emails[0]["text"]


def test_no_source_key_at_all_is_dropped_too(world):
    body = req()
    body.pop("note")
    assert post(body)[0] == 200
    assert "source" not in world.queue()[0]


def test_a_forty_character_source_is_kept(world):
    assert post(req(source="a" * 40))[0] == 200
    assert world.queue()[0]["source"] == "a" * 40


def test_the_note_is_still_truncated_to_200(world):
    assert post(req(note="x" * 500, source="landing"))[0] == 200
    entry = world.queue()[0]
    assert entry["note"] == "x" * H.MAX_REQUEST_NOTE_LEN
    assert H.MAX_REQUEST_NOTE_LEN == 200
    assert entry["source"] == "landing"


def test_a_note_with_markup_is_escaped_in_the_admin_email(world):
    post(req(note="<b>hi</b>", source="landing"))
    assert "&lt;b&gt;hi&lt;/b&gt;" in world.emails[0]["html"]
