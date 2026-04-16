/**
 * Training methodology content — single source of truth for the Method
 * tab and the Coach context snapshot. When the athlete asks "why is
 * Week 5 light?" or "why am I using poles?", the coach should be able
 * to answer from this same material.
 *
 * Each section has:
 *   - `summary`: plain-prose 1-2 sentence description, used in the coach
 *     context (token-efficient). No markup, no line breaks in sentences.
 *   - `bullets` (optional): extra structured facts per section.
 *
 * Keep the summary prose self-contained so it reads well without the UI.
 */

export interface MethodologySection {
  id: string
  title: string
  summary: string
  bullets?: string[]
}

export const METHODOLOGY_INTRO =
  'This 10-week plan is built on proven endurance training principles from ' +
  'Uphill Athlete, TrainingPeaks methodology, and sport-specific research ' +
  'for skyrunning and vertical kilometer racing.'

export const METHODOLOGY: MethodologySection[] = [
  {
    id: 'periodization',
    title: 'Periodization',
    summary:
      'Linear periodization adapted for trail racing: volume and intensity ' +
      'increase progressively, with a deliberate recovery week (Week 5) and ' +
      'a two-week taper (Weeks 9-10) before race day. Based on Bompa\'s ' +
      'periodization model and House & Johnston\'s Training for the Uphill ' +
      'Athlete (2019). Phases: Base (Wk 1-3), Build (Wk 4-6), Peak (Wk 7-8), ' +
      'Taper (Wk 9-10).',
  },
  {
    id: 'polarized',
    title: '80/20 Polarized Training',
    summary:
      'Roughly 80% of training volume lives in Zone 1-2 (easy/aerobic), ~20% ' +
      'in Zone 3-4. Seiler\'s research shows polarized distributions (lots ' +
      'of easy + some very hard, little moderate) produce greater endurance ' +
      'gains than threshold-heavy programs. Easy runs, long runs, and ' +
      'cross-training are Z1-2; quality sessions (hill repeats, tempo, ' +
      'race-pace) are Z3-4.',
  },
  {
    id: 'specificity',
    title: 'Specificity to the Mountain',
    summary:
      'Broken Arrow 18K is ~3,800 ft of climbing on technical trail at ' +
      '6,200-9,000 ft altitude. The plan progressively stacks race demands: ' +
      'base aerobic in Wk 1-3 (760-912 ft long runs), race-specific vert + ' +
      'eccentric strength + poles in Wk 4-6 (1,528-2,000 ft), peak vert in ' +
      'Wk 7-8 (2,200-2,500+ ft on Olympic Peninsula), taper in Wk 9-10.',
  },
  {
    id: 'eccentric-strength',
    title: 'Eccentric Strength',
    summary:
      'Gym work emphasizes eccentric (lowering) movements — slow squats, ' +
      'Nordic curls, eccentric calf drops, step-downs — to prep the quads ' +
      'for the Shirley Canyon descent. Eccentric training produces ' +
      'structural muscle adaptation that reduces downhill muscle damage ' +
      'and improves downhill running economy.',
  },
  {
    id: 'poles',
    title: 'Trekking Poles',
    summary:
      'Poles are introduced in Week 4 to allow 6 weeks of practice before ' +
      'race day. Research shows poles reduce lower-limb muscle damage by ' +
      '15-20% on steep climbs and improve climbing economy by redistributing ' +
      'effort to the upper body. Key skill: consistent plant rhythm — ' +
      'automatic through repetition.',
  },
  {
    id: 'hr-zones',
    title: 'Heart Rate Zone Training',
    summary:
      'Pace is unreliable on trails; HR is a consistent measure of internal ' +
      'effort regardless of terrain. The plan uses Uphill Athlete zones ' +
      '(Z1 108-128, Z2 128-148, Z3 148-167, Z4 167-177 for Mike). At race ' +
      'altitude (6,200-9,000 ft), HR runs 5-10 bpm higher for the same ' +
      'effort — on race day, pace by perceived effort, not HR targets.',
  },
  {
    id: 'recovery-week',
    title: 'The Recovery Week (Week 5)',
    summary:
      'Volume drops ~27% in Week 5. This is when supercompensation happens: ' +
      'the body absorbs the Wk 1-4 stress and emerges stronger. Skipping ' +
      'recovery leads to non-functional overreaching (elevated RHR, poor ' +
      'sleep, persistent soreness, declining motivation). Lower volume is ' +
      'the work, not the absence of it.',
  },
  {
    id: 'taper',
    title: 'Taper (Weeks 9-10)',
    summary:
      'Volume drops 40-60% while intensity is maintained. Bosquet et al. ' +
      '(2007) meta-analysis: optimal 2-week exponential taper yields ~3% ' +
      'performance gain. Expect to feel restless or sluggish — this is ' +
      'normal consolidation. You cannot gain fitness in the final 2 weeks; ' +
      'you can absolutely lose it by training too hard.',
  },
]

/** One compact paragraph summarizing the full methodology — suitable
 *  for inclusion in the coach system prompt. ~1200 chars, well under
 *  the per-turn context budget. */
export function methodologyForCoach(): string {
  const lines: string[] = [METHODOLOGY_INTRO]
  for (const s of METHODOLOGY) {
    lines.push(`- ${s.title}: ${s.summary}`)
  }
  return lines.join('\n')
}
