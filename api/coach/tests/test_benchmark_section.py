"""Keyless test: the benchmark log reaches the coach prompt, and the prompt
carries the contract for recording a reported result (NO API).

Present -> BENCHMARKS renders the newest of each kind with age / retest /
protocol / history, the accepted kinds, and the record-it directive;
absent -> no phantom section. The COACH_ROLE contract names the
`benchmarks` array, the kind enum, the date rule, and the no-prose rule.
"""

import pathlib
import sys

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from api.coach._core import COACH_ROLE, build_context_block


def _snapshot() -> dict:
    return {
        "benchmarks": {
            "current": [
                {"kind": "race_5k", "label": "5K", "value": "21:40", "dateIso": "2026-09-16", "weeksOld": 0, "stale": False, "protocol": "parkrun", "entries": 2},
                {"kind": "lthr", "label": "Threshold HR", "value": "168 bpm", "dateIso": "2026-06-03", "weeksOld": 15, "stale": True, "entries": 1},
            ],
            "kinds": [
                {"kind": "race_5k", "label": "5K", "unit": "seconds"},
                {"kind": "lthr", "label": "Threshold HR", "unit": "bpm"},
            ],
        },
    }


def test_benchmarks_render_with_age_retest_protocol_and_history() -> None:
    ctx = build_context_block(_snapshot())
    assert "BENCHMARKS (measured, newest of each" in ctx
    tail = ctx.split("BENCHMARKS (measured", 1)[1]
    assert "5K (race_5k): 21:40 on 2026-09-16" in tail
    assert "0 wk old" in tail
    assert "via parkrun" in tail
    assert "2 entries" in tail
    assert "Threshold HR (lthr): 168 bpm on 2026-06-03" in tail
    assert "RETEST DUE" in tail
    assert "race_5k (seconds), lthr (bpm)" in tail
    assert "propose recording it with a `benchmarks` proposal block" in tail
    assert "acknowledge it instead of proposing it again" in tail


def test_empty_log_still_names_the_kinds_and_asks_for_a_race_time() -> None:
    ctx = build_context_block({"benchmarks": {"current": [], "kinds": [{"kind": "race_5k", "label": "5K", "unit": "seconds"}]}})
    assert "BENCHMARKS: none measured yet" in ctx
    assert "race_5k (seconds)" in ctx
    assert "recent race time" in ctx


def test_absent_benchmarks_emit_no_section() -> None:
    assert "BENCHMARKS" not in build_context_block({})


def test_prompt_carries_the_benchmark_contract() -> None:
    assert "BENCHMARKS — record a result the athlete reports" in COACH_ROLE
    assert '"benchmarks": [' in COACH_ROLE
    assert '"kind":"race_5k","value":"21:40","dateIso":"2026-09-16"' in COACH_ROLE
    # The kind enum and the escape hatch.
    for kind in ("race_5k", "wall_balls_unbroken", "goblet_squat_8rm", "plank"):
        assert kind in COACH_ROLE
    assert '"kind":"other"' in COACH_ROLE
    # The date rule is grounded on the Today line, and prose never records.
    assert "resolved from the \"Today:\" line" in COACH_ROLE
    assert "NEVER say \"logged\"" in COACH_ROLE
    # Agreeing to record without the block is the same hard failure as a plan change.
    assert "or agree to record a benchmark the athlete reported" in COACH_ROLE
