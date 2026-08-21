"""The outage: anthropic 1.0.0 removed `temperature` from
messages.create()/stream(), and because requirements are installed fresh on
every Vercel build it reached production on the next rebuild — taking down
every LLM surface at once with "got an unexpected keyword argument
'temperature'".

Three layers now stand between that class of change and production, each
tested in its own file:
  - the pins themselves        → test_requirements_pins.py
  - the capability guard       → THIS file (degrade, don't die)
  - the real-call-path check   → test_sdk_smoke.py
"""

from api.coach._core import _apply_temperature, _sdk_accepts_temperature


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
