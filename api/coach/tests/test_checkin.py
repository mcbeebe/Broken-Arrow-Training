"""Coach check-in email (initiative 005, PR 1).

Locks:
  1. THE SNAPSHOT IS VALIDATED — junk is refused or dropped, never stored as-is.
  2. THE DIGEST IS RIGHT — done / missed / not-yet-synced are told apart, and
     every window is measured from the send date, not the upload date.
  3. THE EMAIL IS SAFE — names from the plan are HTML-escaped; it states the
     data date and says plainly when that date is stale.
  4. THE SCHEDULE — Sunday and Wednesday, 6:00 local (retried to 9:59), in
     the athlete's own zone (Kiritimati and a DST weekend included), once.
  5. THE MODEL IS OPTIONAL — a failed coach read still sends the email.
  6. THE ENDPOINT — owner-only, opt-in, size-capped, rate-limited tests.
"""

import io
import json
from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest

from api.coach import _checkin as K
from api.coach import _core as C
from api.coach import checkin as E
from api.auth import _helpers as H


# ── fixtures ─────────────────────────────────────────────────────────────

def day(iso, type_="run", workout="Easy run", detail="5 mi easy", actual=None, week=6, minutes=50):
    d = {"date": iso, "week": week, "type": type_, "workout": workout, "detail": detail,
         "zone": "Z2", "minutes": minutes}
    if actual is not None:
        d["actual"] = actual
    return d


def snapshot(**over):
    """Sat 2026-10-10 upload. Plan week 6 runs Mon 10/5 – Sun 10/11."""
    days = [
        # last week (week 5): Mon 9/28 .. Sun 10/4
        day("2026-09-28", "rest", "Rest", "", week=5),
        day("2026-09-29", actual={"miles": 5.0, "minutes": 48, "name": "Easy"}, week=5),
        day("2026-09-30", "quality", "Tempo", "3 x 2 mi @ T", actual={"miles": 8.0, "minutes": 62, "name": "Tempo"}, week=5),
        day("2026-10-01", week=5),  # missed easy
        day("2026-10-02", "strength", "Strength A", "", week=5, actual={"miles": 0, "minutes": 40, "name": "Gym"}),
        day("2026-10-03", "long", "Long run", "12 mi", actual={"miles": 12.1, "minutes": 115, "name": "Long"}, week=5),
        day("2026-10-04", "rest", "Rest", "", week=5),
        # this week (week 6): Mon 10/5 .. Sun 10/11
        day("2026-10-05", "rest", "Rest", ""),
        day("2026-10-06", actual={"miles": 5.2, "minutes": 50, "name": "Easy"}),
        day("2026-10-07", "quality", "Intervals", "6 x 800m"),  # missed key session
        day("2026-10-08", actual={"miles": 4.0, "minutes": 40, "name": "Easy"}),
        day("2026-10-09", "strength", "Strength B", ""),  # missed
        day("2026-10-10", "long", "Long run", "14 mi"),  # the asOf day — not synced yet
        day("2026-10-11", "run", "Recovery jog", "3 mi"),
        # next weeks
        day("2026-10-12", "rest", "Rest", "", week=7),
        day("2026-10-13", "run", "Easy run", "6 mi", week=7),
        day("2026-10-14", "quality", "Threshold <b>bold</b> & co", "2 x 3 mi", week=7),
        day("2026-10-18", "long", "Long run", "15 mi", week=7),
        day("2026-10-21", "quality", "Hills", "8 x 90s", week=8),
        day("2026-10-25", "long", "Long run", "16 mi", week=8),
        day("2026-10-26", "run", "Easy run", "5 mi", week=9),
    ]
    snap = {
        "v": 1,
        "asOf": "2026-10-10",
        "generatedAt": "2026-10-10T20:05:00Z",
        "timezone": "America/Los_Angeles",
        "days": days,
        "weeks": [
            {"num": 5, "startIso": "2026-09-28", "focus": "Build", "plannedMiles": 30},
            {"num": 6, "startIso": "2026-10-05", "focus": "Build", "plannedMiles": 32},
            {"num": 7, "startIso": "2026-10-12", "focus": "Build", "plannedMiles": 34},
            {"num": 8, "startIso": "2026-10-19", "focus": "Recovery week", "plannedMiles": 26},
            {"num": 9, "startIso": "2026-10-26", "focus": "Peak", "plannedMiles": 38},
            {"num": 10, "startIso": "2026-11-02", "focus": "Peak", "plannedMiles": 40},
        ],
        "race": {"name": "Broken Arrow 23K", "date": "2026-12-12"},
        "block": {"currentPhase": "Build", "weekNum": 6, "totalWeeks": 15,
                  "phases": [{"label": "Base", "weekStart": 1, "weekEnd": 4},
                             {"label": "Build", "weekStart": 5, "weekEnd": 9},
                             {"label": "Peak", "weekStart": 10, "weekEnd": 13}]},
        "load": {"date": "2026-10-10", "fitness": 42.3, "fitnessChange": 3.4, "fatigue": 51.0,
                 "balance": -8.7, "balanceLabel": "Steady", "ratio": 1.21, "ratioLabel": "Sweet spot"},
    }
    snap.update(over)
    return snap


