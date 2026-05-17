import type { Course, CourseFamily, CourseLookup, RaceCategory } from '../../types/course'
import brokenArrow18k2026 from './broken-arrow-18k-2026'
import brokenArrow11k2026 from './broken-arrow-11k-2026'

/**
 * Course registry. The focus is curated trail races (Tier-1 differentiator),
 * but the schema accepts anything — road 5K, marathon, ultra — so consumer
 * code never has to special-case "this race is unknown".
 *
 * Add new editions by importing and pushing into the matching family's
 * editions array (most-recent first). Add new families by appending to
 * COURSE_FAMILIES.
 */

export const COURSE_FAMILIES: CourseFamily[] = [
  {
    id: 'broken-arrow-18k',
    name: 'Broken Arrow 18K',
    category: 'skyrace',
    defaultDistanceMi: 11.2,
    editions: [brokenArrow18k2026],
  },
  {
    id: 'broken-arrow-11k',
    name: 'Broken Arrow 11K',
    category: 'trail',
    defaultDistanceMi: 6.8,
    editions: [brokenArrow11k2026],
  },
]

const COURSES_BY_ID = new Map<string, CourseLookup>()
const FAMILIES_BY_ID = new Map<string, CourseFamily>()

for (const family of COURSE_FAMILIES) {
  FAMILIES_BY_ID.set(family.id, family)
  for (const course of family.editions) {
    COURSES_BY_ID.set(course.id, { family, course })
  }
}

/** Look up a Course by its year-scoped id. */
export function getCourseById(id: string): CourseLookup | null {
  return COURSES_BY_ID.get(id) ?? null
}

/** Look up a CourseFamily by its year-agnostic family id. */
export function getCourseFamily(familyId: string): CourseFamily | null {
  return FAMILIES_BY_ID.get(familyId) ?? null
}

/** Look up the most recent edition of a family, or null if none. */
export function getLatestEdition(familyId: string): Course | null {
  const family = FAMILIES_BY_ID.get(familyId)
  if (!family || family.editions.length === 0) return null
  // Editions are stored most-recent-first; return [0] but fall back to
  // sorting by year if a contributor forgot.
  const sorted = [...family.editions].sort((a, b) => b.year - a.year)
  return sorted[0]
}

/** Find the edition of a family for a specific year, or null. */
export function getEditionForYear(familyId: string, year: number): Course | null {
  const family = FAMILIES_BY_ID.get(familyId)
  if (!family) return null
  return family.editions.find(c => c.year === year) ?? null
}

/** All known families filtered by category — useful for "show all trail races". */
export function listFamiliesByCategory(category: RaceCategory): CourseFamily[] {
  return COURSE_FAMILIES.filter(f => f.category === category)
}

/** Flat list of every known Course (every edition of every family). */
export function listAllCourses(): Course[] {
  return COURSE_FAMILIES.flatMap(f => f.editions)
}

export { brokenArrow18k2026, brokenArrow11k2026 }
