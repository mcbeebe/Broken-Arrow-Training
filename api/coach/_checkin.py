"""Coach check-in email (initiative 005, PR 1).

The plan exists only in the app, so the app uploads a check-in snapshot
(`clean_snapshot` is its schema) whenever its plan or load numbers change.
Every Sunday and Wednesday at 6:00 am in the athlete's own time zone, the
hourly cron (`scheduled_push.py`) calls `run_checkin_emails`, which writes
the email from the last snapshot and sends it through Resend.

The email's numbers and day lists are templated from the snapshot, so they
cannot be wrong. Only the "Coach's read" paragraph is written by the model,
and the email still goes out without it if that call fails (D7).

Owner-only until `CHECKIN_ATHLETES` names others (D2). Nothing here logs the
snapshot, the email address or the email body: failures log the error's
class.
"""

from __future__ import annotations

import os
import re
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover - zoneinfo is stdlib on 3.9+
    ZoneInfo = None  # type: ignore

from ._core import kv_del, kv_get_json, kv_set_json

# ── Schedule (D4, D5) ────────────────────────────────────────────────────

#: Python weekdays the email goes out on: Wednesday and Sunday.
SEND_WEEKDAYS = (2, 6)
#: Local hour the email is due. The cron runs hourly; a send missed at 6
#: (a cron hiccup, a Resend outage) is retried each hour up to SEND_LAST_HOUR.
SEND_HOUR = 6
SEND_LAST_HOUR = 9
#: A snapshot older than this is called out in the email.
STALE_AFTER_DAYS = 3
#: Test sends per athlete per day (the Settings button).
TEST_SENDS_PER_DAY = 5

INDEX_KEY = "checkin_index"
SNAPSHOT_TTL_SECONDS = 60 * 86400
SENT_TTL_SECONDS = 3 * 86400

#: Body cap for a snapshot upload. A real one is ~20 KB.
MAX_BODY_BYTES = 256 * 1024


def prefs_key(athlete_id: str) -> str:
    return f"checkin:prefs:{athlete_id}"


def snapshot_key(athlete_id: str) -> str:
    return f"checkin:snapshot:{athlete_id}"


def last_sent_key(athlete_id: str) -> str:
    return f"checkin:last:{athlete_id}"


def sent_claim_key(athlete_id: str, local_date: str) -> str:
    return f"checkin:sent:{athlete_id}:{local_date}"


def test_counter_key(athlete_id: str, day: str | None = None) -> str:
    day = day or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return f"checkin:test:{athlete_id}:{day}"


# ── Access (D2) ──────────────────────────────────────────────────────────

def checkin_allowed(athlete_id: str, admin_athlete_id: str) -> bool:
    """The owner, plus anyone named in ``CHECKIN_ATHLETES`` (comma-separated).

    The app has its own gate, ``checkinOpenTo`` in
    ``src/utils/checkin/access.ts``; opening this to others changes both.
    """
    athlete = (athlete_id or "").strip().lower()
    if not athlete:
        return False
    if athlete == (admin_athlete_id or "").strip().lower():
        return True
    extra = os.environ.get("CHECKIN_ATHLETES", "")
    return athlete in {a.strip().lower() for a in extra.split(",") if a.strip()}


# ── Snapshot schema ──────────────────────────────────────────────────────

