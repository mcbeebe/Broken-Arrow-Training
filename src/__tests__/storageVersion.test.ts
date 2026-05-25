import { describe, it, expect, beforeEach } from 'vitest'
import { clearAllCachedData } from '../utils/storageVersion'

/**
 * Locks the invariant that a cache clear (triggered on a storage-version
 * migration, or by the "Clear Cache & Reload" button) wipes only derived
 * caches — never user-entered adjustments. Plan edits + proposal apply-state
 * are the "workout adjustments" the athlete cares about; losing them is the
 * "my changes reverted after syncing" complaint.
 */
describe('clearAllCachedData', () => {
  beforeEach(() => localStorage.clear())

  it('preserves plan edits, proposal apply-state, swaps, and manual logs', () => {
    localStorage.setItem('ba_plan_edits_mike', JSON.stringify([{ id: 'e1' }]))
    localStorage.setItem('ba_plan_overrides_mike', JSON.stringify([{ id: 'o1' }]))
    localStorage.setItem('ba_coach_turn_ui_v1:mike', JSON.stringify({ t1: { actionStatus: 'applied' } }))
    localStorage.setItem('ba_coach_insight_proposal_v1:mike:b9', JSON.stringify({ status: 'applied' }))
    localStorage.setItem('ba_day_swaps_mike', JSON.stringify([{ weekNum: 1 }]))
    localStorage.setItem('ba_manual_logs_mike', JSON.stringify([{ id: 'l1' }]))
    localStorage.setItem('ba_soreness_mike', JSON.stringify([{ date: 'x' }]))

    clearAllCachedData()

    expect(localStorage.getItem('ba_plan_edits_mike')).not.toBeNull()
    expect(localStorage.getItem('ba_plan_overrides_mike')).not.toBeNull()
    expect(localStorage.getItem('ba_coach_turn_ui_v1:mike')).not.toBeNull()
    expect(localStorage.getItem('ba_coach_insight_proposal_v1:mike:b9')).not.toBeNull()
    expect(localStorage.getItem('ba_day_swaps_mike')).not.toBeNull()
    expect(localStorage.getItem('ba_manual_logs_mike')).not.toBeNull()
    expect(localStorage.getItem('ba_soreness_mike')).not.toBeNull()
  })

  it('still clears the Strava/Garmin caches it is meant to refresh', () => {
    localStorage.setItem('ba_garmin_activity_details_mike', JSON.stringify([{}]))
    localStorage.setItem('ba_garmin_health_mike', JSON.stringify([{}]))
    localStorage.setItem('ba_garmin_activities_mike', JSON.stringify([{}]))
    localStorage.setItem('ba_strava_streams_123', JSON.stringify([{}]))
    localStorage.setItem('ba_strava_activities', JSON.stringify([{}]))

    clearAllCachedData()

    expect(localStorage.getItem('ba_garmin_activity_details_mike')).toBeNull()
    expect(localStorage.getItem('ba_garmin_health_mike')).toBeNull()
    expect(localStorage.getItem('ba_garmin_activities_mike')).toBeNull()
    expect(localStorage.getItem('ba_strava_streams_123')).toBeNull()
    expect(localStorage.getItem('ba_strava_activities')).toBeNull()
  })
})
