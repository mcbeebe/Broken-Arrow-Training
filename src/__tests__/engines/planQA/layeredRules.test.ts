import { describe, it, expect } from 'vitest'
import type { PlannedDay, TrainingWeek, SeasonRace, RaceInfo } from '../../../types'
import { validatePlan } from '../../../engines/planQA/validatePlan'
import { layerSecondaryWork } from '../../../engines/season/layerSecondaryWork'

/**
 * D11 — no rule in the gate could see a layered day. They are type
 * 'strength' with an ordinary-looking detail, so a dose in a deload week, a
 * duplicated pair, a flattened ramp and a session sandwiched between two hard
 * runs were all structurally invisible: the plan shipped, the gate passed, and
 * nothing told the athlete.
 */

const ids = (weeks: TrainingWeek[]) =>
  validatePlan({ weeks }).findings.filter(f => f.id.startsWith('qa_layered_')).map(f => f.id)

function day(label: string, type: PlannedDay['type'], extra: Partial<PlannedDay> = {}): PlannedDay {
  return { day: label, type, workout: 'X', detail: 'd', zone: 'Z2', route: '', time: '45 min', ...extra }
}

/** A layered day as the transform stamps them. */
function layered(label: string, detail: string, extra: Partial<PlannedDay> = {}): PlannedDay {
  return day(label, 'strength', {
    workout: 'Hyrox prep — station volumes',
    detail,
    layeredFor: 'Hyrox - Anaheim',
    ...extra,
  })
}

const RAMP = ['SkiErg 350m · Row 350m', 'SkiErg 500m · Row 500m', 'SkiErg 750m · Row 750m']

function week(num: number, mon: number, d: number, focus: string, days: PlannedDay[]): TrainingWeek {
  return { num, dates: '', miles: 20, focus, startIso: `2026-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`, days }
}

describe('the QA gate can see layered days', () => {
  it('GUARD: a plan with no layered days produces no layered findings', () => {
    const weeks = [week(1, 9, 14, 'Build', [
      day('Mon 9/14', 'run'), day('Tue 9/15', 'strength'), day('Wed 9/16', 'quality'),
      day('Thu 9/17', 'cross'), day('Sun 9/20', 'long'),
    ])]
    expect(ids(weeks)).toEqual([])
  })

  it('flags a layered dose inside a cutback, taper or recovery week', () => {
    for (const focus of ['Cutback', 'Taper', 'Recovery week', 'Deload']) {
      const weeks = [week(1, 9, 14, focus, [
        day('Mon 9/14', 'run'),
        layered('Tue 9/15', RAMP[0]),
        day('Wed 9/16', 'rest'),
      ])]
      expect(ids(weeks), focus).toContain('qa_layered_in_protected_week')
    }
  })

  it('flags two byte-identical layered sessions in one week', () => {
    const weeks = [week(1, 9, 14, 'Build', [
      day('Mon 9/14', 'run'),
      layered('Tue 9/15', RAMP[0]),
      day('Wed 9/16', 'run'),
      layered('Thu 9/17', RAMP[0]), // same detail — the D1 defect
    ])]
    expect(ids(weeks)).toContain('qa_layered_duplicate')
  })

  it('does NOT flag two DIFFERENT layered sessions in one week', () => {
    const weeks = [week(1, 9, 14, 'Build', [
      day('Mon 9/14', 'run'),
      layered('Tue 9/15', RAMP[0]),
      day('Wed 9/16', 'run'),
      layered('Thu 9/17', RAMP[1]),
    ])]
    expect(ids(weeks)).not.toContain('qa_layered_duplicate')
  })

  it('flags a ramp that never ramps', () => {
    const weeks = [1, 2, 3].map((n, i) => week(n, 9, 14 + i * 7, 'Build', [
      day(`Mon 9/${14 + i * 7}`, 'run'),
      layered(`Tue 9/${15 + i * 7}`, `SkiErg 350m · Row 350m — session ${''}`),
      day(`Wed 9/${16 + i * 7}`, 'run'),
    ]))
    // Identical prescribed volumes in every week, three weeks running.
    expect(ids(weeks)).toContain('qa_layered_ramp_flat')
  })

  it('does NOT flag a ramp that ramps', () => {
    const weeks = [1, 2, 3].map((n, i) => week(n, 9, 14 + i * 7, 'Build', [
      day(`Mon 9/${14 + i * 7}`, 'run'),
      layered(`Tue 9/${15 + i * 7}`, RAMP[i]),
      day(`Wed 9/${16 + i * 7}`, 'run'),
    ]))
    expect(ids(weeks)).not.toContain('qa_layered_ramp_flat')
  })

  it('flags a full-volume layered session sandwiched against a hard run', () => {
    const weeks = [week(1, 9, 14, 'Build', [
      day('Mon 9/14', 'run'),
      day('Tue 9/15', 'quality'),
      layered('Wed 9/16', RAMP[0]), // day after the quality session, not eased
      day('Thu 9/17', 'run'),
    ])]
    expect(ids(weeks)).toContain('qa_layered_sandwich')
  })

  it('does NOT flag one that was EASED for the run beside it — that is the safe outcome', () => {
    const weeks = [week(1, 9, 14, 'Build', [
      day('Mon 9/14', 'run'),
      day('Tue 9/15', 'quality'),
      layered('Wed 9/16', `${RAMP[0]} · EASED: a quality or long run sits the day beside this one`),
      day('Thu 9/17', 'run'),
    ])]
    expect(ids(weeks)).not.toContain('qa_layered_sandwich')
  })

  it('reads the structural marker, not the workout string — a renamed session stays visible', () => {
    // An athlete who edits "Hyrox prep — station volumes" to "Gym" would have
    // switched every rule off if detection were a prefix match.
    const weeks = [week(1, 9, 14, 'Cutback', [
      day('Mon 9/14', 'run'),
      layered('Tue 9/15', RAMP[0], { workout: 'Gym' }),
      day('Wed 9/16', 'rest'),
    ])]
    expect(ids(weeks)).toContain('qa_layered_in_protected_week')
  })

  it('still reads a stored plan that predates the marker (workout-prefix fallback)', () => {
    const legacy = day('Tue 9/15', 'strength', { workout: 'Hyrox prep — station volumes', detail: RAMP[0] })
    const weeks = [week(1, 9, 14, 'Taper', [day('Mon 9/14', 'run'), legacy, day('Wed 9/16', 'rest')])]
    expect(ids(weeks)).toContain('qa_layered_in_protected_week')
  })

  it('every layered rule is a warn — the gate never fails a plan for the athlete\'s own swap', () => {
    const weeks = [week(1, 9, 14, 'Cutback', [
      day('Mon 9/14', 'run'),
      day('Tue 9/15', 'quality'),
      layered('Wed 9/16', RAMP[0]),
      layered('Thu 9/17', RAMP[0]),
    ])]
    const qa = validatePlan({ weeks })
    const layeredFindings = qa.findings.filter(f => f.id.startsWith('qa_layered_'))
    expect(layeredFindings.length).toBeGreaterThan(0)
    expect(layeredFindings.every(f => f.severity === 'warn')).toBe(true)
  })
})

