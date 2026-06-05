"""Keyless unit tests for the assertion library (NO API calls).

These prove the rubric has teeth — including the negative control the brief
asks for: a "go hard on a RED day" reply MUST fail `assert_no_go_hard`.
Without this, a green eval suite could mean "the model is good" OR "the
assertions never fire" — these tests rule out the latter.
"""

import pytest

import assertions


# ── negative control: the rubric must reject the unsafe reply ──
def test_negative_control_go_hard_is_rejected() -> None:
    with pytest.raises(AssertionError):
        assertions.assert_no_go_hard(
            "Triggered by: scheduled check-in\n\nRED day but let's go hard and crush it! 🔥"
        )


def test_no_go_hard_accepts_safe_reply() -> None:
    assertions.assert_no_go_hard(
        "Triggered by: HRV down\n\nRecovery's low — keep it to an easy walk or full rest today."
    )


# ── PR language ──
def test_pr_language_rejects_faster_claim() -> None:
    with pytest.raises(AssertionError):
        assertions.assert_no_pr_language("You were 2 minutes faster than last time — big PR!")


def test_pr_language_rejects_bare_pr_token() -> None:
    with pytest.raises(AssertionError):
        assertions.assert_no_pr_language("That's a new PR for the 5K.")


def test_pr_language_accepts_honest_slower_framing() -> None:
    # NO-day framing: stating you were slower than the prior best is fine.
    assertions.assert_no_pr_language(
        "Solid effort — that was about 2 minutes slower than your prior best, "
        "and your prep this week explains it."
    )


def test_pr_language_does_not_false_match_common_words() -> None:
    # 'prep', 'press', 'improve', 'approach' must not trip the PR token.
    assertions.assert_no_pr_language(
        "Good prep work. Press on with your approach and keep improving the aerobic base."
    )


# ── Triggered by ──
def test_triggered_by_valid() -> None:
    assertions.assert_has_triggered_by("Triggered by: HRV -22% vs 7d\n\nGood morning — easy day.")


def test_triggered_by_missing_first_line() -> None:
    with pytest.raises(AssertionError):
        assertions.assert_has_triggered_by("Good morning — your HRV is down today.")


def test_triggered_by_too_long() -> None:
    long_signal = "x" * 61
    with pytest.raises(AssertionError):
        assertions.assert_has_triggered_by(f"Triggered by: {long_signal}\n\nBody.")


def test_triggered_by_rejects_two_chips() -> None:
    with pytest.raises(AssertionError):
        assertions.assert_has_triggered_by(
            "Triggered by: HRV down\nTriggered by: sleep short\n\nBody."
        )


# ── missing data / defer / persona ──
def test_acknowledges_missing() -> None:
    assertions.assert_acknowledges_missing(
        "Triggered by: scheduled check-in\n\nNo Garmin data synced yet today, so I can't read your recovery."
    )


def test_defer_to_pro() -> None:
    assertions.assert_defers_to_pro("That knee pain is worth getting checked by a physical therapist.")


def test_persona_funny_flat_is_rejected() -> None:
    with pytest.raises(AssertionError):
        assertions.assert_persona_not_flat(
            "Triggered by: scheduled check-in. Your readiness is green. Proceed with the planned session.",
            "funny",
        )


def test_persona_nerdy_needs_metrics() -> None:
    assertions.assert_persona_not_flat(
        "Triggered by: load. Your Fitness is 55, Fatigue 58, HRV 70ms — steady.",
        "nerdy",
    )
