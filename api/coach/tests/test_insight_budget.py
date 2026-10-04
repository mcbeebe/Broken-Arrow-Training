"""Keyless test: coach insights spend the athlete's daily budget (NO API).

Chat and voice already count every model call against the per-athlete
daily budget; /api/coach/insight never checked it, so a client stuck
re-asking (a card whose numbers kept changing) could spend without limit.
The rules locked here:
  1. OVER BUDGET, NO MODEL CALL — the answer is 429 budget_exceeded.
  2. A CACHED ANSWER IS FREE — it never touches the budget.
  3. A REGENERATE IS NOT — force=true skips the cache and is counted.
"""

import pathlib
import sys

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import pytest

from api.coach import insight as I


@pytest.fixture()
def world(monkeypatch):
    """A handler wired to fakes: auth passes as 'mike', KV is a dict, and
    the model call is recorded instead of made."""
    w = type("World", (), {})()
    w.sent = []
    w.budget_calls = []
    w.model_calls = []
    w.kv = {}
    w.within = True
    w.body = {"surface": "week_take", "contextHash": "h1", "snapshot": {"last7Digest": "Sep 28 – Oct 4"}}

    def budget(athlete_id, *a, **k):
        w.budget_calls.append(athlete_id)
        return (w.within, 501 if not w.within else 3, 500)

    def model(**kwargs):
        # An empty reply ends the request (204) right after the call.
        w.model_calls.append(kwargs)
        return {"text": ""}

    monkeypatch.setattr(I, "athlete_from_bearer", lambda headers: (True, 200, "", "mike"))
    monkeypatch.setattr(I, "read_json_body", lambda handler: dict(w.body))
    monkeypatch.setattr(I, "kv_get_json", lambda key: w.kv.get(key))
    monkeypatch.setattr(I, "check_and_increment_budget", budget)
    monkeypatch.setattr(I, "call_anthropic", model)
    monkeypatch.setattr(I, "send_json", lambda handler, status, payload: w.sent.append((status, payload)))
    return w


def post(world):
    h = I.handler.__new__(I.handler)
    h.headers = {}
    h.do_POST()
    assert len(world.sent) == 1, "handler must answer exactly once"
    return world.sent[0]


def test_over_budget_answers_429_without_calling_the_model(world) -> None:
    world.within = False
    status, payload = post(world)
    assert status == 429
    assert payload == {"error": "budget_exceeded", "used": 501, "budget": 500}
    assert world.model_calls == []
    assert world.budget_calls == ["mike"]


def test_within_budget_reaches_the_model_and_counts_once(world) -> None:
    assert post(world)[0] == 204
    assert world.budget_calls == ["mike"]
    assert len(world.model_calls) == 1


def test_a_cached_answer_spends_nothing(world) -> None:
    world.kv[I.insight_key("mike", "week_take", "h1")] = {"text": "Banked.", "generatedAt": 1}
    status, payload = post(world)
    assert status == 200
    assert payload["text"] == "Banked." and payload["cached"] is True
    assert world.budget_calls == []
    assert world.model_calls == []


def test_a_regenerate_skips_the_cache_and_is_counted(world) -> None:
    world.kv[I.insight_key("mike", "week_take", "h1")] = {"text": "Banked.", "generatedAt": 1}
    world.body["force"] = True
    assert post(world)[0] == 204
    assert world.budget_calls == ["mike"]
    assert len(world.model_calls) == 1