SUNDAY = date(2026, 10, 11)


class FakeKV:
    def __init__(self):
        self.store: dict[str, str] = {}
        self.ttls: dict[str, int | None] = {}

    def get(self, key):
        return self.store.get(key)

    def set(self, key, value, ex=None):
        self.store[key] = value
        self.ttls[key] = ex

    def expire(self, key):
        """What Redis does when a key's TTL runs out."""
        self.store.pop(key, None)

    def delete(self, key):
        self.store.pop(key, None)

    def bump(self, key, ttl_seconds, timeout=3):
        value = int(self.store.get(key, "0")) + 1
        self.store[key] = str(value)
        self.ttls[key] = ttl_seconds
        return value

    def unbump(self, key, timeout=3):
        value = int(self.store.get(key, "0")) - 1
        self.store[key] = str(value)
        return value


@pytest.fixture()
def kv(monkeypatch):
    store = FakeKV()
    monkeypatch.setattr(C, "kv_get", store.get)
    monkeypatch.setattr(C, "kv_set", store.set)
    monkeypatch.setattr(K, "kv_del", store.delete)
    monkeypatch.setattr(K, "kv_set", store.set)
    monkeypatch.setattr(K, "_kv_set_large", lambda k, v, ex: store.set(k, v, ex))
    monkeypatch.setattr(H, "kv_bump_counter", store.bump)
    monkeypatch.setattr(H, "kv_unbump_counter", store.unbump)
    monkeypatch.setattr(E, "kv_bump_counter", store.bump)
    monkeypatch.setattr(H, "ADMIN_ATHLETE_ID", "mike")
    monkeypatch.delenv("CHECKIN_ATHLETES", raising=False)
    return store


# ── 1. the snapshot ──────────────────────────────────────────────────────

def test_a_good_snapshot_survives_cleaning():
    snap = K.clean_snapshot(snapshot())
    assert snap["asOf"] == "2026-10-10"
    assert snap["timezone"] == "America/Los_Angeles"
    assert len(snap["days"]) == len(snapshot()["days"])
    assert snap["load"]["fitness"] == 42.3
    assert snap["race"] == {"name": "Broken Arrow 23K", "date": "2026-12-12"}


@pytest.mark.parametrize("bad, code", [
    (None, "bad_snapshot"),
    ([], "bad_snapshot"),
    ({**snapshot(), "v": 2}, "bad_version"),
    ({**snapshot(), "asOf": "10/10/2026"}, "bad_as_of"),
    ({**snapshot(), "asOf": "2026-02-30"}, "bad_as_of"),
    ({**snapshot(), "days": "lots"}, "bad_days"),
])
def test_a_bad_snapshot_is_refused_with_a_code(bad, code):
    with pytest.raises(K.SnapshotError) as e:
        K.clean_snapshot(bad)
    assert e.value.code == code


def test_bad_entries_are_dropped_and_text_is_trimmed():
    raw = snapshot(days=[
        day("2026-10-13", workout="x" * 500),
        {"date": "not a date"},
        "junk",
        {**day("2026-10-14"), "minutes": True},
        {**day("2026-10-15"), "minutes": float("nan")},
    ], timezone="Mars/Olympus_Mons")
    snap = K.clean_snapshot(raw)
    assert [d["date"] for d in snap["days"]] == ["2026-10-13", "2026-10-14", "2026-10-15"]
    assert len(snap["days"][0]["workout"]) == 120
    assert snap["days"][1]["minutes"] is None  # a bool is not a number
    assert snap["days"][2]["minutes"] is None  # nor is NaN
    assert snap["timezone"] == "UTC"


