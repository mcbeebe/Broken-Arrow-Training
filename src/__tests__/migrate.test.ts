import { describe, it, expect, beforeEach } from 'vitest'
import {
  collectMigrationPayload,
  applyMigrationPayload,
  encodeMigrationHash,
  parseMigrationHash,
  MIGRATE_PROTOCOL_VERSION,
  type MigrationPayload,
} from '../utils/migrate'

describe('collectMigrationPayload', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('picks up allowlisted per-athlete prefixes', () => {
    localStorage.setItem('ba_plan_edits_mike', '{"ops":[]}')
    localStorage.setItem('ba_manual_logs_mike', '[]')
    localStorage.setItem('ba_soreness_mike', '{}')
    localStorage.setItem('ba_strava_tokens_mike', '{"refresh":"r"}')
    localStorage.setItem('ba_garmin_connected_mike', 'true')

    const { items } = collectMigrationPayload()
    expect(items).toMatchObject({
      ba_plan_edits_mike: '{"ops":[]}',
      ba_manual_logs_mike: '[]',
      ba_soreness_mike: '{}',
      ba_strava_tokens_mike: '{"refresh":"r"}',
      ba_garmin_connected_mike: 'true',
    })
  })

  it('picks up allowlisted global exact keys', () => {
    localStorage.setItem('ba_theme', 'dark')
    localStorage.setItem('ba_palette', 'forest')
    localStorage.setItem('ba_auth_session', '{"email":"m@x.com"}')
    localStorage.setItem('ba_storage_version', '3')

    const { items } = collectMigrationPayload()
    expect(items).toEqual({
      ba_theme: 'dark',
      ba_palette: 'forest',
      ba_auth_session: '{"email":"m@x.com"}',
      ba_storage_version: '3',
    })
  })

  it('skips regenerable cache keys', () => {
    localStorage.setItem('ba_plan_edits_mike', '{"keep":1}')
    localStorage.setItem('ba_garmin_streams_act123_mike', '[1,2,3]')
    localStorage.setItem('ba_strava_streams_act456', '[4,5,6]')
    localStorage.setItem('ba_garmin_activities_mike', '[]')
    localStorage.setItem('ba_garmin_health_mike', '[]')
    localStorage.setItem('ba_weather_forecast_v2:39.123:-119.456', '{}')

    const { items } = collectMigrationPayload()
    expect(items).toEqual({ ba_plan_edits_mike: '{"keep":1}' })
  })

  it('skips unrelated keys (non-ba and unknown ba prefixes)', () => {
    localStorage.setItem('ba_unknown_future_key_mike', 'x')
    localStorage.setItem('something_else', 'y')

    const { items } = collectMigrationPayload()
    expect(items).toEqual({})
  })

  it('picks up keys with colon separators (the cutover hotfix case)', () => {
    // These hooks write `<prefix>:<athleteId>` instead of `<prefix>_<athleteId>`.
    // The original cutover allowlist only checked underscore-terminated
    // prefixes, so these were silently dropped during migration. The
    // hotfix accepts both separators.
    localStorage.setItem('ba_coach_memory_v1:mike', '{"turns":[]}')
    localStorage.setItem('ba_coach_turn_ui_v1:mike', '{"applied":{}}')
    localStorage.setItem('ba_coach_insight_v1:mike:daily:abc123', '{"text":"..."}')
    localStorage.setItem('ba_coach_insight_seen_v1:mike', '1717180800000')
    localStorage.setItem('ba_display_prefs_v1:mike', '{"detailLevel":"high"}')
    localStorage.setItem('ba_workout_time_pref_v1:mike', 'morning')
    localStorage.setItem('ba_athlete_home_v1:mike', '{"lat":1,"lng":2}')
    localStorage.setItem('ba_coach_font_scale:mike', '1.1')

    const { items } = collectMigrationPayload()
    expect(items).toMatchObject({
      'ba_coach_memory_v1:mike': '{"turns":[]}',
      'ba_coach_turn_ui_v1:mike': '{"applied":{}}',
      'ba_coach_insight_v1:mike:daily:abc123': '{"text":"..."}',
      'ba_coach_insight_seen_v1:mike': '1717180800000',
      'ba_display_prefs_v1:mike': '{"detailLevel":"high"}',
      'ba_workout_time_pref_v1:mike': 'morning',
      'ba_athlete_home_v1:mike': '{"lat":1,"lng":2}',
      'ba_coach_font_scale:mike': '1.1',
    })
  })

  it('does not greedy-match a prefix root against a longer prefix', () => {
    // `ba_onboarding` and `ba_onboarding_redo` are both on the allowlist.
    // A key like `ba_onboarding_redo_mike` must be collected (either
    // match is fine), but a key like `ba_onboarding_unknown_mike` would
    // match the shorter prefix — that's by design (anything starting
    // with the root is preserved). The regression we're guarding here
    // is that a colon-style coach key doesn't accidentally collide with
    // a different prefix root.
    localStorage.setItem('ba_onboarding_redo_mike', '1')
    localStorage.setItem('ba_coach_insight_v1:mike:daily:x', '{}')
    localStorage.setItem('ba_coach_insight_proposal_v1_mike', '{}')

    const { items } = collectMigrationPayload()
    expect(Object.keys(items).sort()).toEqual([
      'ba_coach_insight_proposal_v1_mike',
      'ba_coach_insight_v1:mike:daily:x',
      'ba_onboarding_redo_mike',
    ])
  })

  it('preserves selected sessionStorage entries', () => {
    sessionStorage.setItem('ba_initial_view', 'coach')
    sessionStorage.setItem('ba_inapp_bypass', '1')

    const { session } = collectMigrationPayload()
    // Only ba_initial_view is on the allowlist (ba_inapp_bypass is a
    // one-shot bypass flag that shouldn't follow the user across origins).
    expect(session).toEqual({ ba_initial_view: 'coach' })
  })

  it('produces a payload with the current protocol version', () => {
    const payload = collectMigrationPayload()
    expect(payload.v).toBe(MIGRATE_PROTOCOL_VERSION)
    expect(payload.ts).toBeGreaterThan(0)
  })
})

