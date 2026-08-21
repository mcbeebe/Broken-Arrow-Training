"""The outage: anthropic 1.0.0 removed `temperature` from
messages.create()/stream(), and because requirements are installed fresh on
every Vercel build it reached production on the next rebuild — taking down
every LLM surface at once with "got an unexpected keyword argument
'temperature'".

requirements.txt now pins below 1.0.0. These tests cover the second line of
defence, so the day that bound is raised the coach degrades instead of going
dark.
"""

import re
from pathlib import Path

from api.coach._core import _apply_temperature, _sdk_accepts_temperature

REQUIREMENTS = Path(__file__).resolve().parents[2] / "requirements.txt"


def test_anthropic_is_pinned_below_the_breaking_major():
    """The pin IS the fix — without it the guard only softens the landing."""
    text = REQUIREMENTS.read_text()
    line = next(l for l in text.splitlines() if l.strip().startswith("anthropic"))
    assert "<1.0.0" in line, f"anthropic must stay below 1.0.0, got: {line}"


def test_every_dependency_carries_an_upper_bound():
    """Any unpinned dep is the same outage waiting on a different package."""
    for line in REQUIREMENTS.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name = re.split(r"[<>=\[]", line, 1)[0]
        if name == "tzdata":
            continue  # data-only, no API to break
        assert "<" in line, f"{name} has no upper bound: {line}"


def test_temperature_is_applied_when_the_sdk_supports_it(monkeypatch):
    monkeypatch.setattr("api.coach._core._sdk_accepts_temperature", lambda: True)
    kwargs = {"model": "m"}
    _apply_temperature(kwargs, 0.2)
    assert kwargs["temperature"] == 0.2


def test_temperature_is_dropped_rather_than_crashing(monkeypatch):
    """Degrade, don't die: a coach with default sampling beats no coach."""
    monkeypatch.setattr("api.coach._core._sdk_accepts_temperature", lambda: False)
    kwargs = {"model": "m"}
    _apply_temperature(kwargs, 0.2)
    assert "temperature" not in kwargs
    assert kwargs == {"model": "m"}


def test_no_temperature_requested_means_no_key_either(monkeypatch):
    monkeypatch.setattr("api.coach._core._sdk_accepts_temperature", lambda: True)
    kwargs = {"model": "m"}
    _apply_temperature(kwargs, None)
    assert "temperature" not in kwargs


def test_capability_probe_matches_the_installed_sdk():
    """Whatever is installed here, the probe must agree with it — that is
    the whole point of asking the SDK instead of hardcoding a version."""
    _sdk_accepts_temperature.cache_clear()
    try:
        import inspect

        from anthropic.resources.messages import Messages

        expected = "temperature" in inspect.signature(Messages.create).parameters
    except Exception:
        expected = True  # no SDK installed → the probe's documented default
    assert _sdk_accepts_temperature() is expected

def test_garminconnect_is_not_pinned_below_the_working_release():
    """The counter-lesson: an upper bound that DOWNGRADES is its own outage.

    Capping garminconnect at <0.3.0 dropped it 0.3.2 -> 0.2.40, whose older
    garth cannot complete Garmin's current auth flow ("OAuth1 token is
    required for OAuth2 refresh"). Pin at or above what production runs.
    """
    line = next(
        l for l in REQUIREMENTS.read_text().splitlines()
        if l.strip().startswith("garminconnect")
    )
    floor = line.split(">=", 1)[1].split(",", 1)[0].strip()
    major, minor, *_ = (int(p) for p in floor.split("."))
    assert (major, minor) >= (0, 3), f"garminconnect floor regressed to {floor}"
    assert "<0.4.0" in line, f"still cap the major: {line}"