def test_the_day_list_is_capped():
    raw = snapshot(days=[day(f"2026-{m:02d}-{d:02d}") for m in (1, 2, 3, 4) for d in range(1, 29)])
    assert len(K.clean_snapshot(raw)["days"]) == K.MAX_DAYS


# ── 2. the digest ────────────────────────────────────────────────────────

def test_this_week_tells_done_missed_and_unsynced_apart():
    dg = K.build_digest(K.clean_snapshot(snapshot()), SUNDAY)
    sf = dg["soFar"]
    # Tue–Sat sessions before Sunday: easy ✓, intervals ✗, easy ✓, strength ✗, long (asOf, unknown)
    assert sf["planned"] == 5
    assert sf["done"] == 2
    assert sf["unsynced"] == 1
    assert sf["missedKey"] == ["Intervals (Wed 10/7)"]
    assert len(sf["missed"]) == 2
    assert sf["miles"] == pytest.approx(9.2)
    assert [d["workout"] for d in dg["todaySessions"]] == ["Recovery jog"]
    assert dg["weekNum"] == 6 and dg["weekFocus"] == "Build"


def test_the_last_two_weeks_are_counted_back_from_the_send_date():
    dg = K.build_digest(K.clean_snapshot(snapshot()), SUNDAY)
    l14 = dg["last14"]
    # 9/27..10/10: week 5 has 5 sessions (4 done), week 6 so far 5 (2 done)
    assert l14["planned"] == 10
    assert l14["done"] == 6
    assert l14["keyPlanned"] == 4 and l14["keyDone"] == 2
    assert l14["miles"] == pytest.approx(5 + 8 + 0 + 12.1 + 5.2 + 4)


def test_the_next_two_weeks_start_tomorrow_skip_rest_days_and_end_with_a_plan_week():
    dg = K.build_digest(K.clean_snapshot(snapshot()), SUNDAY)
    dates = [d["date"] for d in dg["next14"]]
    # Day 13 is Sat 10/24, in week 8: the list runs on to that week's Sunday.
    assert dates == ["2026-10-13", "2026-10-14", "2026-10-18", "2026-10-21", "2026-10-25"]
    assert "2026-10-11" not in dates  # today is under 'This week'
    assert "2026-10-12" not in dates  # rest
    assert "2026-10-26" not in dates  # week 9 — 'further ahead'


def test_further_ahead_has_the_race_the_phase_and_later_weeks():
    dg = K.build_digest(K.clean_snapshot(snapshot()), SUNDAY)
    assert dg["raceLine"] == "Broken Arrow 23K is 9 weeks away (Saturday, Dec 12)."
    assert dg["currentPhase"] == "Build"
    assert dg["nextPhase"]["label"] == "Peak"
    assert [w["num"] for w in dg["beyondWeeks"]] == [9, 10]  # no day listed twice


def test_a_passed_race_is_not_counted_down():
    dg = K.build_digest(K.clean_snapshot(snapshot(race={"name": "Old race", "date": "2026-09-01"})), SUNDAY)
    assert dg["raceLine"] is None


def test_a_snapshot_days_old_marks_everything_since_as_unsynced():
    dg = K.build_digest(K.clean_snapshot(snapshot(asOf="2026-10-06")), SUNDAY)
    assert dg["isStale"] is True and dg["staleDays"] == 5
    # Nothing on/after 10/6 can be "missed": the app hasn't told us yet.
    assert dg["soFar"]["missed"] == []


# ── 3. the email ─────────────────────────────────────────────────────────

