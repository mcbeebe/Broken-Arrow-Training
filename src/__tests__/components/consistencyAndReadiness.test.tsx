import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ComplianceWeekRow from '../../components/ComplianceWeekRow'
import ReadinessBanner from '../../components/ReadinessBanner'
import type { WeekCompliance } from '../../hooks/useCompliance'
import type { DayCompliance, ReadinessScore, WorkoutType } from '../../types'

/**
 * PR-4 (G8 + G9) behavioral tests:
 *  - the weekly consistency headline counts rest as compliance and grants
 *    grace for one flexed non-key session (never a streak);
 *  - a RED readiness verdict always renders a concrete action, even when
 *    the engine produced no per-workout adjustment;
 *  - repo-level negative guard: no user-facing streak feature exists.
 */

function dc(date: string, workoutType: WorkoutType, hasActual: boolean): DayCompliance {
  return {
    date,
    day: `Day ${date.slice(8)}`,
    workoutType,
    hasActual,
    targets: {},
    distanceGrade: 'na',
    durationGrade: 'na',
    hrGrade: 'na',
  } as DayCompliance
}

// All dates far in the past so isPastDate() is always true.
function makeWeek(days: DayCompliance[], completed: number): WeekCompliance {
  return {
    weekNum: 1, completed, missed: 0, restDays: 0, totalWorkouts: days.length,
    plannedMiles: 20, actualMiles: 18, plannedElevation: 0, actualElevation: 0,
    plannedDuration: 300, actualDuration: 280, hrCompliance: 0,
    hrCheckedWorkouts: 0, hrInZoneTotal: 0, days, flaggedCount: 0,
  } as WeekCompliance
}

describe('G9 — flexible consistency headline (rest counts, no streaks)', () => {
  it('counts kept rest days as sessions done', () => {
    const week = makeWeek([
      dc('2025-01-06', 'run', true),
      dc('2025-01-07', 'rest', false),   // rest kept = compliance ✓
      dc('2025-01-08', 'long', true),
    ], 2)
    render(<ComplianceWeekRow week={week} />)
    expect(screen.getByText('3 of 3 sessions')).toBeInTheDocument()
    expect(screen.getByText(/rest days count/)).toBeInTheDocument()
    expect(screen.getByText(/on track/)).toBeInTheDocument()
  })

  it('grants grace for one flexed non-key session', () => {
    const week = makeWeek([
      dc('2025-01-06', 'run', false),    // flexed easy run
      dc('2025-01-07', 'rest', false),
      dc('2025-01-08', 'long', true),
    ], 1)
    render(<ComplianceWeekRow week={week} />)
    expect(screen.getByText('2 of 3 sessions')).toBeInTheDocument()
    expect(screen.getByText(/1 flexed session is fine/)).toBeInTheDocument()
  })

  it('GUARD: a missed key session gets no grace framing', () => {
    const week = makeWeek([
      dc('2025-01-06', 'long', false),   // missed KEY session
      dc('2025-01-07', 'rest', false),
      dc('2025-01-08', 'run', true),
    ], 1)
    render(<ComplianceWeekRow week={week} />)
    expect(screen.getByText('2 of 3 sessions')).toBeInTheDocument()
    expect(screen.queryByText(/on track/)).toBeNull()
  })
})

describe('G8 — RED verdict always pairs with a concrete action', () => {
  function score(overrides: Partial<ReadinessScore>): ReadinessScore {
    return {
      date: '2025-01-08', score: 30, displayScore: 30, status: 'RED',
      trainingState: 'C', message: 'Recovery signals are suppressed.',
      components: { hrv: 20, rhr: 30, sleep: 40, load: 30 },
      ...overrides,
    } as ReadinessScore
  }

  it('renders the engine adjustment when present', () => {
    render(<ReadinessBanner
      todayScore={score({ adjustment: 'Swap intervals for 30 min Z1 jog' })}
      todayHealth={undefined} healthHistory={[]}
    />)
    expect(screen.getByText(/Swap intervals/)).toBeInTheDocument()
  })

  it('falls back to a concrete action when no adjustment exists (orthosomnia-safe)', () => {
    render(<ReadinessBanner
      todayScore={score({ adjustment: undefined })}
      todayHealth={undefined} healthHistory={[]}
    />)
    expect(screen.getByText(/Keep today easy/)).toBeInTheDocument()
    expect(screen.getByText(/trend, not the number/)).toBeInTheDocument()
  })

  it('state D fallback points at the deload program', () => {
    render(<ReadinessBanner
      todayScore={score({ trainingState: 'D', adjustment: undefined })}
      todayHealth={undefined} healthHistory={[]}
    />)
    expect(screen.getByText(/deload program/)).toBeInTheDocument()
  })
})

describe('G9 negative guard — no streak feature ships, by design', () => {
  it('no user-facing component mentions streaks (BJHP 2025 / Milkman 2021)', () => {
    const sources = import.meta.glob('../../components/*.tsx', {
      query: '?raw', import: 'default', eager: true,
    }) as Record<string, string>
    const offenders: string[] = []
    for (const [file, raw] of Object.entries(sources)) {
      const text = raw
        // Comments may (and do) explain WHY we avoid streaks — only code
        // and rendered strings count as shipping the feature.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      if (/streak/i.test(text)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})
