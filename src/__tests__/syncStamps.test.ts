import { describe, it, expect, beforeEach } from 'vitest'
import {
  stampKey,
  readStamp,
  listStampedKeys,
  readLastUploadedStamp,
  writeLastUploadedStamp,
} from '../utils/syncStamps'

describe('syncStamps', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stampKey + readStamp round-trip', () => {
    stampKey('ba_plan_edits_mike', 1700000000000)
    expect(readStamp('ba_plan_edits_mike')).toBe(1700000000000)
  })

  it('defaults stamp to Date.now() when no timestamp passed', () => {
    const before = Date.now()
    stampKey('ba_theme')
    const after = Date.now()
    const stamp = readStamp('ba_theme')
    expect(stamp).toBeGreaterThanOrEqual(before)
    expect(stamp).toBeLessThanOrEqual(after)
  })

  it('readStamp returns 0 for unknown key', () => {
    expect(readStamp('ba_never_written')).toBe(0)
  })

  it('listStampedKeys enumerates only stamped data keys without the prefix', () => {
    stampKey('ba_plan_edits_mike', 1)
    stampKey('ba_coach_memory_v1:mike', 2)
    stampKey('ba_theme', 3)
    // Plain user-data entries should NOT show up in the stamp list
    localStorage.setItem('ba_plan_edits_mike', '{"ops":[]}')
    localStorage.setItem('ba_some_other_key', 'value')

    const keys = listStampedKeys().sort()
    expect(keys).toEqual([
      'ba_coach_memory_v1:mike',
      'ba_plan_edits_mike',
      'ba_theme',
    ])
  })

  it('lastUploaded stamps are independent of write stamps', () => {
    stampKey('ba_plan_edits_mike', 100)
    writeLastUploadedStamp('ba_plan_edits_mike', 90)
    expect(readStamp('ba_plan_edits_mike')).toBe(100)
    expect(readLastUploadedStamp('ba_plan_edits_mike')).toBe(90)
  })

  it('readLastUploadedStamp returns 0 when never uploaded', () => {
    expect(readLastUploadedStamp('ba_plan_edits_mike')).toBe(0)
  })
})
