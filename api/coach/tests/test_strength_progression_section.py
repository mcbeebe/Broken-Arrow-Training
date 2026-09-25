"""Keyless test: strength progression reaches the coach prompt with the
right unit of work (NO API).

A rep exercise reads "x12x3" as it always has. A timed hold (plank, wall
sit) has 0 reps, so it reads by its hold time — field bug 2026-09-23:
"Plank 3x60s" drafted as 60 reps, and once fixed would have shown the
coach "x0x3".
"""

import pathlib
import sys

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from api.coach._core import build_context_block


def _snapshot() -> dict:
    return {
        "strengthProgression": [
            {
                "name": "Goblet Squat", "sessions": 3, "isBodyweight": False,
                "firstSession": {"weekNum": 1, "topWeightLb": 30, "avgReps": 10, "sets": 3},
                "latestSession": {"weekNum": 4, "topWeightLb": 40, "avgReps": 12, "sets": 3},
                "suggestedTarget": {"weightLb": 45, "reps": 10, "sets": 3, "tier": "progress", "rationale": "Clean reps."},
            },
            {
                "name": "Plank", "sessions": 2, "isBodyweight": True,
                "firstSession": {"weekNum": 2, "topWeightLb": 0, "avgReps": 0, "sets": 3, "holdSec": 45},
                "latestSession": {"weekNum": 4, "topWeightLb": 0, "avgReps": 0, "sets": 3, "holdSec": 60},
                "suggestedTarget": {"weightLb": 0, "reps": 0, "sets": 3, "timeSec": 65, "tier": "progress", "rationale": "Held every set."},
            },
        ],
    }


def _line(ctx: str, name: str) -> str:
    return next(l for l in ctx.splitlines() if l.strip().startswith(f"- {name}:"))


def test_rep_exercise_reads_as_before() -> None:
    line = _line(build_context_block(_snapshot()), "Goblet Squat")
    assert "first Wk1 30lb x10x3 -> latest Wk4 40lb x12x3" in line
    assert "Suggested next: 45lb x10x3 [progress]" in line


def test_hold_reads_by_time_never_zero_reps() -> None:
    line = _line(build_context_block(_snapshot()), "Plank")
    assert "first Wk2 BW hold 45s x3 -> latest Wk4 BW hold 60s x3" in line
    assert "Suggested next: BW hold 65s x3 [progress]" in line
    assert "x0x" not in line
