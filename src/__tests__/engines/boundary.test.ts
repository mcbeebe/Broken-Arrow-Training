// PLAN-vs-CODE DRIFT (PR-01, BA_Terrain_Descent_IT_Project_Plan_v1.0.md §PR-01 AC2):
// The plan asserts `import { ATEScore, MIM_MATRIX } from '...'`, but in the live code
// `ATEScore` does not exist (the ATE composite is computed by `calculateReadiness`)
// and `MIM_MATRIX` is module-private in `src/utils/trimp.ts`. We substitute two
// real exports with the same structural intent (verify engine barrels re-export
// the source-of-truth symbols byte-identically). If a future PR (e.g. PR-14)
// surfaces the same drift, follow this pattern OR patch the plan doc.
import { describe, it, expect } from 'vitest'

import { calculateReadiness as readinessFromUtils } from '../../utils/readiness'
import { calculateBanisterTRIMP as trimpFromUtils } from '../../utils/trimp'

import { calculateReadiness as readinessFromEngine } from '../../engines/readiness'
import { calculateBanisterTRIMP as trimpFromEngine } from '../../engines/mim'

import * as engines from '../../engines'
import * as terrain from '../../engines/terrain'
import * as descent from '../../engines/descent'
import * as altitude from '../../engines/altitude'

describe('engines module boundary (PR-01)', () => {
  it('readiness barrel re-exports the same symbol as src/utils/readiness', () => {
    expect(readinessFromEngine).toBe(readinessFromUtils)
  })

  it('mim barrel re-exports the same symbol as src/utils/trimp', () => {
    expect(trimpFromEngine).toBe(trimpFromUtils)
  })

  it('top-level engines namespace exposes each engine sub-module', () => {
    expect(engines).toHaveProperty('readiness')
    expect(engines).toHaveProperty('mim')
    expect(engines).toHaveProperty('terrain')
    expect(engines).toHaveProperty('descent')
    expect(engines).toHaveProperty('altitude')
  })

  it('terrain, descent, altitude barrels load without runtime error', () => {
    expect(terrain).toBeDefined()
    expect(descent).toBeDefined()
    expect(altitude).toBeDefined()
  })
})
