import { describe, it, expect } from 'vitest'
import type { RaceInfo, SeasonRace, TrainingWeek, PlannedDay } from '../../../types'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'
import { layerSecondaryWork } from '../../../engines/season/layerSecondaryWork'
import { planSeason } from '../../../engines/season/planSeason'
import { spliceSeasonWeeks } from '../../../engines/season/spliceSeason'
import { prehabBlockFor } from '../../../engines/planGenerator/prehab'
import { dayIsoInWeek } from '../../../utils/planDates'
import { MASTERS_RECOVERY } from '../../../engines/hyrox/heuristics'

/**
 * Layered multi-race preparation (user-directed): a Hyrox 6–7 weeks after
 * the anchor race can't be prepared in the gap alone — integration:'layered'
 * weaves 1–2 station/strength sessions into the anchor build's EXISTING
 * strength/cross slots. Guards: run days untouched, nothing in the final 2
 * pre-race weeks, sequential/unset = byte-identical.
 */

function day(label: string, type: PlannedDay['type'], workout = 'X'): PlannedDay {
  return { day: label, type, workout, detail: 'd', zone: 'Z2', route: '', time: '45 min' }
}

/** Mon-anchored anchor-build weeks ending at a Sat 10/24 race. */
function anchorWeeks(): TrainingWeek[] {
  // Week starts: 9/14, 9/21, 9/28, 10/5, 10/12 (final-2 guard), 10/19 (race wk)
  const mk = (num: number, mon: number, dayNum: number, focus = 'Build'): TrainingWeek => ({
    num, dates: '', miles: 20, focus,
    days: [
      day(`Mon ${mon}/${dayNum}`, 'run'),
      day(`Tue ${mon}/${dayNum + 1}`, 'strength', 'STRENGTH'),
      day(`Wed ${mon}/${dayNum + 2}`, 'quality'),
      day(`Thu ${mon}/${dayNum + 3}`, 'cross', 'Cycling'),
      day(`Sat ${mon}/${dayNum + 5}`, 'long'),
    ],
  })
  return [
    mk(1, 9, 14), mk(2, 9, 21), mk(3, 9, 28), mk(4, 10, 5),
    mk(5, 10, 12, 'Taper'), // inside the final-2-week guard
    { num: 6, dates: '', miles: 8, focus: 'Race week', days: [day('Mon 10/19', 'run'), day('Sat 10/24', 'race', 'RACE DAY')] },
  ]
}

function hyroxRace(integration?: 'layered' | 'sequential'): SeasonRace {
  const raceInfo: RaceInfo = {
    name: 'Hyrox - Anaheim', date: '2026-12-12', startTime: '', distance: 'Hyrox',
    distanceMiles: 8, elevation: '', elevationRange: '', course: '', cutoff: '',
    landmarks: [], gear: [], nutrition: '', description: 'Hyrox open',
  }
  return { id: 'hyrox', priority: 'A', raceInfo, status: 'upcoming', integration }
}

const ANCHOR = '2026-10-24'
const TODAY = '2026-07-08'

