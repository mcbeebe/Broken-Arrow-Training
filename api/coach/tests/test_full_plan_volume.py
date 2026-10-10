"""Keyless test: the full-plan overview reads each week's volume as the plan gives it (NO API).

Field bug: General Fitness weeks give their volume as a time ("~45 min
cardio"), and an uploaded plan can give a label ("By time"). The overview
stuck "mi" on whatever came, so the coach read "~45 min cardiomi" and
"By timemi". Miles are still written as before ("32mi").
"""

import pathlib
import sys

import pytest

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from api.coach._core import build_context_block


def _week_line(miles: object) -> str:
    snapshot = {"fullPlan": {"weeks": [{"num": 3, "dates": "Oct 6–12", "miles": miles, "focus": "Base"}], "days": []}}
    ctx = build_context_block(snapshot, include_full_plan=True)
    return next(line.strip() for line in ctx.splitlines() if line.strip().startswith("Wk 3"))


@pytest.mark.parametrize(
    ("miles", "shown"),
    [
        (32, "32mi"),
        (12.5, "12.5mi"),
        ("20", "20mi"),
        ("~20", "~20mi"),
        ("~45 min cardio", "~45 min cardio"),
        ("By time", "By time"),
        ("Miles + time", "Miles + time"),
        ("14+race", "14+race"),
        (None, "?"),
        ("", "?"),
    ],
)
def test_a_week_reads_its_volume_as_the_plan_gives_it(miles: object, shown: str) -> None:
    assert _week_line(miles) == f"Wk 3 (Oct 6–12, {shown}): Base"


def test_never_a_unit_stuck_on_a_time_or_a_label() -> None:
    for miles in ("~45 min cardio", "By time"):
        assert "mi)" not in _week_line(miles)
