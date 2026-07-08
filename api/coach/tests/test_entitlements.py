"""Keyless tests for the backend-only billing/entitlements scaffold
(api/auth/_entitlements.py). No KV, no network: the KV helpers no-op when
KV_REST_API_URL is unset, so we monkeypatch them with an in-memory dict.

The product-level invariants locked here:
  1. INERT BY DEFAULT — with nothing configured, every athlete is premium
     and every feature gate passes (current users are unaffected).
  2. Backend only — the auth sign-in response never carries a tier (grep
     assertion on the handler source: no client surface).
  3. Fail open — unknown feature keys never lock an athlete out.
"""

import json
import pathlib
import sys

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import pytest

from api.auth import _entitlements as ent


@pytest.fixture()
def kv(monkeypatch):
    """In-memory KV standing in for Upstash."""
    store = {}
    monkeypatch.setattr(ent, "_kv_get", store.get)
    monkeypatch.setattr(ent, "_kv_set", store.__setitem__)
    return store


def test_inert_by_default_everyone_premium(kv, monkeypatch):
    monkeypatch.delenv("BILLING_DEFAULT_TIER", raising=False)
    assert ent.default_tier() == "premium"
    assert ent.get_athlete_tier("mike") == "premium"
    assert ent.get_athlete_tier("") == "premium"
    # Every staged feature passes for an unconfigured athlete.
    for feature in ent.FEATURE_TIERS:
        assert ent.has_entitlement("lori", feature)


def test_default_tier_env_override_and_bad_value(kv, monkeypatch):
    monkeypatch.setenv("BILLING_DEFAULT_TIER", "free")
    assert ent.default_tier() == "free"
    assert ent.get_athlete_tier("stranger") == "free"
    # Free default + premium feature → gated; free feature → allowed.
    assert not ent.has_entitlement("stranger", "season_engine")
    assert ent.has_entitlement("stranger", "watch_push")
    monkeypatch.setenv("BILLING_DEFAULT_TIER", "platinum")  # not a tier
    assert ent.default_tier() == "premium"


def test_set_and_clear_explicit_tier(kv, monkeypatch):
    monkeypatch.setenv("BILLING_DEFAULT_TIER", "free")
    ent.set_athlete_tier("Jim ", "premium", note="founder comp")
    assert ent.get_athlete_tier("jim") == "premium"
    assert ent.has_entitlement("jim", "season_engine")
    entry = ent.get_entitlements_map()["jim"]
    assert entry["note"] == "founder comp"
    assert isinstance(entry["updatedAt"], int)
    # 'default' clears the explicit entry → back to the env default.
    ent.set_athlete_tier("jim", "default")
    assert "jim" not in ent.get_entitlements_map()
    assert ent.get_athlete_tier("jim") == "free"


def test_set_tier_validation(kv):
    with pytest.raises(ValueError):
        ent.set_athlete_tier("", "premium")
    with pytest.raises(ValueError):
        ent.set_athlete_tier("mike", "gold")


def test_map_survives_garbage_kv(kv):
    kv[ent.KV_ENTITLEMENTS_KEY] = "not json"
    assert ent.get_entitlements_map() == {}
    kv[ent.KV_ENTITLEMENTS_KEY] = json.dumps(
        {"mike": {"tier": "gold"}, "lori": {"tier": "free"}, "": {"tier": "premium"}}
    )
    # Invalid tier and empty id filtered; valid entry survives.
    assert ent.get_entitlements_map() == {
        "lori": {"tier": "free", "updatedAt": None, "note": ""},
    }


def test_unknown_feature_fails_open(kv, monkeypatch):
    monkeypatch.setenv("BILLING_DEFAULT_TIER", "free")
    assert ent.has_entitlement("anyone", "feature_that_does_not_exist")


def test_no_user_visible_surface():
    """The sign-in success response must not leak billing/tier data, and no
    client code may reference entitlements. Backend-only, per product
    decision recorded in the module docstring."""
    google_src = (_REPO_ROOT / "api" / "auth" / "google.py").read_text()
    # The sign-in response block carries exactly these keys — no tier.
    success_block = google_src.split('"authenticated": True', 1)[1].split("})", 1)[0]
    assert "tier" not in success_block.lower()
    assert "billing" not in success_block.lower()
    assert "entitlement" not in success_block.lower()
    # billing_* actions are admin-gated: dispatched only inside _handle_admin,
    # which begins with the verify_admin gate.
    admin_body = google_src.split("def _handle_admin", 1)[1]
    assert "billing_list" in admin_body and "billing_set_tier" in admin_body
    assert "verify_admin" in admin_body.split("billing_list", 1)[0]
    # No client-side reference: src/ never mentions the entitlements surface.
    src_dir = _REPO_ROOT / "src"
    for path in src_dir.rglob("*.ts*"):
        text = path.read_text(errors="ignore")
        assert "billing_set_tier" not in text and "billing_list" not in text, (
            f"client file {path} references the backend-only billing surface"
        )
