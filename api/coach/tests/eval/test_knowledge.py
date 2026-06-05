"""Keyless unit tests for R6's relevance-gated knowledge assembler (NO API).

`select_knowledge` is pure, so we can prove the gating deterministically: the
right topic modules appear for the right athlete/message, and nothing extra
leaks in (which would inflate every prompt's tokens).
"""

from api.coach._core import select_knowledge, APP_KNOWLEDGE, APP_KNOWLEDGE_LITE

_MASTERS = "Masters / age 40+:"
_FEMALE = "Female-specific considerations:"
_RTR = "Return-to-run"
_VO2 = "VO2max & interval prescription:"
_STRENGTH = "Strength programming for endurance:"


def test_default_profile_gets_core_only() -> None:
    k = select_knowledge(lite=False, profile=None, user_msg="")
    assert APP_KNOWLEDGE.strip()[:40] in k       # core present
    assert _MASTERS not in k
    assert _FEMALE not in k
    assert _RTR not in k


def test_masters_gated_by_age() -> None:
    k = select_knowledge(lite=True, profile={"birthDate": "1972-01-01"}, user_msg="")
    assert _MASTERS in k
    assert _FEMALE not in k


def test_under_40_no_masters() -> None:
    assert _MASTERS not in select_knowledge(lite=True, profile={"birthDate": "2000-01-01"})


def test_female_gated() -> None:
    assert _FEMALE in select_knowledge(lite=True, profile={"sex": "female"})


def test_beginner_and_injury_gate_return_to_run() -> None:
    assert _RTR in select_knowledge(lite=True, profile={"experienceLevel": "beginner"})
    assert _RTR in select_knowledge(
        lite=True, profile={"injuryHistory": [{"region": "knee", "status": "chronic"}]}
    )


def test_keyword_modules_are_chat_only() -> None:
    # Message-gated modules require a user message (chat); insight passes "".
    assert _VO2 in select_knowledge(lite=False, user_msg="should I do VO2max intervals tomorrow?")
    assert _STRENGTH in select_knowledge(lite=False, user_msg="how should I structure my strength / lifting?")
    assert _VO2 not in select_knowledge(lite=False, user_msg="")


def test_lite_core_is_smaller_than_full() -> None:
    lite = select_knowledge(lite=True, profile=None)
    full = select_knowledge(lite=False, profile=None)
    assert APP_KNOWLEDGE_LITE.strip()[:40] in lite
    assert len(lite) < len(full)
