import type { SectionId } from '../types'

/**
 * Hideable sections, grouped by surface, in customer language. Order
 * matches how they appear on each screen. Every id here must control a
 * card (todaySnapshotReadiness.test.tsx checks the Today ones) — three
 * Today switches once sat in Settings with nothing behind them.
 */
export const SECTION_GROUPS: { group: string; items: { id: SectionId; label: string }[] }[] = [
  {
    group: 'Dashboard',
    items: [
      { id: 'dash.tabReadiness', label: 'Readiness tab' },
      { id: 'dash.tabPerformance', label: 'Performance tab' },
      { id: 'dash.descentCapacity', label: 'Descent capacity' },
      { id: 'dash.volume', label: 'Volume chart' },
      { id: 'dash.performanceChart', label: 'Fitness & fatigue trend' },
      { id: 'dash.trimpBreakdown', label: 'Training-load breakdown' },
      { id: 'dash.strengthProgress', label: 'Strength progress' },
    ],
  },
  {
    group: 'Summary',
    items: [
      { id: 'summary.whatChanged', label: 'Your last 7 days' },
      { id: 'summary.trainingLoad', label: '7-day training load' },
      { id: 'summary.perfSnapshot', label: 'Performance snapshot' },
      { id: 'summary.readinessTrend', label: '7-day readiness trend' },
    ],
  },
]
