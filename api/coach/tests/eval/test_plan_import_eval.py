"""LIVE plan-import eval (marked `eval`; needs ANTHROPIC_API_KEY). Initiative 004, D3.

Reads every synthetic plan in `plan_import_cases.py` with each candidate
model, through the production path (`parse_request` then `extract_plan`),
and scores the result against the truth it was rendered from. The report
(accuracy, time, tokens per model) prints at the end of the run and goes to
the GitHub job summary; it is what picks the default model.

Runs only when asked: `pytest -m eval api/coach/tests/eval`, a manual
dispatch of coach-eval.yml, or a PR labelled `run-coach-eval`.
"""

from __future__ import annotations

import os
import time

import pytest

from api.coach._core import HAIKU_MODEL, SONNET_MODEL
from api.coach._plan_import import extract_plan, parse_request
from plan_import_cases import RESULTS, cases, request_body, score

MODELS = sorted({HAIKU_MODEL, SONNET_MODEL})
MIN_ACCURACY = 0.9


@pytest.mark.eval
@pytest.mark.skipif(
    not os.environ.get("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set — live plan-import eval skipped",
)
@pytest.mark.parametrize("model", MODELS)
@pytest.mark.parametrize("case", cases(), ids=lambda c: c.id)
def test_reads_the_plan(monkeypatch, model, case) -> None:
    monkeypatch.setenv("ANTHROPIC_PLAN_IMPORT_MODEL", model)
    req = parse_request(request_body(case))
    row = {"model": model, "case": case.id, "passed": False, "input": 0, "output": 0}
    t0 = time.time()
    try:
        result = extract_plan(req, athlete_id="eval", today="2026-10-08")
    except Exception as e:
        row.update(seconds=time.time() - t0, error=type(e).__name__)
        RESULTS.append(row)
        raise
    row["seconds"] = time.time() - t0
    row["input"], row["output"] = result["usage"]["input"], result["usage"]["output"]
    plan = result["plan"]
    s = score(case, plan)
    row.update(s)
    RESULTS.append(row)

    assert plan["status"] == case.status, s
    if case.status != "ok":
        assert plan["weeks"] == []
        row["passed"] = True
        return
    assert s["weeks"] == len(case.weeks), f"read {s['weeks']} weeks, expected {len(case.weeks)}"
    if case.units in ("mi", "km"):
        assert plan["units"] == case.units
    if case.levels:
        assert set(case.levels) <= set(plan.get("levels", [])), plan.get("levels")
    assert s["accuracy"] >= MIN_ACCURACY, s["misses"]
    assert s["extra"] <= 1, s["misses"]
    row["passed"] = True
