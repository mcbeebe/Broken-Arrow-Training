"""Keyless test: the G6 race-pacing plan reaches the coach prompt (NO API).

`App.tsx` sets `racePacingContext` only for curated courses in the final
~2 weeks. Present → RACE_PACING renders with the execution directives;
absent → no phantom section for unmatched courses or far-out races.
"""

import pathlib
import sys

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from api.coach._core import build_context_block


def test_race_pacing_context_renders_with_execution_directives() -> None:
    ctx = build_context_block({
        "racePacingContext": (
            "Course plan for Broken Arrow 18K: projected 2h10-2h35. "
            "KT-22 Climb (mi 0-2, +11.4%): 13:05-14:34/mi. "
            "Fueling: 45 g carb/hr; checkpoints: Siberia mi 4.9 ≈ 52 g in."
        ),
    })
    assert "RACE_PACING:" in ctx
    assert "KT-22 Climb" in ctx
    tail = ctx.split("RACE_PACING:", 1)[1]
    assert "segment by" in tail                      # answer from the bands
    assert "racing, not surrender" in tail           # hike framing
    assert "places, not clock time" in tail          # fueling by checkpoint


def test_absent_race_pacing_emits_no_section() -> None:
    assert "RACE_PACING" not in build_context_block({})


def test_blank_race_pacing_is_ignored() -> None:
    assert "RACE_PACING" not in build_context_block({"racePacingContext": " "})
