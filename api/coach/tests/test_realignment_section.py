"""Keyless test: the G4 realignment context reaches the coach prompt (NO API).

`App.tsx` injects `realignmentContext` (from src/utils/realignment.ts) only
when the trailing-7-day miss policy fires. This locks the server half of the
wiring: present → a REALIGNMENT section renders with the proposal-authoring
directive (future days only, offer-not-fiat, no guilt); absent/blank → no
phantom section, so a compliant athlete's coach never hints at drift.
"""

import pathlib
import sys

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from api.coach._core import build_context_block


def test_realignment_context_renders_with_proposal_directive() -> None:
    ctx = build_context_block({
        "realignmentContext": (
            "Athlete missed a key session this week — Long Run 10mi. "
            "All misses in the last 7 days: Long Run 10mi (Tue 7/7, key session)."
        ),
    })
    assert "REALIGNMENT:" in ctx
    assert "Long Run 10mi" in ctx
    # The directive that makes this a negotiation, not a rewrite:
    assert "proposal" in ctx.split("REALIGNMENT:", 1)[1][:900]
    assert "FUTURE days only" in ctx
    # Tone guard — never scold.
    assert "not a failing" in ctx


def test_absent_realignment_emits_no_section() -> None:
    assert "REALIGNMENT" not in build_context_block({})


def test_blank_realignment_is_ignored() -> None:
    assert "REALIGNMENT" not in build_context_block({"realignmentContext": "   "})
