"""Billing / entitlements scaffold — BACKEND ONLY, by explicit product decision.

Nothing here is user-visible: no client code reads tiers, no auth response
carries them, no UI renders them. This module exists so the premium gate
(Season Engine G1 + execution loop G2 are the natural premium tier per
docs/gap-closure-build-plan.md §7) can be flipped on server-side later
without a schema scramble — and so the admin can stage tiers ahead of time.

Model:
  - Two tiers: "free" and "premium".
  - Per-athlete tier lives in KV under `billing:entitlements` as
    {athleteId: {"tier": ..., "updatedAt": ..., "note": ...}}.
  - Athletes with no explicit entry get BILLING_DEFAULT_TIER (env), which
    defaults to "premium": every current allowlisted friends-and-family
    athlete keeps full access and NOTHING changes in product behavior
    until a future PR both flips the default and actually gates a feature.
  - `has_entitlement(athlete_id, feature)` is the one gate helper product
    code may call. FEATURE_TIERS maps feature keys to the minimum tier.

Admin management rides the existing /api/auth/athletes action switch
(`billing_list` / `billing_set_tier`), owner-gated by verify_admin — no new
Vercel function (Hobby 12-function rule, plan §1-D7).
"""

import json
import os
import time

from ._helpers import _kv_get, _kv_set

KV_ENTITLEMENTS_KEY = "billing:entitlements"

TIERS = ("free", "premium")

# Tier rank for comparisons; higher rank satisfies lower requirements.
_TIER_RANK = {"free": 0, "premium": 1}

# Feature key → minimum tier. Staged ahead of the features themselves:
# nothing in product code calls has_entitlement() yet (the gate flips in a
# future PR, per the plan's monetization note). Keys match the plan's specs.
FEATURE_TIERS = {
    "season_engine": "premium",   # G1 multi-race season (PRs 6-7)
    "race_pacing": "premium",     # G6 course pace bands (PR-9)
    "watch_push": "free",         # G2a ships free — trust win, not a gate
    "coach_chat": "free",
    "free_calculators": "free",   # G10 is the funnel; never gate it
}


def default_tier() -> str:
    """The tier for athletes with no explicit entry. Defaults to premium so
    the scaffold is inert for the current allowlisted user base."""
    tier = os.environ.get("BILLING_DEFAULT_TIER", "premium").strip().lower()
    return tier if tier in TIERS else "premium"


def get_entitlements_map() -> dict:
    """athleteId → {"tier", "updatedAt", "note"} for explicitly-set athletes.
    {} when none set or KV unconfigured (all athletes ride the default)."""
    raw = _kv_get(KV_ENTITLEMENTS_KEY)
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except Exception:
        return {}
    if not isinstance(data, dict):
        return {}
    out = {}
    for athlete_id, entry in data.items():
        aid = str(athlete_id).strip().lower()
        if not aid or not isinstance(entry, dict):
            continue
        tier = str(entry.get("tier", "")).strip().lower()
        if tier not in TIERS:
            continue
        out[aid] = {
            "tier": tier,
            "updatedAt": entry.get("updatedAt"),
            "note": str(entry.get("note", ""))[:200],
        }
    return out


def get_athlete_tier(athlete_id: str) -> str:
    """The athlete's effective tier: explicit entry, else the default."""
    aid = str(athlete_id or "").strip().lower()
    if not aid:
        return default_tier()
    entry = get_entitlements_map().get(aid)
    return entry["tier"] if entry else default_tier()


def set_athlete_tier(athlete_id: str, tier: str, note: str = "") -> dict:
    """Set (or clear, tier='default') an athlete's explicit tier. Returns the
    updated map. Raises ValueError on bad input, RuntimeError when KV is
    unconfigured (mirrors the allowlist helpers)."""
    aid = str(athlete_id or "").strip().lower()
    tier = str(tier or "").strip().lower()
    if not aid:
        raise ValueError("athleteId required")
    if tier not in TIERS and tier != "default":
        raise ValueError(f"tier must be one of {TIERS} or 'default'")

    current = get_entitlements_map()
    if tier == "default":
        current.pop(aid, None)
    else:
        current[aid] = {
            "tier": tier,
            "updatedAt": int(time.time()),
            "note": str(note or "").strip()[:200],
        }
    _kv_set(KV_ENTITLEMENTS_KEY, json.dumps(current, separators=(",", ":")))
    return current


def has_entitlement(athlete_id: str, feature: str) -> bool:
    """THE gate helper. Unknown features default to allowed (a typo in a
    feature key must fail open, never lock a paying athlete out)."""
    required = FEATURE_TIERS.get(str(feature or "").strip().lower())
    if required is None:
        return True
    athlete_rank = _TIER_RANK[get_athlete_tier(athlete_id)]
    return athlete_rank >= _TIER_RANK[required]
