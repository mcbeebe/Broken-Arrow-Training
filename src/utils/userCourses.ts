import type { Course } from '../types/course'

/**
 * User-uploaded course registry — localStorage-backed storage for courses
 * synthesized from a GPX the athlete uploaded (see gpxCourse.ts). Keyed by
 * normalized race name so the same race resolves to the same course across
 * plan regenerations and season edits, and consulted by resolveCourseForRace
 * as the fallback between the curated catalog and the estimated stub.
 *
 * Storage is a single JSON map so multi-race seasons can each carry their
 * own uploaded course.
 */

const STORAGE_KEY = 'userCourses.v1'

export function userCourseKey(race: { name?: string } | null | undefined): string | null {
  const key = (race?.name ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
  return key || null
}

function readAll(): Record<string, Course> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, Course> : {}
  } catch {
    return {}
  }
}

function writeAll(map: Record<string, Course>): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
    return true
  } catch {
    return false
  }
}

export function getUserCourse(race: { name?: string } | null | undefined): Course | null {
  const key = userCourseKey(race)
  if (!key) return null
  return readAll()[key] ?? null
}

export function saveUserCourse(race: { name?: string } | null | undefined, course: Course): boolean {
  const key = userCourseKey(race)
  if (!key) return false
  const map = readAll()
  map[key] = course
  return writeAll(map)
}

export function removeUserCourse(race: { name?: string } | null | undefined): void {
  const key = userCourseKey(race)
  if (!key) return
  const map = readAll()
  if (key in map) {
    delete map[key]
    writeAll(map)
  }
}
