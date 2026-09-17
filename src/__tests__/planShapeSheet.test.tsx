/**
 * Plan tab → Shape my week: the sheet names exactly what changes and from
 * which week, what happens to hand-edited and pinned days under each way
 * of applying, previews the resulting week from the real generator, and
 * confirms with a button that says which mode it is.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import PlanShapeSheet from '../components/PlanShapeSheet'
import { generatePlanFromMethod } from '../engines/planGenerator/generatePlan'
import { getMethodById } from '../data/methods'
import type { OnboardingConfig } from '../hooks/useOnboarding'

afterEach(cleanup)

const config = {
  raceType: 'road', raceName: 'Test Half', raceDate: '2026-11-15', raceDistance: 'half_marathon',
  experienceLevel: 'intermediate', trainingDaysPerWeek: 5, longRunDay: 'Sunday', selectedMethodId: 'daniels',
  wearable: 'none', athleteName: 'Test', age: 38, maxHR: 184, completedAt: '2026-06-01T00:00:00Z',
  strengthDaysPerWeek: 1, crossTrainingModes: ['cycling'], crossTrainingDaysPerWeek: 1,
} as OnboardingConfig

function weeksWithEdits() {
  const plan = generatePlanFromMethod(getMethodById('daniels')!, config, '2026-06-01')
  const weeks = plan.weeks.map(w => ({ ...w, days: w.days.map(d => ({ ...d })) }))
  // A hand-edited Wednesday in week 5 and a pinned Friday in week 6.
  const w5 = weeks.find(w => w.num === 5)!, w6 = weeks.find(w => w.num === 6)!
  const wed = w5.days.find(d => d.day.startsWith('Wed'))!; wed.userEdited = true
  const fri = w6.days.find(d => d.day.startsWith('Fri'))!; fri.locked = true
  return { weeks, wedLabel: wed.day, friLabel: fri.day }
}

describe('PlanShapeSheet', () => {
  it('starts on the current layout, names each change with its from/to, and defaults to keeping edits', () => {
    const { weeks, wedLabel, friLabel } = weeksWithEdits()
    const onReshape = vi.fn(), onRebuild = vi.fn()
    render(<PlanShapeSheet config={config} weeks={weeks} currentWeekNum={4} todayIso={weeks[3].startIso ?? '2026-06-22'} onReshape={onReshape} onRebuild={onRebuild} onClose={() => {}} />)
    expect(screen.getByTestId('shape-changes').textContent).toContain('Nothing yet')
    expect((screen.getByTestId('shape-confirm') as HTMLButtonElement).disabled).toBe(true)
    // Make Tuesday a strength day.
    fireEvent.click(screen.getByTestId('shape-day-2'))
    fireEvent.click(screen.getByTestId('shape-role-strength'))
    const changes = screen.getByTestId('shape-changes').textContent ?? ''
    expect(changes).toMatch(/Tuesday:.*→ Strength/)
    expect(changes).toContain('Weeks before 4 stay as they were')
    // Both modes say what happens to the hand-edited Wednesday and pinned Friday.
    expect(screen.getByTestId('shape-mode-in-place').textContent).toContain(`1 hand-edited day (${wedLabel}) stay exactly as you edited`)
    expect(screen.getByTestId('shape-mode-in-place').textContent).toContain(`1 pinned day (${friLabel})`)
    expect(screen.getByTestId('shape-mode-rebuild').textContent).toContain('1 hand-edited day and any swaps are dropped')
    expect(screen.getByTestId('week-shape-preview')).toBeTruthy()
    const confirm = screen.getByTestId('shape-confirm') as HTMLButtonElement
    expect(confirm.disabled).toBe(false)
    expect(confirm.textContent).toMatch(/^Rewrite weeks 4–\d+, keep my edits$/)
    fireEvent.click(confirm)
    expect(onReshape).toHaveBeenCalledTimes(1)
    expect(onReshape.mock.calls[0][0][2]).toBe('strength')
    expect(onReshape.mock.calls[0][1]).toBe(4)
    expect(onRebuild).not.toHaveBeenCalled()
  })

  it('rebuild mode routes to onRebuild and the button says so; a shape with an error cannot be confirmed', () => {
    const { weeks } = weeksWithEdits()
    const onReshape = vi.fn(), onRebuild = vi.fn()
    render(<PlanShapeSheet config={config} weeks={weeks} currentWeekNum={4} todayIso="2026-06-22" onReshape={onReshape} onRebuild={onRebuild} onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('shape-day-2'))
    fireEvent.click(screen.getByTestId('shape-role-strength'))
    fireEvent.click(screen.getByTestId('shape-from-5'))
    fireEvent.click(screen.getByTestId('shape-mode-rebuild'))
    const confirm = screen.getByTestId('shape-confirm') as HTMLButtonElement
    expect(confirm.textContent).toMatch(/^Rebuild weeks 5–\d+ fresh$/)
    fireEvent.click(confirm)
    expect(onRebuild).toHaveBeenCalledTimes(1)
    expect(onRebuild.mock.calls[0][1]).toBe(5)
    cleanup()
    render(<PlanShapeSheet config={config} weeks={weeks} currentWeekNum={4} todayIso="2026-06-22" onReshape={onReshape} onRebuild={onRebuild} onClose={() => {}} />)
    // Take the long run away entirely: an error, so the button stays disabled and says why.
    for (const wd of [1, 2, 3, 4, 5, 6, 7]) {
      fireEvent.click(screen.getByTestId(`shape-day-${wd}`))
      fireEvent.click(screen.getByTestId(wd === 1 ? 'shape-role-rest' : 'shape-role-run'))
    }
    expect(screen.getByTestId('shape-issues').textContent).toContain('Give the long run a weekday')
    expect((screen.getByTestId('shape-confirm') as HTMLButtonElement).disabled).toBe(true)
  })
})
