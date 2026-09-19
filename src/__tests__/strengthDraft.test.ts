/**
 * The plan-detail parser. Field bug: a station circuit's detail ended
 * "· Rest 2 min between · Grip note: finish with 2× dead hang…" and both
 * lines logged as exercises (3 × 10 each, "Last time: BW × 10"). The
 * prescription now separates work from instructions.
 */
import { describe, it, expect } from 'vitest'
import { parsePlanPrescription, parsePlanExercises, parseRestDirective, CIRCUIT_DRAFT } from '../utils/strengthDraft'
import { generateHyroxPlan } from '../utils/planGenerator'
import { isGymBasedDay } from '../utils/matching'
import type { OnboardingConfig } from '../hooks/useOnboarding'

const INTRO_CIRCUIT =
  'SkiErg 500m · Sled push 25m @ 152 kg · Sled pull 25m @ 103 kg · Burpee broad jumps 40m · Row 500m'
  + ' · Wall balls 50 @ 6 kg to 3.0 m · Wall balls practice · Rest 2 min between'
  + ' · Grip note: finish with 2× dead hang to build the carry/pull grip the race demands'

describe('parseRestDirective', () => {
  it('reads minutes and seconds, and which boundary the rest sits on', () => {
    expect(parseRestDirective('Rest 2 min between')).toEqual({ sec: 120, between: 'rounds' })
    expect(parseRestDirective('Walk 2 min between rounds')).toEqual({ sec: 120, between: 'rounds' })
    expect(parseRestDirective('90 sec rest between stations')).toEqual({ sec: 90, between: 'stations' })
    expect(parseRestDirective('Rest 1.5 min between sets')).toEqual({ sec: 90, between: 'stations' })
  })

  it('is null for exercises, and for rest lines with no duration', () => {
    expect(parseRestDirective('Farmer carry 3×40m')).toBeNull()
    expect(parseRestDirective('Rest fully between tests — this is a measurement')).toBeNull()
    expect(parseRestDirective('Wall balls 50 @ 6 kg to 3.0 m')).toBeNull()
  })
})

describe('parsePlanPrescription', () => {
  it('keeps the stations, lifts the rest out, and files the grip note as a note', () => {
    const p = parsePlanPrescription(INTRO_CIRCUIT)
    expect(p.exercises.map(e => e.name)).toEqual([
      'SkiErg 500m', 'Sled push 25m @ 152 kg', 'Sled pull 25m @ 103 kg', 'Burpee broad jumps 40m',
      'Row 500m', 'Wall balls 50 @ 6 kg to 3.0 m', 'Wall balls practice',
    ])
    expect(p.rest).toEqual({ sec: 120, between: 'rounds' })
    expect(p.notes).toEqual(['Grip note: finish with 2× dead hang to build the carry/pull grip the race demands'])
  })

  it('the multi-station circuit rests between stations, and the sled note is a note', () => {
    const p = parsePlanPrescription('SkiErg 500m · Row 500m · Wall balls extra set · Sled note: Light sled — focus on form · 90 sec rest between stations')
    expect(p.rest).toEqual({ sec: 90, between: 'stations' })
    expect(p.exercises.map(e => e.name)).toEqual(['SkiErg 500m', 'Row 500m', 'Wall balls extra set'])
    expect(p.notes).toEqual(['Sled note: Light sled — focus on form'])
  })

  it('a rest sentence glued onto a station keeps the station and does not read metres as minutes', () => {
    // The full-distance stations day: "… Wall balls 100 @ 6 kg to 3.0 m. Rest 3 min between stations and log every split — …"
    for (const load of ['6 kg to 3.0 m', '4 kg to 2.7 m']) {
      const p = parsePlanPrescription(`SkiErg 1000m · Wall balls 100 @ ${load}. Rest 3 min between stations and log every split — these are the numbers your race plan is built from.`)
      expect(p.exercises.map(e => e.name)).toEqual(['SkiErg 1000m', `Wall balls 100 @ ${load}`])
      expect(p.rest).toEqual({ sec: 180, between: 'stations' })
    }
  })

  it('metres are distance, "1:30" is a duration, and prose that merely mentions rest is not a directive', () => {
    expect(parseRestDirective('Walk 400m between rounds')).toBeNull()
    expect(parseRestDirective('Rest 1:30 between rounds')).toEqual({ sec: 90, between: 'rounds' })
    expect(parseRestDirective('Every station at race spec, generous rest, technique first: SkiErg 1000m')).toBeNull()
    const p = parsePlanPrescription('Walk 400m between rounds · Row 500m')
    expect(p.rest).toBeUndefined()
    expect(p.notes).toEqual(['Walk 400m between rounds'])
    expect(p.exercises.map(e => e.name)).toEqual(['Row 500m'])
  })

  it('a second rest directive is kept as a note, and a note label may carry an apostrophe', () => {
    const p = parsePlanPrescription("Row 500m · Rest 60s between stations · Rest 3 min between rounds · Coach's note: keep the sled low")
    expect(p.rest).toEqual({ sec: 60, between: 'stations' })
    expect(p.notes).toEqual(['Rest 3 min between rounds', "Coach's note: keep the sled low"])
    expect(p.exercises.map(e => e.name)).toEqual(['Row 500m'])
  })

  it('the benchmark protocol keeps its lift when its rest sentence is peeled off', () => {
    const p = parsePlanPrescription('Goblet squat: Work up in 5–10 lb jumps until you find the heaviest weight you can move for 8 clean reps. Rest 2 min between attempts.')
    expect(p.exercises.map(e => e.name)).toEqual(['Goblet squat: Work up in 5–10 lb jumps until you find the heaviest weight you can move for 8 clean reps'])
    expect(p.rest).toEqual({ sec: 120, between: 'stations' })
  })

  it('a durationless "rest between" line is a note, not a timer', () => {
    const p = parsePlanPrescription('Push-ups: as many as you can · Rest fully between tests — this is a measurement, not a workout')
    expect(p.rest).toBeUndefined()
    expect(p.notes).toEqual(['Rest fully between tests — this is a measurement, not a workout'])
    expect(p.exercises).toHaveLength(1)
  })

  it('a plain strength day has no rest or notes and parses sets as before', () => {
    const p = parsePlanPrescription('Goblet squats 3×12 · Walking lunges 3×10/leg · Plank 3×45s')
    expect(p.rest).toBeUndefined()
    expect(p.notes).toEqual([])
    expect(p.exercises.map(e => [e.name, e.sets.length, e.sets[0].reps])).toEqual([
      ['Goblet squats', 3, 12], ['Walking lunges', 3, 10], ['Plank', 3, 45],
    ])
  })

  it('a circuit drafts each station once, one effort — the workout lists them once', () => {
    const p = parsePlanPrescription('SkiErg 500m · Sled push 25m @ 152 kg · Farmer carry 3×40m · Rest 2 min between stations', CIRCUIT_DRAFT)
    expect(p.exercises.map(e => [e.name, e.sets.length, e.sets[0].reps])).toEqual([
      ['SkiErg 500m', 1, 1], ['Sled push 25m @ 152 kg', 1, 1], ['Farmer carry', 3, 40],
    ])
    expect(p.rest).toEqual({ sec: 120, between: 'stations' })
    // Without the option, the strength-day skeleton stands.
    expect(parsePlanExercises('SkiErg 500m')[0].sets).toHaveLength(3)
  })

  it('empty detail is an empty prescription', () => {
    expect(parsePlanPrescription('')).toEqual({ exercises: [], notes: [] })
  })
})

