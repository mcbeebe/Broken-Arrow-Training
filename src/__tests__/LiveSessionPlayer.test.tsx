/**
 * The live-session player (Phase 2, PR 4) — full-screen flow over the
 * engine: preview → exercise → rest → summary, plus crash-resume.
 * Timing displays are not asserted (the engine's own suite covers the
 * clock math); these tests pin the flow and the save contract.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import LiveSessionPlayer from '../components/LiveSessionPlayer'
import { startSession, saveDraft } from '../utils/liveSession'
import type { ActualWorkout, PlannedDay, TrainingWeek } from '../types'

afterEach(cleanup)
beforeEach(() => localStorage.clear())

const plannedDay: PlannedDay = {
  day: 'Mon 8/24', type: 'strength', workout: 'STRENGTH',
  detail: 'Goblet squats 2×12 · Plank 1×45s',
  zone: 'Z1', route: 'Gym', time: '1 hr',
}

function historyWeeks(): TrainingWeek[] {
  return [{
    num: 6, dates: 'Aug 10–16', miles: 10, focus: 'Build',
    days: [{
      day: 'Mon 8/10', type: 'strength', workout: 'STRENGTH',
      detail: 'Goblet squats 2×12', zone: 'Z1', route: 'Gym', time: '1 hr',
      actual: {
        stravaId: 1, source: 'manual', distance: 0, movingTime: 3000,
        elapsedTime: 3000, elevationGain: 0, type: 'strength_training',
        name: 'Strength', startDate: '2026-08-10T08:00:00',
        strengthLog: [{
          name: 'Goblet squats', focus: 'lower',
          sets: [{ reps: 12, weight: '20 lb' }, { reps: 12, weight: '20 lb' }],
        }],
      },
    }],
  }]
}

function renderPlayer(overrides: Partial<Parameters<typeof LiveSessionPlayer>[0]> = {}) {
  const onSave = vi.fn()
  const onClose = vi.fn()
  render(
    <LiveSessionPlayer
      planned={plannedDay}
      dayLabel="Mon 8/24"
      dayIso="2026-08-24"
      athleteId="mike"
      allWeeks={historyWeeks()}
      onSave={onSave}
      onClose={onClose}
      {...overrides}
    />,
  )
  return { onSave, onClose }
}

describe('preview (screen 5)', () => {
  it('lists the drafted prescription with history and offers Start', () => {
    const { onClose } = renderPlayer()
    expect(screen.getByText('Goblet squats')).toBeTruthy()
    expect(screen.getByText(/last: 20 lb × 12, 12/)).toBeTruthy()
    expect(screen.getByText('Start workout')).toBeTruthy()
    fireEvent.click(screen.getByText('or log it afterwards'))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('the session flow', () => {
  it('start → log sets through rest → summary, with the save contract intact', () => {
    const { onSave, onClose } = renderPlayer()
    fireEvent.click(screen.getByText('Start workout'))

    // Exercise view: goblet squats, set 1 current.
    expect(screen.getByText('Exercise 1 of 2')).toBeTruthy()
    fireEvent.click(screen.getByText(/Log set 1/))

    // Rest screen (dark) with the escape hatches.
    expect(screen.getByText('Rest')).toBeTruthy()
    expect(screen.getByText('+30s')).toBeTruthy()
    fireEvent.click(screen.getByText('Skip rest'))

    // Set 2 → rest → Plank (final set logs straight to summary).
    fireEvent.click(screen.getByText(/Log set 2/))
    fireEvent.click(screen.getByText('Skip rest'))
    expect(screen.getByText('Exercise 2 of 2')).toBeTruthy()
    fireEvent.click(screen.getByText(/Log set 1 · finish/))

    // Summary.
    expect(screen.getByText(/Session done/)).toBeTruthy()
    expect(screen.getByText('3/3')).toBeTruthy()
    fireEvent.click(screen.getByText('Save workout'))

    const workout: ActualWorkout = onSave.mock.calls[0][0]
    const meta = onSave.mock.calls[0][1]
    expect(meta).toEqual({ dayLabel: 'Mon 8/24', dayIso: '2026-08-24' })
    expect(workout.type).toBe('strength_training')
    expect(workout.strengthLog).toHaveLength(2)
    expect(workout.strengthLog![0].sets.every(s => s.done === true)).toBe(true)
    expect(onClose).toHaveBeenCalled()
    // Draft cleared — nothing to resume.
    expect(localStorage.getItem('ba_live_session_draft_mike')).toBeNull()
  })

  it('skip set advances without credit and the summary counts it honestly', () => {
    renderPlayer()
    fireEvent.click(screen.getByText('Start workout'))
    fireEvent.click(screen.getByText('skip set'))          // set 1 skipped
    fireEvent.click(screen.getByText(/Log set 2/))
    fireEvent.click(screen.getByText('Skip rest'))
    fireEvent.click(screen.getByText(/Log set 1 · finish/))
    expect(screen.getByText('2/3')).toBeTruthy()
  })

  it('steppers edit the current set in place', () => {
    renderPlayer()
    fireEvent.click(screen.getByText('Start workout'))
    // Ghosted from history: 20 lb. One bump → 22.5.
    fireEvent.click(screen.getAllByLabelText('plus lb')[0])
    expect(screen.getByText('22.5')).toBeTruthy()
    fireEvent.click(screen.getAllByLabelText('minus reps')[0])
    expect(screen.getByText('11')).toBeTruthy()
  })
})

describe('recording a set’s time live (Plank, wall balls, an erg piece)', () => {
  it('the microwave keypad stamps the set, and "Set done" confirms it and starts rest', () => {
    renderPlayer()
    fireEvent.click(screen.getByText('Start workout'))
    expect(screen.getByText('Add time')).toBeTruthy()
    fireEvent.click(screen.getByText('Add time'))
    // 1:30, typed microwave-style: "1", "3", "0".
    fireEvent.click(screen.getByRole('button', { name: '1' }))
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    fireEvent.click(screen.getByRole('button', { name: '0' }))
    expect(screen.getByText('1:30')).toBeTruthy()
    fireEvent.click(screen.getByText('Set done'))
    // "Set done" both confirms the time and logs the set.
    expect(screen.getByText('Rest')).toBeTruthy()
  })

  it('"Next: weight" closes the keypad without logging the set — the time already stuck', () => {
    renderPlayer()
    fireEvent.click(screen.getByText('Start workout'))
    fireEvent.click(screen.getByText('Add time'))
    fireEvent.click(screen.getByRole('button', { name: '9' }))
    fireEvent.click(screen.getByText('Next: weight'))
    // Still on the exercise face, set 1 — not logged.
    expect(screen.getByText('Exercise 1 of 2')).toBeTruthy()
    expect(screen.getByText(/0:09 — edit time/)).toBeTruthy()
  })

  it('closing the keypad keeps the typed time; the set logs it on "Log set"', () => {
    renderPlayer()
    fireEvent.click(screen.getByText('Start workout'))
    fireEvent.click(screen.getByText('Add time'))
    fireEvent.click(screen.getByRole('button', { name: '4' }))
    fireEvent.click(screen.getByRole('button', { name: '5' }))
    fireEvent.click(screen.getByText('Close'))
    fireEvent.click(screen.getByText(/Log set 1/))
    fireEvent.click(screen.getByText('Skip rest'))
    fireEvent.click(screen.getByText(/Log set 2/))
    fireEvent.click(screen.getByText('Skip rest'))
    fireEvent.click(screen.getByText(/Log set 1 · finish/))
    fireEvent.click(screen.getByText('Save workout'))
  })

  it('moving to the next set closes any keypad left open on the one before', () => {
    renderPlayer()
    fireEvent.click(screen.getByText('Start workout'))
    fireEvent.click(screen.getByText('Add time'))
    expect(screen.getByText('Set done')).toBeTruthy() // the keypad is open
    fireEvent.click(screen.getByText('Close'))
    fireEvent.click(screen.getByText(/Log set 1/))
    fireEvent.click(screen.getByText('Skip rest'))
    // Set 2's own card offers time entry fresh — no leftover keypad.
    expect(screen.queryByText('Set done')).toBeNull()
    expect(screen.getByText('Add time')).toBeTruthy()
  })
})

describe('circuit mode (screen 8)', () => {
  const circuitDay: PlannedDay = {
    day: 'Fri 8/28', type: 'cross', workout: 'Station circuit (intro)',
    detail: 'SkiErg 2×1 · Wall balls 2×15 · Farmer carry 2×40',
    zone: 'Z2', route: 'Gym', time: '45 min',
  }

  it('a gym-circuit day starts round-major with the station flow, no rest screens', () => {
    renderPlayer({ planned: circuitDay, dayLabel: 'Fri 8/28', dayIso: '2026-08-28' })
    fireEvent.click(screen.getByText('Start workout'))
    expect(screen.getByText('Round 1 of 2')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Station done · next: Wall balls/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Station done/ }))
    // Straight to the next station — never a rest screen.
    expect(screen.queryByText('Rest')).toBeNull()
    expect(screen.getByRole('button', { name: /Station done · next: Farmer carry/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Station done/ }))
    expect(screen.getByRole('button', { name: /Station done · next: round 2/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Station done/ }))
    // Round 2 begins back at the first station.
    expect(screen.getByText('Round 2 of 2')).toBeTruthy()
  })
})

describe('circuit rest — "Rest 2 min between" plays as a timed rest, not Exercise 8', () => {
  const restCircuitDay: PlannedDay = {
    day: 'Fri 9/18', type: 'cross', workout: 'Station circuit (intro)',
    detail: 'SkiErg 2×1 · Wall balls 2×15 · Rest 2 min between rounds · Grip note: finish with 2× dead hang to build the carry/pull grip the race demands',
    zone: 'Z2', route: 'Gym', time: '45 min',
  }

  it('the preview lists the stations only, with the rest and the note as guidance', () => {
    renderPlayer({ planned: restCircuitDay, dayLabel: 'Fri 9/18', dayIso: '2026-09-18' })
    expect(screen.queryByText('Rest 2 min between rounds')).toBeNull()
    // Two numbered exercise rows ("2 efforts" for SkiErg 2×1, "2 × 15" for
    // wall balls) — the note is shown as guidance, not as a third row.
    expect(screen.getByText(/^2 efforts/)).toBeTruthy()
    expect(screen.getByText(/^2 × 15/)).toBeTruthy()
    expect(screen.getByText(/Grip note: finish with 2× dead hang/)).toBeTruthy()
    expect(screen.getByText(/Rest 2:00 between rounds/)).toBeTruthy()
  })

  it('round 1 flows station to station, then the round boundary is the rest screen', () => {
    const { onSave } = renderPlayer({ planned: restCircuitDay, dayLabel: 'Fri 9/18', dayIso: '2026-09-18' })
    fireEvent.click(screen.getByText('Start workout'))
    expect(screen.getByText('Round 1 of 2')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Station done · next: Wall balls/ }))
    expect(screen.queryByText('Rest')).toBeNull()
    // The label says the rest is coming before the athlete taps.
    fireEvent.click(screen.getByRole('button', { name: /Station done · rest, then round 2/ }))
    expect(screen.getByText('Rest')).toBeTruthy()
    expect(screen.getByText('of 2:00')).toBeTruthy()
    expect(screen.getByText('Round 2 of 2 — SkiErg')).toBeTruthy()
    expect(screen.getByText(/Wall balls done/)).toBeTruthy()
    fireEvent.click(screen.getByText('Skip rest'))
    expect(screen.getByText('Round 2 of 2')).toBeTruthy()
    // Last station of the last round finishes without a rest.
    fireEvent.click(screen.getByRole('button', { name: /Station done · next: Wall balls/ }))
    fireEvent.click(screen.getByRole('button', { name: /Station done · next: finish/ }))
    expect(screen.getByText(/Session done/)).toBeTruthy()
    fireEvent.click(screen.getByText('Save workout'))
    const workout: ActualWorkout = onSave.mock.calls[0][0]
    expect(workout.strengthLog!.map(ex => ex.name)).toEqual(['SkiErg', 'Wall balls'])
  })
})

describe('the intro circuit as the plan writes it — one pass, 2 min between stations', () => {
  const introDay: PlannedDay = {
    day: 'Fri 9/18', type: 'cross', workout: 'Station circuit (intro)',
    detail: 'SkiErg 500m · Sled push 25m @ 152 kg · Row 500m · Rest 2 min between stations · Grip note: finish with 2× dead hang',
    zone: 'Z2', route: 'Gym', time: '45 min',
  }

  it('drafts each station once (no invented rounds) and rests after every station', () => {
    const { onSave } = renderPlayer({ planned: introDay, dayLabel: 'Fri 9/18', dayIso: '2026-09-18' })
    expect(screen.getAllByText(/^one effort/)).toHaveLength(3)
    expect(screen.queryByText(/1 × 1/)).toBeNull()
    expect(screen.getByText(/Rest 2:00 between stations/)).toBeTruthy()
    fireEvent.click(screen.getByText('Start workout'))
    expect(screen.queryByText(/Round 1 of/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Station done · rest, then Sled push/ }))
    expect(screen.getByText('Rest')).toBeTruthy()
    expect(screen.getByText('of 2:00')).toBeTruthy()
    expect(screen.getByText('Sled push 25m @ 152 kg')).toBeTruthy() // up next, no round stamp
    fireEvent.click(screen.getByText('Skip rest'))
    fireEvent.click(screen.getByRole('button', { name: /Station done · rest, then Row 500m/ }))
    fireEvent.click(screen.getByText('Skip rest'))
    fireEvent.click(screen.getByRole('button', { name: /Station done · next: finish/ }))
    fireEvent.click(screen.getByText('Save workout'))
    const workout: ActualWorkout = onSave.mock.calls[0][0]
    expect(workout.strengthLog!.map(ex => ex.sets.length)).toEqual([1, 1, 1])
    expect(workout.stationSplits!.map(x => x.label)).toEqual(['SkiErg 500m', 'Sled push 25m @ 152 kg', 'Row 500m'])
  })

  it('"Add round" grows the circuit live — the second lap is walked, splits stamp the round', () => {
    const { onSave } = renderPlayer({ planned: introDay, dayLabel: 'Fri 9/18', dayIso: '2026-09-18' })
    fireEvent.click(screen.getByText('Start workout'))
    expect(screen.queryByText(/Round 1 of/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add round' }))
    expect(screen.getByText('Round 1 of 2')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Station done · rest, then Sled push/ }))
    fireEvent.click(screen.getByText('Skip rest'))
    fireEvent.click(screen.getByRole('button', { name: /Station done · rest, then Row 500m/ }))
    fireEvent.click(screen.getByText('Skip rest'))
    fireEvent.click(screen.getByRole('button', { name: /Station done · rest, then round 2/ }))
    fireEvent.click(screen.getByText('Skip rest'))
    expect(screen.getByText('Round 2 of 2')).toBeTruthy()
    fireEvent.click(screen.getByText('End'))
    fireEvent.click(screen.getByText('Save workout'))
    const workout: ActualWorkout = onSave.mock.calls[0][0]
    expect(workout.strengthLog!.map(ex => ex.sets.length)).toEqual([2, 2, 2])
    expect(workout.stationSplits![0].label).toBe('SkiErg 500m — round 1')
  })
})

describe('adding an exercise mid-workout', () => {
  it('straight sets: the pick slots in as "Next", the current set is untouched', () => {
    renderPlayer()
    fireEvent.click(screen.getByText('Start workout'))
    expect(screen.getByText('Exercise 1 of 2')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add exercise' }))
    fireEvent.click(screen.getByText('Dumbbell Row')) // from the guide library
    expect(screen.getByText('Exercise 1 of 3')).toBeTruthy()
    expect(screen.getByText(/Dumbbell Row · 3 sets/)).toBeTruthy()
    // Finish the squats — the row is what comes up.
    fireEvent.click(screen.getByText(/Log set 1/))
    fireEvent.click(screen.getByText('Skip rest'))
    fireEvent.click(screen.getByText(/Log set 2/))
    expect(screen.getByText('Dumbbell Row — set 1 of 3')).toBeTruthy() // rest screen's "Up next"
    fireEvent.click(screen.getByText('Skip rest'))
    expect(screen.getByText('Exercise 2 of 3')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Dumbbell Row' })).toBeTruthy()
  })

  it('can be added from the rest screen too', () => {
    renderPlayer()
    fireEvent.click(screen.getByText('Start workout'))
    fireEvent.click(screen.getByText(/Log set 1/))
    expect(screen.getByText('Rest')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add exercise' }))
    fireEvent.click(screen.getByText('Dumbbell Row'))
    fireEvent.click(screen.getByText('Skip rest'))
    expect(screen.getByText('Exercise 1 of 3')).toBeTruthy()
  })

  it('circuit: the sleds are taken — the new station is next in this round', () => {
    const circuitDay: PlannedDay = {
      day: 'Fri 8/28', type: 'cross', workout: 'Station circuit (intro)',
      detail: 'SkiErg 2×1 · Sled push 2×1 · Row 2×1',
      zone: 'Z2', route: 'Gym', time: '45 min',
    }
    renderPlayer({ planned: circuitDay, dayLabel: 'Fri 8/28', dayIso: '2026-08-28' })
    fireEvent.click(screen.getByText('Start workout'))
    fireEvent.click(screen.getByRole('button', { name: /Station done · next: Sled push/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Add exercise' }))
    fireEvent.click(screen.getByText('Dumbbell Row'))
    expect(screen.getByRole('button', { name: /Station done · next: Dumbbell Row/ })).toBeTruthy()
    fireEvent.click(screen.getByText('skip')) // the sled
    expect(screen.getByRole('heading', { name: 'Dumbbell Row' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Station done · next: Row/ })).toBeTruthy()
  })

  it('a blank custom name cannot be added from the live player', () => {
    renderPlayer()
    fireEvent.click(screen.getByText('Start workout'))
    fireEvent.click(screen.getByRole('button', { name: 'Add exercise' }))
    const custom = screen.getByText('Type a name above to add a custom exercise').closest('button')!
    expect(custom.disabled).toBe(true)
    fireEvent.click(custom)
    expect(screen.getByText('Exercise 1 of 2')).toBeTruthy()
  })
})

describe('simulation mode (Phase 3b)', () => {
  const halfSimDay: PlannedDay = {
    day: 'Sat 8/29', type: 'long', workout: 'HALF SIMULATION: 4 runs + 4 stations',
    detail: 'Race order, race weights…', zone: '2.5 mi + stations · Z3–Z4',
    route: 'Gym', time: '~60 min',
  }

  it('a sim day drafts race-spec segments and plays them as one timed round', () => {
    const { onSave } = renderPlayer({ planned: halfSimDay, dayLabel: 'Sat 8/29', dayIso: '2026-08-29' })
    // Preview drafts from the race spec, not the prose detail.
    expect(screen.getByText('Run 1 — 1 km')).toBeTruthy()
    expect(screen.getByText('Sled push — 50 m @ 152 kg')).toBeTruthy()
    fireEvent.click(screen.getByText('Start workout'))

    // Sim face: no round tracker, run-aware action, straight sequencing.
    expect(screen.getByText('Half simulation')).toBeTruthy()
    expect(screen.queryByText(/Round 1 of/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Run done · next: SkiErg/ }))
    expect(screen.queryByText('Rest')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Station done · next: Run 2/ }))

    // End early and save — the sim contract, not a strength log.
    fireEvent.click(screen.getByText('End'))
    fireEvent.click(screen.getByText('Save workout'))
    const workout: ActualWorkout = onSave.mock.calls[0][0]
    expect(workout.type).toBe('workout')
    expect(workout.name).toBe('Half simulation — Sat 8/29')
    expect(workout.strengthLog).toBeUndefined()
    expect(workout.stationSplits).toHaveLength(2)
    expect(workout.stationSplits![0].kind).toBe('run')
    expect(workout.stationSplits![1].kind).toBe('station')
  })
})

describe('crash resume', () => {
  it('a saved draft resumes mid-session, whatever day the player was opened for', () => {
    // A session from ANOTHER day died mid-rest…
    const s = startSession(
      [{ name: 'Wall balls', focus: 'full', sets: [{ reps: 15, weight: '14 lb', done: false }, { reps: 15, weight: '14 lb', done: false }] }],
      { dayLabel: 'Fri 8/21', dayIso: '2026-08-21' },
      Date.now() - 60_000,
    )
    saveDraft(s, 'mike')

    // …and the player opens straight into it, not the preview.
    const { onSave } = renderPlayer()
    expect(screen.queryByText('Start workout')).toBeNull()
    expect(screen.getByText('Wall balls')).toBeTruthy()

    fireEvent.click(screen.getByText(/Log set 1/))
    fireEvent.click(screen.getByText('Skip rest'))
    fireEvent.click(screen.getByText(/Log set 2 · finish/))
    fireEvent.click(screen.getByText('Save workout'))
    // Saved against the DRAFT's day, not the opened day.
    expect(onSave.mock.calls[0][1]).toEqual({ dayLabel: 'Fri 8/21', dayIso: '2026-08-21' })
  })

  it('discard clears the draft without saving', () => {
    const s = startSession(
      [{ name: 'Wall balls', focus: 'full', sets: [{ reps: 15, weight: '14 lb', done: false }] }],
      { dayLabel: 'Fri 8/21' }, Date.now(),
    )
    saveDraft({ ...s }, 'mike')
    const { onSave } = renderPlayer()
    fireEvent.click(screen.getByText('End'))
    fireEvent.click(screen.getByText('Discard session'))
    expect(onSave).not.toHaveBeenCalled()
    expect(localStorage.getItem('ba_live_session_draft_mike')).toBeNull()
  })
})
