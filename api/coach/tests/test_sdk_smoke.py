"""SDK smoke test — would-production-crash, answered in CI.

The outage this exists for: anthropic 1.0.0 removed the ``temperature``
kwarg from ``messages.create()``/``messages.stream()``. CI installed the
new SDK, every test passed, and the break surfaced only when a real
request hit the call path in production — because nothing in the keyless
suite ever exercised the kwargs we actually send.

These tests close that hole without an API key or a network call. They
drive the REAL ``call_anthropic`` and ``stream_anthropic`` functions
against a fake client whose single job is to ``inspect.signature(...)
.bind()`` the received kwargs against the INSTALLED SDK's true method
signatures — the exact acceptance check Python performs at the real call
site. If a future SDK rejects any kwarg production sends (or grows a new
required one), CI goes red in seconds instead of the coach going dark.

Design notes:
  - The kwargs are built by the production functions themselves, not
    restated here — so a kwarg added to ``base_kwargs``/``stream_kwargs``
    later is covered automatically, with no test to remember to update.
  - Shapes mirror production exactly: chat.py's ``temperature=0.3``, its
    ``web_search_20250305`` tool literal, and the ``cache_control:
    ephemeral`` system-block list used for prompt caching.
  - ``athlete_id`` is never passed, so the telemetry path (KV writes)
    stays cold.

Scope, honestly: this file proves signature-level acceptance of the
kwargs production sends, plus the response-model attributes production
reads bare. It cannot prove the SDK's runtime VALUE validation (payload
shapes inside `tools`/`system`) or wire behavior — those need a live
call, which is what the opt-in eval suite is for.
"""

from types import SimpleNamespace

import inspect
import json

import pytest

anthropic = pytest.importorskip(
    "anthropic",
    reason="anthropic SDK not installed — CI installs it via requirements-dev",
    # Only a MISSING module may skip. An installed-but-broken SDK (a
    # dependency conflict raising ImportError inside `import anthropic`)
    # must fail loudly — production's own import would crash the same way,
    # and a skip would disarm the guard in exactly that environment.
    exc_type=ModuleNotFoundError,
)
from anthropic.resources.messages import Messages  # noqa: E402

from api.coach._core import (  # noqa: E402
    _sdk_accepts_temperature,
    call_anthropic,
    stream_anthropic,
)

# Production call shapes, mirrored verbatim (see api/coach/chat.py).
WEB_SEARCH_TOOL = {"type": "web_search_20250305", "name": "web_search", "max_uses": 3}
CACHED_SYSTEM_BLOCKS = [
    {"type": "text", "text": "You are the coach.", "cache_control": {"type": "ephemeral"}},
]
MESSAGES = [{"role": "user", "content": "How was my week?"}]

_SELF = object()  # placeholder for the bound method's `self` slot


def _assert_sdk_accepts(method, kwargs: dict) -> None:
    """The same check Python performs when production calls the SDK:
    bind these kwargs against the installed method's real signature.
    Raises TypeError — failing the test — on any unknown kwarg or any
    newly-required parameter we fail to supply."""
    inspect.signature(method).bind(_SELF, **kwargs)


class _FakeStream:
    """Context-manager + event iterator matching what stream_anthropic
    consumes: a server_tool_use content_block_start (the status branch),
    text deltas, then get_final_message() with usage + web-search count."""

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def __iter__(self):
        yield SimpleNamespace(
            type="content_block_start",
            content_block=SimpleNamespace(type="server_tool_use", name="web_search"),
        )
        for chunk in ("Solid ", "week."):
            yield SimpleNamespace(
                type="content_block_delta",
                delta=SimpleNamespace(type="text_delta", text=chunk),
            )

    def get_final_message(self):
        return SimpleNamespace(
            usage=SimpleNamespace(
                input_tokens=120,
                output_tokens=8,
                server_tool_use=SimpleNamespace(web_search_requests=1),
            )
        )


class _FakeClient:
    """Accepts a call only if the INSTALLED SDK's signature would."""

    def __init__(self):
        self.create_kwargs: dict | None = None
        self.stream_kwargs: dict | None = None
        outer = self

        class _Messages:
            def create(self, **kwargs):
                _assert_sdk_accepts(Messages.create, kwargs)
                outer.create_kwargs = kwargs
                return SimpleNamespace(
                    content=[SimpleNamespace(type="text", text="ok")],
                    usage=SimpleNamespace(input_tokens=100, output_tokens=5),
                )

            def stream(self, **kwargs):
                _assert_sdk_accepts(Messages.stream, kwargs)
                outer.stream_kwargs = kwargs
                return _FakeStream()

        self.messages = _Messages()


@pytest.fixture()
def fake_client(monkeypatch):
    client = _FakeClient()
    monkeypatch.setattr("api.coach._core._get_anthropic_client", lambda: client)
    return client