def test_the_email_has_every_section_and_the_data_date():
    dg = K.build_digest(K.clean_snapshot(snapshot()), SUNDAY)
    subject, html, text = K.compose_email(dg, "Strong week. Keep the easy days easy.", "https://attune.coach/app/?view=today")
    assert subject == "Your Sunday check-in · week 6 of 15"
    for heading in ("This week · week 6 · Build", "The last 2 weeks", "The next 2 weeks", "Further ahead"):
        assert heading in html
    assert "Coach&#x27;s read" in html or "Coach's read" in html
    assert "Based on your data as of Saturday, Oct 10, 1:05 pm." in text
    assert "1 session since your last sync isn’t counted yet." in text
    assert text.count("Recovery jog") == 1
    assert "Fitness 42.3 (+3.4 over 14 days)." in text
    assert "Recovery Balance −8.7 (Steady)" in text
    assert "Load Ratio 1.21 (Sweet spot)" in text
    assert "https://attune.coach/app/?view=today" in html


def test_plan_text_is_escaped_in_the_html():
    dg = K.build_digest(K.clean_snapshot(snapshot()), SUNDAY)
    _s, html, _t = K.compose_email(dg, "<img src=x onerror=alert(1)>", "https://attune.coach/app/?view=today")
    assert "<b>bold</b>" not in html
    assert "Threshold &lt;b&gt;bold&lt;/b&gt; &amp; co" in html
    assert "<img" not in html


def test_no_coach_read_means_no_empty_box():
    dg = K.build_digest(K.clean_snapshot(snapshot()), SUNDAY)
    _s, html, text = K.compose_email(dg, None, "https://x")
    assert "Coach's read" not in html and "COACH'S READ" not in text


def test_a_stale_email_says_so():
    dg = K.build_digest(K.clean_snapshot(snapshot(asOf="2026-10-06", generatedAt="2026-10-06T15:00:00Z")), SUNDAY)
    line = K.data_date_line(dg)
    assert line.startswith("Based on your data as of Tuesday, Oct 6, 8:00 am.")
    assert "5 days ago" in line and "Open attune.coach" in line


def test_a_test_send_is_marked_in_the_subject():
    dg = K.build_digest(K.clean_snapshot(snapshot()), SUNDAY)
    assert K.subject_for(dg, test=True).startswith("[Test] Your Sunday check-in")


def test_the_coach_read_is_cleaned_to_plain_prose():
    raw = "Triggered by: Fitness +3.4\n\n**Great week.** Two key sessions done.\n- Keep Tuesday easy.\n> [!KEY] Sleep matters."
    out = K.clean_read(raw)
    assert out == "Great week. Two key sessions done.\nKeep Tuesday easy.\nSleep matters."
    assert K.clean_read("") is None


# ── 4. the schedule ──────────────────────────────────────────────────────

def _utc(*a):
    return datetime(*a, tzinfo=timezone.utc)


@pytest.mark.parametrize("now_utc, tz, due", [
    (_utc(2026, 10, 11, 13, 0), "America/Los_Angeles", True),    # Sun 6:00 PDT
    (_utc(2026, 10, 11, 12, 59), "America/Los_Angeles", False),  # Sun 5:59
    (_utc(2026, 10, 11, 16, 30), "America/Los_Angeles", True),   # Sun 9:30 — retry window
    (_utc(2026, 10, 11, 17, 0), "America/Los_Angeles", False),   # Sun 10:00 — closed
    (_utc(2026, 10, 14, 13, 0), "America/Los_Angeles", True),    # Wed 6:00
    (_utc(2026, 10, 12, 13, 0), "America/Los_Angeles", False),   # Mon
    (_utc(2026, 10, 10, 16, 0), "Pacific/Kiritimati", True),     # Sat UTC = Sun 6:00 at UTC+14
    (_utc(2026, 11, 1, 14, 0), "America/Los_Angeles", True),     # Sun 6:00 PST, the day DST ends
    (_utc(2026, 11, 1, 13, 0), "America/Los_Angeles", False),    # 5:00 PST that morning
])
def test_due_on_sunday_and_wednesday_at_six_local(now_utc, tz, due):
    assert K.is_due(K.local_now(tz, now_utc)) is due


def _enable(kv, athlete="mike", snap=None):
    K.save_prefs(athlete, True, f"{athlete}@example.com")
    K.save_snapshot(athlete, K.clean_snapshot(snap or snapshot()))