describe('layerSecondaryWork', () => {
  it('weaves Hyrox sessions into strength/cross slots — 1/week early, 2/week later', () => {
    const out = layerSecondaryWork(anchorWeeks(), hyroxRace('layered'), ANCHOR, TODAY)
    const counts = out.map(w => w.days.filter(d => d.workout.includes('Hyrox prep')).length)
    // Weeks 1-2 (first half of the 4 eligible): 1 session; weeks 3-4: 2.
    expect(counts.slice(0, 4)).toEqual([1, 1, 2, 2])
    // Guard: nothing in the final-2-week window or race week.
    expect(counts[4]).toBe(0)
    expect(counts[5]).toBe(0)
    // P3.5 — content PROGRESSES across the run instead of repeating one
    // static template (v1 shipped the identical Monday for 8 weeks).
    const layered = out.flatMap(w => w.days.filter(d => d.workout.includes('Hyrox prep')))
    expect(new Set(layered.map(d => d.detail)).size).toBeGreaterThan(1)
    expect(new Set(layered.map(d => d.workout)).size).toBeGreaterThan(1)
  })

  it('run days, day counts, and week volumes are untouched', () => {
    const base = anchorWeeks()
    const out = layerSecondaryWork(base, hyroxRace('layered'), ANCHOR, TODAY)
    out.forEach((w, i) => {
      expect(w.days.length).toBe(base[i].days.length)
      expect(w.miles).toBe(base[i].miles)
      const runTypes = (ws: TrainingWeek) => ws.days.filter(d => ['run', 'quality', 'long', 'race'].includes(d.type)).map(d => d.workout)
      expect(runTypes(w)).toEqual(runTypes(base[i]))
    })
  })

  it('GUARD: sequential and unset are byte-identical; non-Hyrox races pass through', () => {
    const base = anchorWeeks()
    expect(layerSecondaryWork(base, hyroxRace('sequential'), ANCHOR, TODAY)).toBe(base)
    expect(layerSecondaryWork(base, hyroxRace(undefined), ANCHOR, TODAY)).toBe(base)
    const marathon = { ...hyroxRace('layered'), raceInfo: { ...hyroxRace().raceInfo, name: 'CIM Marathon', distance: 'Marathon', description: 'road race' } }
    expect(layerSecondaryWork(base, marathon, ANCHOR, TODAY)).toBe(base)
  })

  it('never rewrites history: completed days and past days stay as they were', () => {
    const base = anchorWeeks()
    base[0].days[1] = { ...base[0].days[1], actual: { name: 'Done', distance: 0, movingTime: 1800 } as PlannedDay['actual'] }
    const out = layerSecondaryWork(base, hyroxRace('layered'), ANCHOR, TODAY)
    expect(out[0].days[1].workout).toBe('STRENGTH') // completed — untouched
    // The cross slot picks up the session instead.
    expect(out[0].days[3].workout).toContain('Hyrox prep')
  })
})

describe('spliceSeasonWeeks applies layering (opt-in only)', () => {
  const config = {
    raceType: 'trail', raceName: 'Half', raceDate: ANCHOR,
    raceDistance: 'half_marathon', experienceLevel: 'intermediate',
    trainingDaysPerWeek: 4, wearable: 'none', athleteName: 'T', age: 40,
    maxHR: 180, selectedMethodId: 'daniels', completedAt: '',
  } as OnboardingConfig

  function anchorSeasonRace(): SeasonRace {
    return {
      id: 'half', priority: 'A', status: 'upcoming',
      raceInfo: {
        name: 'Half', date: ANCHOR, startTime: '', distance: 'Half Marathon',
        distanceMiles: 13.1, elevation: '', elevationRange: '', course: '', cutoff: '',
        landmarks: [], gear: [], nutrition: '',
      },
    }
  }

  it('layered second race transforms anchor strength/cross slots through the splice', () => {
    const result = planSeason([anchorSeasonRace(), hyroxRace('layered')], TODAY)
    const spliced = spliceSeasonWeeks(anchorWeeks(), result, config, TODAY)
    const layeredCount = spliced.flatMap(w => w.days).filter(d => d.workout.includes('Hyrox prep')).length
    expect(layeredCount).toBeGreaterThan(0)
  })

  it('GUARD: an unset-integration second race leaves anchor weeks day-identical', () => {
    const base = anchorWeeks()
    const result = planSeason([anchorSeasonRace(), hyroxRace(undefined)], TODAY)
    const spliced = spliceSeasonWeeks(base, result, config, TODAY)
    for (let i = 0; i < base.length; i++) {
      expect(spliced[i].days.map(d => d.workout)).toEqual(base[i].days.map(d => d.workout))
    }
  })
})

