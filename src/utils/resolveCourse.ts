import type { RaceInfo } from '../types'
import type { Course, CourseFamily } from '../types/course'
import { COURSE_FAMILIES, getLatestEdition } from '../data/courses'

/**
 * Race → Course resolution. *Curated-only* in this iteration — matches
 * the user's RaceInfo against the registered CourseFamilies by name
 * keyword + distance proximity and returns the closest year edition.
 *
 * TODO(parked): generic-course synthesis for non-curated races. The
 * earlier draft fabricated a single-segment Course from RaceInfo when
 * no curated match existed, so course-coverage scoring and the
 * "Your Race" card could work for *every* user (not just those training
 * for races we've seeded). Revive when we're ready to expand beyond
 * Broken Arrow.
 *
 * Returns null when the race doesn't match a curated course. Callers
 * should treat that as "no course-aware features for this user yet" and
 * fall back to non-course-aware surfaces.
 */

export interface CourseResolution {
  course: Course
  /** True when synthesized from RaceInfo (no curated data available).
   *  Always false today because generic synthesis is parked. */
  isGeneric: boolean
  /** Matched family. */
  family: CourseFamily
}

interface CuratedRule {
  family: CourseFamily
  keywords: string[]
  expectedDistanceMi: number
}

const CURATED_RULES: CuratedRule[] = COURSE_FAMILIES.map(f => ({
  family: f,
  keywords: deriveKeywords(f),
  expectedDistanceMi: f.defaultDistanceMi,
}))

function deriveKeywords(family: CourseFamily): string[] {
  const name = family.name.toLowerCase()
  const keywords = new Set<string>([name])
  // Distance shorthand — "18k", "11k" — helps when the user typed a
  // free-form race name like "Broken Arrow 18K".
  const kmMatch = name.match(/(\d+)\s*k\b/)
  if (kmMatch) keywords.add(kmMatch[0])
  // Series stem ("broken arrow") so a name without distance still matches
  // when distance disambiguates.
  const stem = name.replace(/\s+\d+\s*k$/, '').trim()
  if (stem) keywords.add(stem)
  return Array.from(keywords)
}

function normalize(s: string | undefined | null): string {
  return (s ?? '').toLowerCase().trim()
}

function distanceProximity(a: number, b: number): number {
  const maxMag = Math.max(Math.abs(a), Math.abs(b), 0.01)
  return 1 - Math.abs(a - b) / maxMag
}

function matchCurated(race: RaceInfo): { family: CourseFamily; score: number } | null {
  const name = normalize(race.name)
  if (!name) return null
  let best: { family: CourseFamily; score: number } | null = null
  for (const rule of CURATED_RULES) {
    const keywordHit = rule.keywords.some(k => name.includes(k))
    if (!keywordHit) continue
    const distScore =
      race.distanceMiles > 0
        ? distanceProximity(race.distanceMiles, rule.expectedDistanceMi)
        : 0.7
    const score = 0.6 + 0.4 * distScore
    if (!best || score > best.score) {
      best = { family: rule.family, score }
    }
  }
  return best
}

function yearFromRaceDate(date: string | undefined): number {
  if (!date) return new Date().getFullYear()
  const y = parseInt(date.slice(0, 4), 10)
  return Number.isFinite(y) && y > 1990 ? y : new Date().getFullYear()
}

export function resolveCourseForRace(race: RaceInfo | null | undefined): CourseResolution | null {
  if (!race) return null
  const matched = matchCurated(race)
  if (!matched) return null
  const year = yearFromRaceDate(race.date)
  const course =
    matched.family.editions.find(c => c.year === year)
    ?? getLatestEdition(matched.family.id)
  if (!course) return null
  return { course, isGeneric: false, family: matched.family }
}

/** Quick boolean — does the library have a curated course for this race? */
export function hasCuratedCourse(race: RaceInfo | null | undefined): boolean {
  if (!race) return false
  return matchCurated(race) !== null
}