def test_the_cron_sends_once_per_day(kv):
    _enable(kv)
    sent = []
    sender = lambda a, e, s, d: sent.append((a, e, d)) or True
    r1 = K.run_checkin_emails(_utc(2026, 10, 11, 13, 5), sender=sender)
    r2 = K.run_checkin_emails(_utc(2026, 10, 11, 14, 5), sender=sender)
    assert sent == [("mike", "mike@example.com", SUNDAY)]
    assert r1["sent"] == 1 and r2["sent"] == 0


def test_a_failed_send_is_retried_next_hour(kv):
    _enable(kv)
    results = iter([False, True])
    sent = []
    sender = lambda a, e, s, d: sent.append(d) or next(results)
    assert K.run_checkin_emails(_utc(2026, 10, 11, 13, 5), sender=sender)["failed"] == 1
    assert K.run_checkin_emails(_utc(2026, 10, 11, 14, 5), sender=sender)["sent"] == 1
    assert len(sent) == 2


def test_a_sender_that_raises_does_not_stop_the_run(kv):
    _enable(kv)

    def boom(*a):
        raise RuntimeError("resend down")
    assert K.run_checkin_emails(_utc(2026, 10, 11, 13, 5), sender=boom)["failed"] == 1


@pytest.mark.parametrize("setup", ["disabled", "no_snapshot", "not_allowed", "not_due"])
def test_the_cron_skips_who_it_should(kv, setup):
    athlete = "lori" if setup == "not_allowed" else "mike"
    _enable(kv, athlete)
    if setup == "disabled":
        kv.store[K.prefs_key("mike")] = json.dumps({"enabled": False, "email": "m@e.com"})
    if setup == "no_snapshot":
        kv.delete(K.snapshot_key("mike"))
    if setup == "not_allowed":
        kv.store[K.INDEX_KEY] = json.dumps(["lori"])
    now = _utc(2026, 10, 12, 13, 5) if setup == "not_due" else _utc(2026, 10, 11, 13, 5)
    sent = []
    K.run_checkin_emails(now, sender=lambda *a: sent.append(a) or True)
    assert sent == []


def test_checkin_athletes_opens_it_to_others(kv, monkeypatch):
    assert K.checkin_allowed("lori", "mike") is False
    monkeypatch.setenv("CHECKIN_ATHLETES", "lori, joel")
    assert K.checkin_allowed("Lori", "mike") is True
    assert K.checkin_allowed("", "mike") is False


# ── 5. the model is optional ─────────────────────────────────────────────

def test_a_failed_coach_read_still_sends(kv):
    out = []

    def bad_read(a, dg):
        raise RuntimeError("model down")
    ok = K.send_checkin("mike", "m@e.com", K.clean_snapshot(snapshot()), SUNDAY,
                        write_read=bad_read, send=lambda *a: out.append(a) or True)
    assert ok is True
    to, subject, html, text = out[0]
    assert to == "m@e.com" and "Coach's read" not in html
    last = json.loads(kv.store[K.last_sent_key("mike")])
    assert last["coachRead"] is False and last["subject"] == subject


def test_the_coach_read_goes_to_the_model_with_the_digest_only(kv, monkeypatch):
    calls = []

    def fake_call(**kw):
        calls.append(kw)
        return {"text": "**Good week.** Keep going."}
    monkeypatch.setattr(C, "call_anthropic", fake_call)
    monkeypatch.setattr(C, "check_and_increment_budget", lambda a: (True, 1, 30))
    dg = K.build_digest(K.clean_snapshot(snapshot()), SUNDAY)
    assert K.write_coach_read("mike", dg) == "Good week. Keep going."
    msg = calls[0]["messages"][0]["content"]
    assert "THE NEXT 2 WEEKS" in msg and "never invent one" in msg
    assert calls[0]["surface"] == "checkin_email"


def test_over_budget_means_no_read_and_no_call(kv, monkeypatch):
    monkeypatch.setattr(C, "call_anthropic", lambda **kw: pytest.fail("model called over budget"))
    monkeypatch.setattr(C, "check_and_increment_budget", lambda a: (False, 31, 30))
    assert K.write_coach_read("mike", K.build_digest(K.clean_snapshot(snapshot()), SUNDAY)) is None


# ── 6. the endpoint ──────────────────────────────────────────────────────

