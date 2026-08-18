/**
 * Phase 4 (PRD-109-F3) — the health & energy-availability screening copy,
 * frozen in one registry so every clinical-adjacent string ships from a
 * single reviewed file.
 *
 * LANGUAGE CONTRACT: these strings INFORM and ROUTE — they name patterns
 * and next steps. They never diagnose, never attribute a condition, and
 * never tell an athlete what is wrong with them. Any edit to this file
 * goes through the designated sports-medicine reviewer before shipping.
 * (Evidence basis: IOC 2023 REDs consensus — screening-first, clinician-
 * led; van der Worp 2015 — previous injury is the strongest running-
 * injury risk factor.)
 */

export const SCREENING_COPY = {
  /** The caution advisory when any screen answer is a yes. */
  healthFlagTitle: 'Worth a professional look before ramping up',
  healthFlagDetail:
    'Something you shared in the health questions is a pattern worth reviewing with a clinician or sports dietitian before building training load. ' +
    'This plan has been made more conservative in the meantime: weekly growth is capped at 5%, and jump/impact-heavy strength work is left out. ' +
    'Training through it is usually fine — training past it is what this guards against.',

  /** Extra sentence when the flag includes bone-stress history. */
  boneStressDetail:
    'With a bone stress history, hill sprints and impact-heavy work stay out for the first six weeks and impact builds gradually — bone adapts, on its own schedule.',

  /** The critical advisory for a recent bone stress + marathon/ultra pick. */
  boneRecentUltraTitle: 'A recent bone stress injury and this distance are a risky pair',
  boneRecentUltraDetail:
    'A bone stress injury inside the last six months plus marathon-or-longer training volume is the highest-risk combination this app can see. ' +
    'Please review this goal with the clinician who managed the injury before starting — a later race or a shorter distance keeps the comeback honest.',
} as const

export type ScreeningCopyKey = keyof typeof SCREENING_COPY
