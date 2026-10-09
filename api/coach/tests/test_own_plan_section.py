"""Keyless test: the coach knows when the athlete follows their own plan (NO API).

Initiative 004, D1: an uploaded plan is followed as written. `App.tsx` sets
`planSource: 'imported'` on the snapshot for such a plan, and drops the
generated plan's method, phases, season and week shape. This locks the
server half:
  1. planSource 'imported' → an OWN PLAN section with the hard rules.
  2. No method framing for it, even if a stale methodology arrives.
  3. Anything else → no section, and the method framing as before.
  4. The prompt names exactly the whole-week ops the app refuses
     (src/utils/planImport/guardrails.ts), so the two can't drift apart.
  5. The week_take surface, which filters the snapshot, keeps the signal.
"""

import pathlib
import re
import sys

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from api.coach._core import build_context_block
from api.coach.insight import _week_take_snapshot

METHOD = {"methodName": "Polarized 80/20", "methodCoach": "Seiler", "methodPhilosophy": "Mostly easy."}


def _own_plan_section(ctx: str) -> str:
    assert "OWN PLAN" in ctx
    return ctx.split("OWN PLAN", 1)[1]


def test_an_uploaded_plan_gets_the_own_plan_rules() -> None:
    section = _own_plan_section(build_context_block({"planSource": "imported"}))
    assert "Follow the plan as written" in section
    assert "NEVER propose a week layout" in section
    assert "`reshape`" in section
    # Day edits stay allowed, and the athlete approves each one.
    for op in ("updateDay", "addDay", "deleteDay"):
        assert op in section
    assert "approves each one" in section
    # No generated-plan framing.
    assert "Base, Build, Peak or Taper" in section
    assert "Don't recalibrate" in section


def test_no_method_framing_for_an_uploaded_plan_even_if_one_arrives() -> None:
    ctx = build_context_block({"planSource": "imported", "methodology": METHOD})
    assert "Training philosophy" not in ctx
    assert "Polarized 80/20" not in ctx


def test_a_generated_plan_is_unchanged() -> None:
    ctx = build_context_block({"methodology": METHOD})
    assert "OWN PLAN" not in ctx
    assert "Training philosophy: Polarized 80/20 — Seiler" in ctx


def test_only_imported_turns_it_on() -> None:
    for value in (None, "", "generated", "IMPORTED", True):
        assert "OWN PLAN" not in build_context_block({"planSource": value})


def test_the_prompt_names_exactly_the_week_ops_the_app_refuses() -> None:
    src = (_REPO_ROOT / "src" / "utils" / "planImport" / "guardrails.ts").read_text()
    match = re.search(r"WEEK_OPS[^=]*=\s*new Set\(\[([^\]]*)\]\)", src)
    assert match, "WEEK_OPS not found in guardrails.ts"
    refused = set(re.findall(r"'(\w+)'", match.group(1)))
    assert refused == {"addWeek", "deleteWeek", "updateWeek"}
    section = _own_plan_section(build_context_block({"planSource": "imported"}))
    for op in refused:
        assert op in section, f"the coach is never told {op} is refused"


def test_the_week_take_surface_keeps_the_signal() -> None:
    kept = _week_take_snapshot({"planSource": "imported", "weeks": [1, 2], "today": {"date": "2026-10-09"}})
    assert kept["planSource"] == "imported"
    assert "weeks" not in kept
