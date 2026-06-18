"""Keyless test: honest plan advisories reach the coach context block (NO API).

The plan generator can attach `advisories` (feasibility / runway / goal-derived
paces) to a plan; `App.tsx` summarizes them into the snapshot as
`advisoriesContext` so the welcome letter can acknowledge them plainly instead
of over-promising. This locks the wiring: when the field is present it renders a
`PLAN ADVISORIES:` line carrying the text; when absent, nothing is emitted (so a
plan with no caveats never grows a phantom warning).
"""

from api.coach._core import build_context_block

_ADVISORY = (
    "Tight runway: the race is ~3 weeks away, so the plan is compressed · "
    "Goal paces are a starting estimate — confirm with a tune-up"
)


def test_advisories_context_renders_plan_advisories_line() -> None:
    ctx = build_context_block({"advisoriesContext": _ADVISORY})
    assert "PLAN ADVISORIES:" in ctx
    # The actual advisory text is carried through verbatim, not just the label.
    assert "Tight runway" in ctx
    assert "confirm with a tune-up" in ctx
    # And the prompt steers the model to own the caveat rather than bury it.
    assert "honestly" in ctx.lower()


def test_no_advisories_means_no_plan_advisories_line() -> None:
    ctx = build_context_block({})
    assert "PLAN ADVISORIES" not in ctx


def test_blank_advisories_are_ignored() -> None:
    # Whitespace-only / empty strings must not emit an empty advisory line.
    assert "PLAN ADVISORIES" not in build_context_block({"advisoriesContext": "   "})
    assert "PLAN ADVISORIES" not in build_context_block({"advisoriesContext": ""})
