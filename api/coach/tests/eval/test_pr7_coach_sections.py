"""Keyless test: the PR-7 guidance contexts reach the coach context block (NO API).

`App.tsx` injects race-execution (R6), mental-skills (R10), and the gated cycle
(R11) and masters (R12) guidance into the snapshot. This locks the wiring: when a
field is present its section renders and the text carries through verbatim; when
absent, nothing is emitted (so an athlete the guidance doesn't apply to — e.g. a
male athlete, or a 30-year-old — never grows a phantom CYCLE / MASTERS section).
"""

from api.coach._core import build_context_block


def test_race_execution_context_renders() -> None:
    ctx = build_context_block({"raceExecutionContext": "pace by the Rule of Thirds — restrain early"})
    assert "RACE EXECUTION:" in ctx
    assert "Rule of Thirds" in ctx


def test_mental_context_renders() -> None:
    ctx = build_context_block({"mentalContext": "build mental skills like fitness: a short mantra"})
    assert "MENTAL SKILLS:" in ctx
    assert "mantra" in ctx


def test_cycle_context_renders() -> None:
    ctx = build_context_block({"cycleContext": "cycle-aware and evidence-humble; RED-S flag worth a check-in"})
    assert "CYCLE:" in ctx
    assert "RED-S" in ctx
    # The prompt keeps the coach from over-stepping into clinical territory.
    assert "clinician" in ctx.lower()


def test_masters_context_renders() -> None:
    ctx = build_context_block({"mastersContext": "masters-aware: recover more deliberately"})
    assert "MASTERS:" in ctx
    assert "recover more" in ctx


def test_absent_contexts_emit_no_sections() -> None:
    ctx = build_context_block({})
    for label in ("RACE EXECUTION", "MENTAL SKILLS", "CYCLE:", "MASTERS"):
        assert label not in ctx


def test_blank_contexts_are_ignored() -> None:
    ctx = build_context_block({
        "raceExecutionContext": "  ", "mentalContext": "", "cycleContext": "   ", "mastersContext": "",
    })
    for label in ("RACE EXECUTION", "MENTAL SKILLS", "CYCLE:", "MASTERS"):
        assert label not in ctx
