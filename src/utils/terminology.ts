// Single source of truth for technical training-science terms.
//
// Every acronym shown to the athlete (CTL, ATL, TSB, ACWR, TRIMP, MIM, DOMS,
// EPOC, GAP, LTHR, VDOT) is defined here in plain English so the UI can
// (a) render a friendlier label by default and
// (b) explain the term on tap via <Term> from components/TermGlossary.

export type TermKey =
  | 'ctl'
  | 'atl'
  | 'tsb'
  | 'acwr'
  | 'trimp'
  | 'mim'
  | 'doms'
  | 'epoc'
  | 'gap'
  | 'lthr'
  | 'vdot'

export interface TermEntry {
  /** Plain-English label shown by default. */
  plain: string
  /** Technical acronym shown when the user opts in to technical names. */
  tech: string
  /** One-sentence plain-English definition shown in the glossary popover. */
  definition: string
  /** Optional second sentence for context (e.g. "Higher is better."). */
  hint?: string
}

export const TERMS: Record<TermKey, TermEntry> = {
  ctl: {
    plain: 'Fitness',
    tech: 'CTL',
    definition:
      'Your 42-day training base — how much load your body has absorbed over the last ~6 weeks.',
    hint: 'Slow to build, slow to lose.',
  },
  atl: {
    plain: 'Fatigue',
    tech: 'ATL',
    definition:
      'Your 7-day training load — how tired you should feel from recent work.',
    hint: 'Spikes after a hard week, drops after a rest day.',
  },
  tsb: {
    plain: 'Recovery Balance',
    tech: 'TSB',
    definition:
      'Fitness minus Fatigue. Positive means you are fresher than your fitness; negative means you are carrying fatigue.',
    hint: 'Target +5 to +25 on race day.',
  },
  acwr: {
    plain: 'Load Ramp',
    tech: 'ACWR',
    definition:
      'How fast you are ramping load — recent week vs. last month. 0.8–1.3 is the safe zone.',
    hint: 'Above 1.5 raises injury risk.',
  },
  trimp: {
    plain: 'Strain',
    tech: 'TRIMP',
    definition:
      'A single number that captures how hard a workout was, based on heart-rate intensity and duration.',
  },
  mim: {
    plain: 'Joint Impact',
    tech: 'MIM',
    definition:
      'How hard a sport is on your joints and muscles relative to running. Cycling ≈ 0.5×, downhill running > 1×.',
  },
  doms: {
    plain: 'Soreness',
    tech: 'DOMS',
    definition:
      'Delayed-onset muscle soreness — the 24–48h ache after hard descents or eccentric strength work.',
  },
  epoc: {
    plain: 'Recovery Cost',
    tech: 'EPOC',
    definition:
      'Excess post-exercise oxygen consumption — Garmin’s on-watch estimate of how much recovery a session costs.',
  },
  gap: {
    plain: 'Grade-adjusted pace',
    tech: 'GAP',
    definition:
      'Your pace normalized for hills. Tells you what your effort would be on flat ground.',
  },
  lthr: {
    plain: 'Threshold heart rate',
    tech: 'LTHR',
    definition:
      'The heart rate at your lactate threshold — roughly the hardest pace you can hold for ~45–60 minutes.',
  },
  vdot: {
    plain: 'Daniels race fitness',
    tech: 'VDOT',
    definition:
      'A single fitness number from a recent race, used to set training paces (Jack Daniels’ formula).',
  },
}

export function getTermLabel(key: TermKey, showTechnicalNames: boolean): string {
  const t = TERMS[key]
  return showTechnicalNames ? t.tech : t.plain
}
