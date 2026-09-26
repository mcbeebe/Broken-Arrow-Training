"""Keyless test: the last-7-days coach take (NO API).

The Today tab's "Your last 7 days" card sends its own summary as
`last7Digest` with surface `week_take`. This locks the server half: the
digest reaches the context block as the sanctioned source, the surface has
its own short task, and it asks for a synthesis that can't contradict the
card rather than a re-listing of it.
"""

import pathlib
import sys

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from api.coach._core import build_context_block
from api.coach.insight import SURFACE_INSTRUCTIONS, _surface_key, _week_take_snapshot

DIGEST = (
    "Sep 20 – 26 · Sessions done 4 of 4 · Training time 5h 2m · Fitness +7 · "
    "Hardest session: Wed STRENGTH: Lower body + sleds · Going well: All 4 "
    "planned sessions done. · To improve: Load is climbing fast — hold next "
    "week's volume flat rather than adding more."
)


def test_digest_reaches_the_context_block() -> None:
    ctx = build_context_block({"last7Digest": DIGEST})
    assert "LAST 7 DAYS (the card the athlete is looking at):" in ctx
    assert "Sessions done 4 of 4" in ctx
    assert "hold next week's volume flat" in ctx


def test_absent_or_blank_digest_emits_no_section() -> None:
    assert "LAST 7 DAYS" not in build_context_block({})
    assert "LAST 7 DAYS" not in build_context_block({"last7Digest": "   "})


def test_week_take_has_its_own_short_task() -> None:
    assert _surface_key("week_take") == "week_take"
    task = SURFACE_INSTRUCTIONS["week_take"]
    assert task is not SURFACE_INSTRUCTIONS["daily"]
    assert "1-2 sentences" in task
    assert "LAST 7 DAYS" in task
    # The honesty guards that make it a comment on the card, not a new read.
    assert "never invent" in task
    assert "never contradict a To improve line" in task
    assert "ONLY facts in the LAST 7 DAYS line" in task
    assert "no callout boxes" in task
    assert "GENERAL-FITNESS" in task
    assert "don't re-list the bullets" in task
    # Not the daily read's shape.
    assert "no 'Triggered by:' chip" in task


FULL_SNAPSHOT = {
    "today": {"date": "2026-09-26"},
    "currentWeekNum": 12,
    "last7Digest": DIGEST,
    "readiness": {"status": "RED", "displayScore": 22},
    "todayHealth": {"sleepHours": 4.5},
    "plannedToday": {"day": "Sat 9/26", "type": "long", "workout": "Long run 14 mi"},
    "recentActivities": [{"name": "Morning Run", "date": "2026-09-26"}],
    "prStatus": "YES",
}


def test_week_take_sees_only_the_card_and_framing() -> None:
    slim = _week_take_snapshot(FULL_SNAPSHOT)
    assert set(slim) == {"today", "currentWeekNum", "last7Digest"}
    ctx = build_context_block(slim, depth="7d", max_activities=0)
    assert "LAST 7 DAYS" in ctx
    # Nothing from today that could pull the take off the week or go stale
    # inside its once-a-day cache.
    assert "Long run 14 mi" not in ctx
    assert "RED" not in ctx
    assert "Morning Run" not in ctx


def test_week_take_keeps_the_general_fitness_framing() -> None:
    slim = _week_take_snapshot({**FULL_SNAPSHOT, "generalGoal": True, "generalGoalLabel": "Build muscle"})
    assert "GENERAL-FITNESS ATHLETE" in build_context_block(slim, depth="7d", max_activities=0)
