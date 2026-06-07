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
    if expect.get("safe_disposition"):  # R5
        assertions.assert_context_has_safe_disposition(ctx, expect["safe_disposition"])
    for needle in expect.get("athlete_directive_contains", []):  # R7
        assert "ATHLETE_PROFILE_DIRECTIVE:" in system, f"no ATHLETE_PROFILE_DIRECTIVE in system prompt"
        assert needle in system, f"expected {needle!r} in system prompt; got the directive line missing it"


def test_athlete_profile_directive_helper() -> None:
    """R7: the pure directive builder renders age/experience/injury/goal, and
    returns None when there's nothing structured (older profiles unaffected)."""
    from api.coach._core import _athlete_profile_directive

    assert _athlete_profile_directive(None) is None
    assert _athlete_profile_directive({"name": "x", "maxHR": 190}) is None
    d = _athlete_profile_directive({
        "birthDate": "1972-03-01",
        "experienceLevel": "intermediate",
        "injuryHistory": [{"region": "right knee", "status": "chronic"}],
        "goals": [{"text": "sub-2h half", "priority": "primary"}],
    })
    assert d is not None
    assert "masters" in d
    assert "experience intermediate" in d
    assert "right knee (chronic)" in d
    assert "sub-2h half" in d


def test_injury_floor_is_chat_only() -> None:
    """R5: the injury floor reads the athlete's message, so it must NOT fire on
    a daily snapshot (no user_msg) but MUST fire when a pain message is passed."""
    from api.coach._core import build_context_block

    snap = {
        "today": {"date": "2026-06-02", "period": "morning"},
        "readiness": {"status": "YELLOW", "trainingState": "B", "components": {}, "message": "ok"},
    }
    assert "SAFE_DISPOSITION: INJURY" not in build_context_block(snap)
    # INJURY_RE matches whole words (pain/hurt/sore/tight/ache/injured/injury);
    # note it does NOT match "hurting"/"aching" — a known narrowness we reuse.
    ctx = build_context_block(snap, user_msg="my right knee is in real pain on the descents")
    assertions.assert_context_has_safe_disposition(ctx, "INJURY")


def test_overtraining_floor_fires_without_user_message() -> None:
    """R5: the overtraining floor (training state D) fires on every surface,
    no athlete message required."""
    from api.coach._core import build_context_block

    snap = {
        "today": {"date": "2026-06-02", "period": "morning"},
        "readiness": {"status": "RED", "trainingState": "D", "components": {}, "message": "overtrained"},
    }
    assertions.assert_context_has_safe_disposition(build_context_block(snap), "OVERTRAINING")


# ── PR baseline must be the SAME route, not just the same distance ──


def test_route_name_match_helper() -> None:
    """Same-route name detection: exact match, strong token overlap, and the
    generic-token guard so two 'Morning Run's don't look like one route."""
    from api.coach._core import _route_names_match

    assert _route_names_match("Granite Mtn", "Granite Mtn")
    assert _route_names_match("Granite Mtn Loop", "Granite Mtn")            # 2/3 overlap
    assert not _route_names_match("Morning Run", "Morning Run")             # only generic tokens
    assert not _route_names_match("Granite Mtn", "Mailbox Peak")           # different routes
    assert not _route_names_match("", "Granite Mtn")


def test_same_route_profile_helper() -> None:
    """Elevation-or-name comparability: a flat run is not the same route as a
    mountain race at the same distance; a same-vert repeat is."""
    from api.coach._core import _same_route_profile

    mountain = {"name": "Broken Arrow Skyrace 18K", "elevationGain": 3763}
    flat = {"name": "Tempo Run", "elevationGain": 200}
    repeat = {"name": "Trail Repeat", "elevationGain": 3500}              # within ±20%
    named_repeat = {"name": "Broken Arrow Skyrace 18K", "elevationGain": 0}

    assert not _same_route_profile(mountain, flat)
    assert _same_route_profile(mountain, repeat)
    assert _same_route_profile(mountain, named_repeat)                    # name carries it


def _mountain_snap(prior: dict) -> dict:
    """Daily snapshot: today is a mountain race, with one prior effort."""
    return {
        "today": {"date": "2026-06-07", "period": "evening"},
        "readiness": {"status": "GREEN", "trainingState": "B", "components": {}, "message": "ok"},
        "plannedToday": {
            "day": "Sat", "type": "Race", "workout": "Skyrace", "zone": "Z4",
            "actual": {
                "name": "Broken Arrow Skyrace 18K", "startDate": "2026-06-07T08:00:00",
                "distance": 8.6, "movingTime": 5700, "avgHR": 154, "elevationGain": 3763,
            },
        },
        "recentActivities": [prior],
    }


def test_pr_status_no_route_baseline_for_flat_prior() -> None:
    """The reported bug: a flat road effort at the same distance must NOT be a
    PR baseline for a mountain race — engine emits NO ROUTE BASELINE."""
    from api.coach._core import build_context_block

    flat_prior = {
        "name": "Riverfront Tempo", "startDate": "2026-04-12T07:00:00",
        "distance": 8.5, "movingTime": 4200, "avgHR": 150, "elevationGain": 180,
    }
    ctx = build_context_block(_mountain_snap(flat_prior))
    assertions.assert_context_has_pr_status(ctx, "NO ROUTE BASELINE")


def test_pr_status_yes_for_same_route_repeat() -> None:
    """A same-route, same-vert prior that's slower still yields a real PR."""
    from api.coach._core import build_context_block

    same_route = {
        "name": "Broken Arrow Skyrace 18K", "startDate": "2025-06-21T08:00:00",
        "distance": 8.6, "movingTime": 6300, "avgHR": 158, "elevationGain": 3700,
    }
    ctx = build_context_block(_mountain_snap(same_route))
    assertions.assert_context_has_pr_status(ctx, "YES")
    assert "'10m PR'" in ctx  # 6300-5700 = 600s = 10m, mandated delta
