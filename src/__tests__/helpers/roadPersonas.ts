/**
 * Shared road-persona fixtures — the single source of athletes for the
 * sweep gate (road-persona-sweep.test.ts) and the property-invariant
 * suite (property-invariants.test.ts). Fix the engine, never the persona.
 */
import type { OnboardingConfig, RaceDistance } from '../../hooks/useOnboarding'

export const TODAY = '2026-08-17' // a Monday

/** The Saturday ending week N (week 1 = the current week). */
export function satAfterWeeks(n: number): string {
  const d = new Date('2026-08-22T12:00:00') // Saturday of week 1
  d.setDate(d.getDate() + (n - 1) * 7)
  return d.toISOString().slice(0, 10)
}

export const DIST_MILES: Record<string, number> = { '5k': 3.1, '10k': 6.2, half_marathon: 13.1, marathon: 26.2, '50k': 31.1 }

export interface Persona {
  label: string
  methodId: string
  distance: RaceDistance
  runways: [number, number]
  cfg: Partial<OnboardingConfig>
}

export const PERSONAS: Persona[] = [
  { label: 'Ava 24F first_timer 3d 5k daniels', methodId: 'daniels', distance: '5k', runways: [8, 16],
    cfg: { athleteName: 'Ava', age: 24, sex: 'female', experienceLevel: 'first_timer', trainingDaysPerWeek: 3 } },
  { label: 'Ben 35M beginner 4d 10k higdon easy-pace', methodId: 'higdon', distance: '10k', runways: [8, 16],
    cfg: { athleteName: 'Ben', age: 35, sex: 'male', experienceLevel: 'beginner', trainingDaysPerWeek: 4, fitnessAnchor: { type: 'easy_pace', valueSeconds: 630 } } },
  { label: 'Carmen 41F intermediate 5d half pfitzinger 10k-anchor', methodId: 'pfitzinger', distance: 'half_marathon', runways: [10, 16],
    cfg: { athleteName: 'Carmen', age: 41, sex: 'female', experienceLevel: 'intermediate', trainingDaysPerWeek: 5, strengthDaysPerWeek: 1, equipmentAccess: ['gym'], fitnessAnchor: { type: 'race_10k', valueSeconds: 52 * 60 } } },
  { label: 'Dmitri 29M advanced 6d marathon hansons hm-anchor 45mi', methodId: 'hansons', distance: 'marathon', runways: [12, 18],
    cfg: { athleteName: 'Dmitri', age: 29, sex: 'male', experienceLevel: 'advanced', trainingDaysPerWeek: 6, currentWeeklyMileage: 45, fitnessAnchor: { type: 'race_hm', valueSeconds: 84 * 60 } } },
  { label: 'Elena 52F intermediate 4d half 80/20 peri knee-returning', methodId: 'fitzgerald_8020', distance: 'half_marathon', runways: [10, 16],
    cfg: { athleteName: 'Elena', age: 52, sex: 'female', experienceLevel: 'intermediate', trainingDaysPerWeek: 4, strengthDaysPerWeek: 1, equipmentAccess: ['gym'], menopauseStatus: 'perimenopause', injuryStatus: 'returning', injuryArea: 'knee' } },
  { label: 'Frank 61M beginner 3d 10k galloway', methodId: 'galloway', distance: '10k', runways: [8, 16],
    cfg: { athleteName: 'Frank', age: 61, sex: 'male', experienceLevel: 'beginner', trainingDaysPerWeek: 3 } },
  { label: 'Grace 33F elite 7d marathon daniels 5k-anchor 60mi', methodId: 'daniels', distance: 'marathon', runways: [12, 18],
    cfg: { athleteName: 'Grace', age: 33, sex: 'female', experienceLevel: 'elite', trainingDaysPerWeek: 7, currentWeeklyMileage: 60, strengthDaysPerWeek: 1, equipmentAccess: ['gym'], strengthExperience: 'experienced', fitnessAnchor: { type: 'race_5k', valueSeconds: 17 * 60 + 30 } } },
  { label: 'Hiro 45M intermediate 5d trail-half roche no-gym', methodId: 'roche_swap', distance: 'half_marathon', runways: [10, 16],
    cfg: { athleteName: 'Hiro', age: 45, sex: 'male', experienceLevel: 'intermediate', trainingDaysPerWeek: 5, strengthDaysPerWeek: 1, raceType: 'trail', elevationGainFt: 2500, fitnessAnchor: { type: 'easy_pace', valueSeconds: 540 } } },
  { label: 'Isla 27F first_timer 4d 5k higdon shin-current', methodId: 'higdon', distance: '5k', runways: [8, 16],
    cfg: { athleteName: 'Isla', age: 27, sex: 'female', experienceLevel: 'first_timer', trainingDaysPerWeek: 4, injuryStatus: 'current', injuryArea: 'shin' } },
  { label: 'Jim 79M beginner 6d 5k daniels (the originating case)', methodId: 'daniels', distance: '5k', runways: [7, 16],
    cfg: { athleteName: 'Jim', age: 79, sex: 'male', experienceLevel: 'beginner', trainingDaysPerWeek: 6, strengthDaysPerWeek: 1, equipmentAccess: ['gym'] } },
  { label: 'Kara 68F intermediate 5d half trainingpeaks recreational-lifter', methodId: 'trainingpeaks', distance: 'half_marathon', runways: [10, 16],
    cfg: { athleteName: 'Kara', age: 68, sex: 'female', experienceLevel: 'intermediate', trainingDaysPerWeek: 5, strengthDaysPerWeek: 1, equipmentAccess: ['gym'], strengthExperience: 'recreational', menopauseStatus: 'postmenopause' } },
  { label: 'Leo 55M advanced 6d trail-50k koop 40mi', methodId: 'koop', distance: '50k', runways: [14, 20],
    cfg: { athleteName: 'Leo', age: 55, sex: 'male', experienceLevel: 'advanced', trainingDaysPerWeek: 6, currentWeeklyMileage: 40, raceType: 'trail', elevationGainFt: 5000, equipmentAccess: ['hills', 'trails'] } },
  // Phase 2 (101-Q1 / 105-F5) — the undertrained-arrival and dosing personas.
  { label: 'Maya 46F beginner 4d marathon higdon 12mi (low-base marathon)', methodId: 'higdon', distance: 'marathon', runways: [16, 18],
    cfg: { athleteName: 'Maya', age: 46, sex: 'female', experienceLevel: 'beginner', trainingDaysPerWeek: 4, currentWeeklyMileage: 12 } },
  { label: 'Noah 62M intermediate 4d trail-50k trainingpeaks 22mi (low-base ultra)', methodId: 'trainingpeaks', distance: '50k', runways: [20, 20],
    cfg: { athleteName: 'Noah', age: 62, sex: 'male', experienceLevel: 'intermediate', trainingDaysPerWeek: 4, currentWeeklyMileage: 22, raceType: 'trail', elevationGainFt: 3000 } },
  { label: 'Priya 31F advanced 5d 10k daniels 55mi (over-mileage sanity)', methodId: 'daniels', distance: '10k', runways: [10, 14],
    cfg: { athleteName: 'Priya', age: 31, sex: 'female', experienceLevel: 'advanced', trainingDaysPerWeek: 5, currentWeeklyMileage: 55, fitnessAnchor: { type: 'race_10k', valueSeconds: 40 * 60 } } },
  { label: 'Owen 74M intermediate 4d half higdon recreational-lifter (senior strength)', methodId: 'higdon', distance: 'half_marathon', runways: [12, 16],
    cfg: { athleteName: 'Owen', age: 74, sex: 'male', experienceLevel: 'intermediate', trainingDaysPerWeek: 4, strengthDaysPerWeek: 1, equipmentAccess: ['gym'], strengthExperience: 'recreational' } },
]

export function buildConfig(p: Persona, weeks: number): OnboardingConfig {
  return {
    raceType: 'road', raceName: `${p.cfg.athleteName}'s Race`, raceDate: satAfterWeeks(weeks),
    raceDistance: p.distance, raceDistanceMiles: DIST_MILES[p.distance],
    longRunDay: 'Saturday', wearable: 'garmin', completedAt: '',
    selectedMethodId: p.methodId,
    ...p.cfg,
  } as unknown as OnboardingConfig
}