describe('applyMigrationPayload', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  function payload(items: Record<string, string>, session: Record<string, string> = {}): MigrationPayload {
    return { v: MIGRATE_PROTOCOL_VERSION, ts: Date.now(), items, session }
  }

  it('writes all keys when local storage is empty', () => {
    const { written } = applyMigrationPayload(
      payload({
        ba_plan_edits_mike: '{"a":1}',
        ba_auth_session: '{"email":"m@x.com"}',
      }),
    )
    expect(written).toBe(2)
    expect(localStorage.getItem('ba_plan_edits_mike')).toBe('{"a":1}')
    expect(localStorage.getItem('ba_auth_session')).toBe('{"email":"m@x.com"}')
  })

  it('does not clobber an existing local key', () => {
    localStorage.setItem('ba_plan_edits_mike', '{"local":"wins"}')
    applyMigrationPayload(payload({ ba_plan_edits_mike: '{"incoming":"loses"}' }))
    expect(localStorage.getItem('ba_plan_edits_mike')).toBe('{"local":"wins"}')
  })

  it('fills only the missing keys when some exist locally', () => {
    localStorage.setItem('ba_theme', 'light')
    const { written } = applyMigrationPayload(
      payload({
        ba_theme: 'dark', // skipped — local present
        ba_palette: 'forest', // written
        ba_auth_session: 'session', // written
      }),
    )
    expect(written).toBe(2)
    expect(localStorage.getItem('ba_theme')).toBe('light')
    expect(localStorage.getItem('ba_palette')).toBe('forest')
    expect(localStorage.getItem('ba_auth_session')).toBe('session')
  })

  it('takes max of incoming + local ba_storage_version', () => {
    localStorage.setItem('ba_storage_version', '5')
    applyMigrationPayload(payload({ ba_storage_version: '3' }))
    expect(localStorage.getItem('ba_storage_version')).toBe('5')

    localStorage.setItem('ba_storage_version', '1')
    applyMigrationPayload(payload({ ba_storage_version: '4' }))
    expect(localStorage.getItem('ba_storage_version')).toBe('4')
  })

  it('sets ba_storage_version from incoming when local is unset', () => {
    applyMigrationPayload(payload({ ba_storage_version: '3' }))
    expect(localStorage.getItem('ba_storage_version')).toBe('3')
  })

  it('fills session storage entries when absent', () => {
    applyMigrationPayload(payload({}, { ba_initial_view: 'coach' }))
    expect(sessionStorage.getItem('ba_initial_view')).toBe('coach')
  })

  it('does not clobber existing session storage entries', () => {
    sessionStorage.setItem('ba_initial_view', 'plan')
    applyMigrationPayload(payload({}, { ba_initial_view: 'coach' }))
    expect(sessionStorage.getItem('ba_initial_view')).toBe('plan')
  })
})

