"""LIVE Coach report-card evals (marked `eval`; needs ANTHROPIC_API_KEY).

One real model call per fixture, then deterministic behavioral assertions
driven by each fixture's `_expect` block. Skipped automatically when no API
key is present (local default runs, fork PRs). Run explicitly with:

    pytest -m eval api/coach/tests/eval          # or: npm run test:coach-eval

Each `_expect` key maps to one assertion. Keys not set simply don't assert,
so later PRs tighten coverage by adding keys to fixtures (R2 adds the
readiness directive, R5 flips on `require_defer_to_pro`, etc.).
"""

import glob
import json
import os
import pathlib

import pytest

import harness
import assertions

_FIX_DIR = pathlib.Path(__file__).parent / "fixtures"
_FIXTURES = sorted(glob.glob(str(_FIX_DIR / "*.json")))

_DEFAULT_MAX_CHARS = 1700  # max_tokens=400 already caps output; sanity bound only


def _load(path: str) -> dict:
    return json.loads(pathlib.Path(path).read_text())


def _snapshot(data: dict) -> dict:
    return {k: v for k, v in data.items() if not k.startswith("_")}


@pytest.mark.eval
@pytest.mark.skipif(
    not os.environ.get("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set — live Coach eval skipped",
)
@pytest.mark.parametrize("path", _FIXTURES, ids=lambda p: pathlib.Path(p).stem)
def test_report_card(path: str) -> None:
    data = _load(path)
    expect = data.get("_expect", {})
    snap = _snapshot(data)

    reply, ctx, model = harness.run_fixture(snap, expect.get("user_question"))

    # Always-on rubric for the daily surface.
    assertions.assert_within_length(reply, expect.get("max_chars", _DEFAULT_MAX_CHARS))
    assertions.assert_at_most_one_proposal(reply)
    if expect.get("require_triggered_by", True):
        assertions.assert_has_triggered_by(reply)

    # Context honesty (also covered keyless, re-checked here for completeness).
    if expect.get("pr_status_expected"):
        assertions.assert_context_has_pr_status(ctx, expect["pr_status_expected"])
    if expect.get("context_contains"):
        assertions.assert_context_contains(ctx, expect["context_contains"])
    if expect.get("readiness_max_intensity"):  # R2
        assertions.assert_context_has_readiness_directive(ctx, expect["readiness_max_intensity"])

    # Scenario-specific behavioral assertions.
    if expect.get("forbid_pr_language"):
        assertions.assert_no_pr_language(reply)
    if expect.get("forbid_go_hard"):
        assertions.assert_no_go_hard(reply)
    if expect.get("acknowledge_missing"):
        assertions.assert_acknowledges_missing(reply)
    if expect.get("evening_framing"):
        assertions.assert_evening_framing(reply)
    if expect.get("require_defer_to_pro"):  # set by R5
        assertions.assert_defers_to_pro(reply)
    if expect.get("persona_voice"):
        assertions.assert_persona_not_flat(reply, expect["persona_voice"])
