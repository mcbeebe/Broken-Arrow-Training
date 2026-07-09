import type { SeasonBlockKind } from '../types'

/** Season-block chip colors + labels, shared by the SeasonPanel timeline
 *  (info tab) and the plan view's season strip so blocks read the same
 *  everywhere. */
export const BLOCK_STYLE: Record<SeasonBlockKind, { bg: string; label: string }> = {
  BUILD: { bg: 'bg-teal-600', label: 'Build' },
  TAPER: { bg: 'bg-indigo-500', label: 'Taper' },
  RACE: { bg: 'bg-slate-900', label: 'Race' },
  RECOVER: { bg: 'bg-emerald-600', label: 'Recover' },
  BRIDGE: { bg: 'bg-amber-600', label: 'Bridge' },
}
