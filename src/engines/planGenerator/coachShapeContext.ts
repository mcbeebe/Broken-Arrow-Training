import type { CoachWeekShapeContext } from '../../types'
import type { OnboardingConfig } from '../../hooks/useOnboarding'
import { DAY_ROLES, describeShape, effectiveShape, roleLabel, type WeekShape } from './weekShape'
import { defaultWeekShapeFor } from './shapeDefaults'
import { planKindOf } from '../benchmark/log'

/**
 * The week's layout as the coach should see it: what is in force this
 * week (the athlete's own layout, or the engine's), the plan's current
 * and last week, and the roles this plan family offers — so a reshape
 * the coach proposes speaks the athlete's weekdays and the app's roles.
 * Null when the plan cannot be laid out yet.
 */
export function buildCoachWeekShapeContext(
  config: OnboardingConfig,
  currentWeekNum: number,
  lastWeekNum: number,
): CoachWeekShapeContext | null {
  const plan = planKindOf(config)
  const own = effectiveShape(config, currentWeekNum)
  const shape: WeekShape | null = own ?? defaultWeekShapeFor(config)
  if (!shape) return null
  return {
    current: describeShape(shape, plan),
    shape,
    athleteShaped: !!own,
    currentWeekNum,
    lastWeekNum,
    roles: DAY_ROLES.map(role => ({ role, label: roleLabel(role, plan) })),
  }
}
