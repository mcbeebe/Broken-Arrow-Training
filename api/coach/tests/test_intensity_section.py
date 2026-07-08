"""Keyless test: the G7 intensity monitor reaches the coach prompt (NO API).

Present -> INTENSITY renders with the gray-zone coaching directive
(slow the easy days, never cut the hard ones; decoupling framed as a
trend); absent/blank -> no phantom section without HR evidence.
"""

import pathlib
import sys

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from api.coach._core import build_context_block


def test_intensity_context_renders_with_directive() -> None:
    ctx = build_context_block({
        "intensityContext": (
            "This week's measured intensity split: 61% easy / 39% hard across 4 "
            "HR-measured sessions (method target: ~80% easy in Build). "
            "GRAY-ZONE FLAG: 80/20's Build wants your easy time easy."
        ),
    })
    assert "INTENSITY:" in ctx
    tail = ctx.split("INTENSITY:", 1)[1]
    assert "61% easy" in tail
    assert "slowing the easy days" in tail
    assert "never cutting the hard ones" in tail
    assert "durability trend, not a verdict" in tail


def test_absent_intensity_emits_no_section() -> None:
    assert "INTENSITY:" not in build_context_block({})


def test_blank_intensity_is_ignored() -> None:
    assert "INTENSITY:" not in build_context_block({"intensityContext": "  "})