@pytest.fixture()
def world(kv, monkeypatch):
    w = SimpleNamespace(sent=[], athlete="mike", email="mike@example.com", kv=kv, emails=[])
    monkeypatch.setattr(E, "athlete_from_bearer", lambda headers: (True, 200, "", w.athlete))
    monkeypatch.setattr(E, "ADMIN_ATHLETE_ID", "mike")
    monkeypatch.setattr(E, "verify_session_token", lambda tok: {"sub": w.athlete, "email": w.email})
    monkeypatch.setattr(E, "send_json", lambda handler, status, payload: w.sent.append((status, payload)))
    monkeypatch.setattr(E, "send_checkin", lambda a, e, s, d, test=False: w.emails.append((a, e, d, test)) or True)
    return w


def call(world, verb, body=None, *, length=None):
    data = json.dumps(body).encode() if body is not None else b""
    h = E.handler.__new__(E.handler)
    h.headers = {"Authorization": "Bearer t", "Content-Length": length if length is not None else str(len(data))}
    h.rfile = io.BytesIO(data)
    getattr(h, f"do_{verb}")()
    assert len(world.sent) == 1, "handler must answer exactly once"
    return world.sent.pop()


def test_not_the_owner_is_refused(world):
    world.athlete = "lori"
    assert call(world, "POST", {"action": "settings", "enabled": True}) == (403, {"error": "not_available"})
    assert call(world, "GET") == (200, {"allowed": False})


def test_enable_upload_and_status(world):
    status, payload = call(world, "POST", {"action": "settings", "enabled": True})
    assert status == 200 and payload["email"] == "mike@example.com"
    status, payload = call(world, "POST", {"action": "snapshot", "snapshot": snapshot()})
    assert status == 200 and payload["asOf"] == "2026-10-10"
    status, payload = call(world, "GET")
    assert payload["enabled"] is True and payload["snapshotAsOf"] == "2026-10-10"


def test_a_snapshot_before_opting_in_is_refused(world):
    assert call(world, "POST", {"action": "snapshot", "snapshot": snapshot()}) == (409, {"error": "not_enabled"})
    assert K.snapshot_key("mike") not in world.kv.store


def test_turning_it_off_deletes_the_snapshot(world):
    call(world, "POST", {"action": "settings", "enabled": True})
    call(world, "POST", {"action": "snapshot", "snapshot": snapshot()})
    call(world, "POST", {"action": "settings", "enabled": False})
    assert K.snapshot_key("mike") not in world.kv.store
    assert json.loads(world.kv.store[K.INDEX_KEY]) == []


def test_a_bad_snapshot_returns_its_code(world):
    call(world, "POST", {"action": "settings", "enabled": True})
    assert call(world, "POST", {"action": "snapshot", "snapshot": {"v": 9}}) == (400, {"error": "bad_version"})


def test_an_oversized_body_is_refused_unread(world):
    assert call(world, "POST", {"action": "snapshot"}, length=str(K.MAX_BODY_BYTES + 1)) == (413, {"error": "too_large"})


def test_no_email_cannot_enable(world, monkeypatch):
    world.email = ""
    monkeypatch.setattr(E, "get_email_to_athlete_map", lambda: {})
    assert call(world, "POST", {"action": "settings", "enabled": True}) == (409, {"error": "no_email"})


def test_test_send_needs_a_snapshot_and_is_rate_limited(world):
    call(world, "POST", {"action": "settings", "enabled": True})
    assert call(world, "POST", {"action": "test"}) == (404, {"error": "no_snapshot"})
    call(world, "POST", {"action": "snapshot", "snapshot": snapshot()})
    for _ in range(K.TEST_SENDS_PER_DAY):  # the 404 above spent none
        assert call(world, "POST", {"action": "test"})[0] == 200
    status, payload = call(world, "POST", {"action": "test"})
    assert status == 429 and payload["error"] == "test_limit"
    assert all(e[3] is True for e in world.emails)


def test_unknown_action(world):
    assert call(world, "POST", {"action": "nope"}) == (400, {"error": "unknown_action"})


def test_nothing_logs_the_snapshot_or_address():
    src = (K.__file__ and open(K.__file__).read()) + open(E.__file__).read()
    for line in src.splitlines():
        if "print(" in line:
            assert "type(e).__name__" in line, f"a log line may carry data: {line.strip()}"