describe('the transform\'s own output passes its own gate', () => {
  const raceInfo: RaceInfo = {
    name: 'Hyrox - Anaheim', date: '2026-12-12', startTime: '', distance: 'Hyrox',
    distanceMiles: 8, elevation: '', elevationRange: '', course: '', cutoff: '',
    landmarks: [], gear: [], nutrition: '', description: 'Hyrox open',
  }
  const race: SeasonRace = { id: 'hyrox', priority: 'A', raceInfo, status: 'upcoming', integration: 'layered' }

  /** Real calendar dates — four Monday-anchored weeks from 2026-09-14. */
  const shift = (iso: string, n: number) => {
    const d = new Date(`${iso}T12:00:00`)
    d.setDate(d.getDate() + n)
    return d
  }
  const label = (iso: string, n: number) => {
    const d = shift(iso, n)
    return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`
  }
  const startOf = (k: number) => {
    const d = shift('2026-09-14', k * 7)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  it('produces no layered findings on a real build', () => {
    const weeks: TrainingWeek[] = [0, 1, 2, 3].map(k => {
      const s = startOf(k)
      return {
        num: k + 1, dates: '', miles: 20, focus: 'Build', startIso: s,
        days: [
          day(label(s, 0), 'run'),
          day(label(s, 1), 'strength', { workout: 'STRENGTH' }),
          day(label(s, 2), 'quality'),
          day(label(s, 3), 'cross', { workout: 'Cycling' }),
          day(label(s, 4), 'rest'),
          day(label(s, 5), 'long'),
        ],
      }
    })
    const out = layerSecondaryWork(weeks, race, '2026-10-24', '2026-07-08')
    expect(out.flatMap(w => w.days).filter(d => d.layeredFor != null).length).toBeGreaterThan(0)
    // Every finding the gate could raise about layered work is a defect the
    // transform was fixed not to produce — so its own output must be clean.
    expect(ids(out)).toEqual([])
  })
})
