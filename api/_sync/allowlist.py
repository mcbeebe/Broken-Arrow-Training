"""Server-side mirror of `src/utils/migrate.ts::isPreservedKey`.

Both the migration bridge and the live sync endpoint must agree on
which localStorage keys are user-state worth preserving (decisions,
edits, history) versus regenerable cache (Strava streams, weather).
Drift between the two lists would let either path drop or accept keys
the other rejects, so this file is intentionally a line-for-line port
of the TS allowlist. Keep them in sync when adding new keys.
"""

# Prefix matches `<prefix>_<athleteId>...` or `<prefix>:<athleteId>...`
# — hook authors use both separators inconsistently (e.g.
# `ba_plan_edits_mike` vs. `ba_coach_memory_v1:mike`). Each prefix is
# stored WITHOUT its trailing separator; `is_preserved` checks for both
# `_` and `:` after the prefix root.
PRESERVE_PREFIXES: tuple[str, ...] = (
    "ba_plan_edits",
    "ba_plan_overrides",
    "ba_manual_logs",
    "ba_day_swaps",
    "ba_soreness",
    "ba_onboarding",
    "ba_onboarding_redo",
    "ba_display_prefs_v1",
    "ba_show_technical_terms",
    "ba_coach_memory_v1",
    "ba_coach_turn_ui_v1",
    "ba_coach_insight_v1",
    "ba_coach_insight_proposal_v1",
    "ba_coach_daily_seeded_v1",
    "ba_coach_insight_seen_v1",
    "ba_coach_ping_v1",
    "ba_hr_zones_override",
    "ba_max_hr_override",
    "ba_mim_calibration",
    "ba_doms_calibration",
    "ba_run_eccentric_v1",
    "ba_run_gap_v1",
    "ba_workout_time_pref_v1",
    "ba_athlete_home_v1",
    "ba_coach_font_scale",
    "ba_tutorial_seen",
    "ba_strava_tokens",
    "ba_garmin_connected",
    "ba_garmin_display_name",
)

PRESERVE_EXACT: frozenset[str] = frozenset({
    "ba_theme",
    "ba_palette",
    "ba_auth_session",
    "ba_storage_version",
})


def is_preserved(key: str) -> bool:
    """True iff this localStorage key belongs in the sync table.

    Matches `isPreservedKey` in `src/utils/migrate.ts` — any change here
    MUST be mirrored there (and vice versa). The two lists are the
    contract between the migration bridge and the live sync endpoint.
    """
    if not key:
        return False
    if key in PRESERVE_EXACT:
        return True
    for p in PRESERVE_PREFIXES:
        if key.startswith(p + "_") or key.startswith(p + ":"):
            return True
    return False