describe('P3.1 — layered sessions render from the race division and athlete sex', () => {
  const stationDays = (weeks: TrainingWeek[]) =>
    weeks.flatMap(w => w.days.filter(d => d.workout === 'Hyrox prep — station volumes'))
  const strengthDays = (weeks: TrainingWeek[]) =>
    weeks.flatMap(w => w.days.filter(d => d.workout === 'Hyrox prep — strength-endurance + grip'))

  it("a female athlete's layered station sessions carry the women's Open loads", () => {
    const out = layerSecondaryWork(anchorWeeks(), hyroxRace('layered'), ANCHOR, TODAY, { sex: 'female' })
    const text = stationDays(out).map(d => d.detail).join('\n')
    expect(text).toContain('102 kg')
    expect(text).not.toContain('152 kg')
    // The strength-endurance session's farmer carry names the real load too.
    expect(strengthDays(out).map(d => d.detail).join('\n')).toContain('2×16 kg')
  })

  it("the race's own division wins over the athlete's (a Pro second race)", () => {
    const race = hyroxRace('layered')
    race.raceInfo.hyroxDivision = 'pro'
    const out = layerSecondaryWork(anchorWeeks(), race, ANCHOR, TODAY, { hyroxDivision: 'open', sex: 'male' })
    const text = stationDays(out).map(d => d.detail).join('\n')
    expect(text).toContain('202 kg')
    expect(text).not.toContain('152 kg')
  })

  it("falls back to the athlete's division when the race carries none", () => {
    const out = layerSecondaryWork(anchorWeeks(), hyroxRace('layered'), ANCHOR, TODAY, { hyroxDivision: 'pro' })
    expect(stationDays(out).map(d => d.detail).join('\n')).toContain('202 kg')
  })

  it('defaults to men\'s Open with no athlete context (legacy callers)', () => {
    const out = layerSecondaryWork(anchorWeeks(), hyroxRace('layered'), ANCHOR, TODAY)
    expect(stationDays(out).map(d => d.detail).join('\n')).toContain('152 kg')
  })
})

// ── PR-1: stop the harm ─────────────────────────────────────────────
// Every assertion below reproduces a defect the adversarial review measured
// on the real pipeline, not a hypothetical.

/** Anchor weeks with an explicit focus per week, so the protected-week rule
 *  can be exercised the way the running generator actually labels weeks
 *  ('Taper' | 'Cutback' | phase name). */
function weeksWithFocus(focuses: string[]): TrainingWeek[] {
  return focuses.map((focus, i) => {
    const mon = 9 + Math.floor((14 + i * 7 - 1) / 30)
    const dayNum = ((14 + i * 7 - 1) % 30) + 1
    return {
      num: i + 1, dates: '', miles: 20, focus,
      days: [
        day(`Mon ${mon}/${dayNum}`, 'run'),
        day(`Tue ${mon}/${dayNum + 1}`, 'strength', 'STRENGTH'),
        day(`Wed ${mon}/${dayNum + 2}`, 'quality'),
        day(`Thu ${mon}/${dayNum + 3}`, 'cross', 'Cycling'),
        day(`Sat ${mon}/${dayNum + 5}`, 'long'),
      ],
    }
  })
}

const layeredDays = (weeks: TrainingWeek[]) =>
  weeks.flatMap(w => w.days.filter(d => /^Hyrox prep — /.test(d.workout)))

describe('PR-1 — the layered transform never destroys the prehab it lands on', () => {
  // The block an athlete gets depends on the area they named; GENERIC_BLOCK
  // ('PREHAB: …', no parenthesis) is what they get when they report an injury
  // and name no area — the case a `'PREHAB ('` matcher silently drops.
  const AREAS = ['knee', 'achilles_calf', 'it_band', 'shin', 'hamstring', 'foot_ankle', 'hip', 'back', 'general']
  for (const area of AREAS) {
    it(`carries the ${area} prehab tail onto every layered day`, () => {
      const block = prehabBlockFor(area)
      expect(block, `${area} should map to a block`).not.toBe('')
      const base = anchorWeeks().map(w => ({
        ...w,
        days: w.days.map(d => (d.type === 'strength' || d.type === 'cross')
          ? { ...d, detail: `${d.detail} · ${block}` }
          : d),
      }))
      const out = layerSecondaryWork(base, hyroxRace('layered'), ANCHOR, TODAY)
      const layered = layeredDays(out)
      expect(layered.length).toBeGreaterThan(0)
      for (const d of layered) {
        expect(d.detail, `${area}: ${d.day}`).toContain(block)
        // and the layered content is still there, not replaced by the tail
        expect(d.detail).toMatch(/Layered toward/)
      }
    })
  }

  it('adds no prehab tail when the day never carried one', () => {
    const out = layerSecondaryWork(anchorWeeks(), hyroxRace('layered'), ANCHOR, TODAY)
    for (const d of layeredDays(out)) expect(d.detail).not.toMatch(/PREHAB/)
  })
})