# ── 7. adversarial review fixes ──────────────────────────────────────────

WEDNESDAY = date(2026, 10, 14)


def test_a_wednesday_email_from_a_sunday_snapshot_is_a_week_on():
    """The week number and phase come from the send date, not the upload."""
    snap = K.clean_snapshot(snapshot(asOf="2026-10-11", generatedAt="2026-10-11T16:00:00Z",
                                     block={**snapshot()["block"], "weekNum": 6}))
    dg = K.build_digest(snap, WEDNESDAY)
    assert dg["weekNum"] == 7 and dg["weekFocus"] == "Build"
    assert K.subject_for(dg) == "Your Wednesday check-in · week 7 of 15"
    # Week 10 starts Peak: on week 7, Build continues and Peak is next.
    assert dg["currentPhase"] == "Build" and dg["nextPhase"]["weekStart"] == 10
    # Sunday → Wednesday is the common gap, and it is called out.
    assert dg["isStale"] is True and "3 days ago" in K.data_date_line(dg)


def test_two_sessions_on_one_date_are_both_counted():
    raw = snapshot()
    raw["days"].append(day("2026-10-06", "strength", "Core", "", actual={"miles": 0, "minutes": 20, "name": "Core"}))
    raw["days"].append(day("2026-10-11", "strength", "Mobility", "15 min"))
    dg = K.build_digest(K.clean_snapshot(raw), SUNDAY)
    assert dg["soFar"]["planned"] == 6 and dg["soFar"]["done"] == 3
    assert sorted(d["workout"] for d in dg["todaySessions"]) == ["Mobility", "Recovery jog"]


def test_old_load_numbers_say_how_old():
    dg = K.build_digest(K.clean_snapshot(snapshot(load={**snapshot()["load"], "date": "2026-10-05"})), SUNDAY)
    assert "Fitness 42.3 (+3.4 over 14 days), as of Monday, Oct 5." in K.digest_text(dg)
    fresh = K.build_digest(K.clean_snapshot(snapshot()), SUNDAY)
    assert "as of" not in K.digest_text(fresh).split("THE NEXT")[0].split("Fitness")[1].split("\n")[0]


@pytest.mark.parametrize("days_out, words", [
    (0, "is today."), (16, "is in 16 days"), (27, "is in 27 days"), (28, "is 4 weeks away"), (62, "is 9 weeks away"),
])
def test_the_race_countdown_never_rounds_days_into_wrong_weeks(days_out, words):
    from datetime import timedelta
    race_day = (SUNDAY + timedelta(days=days_out)).isoformat()
    dg = K.build_digest(K.clean_snapshot(snapshot(race={"name": "R", "date": race_day})), SUNDAY)
    assert words in dg["raceLine"]


@pytest.mark.parametrize("raw, expected", [
    ("> [!Tip] Keep it easy\n*really* easy", "Keep it easy\nreally easy"),
    ("[!note] Sleep.", "Sleep."),
    ("Before.\n```json\n{\"a\": 1}\n```\nAfter.", "Before.\nAfter."),
    ("| a | b |\n|---|---|\nPlain.", "Plain."),
    ("5*4 = 20, keep 3_000 steps.", "5*4 = 20, keep 3_000 steps."),
])
def test_clean_read_strips_what_the_chat_prompt_teaches(raw, expected):
    assert K.clean_read(raw) == expected


def test_a_long_read_is_cut_at_a_sentence_never_inside_a_number():
    out = K.clean_read("Fitness is 42.5 and rising. " * 60)
    assert out.endswith("rising.")
    assert len(out) <= K.READ_MAX_CHARS


def test_the_coach_read_has_a_hard_deadline(kv, monkeypatch):
    seen = {}
    monkeypatch.setattr(C, "call_anthropic", lambda **kw: seen.update(kw) or {"text": "Fine."})
    monkeypatch.setattr(C, "check_and_increment_budget", lambda a: (True, 1, 30))
    K.write_coach_read("mike", K.build_digest(K.clean_snapshot(snapshot()), SUNDAY))
    assert seen["timeout_s"] == K.READ_TIMEOUT_S < 30


