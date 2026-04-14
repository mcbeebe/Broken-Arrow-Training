import mikePlan from './mike-18k-plan'
import jimPlan from './jim-11k-plan'
import loriPlan from './lori-11k-plan'
import joelPlan from './joel-18k-plan'
import type { TrainingPlan } from '../types'

export const plans: Record<string, TrainingPlan> = {
  mike: mikePlan,
  jim: jimPlan,
  lori: loriPlan,
  joel: joelPlan,
}

export { mikePlan, jimPlan, loriPlan, joelPlan }