describe('collect + apply round-trip', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('end-to-end migrates a realistic athlete dataset', () => {
    // Seed "old origin" state
    localStorage.setItem('ba_storage_version', '3')
    localStorage.setItem('ba_theme', 'dark')
    localStorage.setItem('ba_palette', 'forest')
    localStorage.setItem('ba_auth_session', '{"email":"m@x.com","athleteId":"mike"}')
    localStorage.setItem('ba_plan_edits_mike', '{"ops":[{"op":"updateDay"}]}')
    localStorage.setItem('ba_manual_logs_mike', '[{"date":"2026-05-01"}]')
    localStorage.setItem('ba_coach_memory_v1_mike', '{"turns":[]}')
    localStorage.setItem('ba_strava_tokens_mike', '{"refresh":"r"}')
    localStorage.setItem('ba_onboarding_mike', '{"athleteName":"Mike"}')
    // Cache that should NOT cross
    localStorage.setItem('ba_garmin_streams_abc_mike', '[1,2,3]')
    localStorage.setItem('ba_weather_forecast_v2:39.1:-119.4', '{}')

    const exported = collectMigrationPayload()

    // Simulate the new origin
    localStorage.clear()
    sessionStorage.clear()

    const { written } = applyMigrationPayload(exported)

    expect(written).toBe(9) // 9 preserved items, 2 cache items skipped
    expect(localStorage.getItem('ba_plan_edits_mike')).toBe('{"ops":[{"op":"updateDay"}]}')
    expect(localStorage.getItem('ba_auth_session')).toContain('"athleteId":"mike"')
    expect(localStorage.getItem('ba_coach_memory_v1_mike')).toBe('{"turns":[]}')
    expect(localStorage.getItem('ba_garmin_streams_abc_mike')).toBeNull()
    expect(localStorage.getItem('ba_weather_forecast_v2:39.1:-119.4')).toBeNull()
  })
})

describe('migration hash bridge (iOS same-tab redirect)', () => {
  const samplePayload = (): MigrationPayload => ({
    v: MIGRATE_PROTOCOL_VERSION,
    ts: 1717180800000,
    items: {
      ba_plan_edits_mike: '{"ops":[{"op":"updateDay"}]}',
      'ba_coach_memory_v1:mike': '{"turns":[{"role":"user","text":"hi & bye? x=1#2"}]}',
      ba_auth_session: '{"email":"m@x.com","athleteId":"mike"}',
    },
    session: { ba_initial_view: 'readiness' },
  })

  it('round-trips payload + dest through encode/parse', () => {
    const payload = samplePayload()
    const dest = '/?view=readiness#mike'
    const parsed = parseMigrationHash('#' + encodeMigrationHash(payload, dest))
    expect(parsed).not.toBeNull()
    expect(parsed!.dest).toBe(dest)
    expect(parsed!.payload).toEqual(payload)
  })

  it('tolerates a fragment with no leading hash', () => {
    const payload = samplePayload()
    const encoded = encodeMigrationHash(payload, '/')
    expect(parseMigrationHash(encoded)).not.toBeNull()
  })

  it('defaults dest to "/" when empty', () => {
    const parsed = parseMigrationHash('#' + encodeMigrationHash(samplePayload(), ''))
    expect(parsed!.dest).toBe('/')
  })

  it('returns null for non-migration fragments', () => {
    expect(parseMigrationHash('#mike')).toBeNull()
    expect(parseMigrationHash('')).toBeNull()
    expect(parseMigrationHash('#view=readiness')).toBeNull()
  })

  it('returns null for a truncated/garbled fragment instead of throwing', () => {
    const full = '#' + encodeMigrationHash(samplePayload(), '/')
    const clipped = full.slice(0, full.length - 20)
    expect(parseMigrationHash(clipped)).toBeNull()
  })

  it('rejects a mismatched protocol version', () => {
    const bad = { ...samplePayload(), v: 999 } as unknown as MigrationPayload
    expect(parseMigrationHash('#' + encodeMigrationHash(bad, '/'))).toBeNull()
  })
})
