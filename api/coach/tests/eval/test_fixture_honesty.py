"""Keyless fixture-honesty + harness-wiring tests (NO API calls).

Runs in the default `pytest` (not marked `eval`). For every fixture, build
the real system prompt + context block and assert:
- the harness wires up without error (imports the real builders),
- the scenario the fixture CLAIMS actually appears in the context block
  (e.g. `PR_STATUS: NO`, an injury substring) — so a fixture can never
  silently drift to testing the wrong thing.

This is the part of R1 that's verifiable without spending API budget.
"""

import glob
import json
import pathlib

import pytest

import harness
import assertions

_FIX_DIR = pathlib.Path(__file__).parent / "fixtures"
_FIXTURES = sorted(glob.glob(str(_FIX_DIR / "*.json")))


def _load(path: str) -> dict:
    return json.loads(pathlib.Path(path).read_text())


def _snapshot(data: dict) -> dict:
    return {k: v for k, v in data.items() if not k.startswith("_")}


def test_fixtures_exist() -> None:
    assert _FIXTURES, "no eval fixtures found"


@pytest.mark.parametrize("path", _FIXTURES, ids=lambda p: pathlib.Path(p).stem)
def test_fixture_builds_expected_context(path: str) -> None:
    data = _load(path)
    expect = data.get("_expect", {})
    snap = _snapshot(data)

    system, ctx, user_msg = harness.build_daily_call(snap, expect.get("user_question"))

    # Harness wiring: real builders produced a non-empty prompt + task.
    assert system and ctx and user_msg
    assert "Task:" in user_msg
    assert "Triggered by:" in user_msg  # the daily task always demands the chip

    # Honesty: the claimed scenario is really produced by the engine.
    if expect.get("pr_status_expected"):
        assertions.assert_context_has_pr_status(ctx, expect["pr_status_expected"])
    if expect.get("context_contains"):
        assertions.assert_context_contains(ctx, expect["context_contains"])
    if expect.get("readiness_max_intensity"):  # R2
        assertions.assert_context_has_readiness_directive(ctx, expect["readiness_max_intensity"])
