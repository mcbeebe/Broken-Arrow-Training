"""Keyless test: the G1b season narration reaches the coach prompt (NO API).

`App.tsx` sets `seasonContext` (from buildSeasonContext) only for 2+ race
calendars. This locks the server half: present → a SEASON section renders
with the narration directive (season altitude, residual doctrine, recovery-
is-the-training, honest advisories); absent/blank → no phantom section for
single-race athletes.
"""

import pathlib
import sys

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from api.coach._core import build_context_block


def test_season_context_renders_with_narration_directive() -> None:
    ctx = build_context_block({
        "seasonContext": (
            "Season calendar: Summer Half (A, 2026-08-02) · Hyrox SF (A, 2026-10-03). "
            "Current block: BRIDGE toward Hyrox SF — Your aerobic base is the Hyrox asset. "
            "Next race: Hyrox SF in 49 days."
        ),
    })
    assert "SEASON:" in ctx
    assert "Hyrox SF" in ctx
    season_tail = ctx.split("SEASON:", 1)[1]
    # The directives that make this season-altitude coaching:
    assert "next race in the chain" in season_tail
    assert "recovery IS the training" in season_tail
    assert "residual doctrine" in season_tail
    # Honesty guard — never paper over a compressed build.
    assert "paper over" in season_tail


def test_absent_season_emits_no_section() -> None:
    assert "SEASON" not in build_context_block({})


def test_blank_season_is_ignored() -> None:
    assert "SEASON" not in build_context_block({"seasonContext": "  "})
