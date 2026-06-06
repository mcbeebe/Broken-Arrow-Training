"""Keyless unit tests for R3's PR-claim output validator (NO API calls).

`validate_pr_claims` is pure, so we can lock R3 in deterministically against
the real PR_STATUS line shapes that build_context_block emits. This is the
test behind the brief's acceptance criterion: "with the model pinned to Haiku,
a PR_STATUS:NO reply never emits a PR claim."
"""

from api.coach._core import validate_pr_claims

# Real PR_STATUS line shapes (see build_context_block / the banner).
_NO = (
    "PR_STATUS: NO — today's effort (25m) is 2m SLOWER than prior best on "
    "2026-05-10 (Sun) (23m). DO NOT call this a PR. DO NOT say 'faster than'."
)
_YES = (
    "PR_STATUS: YES — today's effort (22m) is 1m FASTER than prior best on "
    "2026-05-10 (Sun) (23m). You MAY call this a PR and MUST use exactly "
    "'1m PR' — no other delta."
)
_NO_BASELINE = (
    "PR_STATUS: NO BASELINE — do NOT claim a PR or cite any previous time for this distance."
)


def test_no_verdict_strips_pr_claim() -> None:
    reply = "Strong run today. That's a 2-minute PR — you were faster than your prior best!"
    clean, violated = validate_pr_claims(reply, _NO)
    assert violated
    assert "PR" not in clean
    assert "faster than" not in clean.lower()
    assert "Strong run today." in clean  # the non-violating sentence survives


def test_no_verdict_keeps_honest_slower_framing() -> None:
    reply = "Solid effort. That was about 2 minutes slower than your prior best — the build week explains it."
    clean, violated = validate_pr_claims(reply, _NO)
    assert not violated
    assert clean == reply


def test_no_baseline_strips_pr() -> None:
    reply = "Nice work out there. A new PR for you, that's a milestone."
    clean, violated = validate_pr_claims(reply, _NO_BASELINE)
    assert violated
    assert "PR" not in clean
    assert "Nice work out there." in clean


def test_yes_keeps_correct_delta() -> None:
    reply = "Huge day — that's a 1m PR over your prior best!"
    clean, violated = validate_pr_claims(reply, _YES)
    assert not violated
    assert clean == reply


def test_yes_strips_wrong_delta() -> None:
    reply = "Great race today. That's an 8-minute PR over your old time!"
    clean, violated = validate_pr_claims(reply, _YES)
    assert violated
    assert "8-minute" not in clean
    assert "Great race today." in clean


def test_no_pr_status_line_is_noop() -> None:
    # Summarization / inference callers pass no PR_STATUS context → untouched.
    reply = "You ran faster than ever and set a PR."
    clean, violated = validate_pr_claims(reply, "Today: Monday\nReadiness: GREEN")
    assert not violated
    assert clean == reply


def test_bare_faster_forward_looking_is_kept() -> None:
    # Comparative-only: "run faster next block" is legit coaching, not a claim.
    reply = "Good effort. With more aerobic base you'll be able to run faster next block."
    clean, violated = validate_pr_claims(reply, _NO)
    assert not violated
    assert clean == reply