def test_call_anthropic_kwargs_are_valid_for_the_installed_sdk(fake_client):
    """The non-streaming path, end to end: the kwargs call_anthropic
    actually builds must bind against the installed messages.create."""
    result = call_anthropic(
        model="claude-x",
        system="You are the coach.",
        messages=MESSAGES,
        max_tokens=64,
        temperature=0.2,  # the daily-insight shape
    )
    assert result["text"] == "ok"
    assert result["usage"] == {"input": 100, "output": 5}
    sent = fake_client.create_kwargs
    assert sent is not None
    for key in ("model", "system", "messages", "max_tokens"):
        assert key in sent, f"production always sends {key!r}"


def test_stream_anthropic_kwargs_are_valid_for_the_installed_sdk(fake_client):
    """The streaming path with chat.py's real extras — cached system
    blocks and the web-search tool — consumed to completion."""
    events = list(
        stream_anthropic(
            model="claude-x",
            system=CACHED_SYSTEM_BLOCKS,
            messages=MESSAGES,
            max_tokens=1500,
            temperature=0.3,  # the chat shape
            tools=[WEB_SEARCH_TOOL],
        )
    )
    kinds = [k for k, _ in events]
    assert kinds == ["status", "delta", "delta", "done", "usage"]
    assert dict(events)["done"] == "Solid week."
    assert json.loads(dict(events)["usage"]) == {"input": 120, "output": 8, "web_searches": 1}
    sent = fake_client.stream_kwargs
    assert sent is not None
    assert sent["tools"] == [WEB_SEARCH_TOOL]
    assert sent["system"] == CACHED_SYSTEM_BLOCKS


def test_temperature_is_sent_exactly_when_the_sdk_accepts_it(fake_client):
    """No silent determinism loss while pinned, no crash after a bump:
    whichever way the installed SDK leans, the sent kwargs must agree."""
    _sdk_accepts_temperature.cache_clear()
    call_anthropic(model="m", system="s", messages=MESSAGES, max_tokens=8, temperature=0.2)
    list(stream_anthropic(model="m", system="s", messages=MESSAGES, max_tokens=8, temperature=0.3))
    if _sdk_accepts_temperature():
        assert fake_client.create_kwargs.get("temperature") == 0.2
        assert fake_client.stream_kwargs.get("temperature") == 0.3
    else:
        assert "temperature" not in fake_client.create_kwargs
        assert "temperature" not in fake_client.stream_kwargs


def test_create_and_stream_agree_on_temperature():
    """The capability probe inspects only messages.create, but the kwarg
    is sent to messages.stream too. If an SDK ever splits the two, the
    guard would mis-handle one path — this is the probe's blind spot,
    held shut."""
    create_has = "temperature" in inspect.signature(Messages.create).parameters
    stream_has = "temperature" in inspect.signature(Messages.stream).parameters
    assert create_has == stream_has


@pytest.mark.parametrize(
    ("method_name", "always_sent"),
    [
        ("create", ("model", "system", "messages", "max_tokens")),
        ("stream", ("model", "system", "messages", "max_tokens", "tools")),
    ],
)
def test_unconditional_production_kwargs_exist_on_the_installed_sdk(method_name, always_sent):
    """Every kwarg production sends without a capability guard must be a
    real parameter of the installed SDK (or the SDK must take **kwargs).
    An SDK that drops any of these breaks production unconditionally —
    exactly the class of change that must fail CI, not the coach."""
    sig = inspect.signature(getattr(Messages, method_name))
    for name in always_sent:
        assert name in sig.parameters, (
            f"installed anthropic SDK's messages.{method_name} no longer accepts "
            f"{name!r} — production sends it unconditionally"
        )


@pytest.mark.parametrize("method_name", ["create", "stream"])
def test_signature_lens_is_not_blind(method_name):
    """Every check in this file — and the capability probe in _core.py —
    reads the SDK through inspect.signature. A future SDK exposing these
    methods as `def create(self, **kwargs)` (validation moved into the
    body or behind a proxy) would make every bind vacuously succeed and
    the probe read `temperature` as unsupported: all guards green, and
    blind. If this test goes red, the lens itself broke — re-verify the
    SDK by hand and rebuild the smoke approach; do not weaken this
    assertion to get green."""
    sig = inspect.signature(getattr(Messages, method_name))
    var_kw = [p.name for p in sig.parameters.values() if p.kind is inspect.Parameter.VAR_KEYWORD]
    assert not var_kw, (
        f"messages.{method_name} now takes **{var_kw[0]} — signature "
        f"introspection can no longer prove anything about accepted kwargs"
    )


def test_response_model_still_exposes_what_production_reads():
    """The response side of the contract. Kwarg acceptance is only half —
    production also does BARE attribute access on the reply: `resp.content`
    in _create_and_concat and `final.usage` in stream_anthropic (both
    crash with AttributeError on a rename; the token-count reads beneath
    them are getattr-with-default and merely degrade). The fake client in
    this file necessarily freezes today's response shape, so this test
    asks the installed SDK's own declared model instead."""
    from anthropic.types import Message

    fields = set(getattr(Message, "model_fields", {}) or ()) or set(dir(Message))
    for attr in ("content", "usage"):
        assert attr in fields, (
            f"installed anthropic SDK's Message model no longer exposes "
            f"{attr!r} — production reads it with bare attribute access"
        )