describe('PR-1 — protected weeks, anchor format, and the race that already happened', () => {
  it('never places a dose in a taper, cutback, recovery or deload week', () => {
    const focuses = ['Base', 'Cutback', 'Build', 'Recovery week', 'Build', 'Taper']
    const out = layerSecondaryWork(weeksWithFocus(focuses), hyroxRace('layered'), '2026-11-28', TODAY)
    out.forEach((w, i) => {
      const n = w.days.filter(d => /^Hyrox prep — /.test(d.workout)).length
      if (/cutback|recover|taper/i.test(focuses[i])) {
        expect(n, `week ${i + 1} "${focuses[i]}" must stay untouched`).toBe(0)
      }
    })
    // and it still did something on the ordinary weeks
    expect(layeredDays(out).length).toBeGreaterThan(0)
  })

  it('returns the anchor untouched when the anchor race is itself a Hyrox', () => {
    const base = anchorWeeks()
    const out = layerSecondaryWork(base, hyroxRace('layered'), ANCHOR, TODAY, { anchorRaceType: 'hyrox' })
    expect(out).toEqual(base)
    // General Fitness is strength-led for the same reason.
    expect(layerSecondaryWork(base, hyroxRace('layered'), ANCHOR, TODAY, { anchorRaceType: 'general' })).toEqual(base)
    // A running anchor still layers.
    expect(layeredDays(layerSecondaryWork(base, hyroxRace('layered'), ANCHOR, TODAY, { anchorRaceType: 'trail' })).length).toBeGreaterThan(0)
  })

  it('stops at the layered race\'s own date — nothing prescribes prep for a race already run', () => {
    // Race BEFORE the anchor: nothing ever marks a race completed, so the
    // ramp used to keep prescribing toward it for the rest of the build.
    const race = hyroxRace('layered')
    race.raceInfo.date = '2026-09-28'
    const out = layerSecondaryWork(anchorWeeks(), race, ANCHOR, TODAY)
    for (const w of out) {
      for (const d of w.days) {
        if (!/^Hyrox prep — /.test(d.workout)) continue
        const iso = dayIsoInWeek(d.day, w, ANCHOR)!
        expect(iso < '2026-09-28', `${d.day} is on/after the race`).toBe(true)
      }
    }
  })
})

describe('PR-1 — two doses in a week are two different sessions', () => {
  it('the escalated weeks alternate emphasis instead of repeating one session', () => {
    const out = layerSecondaryWork(anchorWeeks(), hyroxRace('layered'), ANCHOR, TODAY)
    const doubles = out.filter(w => w.days.filter(d => /^Hyrox prep — /.test(d.workout)).length === 2)
    expect(doubles.length, 'the fixture should produce 2-dose weeks').toBeGreaterThan(0)
    for (const w of doubles) {
      const pair = w.days.filter(d => /^Hyrox prep — /.test(d.workout))
      expect(new Set(pair.map(d => d.workout)).size, `week ${w.num} workouts`).toBe(2)
      expect(pair[0].detail, `week ${w.num} details`).not.toBe(pair[1].detail)
    }
  })
})

