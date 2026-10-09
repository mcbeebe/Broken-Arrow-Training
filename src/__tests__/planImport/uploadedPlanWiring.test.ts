/**
 * Initiative 004, D1: the wiring that keeps an uploaded plan as written.
 *
 * The component and engine tests prove each gate works when it is given the
 * flag. The real App only reaches most of them with a wearable connected (the
 * coach snapshot is null without one), so no boot test can see them. This
 * reads the source instead, as morningStaysClear.test.ts does, so dropping a
 * gate during a refactor fails here, by name, instead of quietly letting the
 * app reshape, rebuild or recalibrate an athlete's own plan.
 */
import { describe, it, expect } from 'vitest'

function source(path: string): string {
  const all = import.meta.glob(['../../App.tsx', '../../hooks/useOnboarding.ts', '../../components/CoachLetter.tsx', '../../components/Settings.tsx', '../../components/Onboarding.tsx'], {
    query: '?raw', import: 'default', eager: true,
  }) as Record<string, string>
  const key = Object.keys(all).find(k => k.endsWith(path))
  if (!key) throw new Error(`${path} not loaded`)
  return all[key]
}

const APP = source('App.tsx')

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

describe('App never changes an uploaded plan behind the athlete', () => {
  const gates: [string, string, number][] = [
    ['no rebuild from the Plan view or the weekly recap (requestRedo deletes the plan)', 'onRebuildPlan={importedMode ? undefined : onboarding.requestRedo}', 2],
    ['no rebuild from the Monday review', 'onRebuild={importedMode ? undefined :', 1],
    ['no "Shape my week"', 'onShapeWeek={importedMode ? undefined :', 1],
    ['no reshape sheet', 'planShapeOpen && onboarding.config && !importedMode', 1],
    ['no "Adjust in the sheet" from a coach reshape', 'onAdjustReshape={importedMode ? undefined :', 1],
    ['no weak-station reweighting', 'onReweightPlan={importedMode ? undefined :', 1],
    ['no autopilot changes', 'enabled: !importedMode', 1],
    ['no Level Up, and the tools say the autopilot is off', 'uploadedPlan={importedMode}', 1],
    ['the Monday review and weekly recap change nothing', 'ownPlan: importedMode', 2],
    ['no pace recalibration', 'assessRecalibration(importedMode ? [] : weeks', 1],
    ['no benchmark re-anchor', 'importedMode ? [] : weeks, todayDateString(), maxHROverride.maxHR', 1],
    ['the reshape card is locked without running the generator', 'if (importedMode) return { ...UPLOADED_PLAN_SHAPE_CONTEXT', 1],
    ['no generated-plan injury ramp ("harder from Week 3")', 'injuryStatus={importedMode ? undefined : onboarding.config?.injuryStatus}', 1],
  ]
  for (const [what, needle, times] of gates) {
    it(what, () => {
      expect(count(APP, needle), `App.tsx no longer contains: ${needle}`).toBe(times)
    })
  }

  it('refuses whole-week proposals when approved, from an insight, and when declined', () => {
    expect(count(APP, 'importedMode && refusedOnUploadedPlan(action)')).toBe(2)
    expect(count(APP, 'importedMode && action && refusedOnUploadedPlan(action)')).toBe(1)
    expect(count(APP, 'UPLOADED_PLAN_HANDOFF')).toBeGreaterThanOrEqual(4) // import + three paths
  })
})

describe('App never shows a stored season for an uploaded plan', () => {
  it('never re-seeds the stored calendar for one, which would drop the races added in the Season panel', () => {
    expect(count(APP, 'importedMode ? undefined : onboarding.config?.additionalRaces')).toBe(1)
    expect(count(APP, 'importedMode ? undefined : onboarding.config?.completedAt')).toBe(1)
    // Declared before the season hook reads it.
    expect(APP.indexOf('const importedMode = isImportedPlan(onboarding.config)'))
      .toBeLessThan(APP.indexOf('const seasonState = useSeason('))
  })

  it('passes no season to Today, the Plan view or Settings', () => {
    expect(count(APP, 'season={importedMode ? null : seasonState.season}')).toBe(3)
    expect(count(APP, 'onOpenSeason={importedMode ? undefined :')).toBe(1)
    expect(count(APP, 'primaryRace={importedMode ? null :')).toBe(1)
    expect(count(APP, '{!importedMode && <SeasonPanel')).toBe(1)
  })
})

describe('the coach is told it is the athlete\'s own plan', () => {
  const snapshotGates = [
    "snap.planSource = 'imported'",
    'delete snap.methodology',
    'snap.planBlocks = null',
    'importedMode ? null : buildSeasonContext(',
    'importedMode ? null : realignmentContextForWeeks(',
    'onboarding.config?.selectedMethodId && !importedMode',
    'if (onboarding.config && !importedMode) {\n      const shapeContext = buildCoachWeekShapeContext(',
  ]
  for (const needle of snapshotGates) {
    it(`snapshot: ${needle.split('\n')[0]}`, () => {
      expect(count(APP, needle), `App.tsx no longer contains: ${needle}`).toBe(1)
    })
  }

  it('the welcome letter has no season and knows the plan source', () => {
    const letter = source('CoachLetter.tsx')
    expect(letter).toContain('const uploaded = isImportedPlan(config)')
    expect(letter).toContain("planSource: 'imported'")
  })
})

describe('the onboarding hook refuses to reshape an uploaded plan', () => {
  const hook = source('hooks/useOnboarding.ts')

  it('in place', () => {
    expect(hook).toContain('if (!prev || isImportedPlan(prev)) return prev')
  })

  it('or by rebuilding, which would clear the athlete\'s day edits', () => {
    expect(hook).toContain('if (!config || isImportedPlan(config)) return')
  })
})

describe('saving an uploaded plan (PR 5)', () => {
  it('Settings saves it through importPlan, and opens Today only when it landed', () => {
    expect(APP).toContain('const ok = onboarding.importPlan(cfg)\n            if (ok) setView(\'today\')')
  })

  it('importPlan backs up the outgoing plan before it saves', () => {
    const hook = source('hooks/useOnboarding.ts')
    const body = hook.slice(hook.indexOf('const importPlan = useCallback'))
    expect(body.indexOf("captureBackup(athleteId, 'before upload')")).toBeGreaterThan(-1)
    expect(body.indexOf("captureBackup(athleteId, 'before upload')")).toBeLessThan(body.indexOf('save(cfg)'))
  })

  it('the way in is the owner\'s alone during the beta (D8)', () => {
    expect(source('components/Settings.tsx')).toContain("const canImportPlan = planImportOpenTo(athleteId) && !!onboardingConfig && !!onUseImportedPlan")
    // Both ways in ask the one gate, so opening uploads up is one change.
    expect(source('components/Onboarding.tsx')).toContain('const canImport = planImportOpenTo(athleteId)')
  })
})
