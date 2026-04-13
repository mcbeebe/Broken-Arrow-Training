import mikePlan from './mike-18k-plan'
import jimPlan from './jim-11k-plan'
import loriPlan from './lori-11k-plan'
import type { TrainingPlan } from '../types'

export const plans: Record<string, TrainingPlan> = {
  mike: mikePlan,
  jim: jimPlan,
  lori: loriPlan,
}

export { mikePlan, jimPlan, loriPlan }