describe('PR-1 — placement does not drift with the calendar', () => {
  it('is byte-identical at three successive `today` values before the build starts', () => {
    // The rejected alternative folded `today` into the eligibility predicate,
    // which made the ramp denominator shrink as the calendar advanced: the
    // athlete watched next Monday's session get LIGHTER as it approached.
    const runs = ['2026-07-08', '2026-08-01', '2026-09-01'].map(t =>
      layerSecondaryWork(anchorWeeks(), hyroxRace('layered'), ANCHOR, t))
    expect(runs[1]).toEqual(runs[0])
    expect(runs[2]).toEqual(runs[0])
  })

  it('a second layered race never re-renders the first race\'s sessions', () => {
    const first = layerSecondaryWork(anchorWeeks(), hyroxRace('layered'), ANCHOR, TODAY)
    const second = { ...hyroxRace('layered'), id: 'hyrox-2' }
    second.raceInfo = { ...second.raceInfo, name: 'Hyrox LA', date: '2027-02-20' }
    const before = new Map(layeredDays(first).map(d => [d.day, d.detail]))
    expect(before.size).toBeGreaterThan(0)
    const out = layerSecondaryWork(first, second, ANCHOR, TODAY)
    // A day the first race already claimed is never re-rendered at the second
    // race's loads and relabelled toward it. (The second race may still take
    // slots the first left free — that is the feature working.)
    for (const d of layeredDays(out)) {
      const was = before.get(d.day)
      if (was === undefined) continue
      expect(d.detail, `${d.day} was re-rendered for the later race`).toBe(was)
      expect(d.detail).toMatch(/Hyrox - Anaheim/)
    }
  })

  /**
   * D4 — v1 took the first transformable slot it walked past, so on an
   * ordinary week the layered session landed the day before the quality
   * session or the day after the long run. Placement now scores each
   * reachable slot by hard-day neighbours BY CALENDAR DATE, prefers the
   * quiet one, and eases (never skips) when there is no quiet one.
   */
  describe('D4 — the layered session bends around the runs', () => {
    /** Mon cross (beside Tue quality) · Thu strength (between two easy runs). */
    const quietSlotWeeks = (): TrainingWeek[] => {
      const mk = (num: number, mon: number, d: number, focus = 'Build'): TrainingWeek => ({
        num, dates: '', miles: 20, focus,
        days: [
          day(`Mon ${mon}/${d}`, 'cross', 'Cycling'),
          day(`Tue ${mon}/${d + 1}`, 'quality'),
          day(`Wed ${mon}/${d + 2}`, 'run'),
          day(`Thu ${mon}/${d + 3}`, 'strength', 'STRENGTH'),
          day(`Fri ${mon}/${d + 4}`, 'run'),
          day(`Sat ${mon}/${d + 5}`, 'long'),
        ],
      })
      return [mk(1, 9, 14), mk(2, 9, 21), mk(3, 9, 28), mk(4, 10, 5)]
    }

    it('prefers the slot that is not beside a quality or long run', () => {
      const out = layerSecondaryWork(quietSlotWeeks(), hyroxRace('layered'), ANCHOR, TODAY)
      // Week 1 gets one dose. Plan order would have taken Mon (index 0);
      // Mon sits the day before Tuesday's quality session, Thursday sits
      // between two easy runs.
      const w1 = out[0].days.filter(d => d.workout.includes('Hyrox prep'))
      expect(w1).toHaveLength(1)
      expect(w1[0].day).toMatch(/^Thu /)
      expect(w1[0].detail).not.toMatch(/EASED/)
    })

    it('sees the previous week\'s Sunday long run across the week boundary', () => {
      // Same week shape every week; the ONLY difference in week 2+ is that a
      // long run sits on the preceding Sunday. A same-week-only scan cannot
      // see it, and week 2 would place identically to week 1.
      const mk = (num: number, mon: number, d: number): TrainingWeek => ({
        num, dates: '', miles: 20, focus: 'Build',
        days: [
          day(`Mon ${mon}/${d}`, 'strength', 'STRENGTH'),
          day(`Tue ${mon}/${d + 1}`, 'run'),
          day(`Wed ${mon}/${d + 2}`, 'cross', 'Cycling'),
          day(`Thu ${mon}/${d + 3}`, 'run'),
          day(`Sun ${mon}/${d + 6}`, 'long'),
        ],
      })
      const weeks = [mk(1, 9, 14), mk(2, 9, 21), mk(3, 9, 28), mk(4, 10, 5)]
      const out = layerSecondaryWork(weeks, hyroxRace('layered'), ANCHOR, TODAY)
      // Week 1: nothing precedes Monday, so Monday is quiet and wins on order.
      expect(out[0].days.filter(d => d.workout.includes('Hyrox prep'))[0].day).toMatch(/^Mon /)
      // Week 2: Monday now follows 9/20's long run, so Wednesday wins.
      expect(out[1].days.filter(d => d.workout.includes('Hyrox prep'))[0].day).toMatch(/^Wed /)
    })

    it('NEVER vetoes: when every reachable slot is crowded the dose still lands, eased', () => {
      // The standard fixture is an ordinary 5-day week where Tue sits before
      // Wednesday's quality and Thu sits after it — there is no quiet slot.
      // A veto here would zero layering out entirely, which is just the
      // "we said we would layer it and didn't" defect wearing a safety label.
      const out = layerSecondaryWork(anchorWeeks(), hyroxRace('layered'), ANCHOR, TODAY)
      expect(out.map(w => w.days.filter(d => d.workout.includes('Hyrox prep')).length).slice(0, 4))
        .toEqual([1, 1, 2, 2])
      const layered = layeredDays(out)
      expect(layered.length).toBe(6)
      for (const d of layered) {
        expect(d.detail, `${d.day} should say it was eased`).toMatch(/EASED/)
        expect(d.zone).toBe('Z2')
      }
    })

    it('an eased session is genuinely lighter, not just labelled', () => {
      // Controlled A/B: the same week, same eligible position — the only
      // change is a quality session moved next to the strength slot.
      const base = (crowd: boolean): TrainingWeek[] => {
        const mk = (num: number, mon: number, d: number): TrainingWeek => ({
          num, dates: '', miles: 20, focus: 'Build',
          days: [
            day(`Mon ${mon}/${d}`, 'run'),
            day(`Tue ${mon}/${d + 1}`, crowd ? 'quality' : 'run'),
            day(`Wed ${mon}/${d + 2}`, 'strength', 'STRENGTH'),
            day(`Thu ${mon}/${d + 3}`, 'run'),
            day(`Sat ${mon}/${d + 5}`, 'long'),
          ],
        })
        return [mk(1, 9, 14), mk(2, 9, 21), mk(3, 9, 28), mk(4, 10, 5)]
      }
      const skiErgM = (weeks: TrainingWeek[]) => {
        const d = layeredDays(weeks).find(x => x.detail.includes('SkiErg'))!
        return Number(d.detail.match(/SkiErg (\d+)m/)![1])
      }
      const full = layerSecondaryWork(base(false), hyroxRace('layered'), ANCHOR, TODAY)
      const eased = layerSecondaryWork(base(true), hyroxRace('layered'), ANCHOR, TODAY)
      expect(skiErgM(eased)).toBeLessThan(skiErgM(full))
      expect(layeredDays(full)[0].detail).not.toMatch(/EASED/)
      expect(layeredDays(eased)[0].detail).toMatch(/EASED/)
      // The circuit is retained, not replaced: still rendered from the spec,
      // so #401's division and sex loads survive the downshift.
      const easedCircuit = layeredDays(eased).find(d => d.detail.includes('STATIONS'))!.detail
      expect(easedCircuit).toMatch(/SkiErg \d+m/)
      expect(easedCircuit).toMatch(/Sled push \d+m @ 152 kg/)
      expect(easedCircuit).toMatch(/Wall balls \d+ @ 6 kg to 3\.0 m/)
      // …minus the plyometric, which is the whole point of easing it.
      expect(easedCircuit).not.toMatch(/Burpee broad jumps \d/)
      expect(easedCircuit).toMatch(/Step-ups \d+\/leg/)
    })
  })

  /**
   * The masters swap has to happen on the SPEC LIST, not the strength
   * template alone: the station circuit renders straight from `specs`, so a
   * template-only fix left every masters athlete doing 80 m of broad jumps
   * on every other layered day.
   */
  describe('masters athletes and the broad jumps', () => {
    const MASTERS = { age: 62 }
    const YOUNGER = { age: 41 }

    /** Strength slot flanked by easy runs, so nothing here is eased — the
     *  jumps come out on age alone or not at all. */
    const quietWeeks = (): TrainingWeek[] => [0, 1, 2, 3].map(k => ({
      num: k + 1, dates: '', miles: 20, focus: 'Build',
      days: [
        day(`Mon 9/${14 + k * 7}`, 'run'),
        day(`Tue 9/${15 + k * 7}`, 'run'),
        day(`Wed 9/${16 + k * 7}`, 'strength', 'STRENGTH'),
        day(`Thu 9/${17 + k * 7}`, 'run'),
        day(`Sat 9/${19 + k * 7}`, 'long'),
      ],
    }))

    it('drops burpee broad jumps from the circuit AND the strength template', () => {
      const out = layerSecondaryWork(anchorWeeks(), hyroxRace('layered'), ANCHOR, TODAY, MASTERS)
      const layered = layeredDays(out)
      expect(layered.length).toBeGreaterThan(0)
      for (const d of layered) {
        expect(d.detail, `${d.day} still prescribes broad jumps`).not.toMatch(/Burpee broad jumps \d/)
      }
      // Both emphases are represented and both substitute step-ups.
      expect(layered.some(d => d.detail.includes('STATIONS'))).toBe(true)
      expect(layered.some(d => d.detail.includes('STRENGTH-ENDURANCE'))).toBe(true)
      expect(layered.some(d => d.detail.includes('Step-ups'))).toBe(true)
      expect(layered.every(d => d.detail.includes('does not repay a masters athlete'))).toBe(true)
    })

    it('leaves a younger athlete\'s broad jumps in place', () => {
      const out = layerSecondaryWork(quietWeeks(), hyroxRace('layered'), ANCHOR, TODAY, YOUNGER)
      const circuit = layeredDays(out).find(d => d.detail.includes('STATIONS'))!
      expect(circuit.detail).toMatch(/Burpee broad jumps \d+m/)
      expect(circuit.detail).not.toMatch(/masters/)
    })

    it('reads the farmer carry load by key — filtering a station must not shift it', () => {
      // `specs[5]` was the farmer carry only while the list had all eight
      // entries; drop the broad jumps and index 5 silently became the sandbag
      // lunges, so a masters athlete was told to carry at the sandbag weight.
      const out = layerSecondaryWork(anchorWeeks(), hyroxRace('layered'), ANCHOR, TODAY, MASTERS)
      const se = layeredDays(out).find(d => d.detail.includes('STRENGTH-ENDURANCE'))!
      // Men's Open: farmer carry 2×24 kg, sandbag lunges 20 kg.
      expect(se.detail).toMatch(/Farmer carry \d+m @ 2×24 kg/)
    })

    it('the masters threshold is MASTERS_RECOVERY\'s, not a second one', () => {
      // Quiet weeks on purpose: in a crowded week the jumps come out for
      // everyone, which would make this assertion pass for the wrong reason.
      const at = layerSecondaryWork(quietWeeks(), hyroxRace('layered'), ANCHOR, TODAY,
        { age: MASTERS_RECOVERY.value.ageThreshold })
      const below = layerSecondaryWork(quietWeeks(), hyroxRace('layered'), ANCHOR, TODAY,
        { age: MASTERS_RECOVERY.value.ageThreshold - 1 })
      expect(layeredDays(at).every(d => !/Burpee broad jumps \d/.test(d.detail))).toBe(true)
      expect(layeredDays(below).some(d => d.detail.includes('Burpee broad jumps'))).toBe(true)
    })

    it('an unknown age is never treated as masters (legacy callers)', () => {
      const out = layerSecondaryWork(quietWeeks(), hyroxRace('layered'), ANCHOR, TODAY)
      expect(layeredDays(out).every(d => !d.detail.includes('masters'))).toBe(true)
    })
  })
})