describe('parsePlanExercises', () => {
  it('is the prescription minus rest and notes — the manual log stops drafting "Rest 2 min between"', () => {
    const names = parsePlanExercises('Sled push 4×15m · Wall balls 3×15 · Farmer carry 3×40m · Rest 2 min between').map(e => e.name)
    expect(names).toEqual(['Sled push', 'Wall balls', 'Farmer carry'])
  })
})

/**
 * Contract sweep: every gym day the generator can emit must parse into
 * exercises that are exercises. The parser and the generator's prose
 * drift independently; this is the test that notices.
 */
describe('generator ↔ parser contract', () => {
  const levels = ['first_timer', 'beginner', 'intermediate', 'advanced', 'elite'] as const
  it('no generated gym day logs a rest line or a note as an exercise, and the key stations day keeps its wall balls', () => {
    let fullSpecDays = 0
    let circuitDays = 0
    for (const experienceLevel of levels) {
      for (const trainingDaysPerWeek of [3, 4, 5, 6]) {
        for (const sex of ['male', 'female'] as const) {
          const plan = generateHyroxPlan({
            raceType: 'hyrox', raceName: 'Hyrox Anaheim', raceDate: '2026-12-05',
            experienceLevel, trainingDaysPerWeek, wearable: 'none', sex,
            athleteName: 'M', age: 45, maxHR: 178, completedAt: '',
          } as OnboardingConfig, '2026-07-12')
          for (const week of plan.weeks) {
            for (const day of week.days) {
              if (!(day.type === 'strength' || isGymBasedDay(day)) || !day.detail) continue
              const p = parsePlanPrescription(day.detail)
              for (const ex of p.exercises) {
                // (A station carrying a prose lead-in — "Every station at
                // full race spec, …: SkiErg 1000m" — is a separate, older
                // wart; this guards the rest/note lines specifically.)
                expect(ex.name, `${day.workout}: "${ex.name}"`).not.toMatch(/^(?:rest|walk|recover)\b/i)
                expect(ex.name, `${day.workout}: "${ex.name}"`).not.toMatch(/\bnote\s*:/i)
                expect(ex.name, `${day.workout}: "${ex.name}"`).not.toMatch(/\bbetween\b/i)
              }
              if (/^Full-distance stations/.test(day.workout)) {
                fullSpecDays++
                expect(p.exercises.some(ex => /^Wall balls/i.test(ex.name)), day.detail).toBe(true)
                expect(p.rest).toEqual({ sec: 180, between: 'stations' })
              }
              if (/^Station circuit \(\d+ stations\)/.test(day.workout)) {
                circuitDays++
                expect(p.rest).toEqual({ sec: 90, between: 'stations' })
                expect(p.notes.some(n => /^Sled note:/.test(n))).toBe(true)
              }
              if (day.workout === 'Station circuit (intro)') {
                expect(p.rest).toEqual({ sec: 120, between: 'stations' })
                expect(p.notes.some(n => /^Grip note:/.test(n))).toBe(true)
              }
            }
          }
        }
      }
    }
    expect(fullSpecDays).toBeGreaterThan(0)
    expect(circuitDays).toBeGreaterThan(0)
  })
})