class SnapshotError(ValueError):
    """The upload is not a usable snapshot. `code` is safe to return."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_DAYS = 80
MAX_WEEKS = 14


def _iso(v: Any) -> str | None:
    if isinstance(v, str) and _ISO_DATE.match(v):
        try:
            date.fromisoformat(v)
            return v
        except ValueError:
            return None
    return None


def _text(v: Any, limit: int = 160) -> str:
    if not isinstance(v, str):
        return ""
    return " ".join(v.split())[:limit]


def _num(v: Any) -> float | None:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    f = float(v)
    if f != f or f in (float("inf"), float("-inf")):
        return None
    return f


def _int(v: Any) -> int | None:
    f = _num(v)
    return int(f) if f is not None else None


def valid_timezone(tz: Any) -> str:
    """The IANA zone if Python knows it, else UTC."""
    if isinstance(tz, str) and tz and ZoneInfo is not None:
        try:
            ZoneInfo(tz)
            return tz
        except Exception:
            pass
    return "UTC"


def clean_snapshot(raw: Any) -> dict:
    """Validate an uploaded snapshot and keep only the fields the email reads.

    Raises SnapshotError for anything that cannot be a snapshot; trims and
    drops individual bad entries rather than refusing the whole upload.
    """
    if not isinstance(raw, dict):
        raise SnapshotError("bad_snapshot")
    if raw.get("v") != 1:
        raise SnapshotError("bad_version")
    as_of = _iso(raw.get("asOf"))
    if not as_of:
        raise SnapshotError("bad_as_of")
    generated_at = _text(raw.get("generatedAt"), 40)

    days_raw = raw.get("days")
    if not isinstance(days_raw, list):
        raise SnapshotError("bad_days")
    days: list[dict] = []
    for d in days_raw[:MAX_DAYS]:
        if not isinstance(d, dict):
            continue
        iso = _iso(d.get("date"))
        if not iso:
            continue
        day: dict[str, Any] = {
            "date": iso,
            "week": _int(d.get("week")),
            "type": _text(d.get("type"), 20) or "run",
            "workout": _text(d.get("workout"), 120),
            "detail": _text(d.get("detail"), 240),
            "zone": _text(d.get("zone"), 40),
            "minutes": _num(d.get("minutes")),
        }
        actual = d.get("actual")
        if isinstance(actual, dict):
            day["actual"] = {
                "miles": _num(actual.get("miles")),
                "minutes": _num(actual.get("minutes")),
                "name": _text(actual.get("name"), 80),
            }
        days.append(day)
    days.sort(key=lambda x: x["date"])

    weeks: list[dict] = []
    weeks_raw = raw.get("weeks")
    for w in (weeks_raw if isinstance(weeks_raw, list) else [])[:MAX_WEEKS]:
        if not isinstance(w, dict):
            continue
        start = _iso(w.get("startIso"))
        num = _int(w.get("num"))
        if not start or num is None:
            continue
        weeks.append({
            "num": num,
            "startIso": start,
            "focus": _text(w.get("focus"), 80),
            "plannedMiles": _num(w.get("plannedMiles")),
        })
    weeks.sort(key=lambda x: x["startIso"])

    race = None
    race_raw = raw.get("race")
    if isinstance(race_raw, dict) and _text(race_raw.get("name"), 120):
        race = {"name": _text(race_raw.get("name"), 120), "date": _iso(race_raw.get("date"))}

    block = None
    block_raw = raw.get("block")
    if isinstance(block_raw, dict):
        phases = []
        for p in (block_raw.get("phases") if isinstance(block_raw.get("phases"), list) else [])[:12]:
            if isinstance(p, dict) and _text(p.get("label"), 40):
                ws, we = _int(p.get("weekStart")), _int(p.get("weekEnd"))
                if ws is not None and we is not None:
                    phases.append({"label": _text(p.get("label"), 40), "weekStart": ws, "weekEnd": we})
        block = {
            "currentPhase": _text(block_raw.get("currentPhase"), 40),
            "weekNum": _int(block_raw.get("weekNum")),
            "totalWeeks": _int(block_raw.get("totalWeeks")),
            "phases": phases,
        }

    load = None
    load_raw = raw.get("load")
    if isinstance(load_raw, dict) and _num(load_raw.get("fitness")) is not None:
        load = {
            "date": _iso(load_raw.get("date")) or as_of,
            "fitness": _num(load_raw.get("fitness")),
            "fitnessChange": _num(load_raw.get("fitnessChange")),
            "fatigue": _num(load_raw.get("fatigue")),
            "balance": _num(load_raw.get("balance")),
            "balanceLabel": _text(load_raw.get("balanceLabel"), 30),
            "ratio": _num(load_raw.get("ratio")),
            "ratioLabel": _text(load_raw.get("ratioLabel"), 30),
        }

    return {
        "v": 1,
        "asOf": as_of,
        "generatedAt": generated_at,
        "timezone": valid_timezone(raw.get("timezone")),
        "days": days,
        "weeks": weeks,
        "race": race,
        "block": block,
        "load": load,
    }


# ── Composition ──────────────────────────────────────────────────────────

REST_TYPES = {"rest"}
KEY_TYPES = {"quality", "long", "race"}


def _d(iso: str) -> date:
    return date.fromisoformat(iso)


def _short(iso: str) -> str:
    """'Mon 10/13'."""
    d = _d(iso)
    return f"{d.strftime('%a')} {d.month}/{d.day}"


def _long(d: date) -> str:
    """'Sunday, Oct 12'."""
    return f"{d.strftime('%A')}, {d.strftime('%b')} {d.day}"


def _fmt_num(v: float | None, dp: int = 1) -> str:
    if v is None:
        return "–"
    s = f"{v:.{dp}f}"
    return s.rstrip("0").rstrip(".") if "." in s else s


def _signed(v: float | None, dp: int = 1) -> str:
    if v is None:
        return ""
    if round(v, dp) == 0:
        return "no change"
    return ("+" if v > 0 else "−") + _fmt_num(abs(v), dp)


def _duration(minutes: float) -> str:
    """'45 min', '6 h 05 min'."""
    total = int(round(minutes))
    if total < 60:
        return f"{total} min"
    return f"{total // 60} h {total % 60:02d} min"


def _session_label(day: dict) -> str:
    label = day.get("workout") or day.get("type", "").title()
    return label


def _status_for(day: dict, as_of: str) -> str:
    """'done' | 'missed' | 'unsynced' for a past plan day."""
    if day.get("actual"):
        return "done"
    if day["date"] < as_of:
        return "missed"
    return "unsynced"


def build_digest(snap: dict, today: date) -> dict:
    """Everything the email shows, worked out from the snapshot for `today`
    (the athlete's local date at send time). Pure — no I/O."""
    as_of = snap["asOf"]
    days = snap.get("days") or []
    by_date = {d["date"]: d for d in days}
    t = today.isoformat()

    # This plan week: the week whose span holds today; Monday-start fallback.
    week = None
    for w in snap.get("weeks") or []:
        start = _d(w["startIso"])
        if start <= today <= start + timedelta(days=6):
            week = w
    week_start = _d(week["startIso"]) if week else today - timedelta(days=today.weekday())
    week_dates = [(week_start + timedelta(days=i)).isoformat() for i in range(7)]
    week_days = [by_date[x] for x in week_dates if x in by_date]

    def tally(span: list[dict]) -> dict:
        sessions = [d for d in span if d["type"] not in REST_TYPES]
        done = [d for d in sessions if _status_for(d, as_of) == "done"]
        missed = [d for d in sessions if _status_for(d, as_of) == "missed"]
        unsynced = [d for d in sessions if _status_for(d, as_of) == "unsynced"]
        key = [d for d in sessions if d["type"] in KEY_TYPES]
        key_done = [d for d in key if d.get("actual")]
        miles = sum((d.get("actual") or {}).get("miles") or 0 for d in done)
        minutes = sum((d.get("actual") or {}).get("minutes") or 0 for d in done)
        return {
            "planned": len(sessions),
            "done": len(done),
            "missed": [_session_label(d) + f" ({_short(d['date'])})" for d in missed],
            "missedKey": [_session_label(d) + f" ({_short(d['date'])})" for d in missed if d["type"] in KEY_TYPES],
            "unsynced": len(unsynced),
            "keyPlanned": len(key),
            "keyDone": len(key_done),
            "miles": miles,
            "minutes": minutes,
        }

    so_far = [d for d in week_days if d["date"] < t]
    today_day = by_date.get(t)
    week_rest = [d for d in week_days if d["date"] > t and d["type"] not in REST_TYPES]

    last14 = [d for d in days if (today - timedelta(days=14)).isoformat() <= d["date"] < t]

    next14_end = (today + timedelta(days=13)).isoformat()
    next14 = [d for d in days if t <= d["date"] <= next14_end and d["type"] not in REST_TYPES]

    beyond_from = today + timedelta(days=14)
    beyond_weeks = [w for w in snap.get("weeks") or [] if _d(w["startIso"]) + timedelta(days=6) >= beyond_from]

    race = snap.get("race")
    race_line = None
    if race and race.get("date"):
        days_to = (_d(race["date"]) - today).days
        if days_to >= 0:
            weeks_to = -(-days_to // 7)
            if days_to == 0:
                race_line = f"{race['name']} is today."
            elif days_to < 14:
                race_line = f"{race['name']} is in {days_to} days ({_long(_d(race['date']))})."
            else:
                race_line = f"{race['name']} is {weeks_to} weeks away ({_long(_d(race['date']))})."

    block = snap.get("block") or {}
    week_num = block.get("weekNum") or (week or {}).get("num")
    next_phase = None
    for p in block.get("phases") or []:
        if week_num is not None and p["weekStart"] > week_num:
            next_phase = p
            break

    stale_days = (today - _d(as_of)).days
    return {
        "today": t,
        "weekday": today.strftime("%A"),
        "asOf": as_of,
        "generatedAt": snap.get("generatedAt") or "",
        "timezone": snap.get("timezone") or "UTC",
        "staleDays": stale_days,
        "isStale": stale_days > STALE_AFTER_DAYS,
        "weekNum": week_num,
        "totalWeeks": block.get("totalWeeks"),
        "weekFocus": (week or {}).get("focus") or "",
        "weekPlannedMiles": (week or {}).get("plannedMiles"),
        "soFar": tally(so_far),
        "todaySession": today_day if today_day and today_day["type"] not in REST_TYPES else None,
        "weekRest": week_rest,
        "last14": tally(last14),
        "load": snap.get("load"),
        "next14": next14,
        "beyondWeeks": beyond_weeks,
        "raceLine": race_line,
        "currentPhase": block.get("currentPhase") or "",
        "nextPhase": next_phase,
    }


def subject_for(dg: dict, test: bool = False) -> str:
    parts = [f"Your {dg['weekday']} check-in"]
    if dg.get("weekNum"):
        wk = f"week {dg['weekNum']}"
        if dg.get("totalWeeks"):
            wk += f" of {dg['totalWeeks']}"
        parts.append(wk)
    subject = " · ".join(parts)
    return f"[Test] {subject}" if test else subject


def _day_line(d: dict) -> str:
    line = f"{_short(d['date'])} · {_session_label(d)}"
    if d.get("detail") and d["detail"] != d.get("workout"):
        line += f" — {d['detail']}"
    return line


def _sections(dg: dict) -> list[tuple[str, list[str]]]:
    """(heading, lines) in email order, shared by the HTML and text parts."""
    out: list[tuple[str, list[str]]] = []

    sf = dg["soFar"]
    week_lines: list[str] = []
    if sf["planned"]:
        week_lines.append(f"{sf['done']} of {sf['planned']} sessions done so far"
                          + (f", {_fmt_num(sf['miles'])} mi" if sf["miles"] else "") + ".")
    if sf["missedKey"]:
        week_lines.append("Missed key session: " + "; ".join(sf["missedKey"]) + ".")
    if sf["unsynced"]:
        week_lines.append(f"{sf['unsynced']} session(s) since your last sync aren't counted yet.")
    if dg["todaySession"]:
        week_lines.append(f"Today: {_session_label(dg['todaySession'])}"
                          + (f" — {dg['todaySession']['detail']}" if dg["todaySession"].get("detail") else "") + ".")
    if dg["weekRest"]:
        week_lines.append("Still to come: " + "; ".join(
            f"{_short(d['date'])} {_session_label(d)}" for d in dg["weekRest"]) + ".")
    if not week_lines:
        week_lines.append("Nothing on the plan this week.")
    heading = "This week"
    if dg.get("weekNum"):
        heading += f" · week {dg['weekNum']}"
    if dg.get("weekFocus"):
        heading += f" · {dg['weekFocus']}"
    out.append((heading, week_lines))

    l14 = dg["last14"]
    past_lines: list[str] = []
    if l14["planned"]:
        past_lines.append(f"Sessions: {l14['done']} of {l14['planned']} done"
                          + (f" (key sessions {l14['keyDone']} of {l14['keyPlanned']})" if l14["keyPlanned"] else "")
                          + ".")
    if l14["miles"]:
        past_lines.append(f"Logged: {_fmt_num(l14['miles'])} mi"
                          + (f" in {_duration(l14['minutes'])}" if l14["minutes"] else "") + ".")
    load = dg.get("load")
    if load:
        fit = f"Fitness {_fmt_num(load['fitness'])}"
        if load.get("fitnessChange") is not None:
            fit += f" ({_signed(load['fitnessChange'])} over 14 days)"
        past_lines.append(fit + ".")
        extras = []
        if load.get("fatigue") is not None:
            extras.append(f"Fatigue {_fmt_num(load['fatigue'])}")
        if load.get("balance") is not None:
            extras.append(f"Recovery Balance {_signed(load['balance']) if load['balance'] else '0'}"
                          + (f" ({load['balanceLabel']})" if load.get("balanceLabel") else ""))
        if load.get("ratio") is not None:
            extras.append(f"Load Ratio {_fmt_num(load['ratio'], 2)}"
                          + (f" ({load['ratioLabel']})" if load.get("ratioLabel") else ""))
        if extras:
            past_lines.append(", ".join(extras) + ".")
    if not past_lines:
        past_lines.append("No sessions on the plan in the last two weeks.")
    out.append(("The last 2 weeks", past_lines))

    nxt = [_day_line(d) for d in dg["next14"]] or ["Nothing planned in the next two weeks."]
    out.append(("The next 2 weeks", nxt))

    beyond: list[str] = []
    if dg.get("raceLine"):
        beyond.append(dg["raceLine"])
    if dg.get("currentPhase"):
        line = f"You're in {dg['currentPhase']}"
        if dg.get("nextPhase"):
            line += f"; {dg['nextPhase']['label']} starts in week {dg['nextPhase']['weekStart']}"
        beyond.append(line + ".")
    for w in dg["beyondWeeks"]:
        line = f"Week {w['num']} ({_short(w['startIso'])})"
        if w.get("focus"):
            line += f" · {w['focus']}"
        if w.get("plannedMiles"):
            line += f" · {_fmt_num(w['plannedMiles'])} mi"
        beyond.append(line)
    if beyond:
        out.append(("Further ahead", beyond))
    return out


def digest_text(dg: dict) -> str:
    """The digest as plain text: the email's text part and the model's input."""
    lines: list[str] = []
    for heading, items in _sections(dg):
        lines.append(heading.upper())
        lines.extend(f"- {x}" for x in items)
        lines.append("")
    return "\n".join(lines).strip()


def data_date_line(dg: dict) -> str:
    """'Based on your data as of Sat, Oct 11, 1:05 pm.' plus a stale warning."""
    when = _long(_d(dg["asOf"]))
    try:
        stamp = datetime.fromisoformat(dg["generatedAt"].replace("Z", "+00:00"))
        if ZoneInfo is not None:
            stamp = stamp.astimezone(ZoneInfo(dg["timezone"]))
        hour = stamp.hour % 12 or 12
        when = f"{_long(stamp.date())}, {hour}:{stamp.minute:02d} {'am' if stamp.hour < 12 else 'pm'}"
    except Exception:
        pass
    line = f"Based on your data as of {when}."
    if dg["isStale"]:
        line += (f" That's {dg['staleDays']} days ago, so anything since isn't here."
                 " Open attune.coach and the next check-in will be current.")
    return line


def _esc(s: str) -> str:
    return (s.replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def compose_email(dg: dict, coach_read: str | None, link: str, test: bool = False) -> tuple[str, str, str]:
    """(subject, html, text) for one check-in."""
    subject = subject_for(dg, test=test)
    sections = _sections(dg)
    date_line = data_date_line(dg)

    text_parts = [subject, ""]
    if coach_read:
        text_parts += ["COACH'S READ", coach_read, ""]
    text_parts += [digest_text(dg), "", date_line, f"Open attune.coach: {link}"]
    text = "\n".join(text_parts)

    ink = "#0f172a"
    muted = "#64748b"
    teal = "#0d9488"
    html: list[str] = [
        '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;'
        f'max-width:560px;margin:0 auto;padding:16px;color:{ink};line-height:1.5">',
        f'<p style="margin:0;color:{teal};font-weight:600;font-size:13px;letter-spacing:.04em;'
        'text-transform:uppercase">attune.coach</p>',
        f'<h1 style="margin:4px 0 16px;font-size:22px">{_esc(subject)}</h1>',
    ]
    if coach_read:
        html.append(
            f'<div style="border-left:3px solid {teal};padding:8px 12px;margin:0 0 20px;background:#f0fdfa">'
            f'<p style="margin:0 0 4px;font-weight:600">Coach\'s read</p>'
            + "".join(f'<p style="margin:0 0 8px">{_esc(p)}</p>' for p in coach_read.split("\n\n") if p.strip())
            + "</div>"
        )
    for heading, items in sections:
        html.append(f'<h2 style="margin:20px 0 6px;font-size:16px">{_esc(heading)}</h2>')
        html.append('<ul style="margin:0;padding-left:20px">'
                    + "".join(f'<li style="margin:2px 0">{_esc(x)}</li>' for x in items)
                    + "</ul>")
    html.append(
        f'<p style="margin:24px 0 8px"><a href="{_esc(link)}" style="display:inline-block;background:{teal};'
        'color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">'
        "Open attune.coach</a></p>"
    )
    html.append(f'<p style="margin:16px 0 0;font-size:12px;color:{muted}">{_esc(date_line)} '
                "Turn these emails off in Settings → Notifications.</p>")
    html.append("</div>")
    return subject, "".join(html), text


# ── The coach's read (D7) ────────────────────────────────────────────────

_MD = re.compile(r"(\*\*|__|`|^#+\s*|^\s*[-*•]\s+|^>\s*(\[![A-Z]+\]\s*)?)", re.MULTILINE)


def clean_read(text: str) -> str | None:
    """Plain prose: no markdown, no 'Triggered by' line, at most ~1200 chars."""
    if not text:
        return None
    lines = [ln for ln in text.strip().splitlines() if not ln.lower().startswith("triggered by")]
    out = _MD.sub("", "\n".join(lines)).strip()
    out = re.sub(r"\n{3,}", "\n\n", out)
    if len(out) > 1200:
        cut = out[:1200]
        out = cut[: cut.rfind(".") + 1] or cut
    return out or None


def write_coach_read(athlete_id: str, dg: dict) -> str | None:
    """3–5 sentences from the model, grounded in the digest. None on any
    failure (no key, over budget, a model error): the email goes without it."""
    from ._core import (
        SONNET_MODEL,
        build_system_prompt,
        call_anthropic,
        check_and_increment_budget,
        load_memory,
    )

    within, _used, _budget = check_and_increment_budget(athlete_id)
    if not within:
        return None
    memory = load_memory(athlete_id)
    system = build_system_prompt(
        about_me=memory.get("aboutMe", ""),
        pending_inferences=[],
        conversation_summary=memory.get("conversationSummary"),
        athlete_profile=None,
        race=None,
        coach_persona=memory.get("coachPersona"),
        lite_knowledge=True,
    )
    focus = ("look back on the week that is ending and set up the week ahead"
             if dg["weekday"] == "Sunday" else
             "check in at the week's midpoint: what's done, and what matters for the rest of the week")
    user_msg = (
        f"Check-in digest for {dg['weekday']} {dg['today']}:\n\n{digest_text(dg)}\n\n"
        f"{data_date_line(dg)}\n\n"
        "Task:\nWrite the coach's read at the top of the athlete's "
        f"{dg['weekday']} check-in email: {focus}. 3–5 sentences of plain "
        "prose in your own voice. No markdown, no bullets, no headings, no "
        "callouts, no sign-off. Use only numbers that appear in the digest — "
        "never invent one. If the data is stale, say so in a few words."
    )
    try:
        result = call_anthropic(
            model=SONNET_MODEL,
            system=system,
            messages=[{"role": "user", "content": user_msg}],
            max_tokens=500,
            athlete_id=athlete_id,
            surface="checkin_email",
        )
    except Exception as e:  # never the message: it may quote the prompt
        print(f"[checkin] coach read failed: {type(e).__name__}", flush=True)
        return None
    return clean_read(str(result.get("text") or ""))


# ── Storage ──────────────────────────────────────────────────────────────

def load_prefs(athlete_id: str) -> dict:
    raw = kv_get_json(prefs_key(athlete_id))
    return raw if isinstance(raw, dict) else {}


def save_prefs(athlete_id: str, enabled: bool, email: str) -> dict:
    prefs = {"enabled": bool(enabled), "email": email, "updatedAt": int(time.time() * 1000)}
    kv_set_json(prefs_key(athlete_id), prefs)
    idx = kv_get_json(INDEX_KEY)
    ids = [a for a in (idx if isinstance(idx, list) else []) if isinstance(a, str)]
    if enabled and athlete_id not in ids:
        kv_set_json(INDEX_KEY, ids + [athlete_id])
    elif not enabled and athlete_id in ids:
        kv_set_json(INDEX_KEY, [a for a in ids if a != athlete_id])
    if not enabled:
        kv_del(snapshot_key(athlete_id))
    return prefs


def save_snapshot(athlete_id: str, snap: dict) -> None:
    kv_set_json(snapshot_key(athlete_id), snap, ex=SNAPSHOT_TTL_SECONDS)


def load_snapshot(athlete_id: str) -> dict | None:
    raw = kv_get_json(snapshot_key(athlete_id))
    if not isinstance(raw, dict):
        return None
    try:
        return clean_snapshot(raw)
    except SnapshotError:
        return None


# ── Sending ──────────────────────────────────────────────────────────────

def local_now(tz: str, now_utc: datetime | None = None) -> datetime:
    now_utc = now_utc or datetime.now(timezone.utc)
    if ZoneInfo is not None:
        try:
            return now_utc.astimezone(ZoneInfo(tz or "UTC"))
        except Exception:
            pass
    return now_utc.astimezone(timezone.utc)


def is_due(local: datetime) -> bool:
    """Sunday or Wednesday, from 6:00 until the retry window closes."""
    return local.weekday() in SEND_WEEKDAYS and SEND_HOUR <= local.hour <= SEND_LAST_HOUR


def checkin_link() -> str:
    from ..auth._helpers import app_url
    return f"{app_url()}/?view=today"


def send_checkin(
    athlete_id: str,
    email: str,
    snap: dict,
    today: date,
    *,
    test: bool = False,
    write_read: Callable[[str, dict], str | None] = write_coach_read,
    send: Callable[..., bool] | None = None,
) -> bool:
    """Compose and send one check-in. Returns True when Resend accepted it."""
    if send is None:
        from ..auth._helpers import send_email as send
    dg = build_digest(snap, today)
    try:
        read = write_read(athlete_id, dg)
    except Exception as e:
        print(f"[checkin] coach read failed: {type(e).__name__}", flush=True)
        read = None
    subject, html, text = compose_email(dg, read, checkin_link(), test=test)
    ok = bool(send(email, subject, html, text))
    if ok:
        try:
            kv_set_json(last_sent_key(athlete_id), {
                "at": int(time.time() * 1000), "subject": subject, "test": test, "coachRead": bool(read),
            })
        except Exception:
            pass
    return ok


def run_checkin_emails(
    now_utc: datetime | None = None,
    *,
    claim: Callable[[str], bool] | None = None,
    release: Callable[[str], None] | None = None,
    sender: Callable[..., bool] = send_checkin,
) -> dict:
    """The cron's half: send every due check-in once. Returns a summary.

    Idempotent per athlete per local date: the claim is an atomic counter, so
    two overlapping cron runs cannot both send. A failed send gives the claim
    back and the next hourly run retries, until SEND_LAST_HOUR.
    """
    from ..auth._helpers import ADMIN_ATHLETE_ID, kv_bump_counter, kv_unbump_counter

    if claim is None:
        def claim(key: str) -> bool:
            return kv_bump_counter(key, SENT_TTL_SECONDS) == 1
    if release is None:
        def release(key: str) -> None:
            kv_unbump_counter(key)

    idx = kv_get_json(INDEX_KEY)
    athlete_ids = [a for a in (idx if isinstance(idx, list) else []) if isinstance(a, str)]
    summary = {"checked": 0, "due": 0, "sent": 0, "failed": 0, "skipped": 0}
    for athlete_id in athlete_ids:
        summary["checked"] += 1
        if not checkin_allowed(athlete_id, ADMIN_ATHLETE_ID):
            summary["skipped"] += 1
            continue
        prefs = load_prefs(athlete_id)
        email = str(prefs.get("email") or "")
        if not prefs.get("enabled") or not email:
            summary["skipped"] += 1
            continue
        snap = load_snapshot(athlete_id)
        if not snap:
            summary["skipped"] += 1
            continue
        local = local_now(snap["timezone"], now_utc)
        if not is_due(local):
            continue
        summary["due"] += 1
        key = sent_claim_key(athlete_id, local.date().isoformat())
        try:
            if not claim(key):
                continue  # already sent (or being sent) today
        except Exception as e:
            print(f"[checkin] claim failed: {type(e).__name__}", flush=True)
            summary["failed"] += 1
            continue
        try:
            ok = sender(athlete_id, email, snap, local.date())
        except Exception as e:
            print(f"[checkin] send failed: {type(e).__name__}", flush=True)
            ok = False
        if ok:
            summary["sent"] += 1
        else:
            summary["failed"] += 1
            try:
                release(key)
            except Exception:
                pass
    return summary