def test_call_anthropic_applies_the_deadline_with_no_retries(monkeypatch):
    applied = {}

    class Client:
        def with_options(self, **kw):
            applied.update(kw)
            return self

        class messages:
            @staticmethod
            def create(**kw):
                return SimpleNamespace(content=[SimpleNamespace(type="text", text="ok")],
                                       usage=SimpleNamespace(input_tokens=1, output_tokens=1))
    monkeypatch.setattr(C, "_get_anthropic_client", lambda: Client())
    monkeypatch.setattr(C, "log_telemetry", lambda *a, **k: None, raising=False)
    C.call_anthropic(model="m", system="s", messages=[{"role": "user", "content": "x"}], timeout_s=20)
    assert applied == {"timeout": 20, "max_retries": 0}


def test_a_run_killed_mid_send_is_retried_next_hour(kv):
    _enable(kv)
    key = K.sent_claim_key("mike", "2026-10-11")

    def killed(*a):
        raise SystemExit  # Vercel's time limit: no Python cleanup runs
    with pytest.raises(SystemExit):
        K.run_checkin_emails(_utc(2026, 10, 11, 13, 5), sender=killed)
    assert kv.ttls[key] == K.CLAIM_TTL_SECONDS < 3600
    kv.expire(key)  # the claim runs out before 07:05
    sent = []
    K.run_checkin_emails(_utc(2026, 10, 11, 14, 5), sender=lambda *a: sent.append(a) or True)
    assert len(sent) == 1


def test_a_sent_email_holds_for_days_not_minutes(kv):
    _enable(kv)
    K.run_checkin_emails(_utc(2026, 10, 11, 13, 5), sender=lambda *a: True)
    key = K.sent_claim_key("mike", "2026-10-11")
    assert kv.ttls[key] == K.SENT_TTL_SECONDS
    sent = []
    K.run_checkin_emails(_utc(2026, 10, 11, 16, 5), sender=lambda *a: sent.append(a) or True)
    assert sent == []


def test_a_non_object_body_is_a_bad_request(world):
    for body in ([1, 2], "hello", 7):
        assert call(world, "POST", body) == (400, {"error": "bad_request"})


def test_an_older_snapshot_cannot_overwrite_a_newer_one(world):
    call(world, "POST", {"action": "settings", "enabled": True})
    call(world, "POST", {"action": "snapshot", "snapshot": snapshot(generatedAt="2026-10-10T20:05:00.000Z")})
    stale = snapshot(asOf="2026-10-09", generatedAt="2026-10-09T08:00:00.000Z")
    assert call(world, "POST", {"action": "snapshot", "snapshot": stale}) == (409, {"error": "older_snapshot"})
    assert json.loads(world.kv.store[K.snapshot_key("mike")])["asOf"] == "2026-10-10"


# ── 8. the cron entry point runs both jobs independently ────────────────

def _run_cron(monkeypatch, push, checkin):
    from api.coach import scheduled_push as S
    out = []
    monkeypatch.setattr(S, "_cron_authorized", lambda headers: True)
    monkeypatch.setattr(S, "run_scheduled_push", push)
    monkeypatch.setattr(S, "run_checkin_emails", checkin)
    monkeypatch.setattr(S, "send_json", lambda h, status, payload: out.append((status, payload)))
    h = S.handler.__new__(S.handler)
    h.headers = {}
    h.do_GET()
    return out[0]


def test_a_failing_push_still_sends_the_checkin(monkeypatch):
    ran = []

    def push():
        raise RuntimeError("vapid")
    status, payload = _run_cron(monkeypatch, push, lambda: ran.append(1) or {"sent": 1})
    assert ran == [1] and status == 500 and payload["checkin"] == {"sent": 1}


def test_a_failing_checkin_leaves_the_push_result_alone(monkeypatch):
    def checkin():
        raise RuntimeError("kv")
    status, payload = _run_cron(monkeypatch, lambda: {"ok": True, "sent": 3}, checkin)
    assert status == 200 and payload["sent"] == 3 and payload["checkin"] == {"error": "RuntimeError"}


def test_push_not_configured_keeps_its_200(monkeypatch):
    status, payload = _run_cron(monkeypatch, lambda: {"ok": False, "error": "push not configured"}, lambda: {})
    assert status == 200
