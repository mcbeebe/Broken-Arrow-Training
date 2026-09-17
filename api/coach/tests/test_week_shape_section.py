"""Keyless test: the week's layout reaches the coach prompt, and the prompt
carries the contract for proposing a reshape (NO API).

Present -> WEEK SHAPE renders the layout in force, whose it is, the week
span, the roles, and the reshape-vs-updateDay directive; absent -> no
phantom section. COACH_ROLE names the `reshape` object, the seven-day
rule, the laws, the fromWeek default and the no-prose rule.
"""

import pathlib
import sys

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from api.coach._core import COACH_ROLE, build_context_block


def _snapshot(athlete_shaped: bool = True) -> dict:
    return {
        "weekShape": {
            "current": "Mon rest · Tue quality · Wed easy run · Thu strength · Fri easy run · Sat long run · Sun rest",
            "shape": {"1": "rest", "2": "quality", "3": "run", "4": "strength", "5": "run", "6": "long", "7": "rest"},
            "athleteShaped": athlete_shaped,
            "currentWeekNum": 6,
            "lastWeekNum": 18,
            "roles": [{"role": "long", "label": "Long run"}, {"role": "quality", "label": "Quality"}, {"role": "rest", "label": "Rest"}],
        },
    }


def test_week_shape_renders_with_owner_span_roles_and_directive() -> None:
    ctx = build_context_block(_snapshot())
    assert "WEEK SHAPE (in force this week; the athlete's own layout)" in ctx
    tail = ctx.split("WEEK SHAPE", 1)[1]
    assert "Tue quality" in tail and "Sat long run" in tail
    assert "Current week 6 of 18." in tail
    assert "long = Long run" in tail
    assert "`reshape` proposal" in tail
    assert "a single day is an `updateDay` op" in tail


def test_engine_layout_is_named_as_not_the_athletes() -> None:
    ctx = build_context_block(_snapshot(athlete_shaped=False))
    assert "the plan's own layout — the athlete has not reshaped it" in ctx


def test_absent_week_shape_emits_no_section() -> None:
    assert "WEEK SHAPE" not in build_context_block({})


def test_prompt_carries_the_reshape_contract() -> None:
    assert "PLAN SHAPING — change the week's layout" in COACH_ROLE
    assert '"reshape": {' in COACH_ROLE
    assert '"shape": {"mon":"rest","tue":"strength"' in COACH_ROLE
    assert "names ALL SEVEN days" in COACH_ROLE
    assert "never three hard days" in COACH_ROLE
    assert "Default to the NEXT week when this week has already started" in COACH_ROLE
    assert "`in_place` (default)" in COACH_ROLE
    assert "A ONE-OFF change to a single day is still an `updateDay` op" in COACH_ROLE
    assert 'never say "moved", "done"' in COACH_ROLE
