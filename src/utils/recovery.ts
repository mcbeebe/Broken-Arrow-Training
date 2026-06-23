/**
 * R5 — post-race recovery formulas (fact-checked, v1.3): one day off running per
 * 10 miles raced (per 10 km for high-vert races), plus one extra hour of sleep
 * per night for a number of nights ≈ miles / 10 (at least 10 nights after a
 * 100-miler), then a reverse-taper rebuild (volume back before speed). The coach
 * also frames sustained low readiness (overreaching / overtraining) as a deload.
 */

export interface PostRaceRecovery {
  /** Days off running (1 per 10 mi; 1 per 10 km ≈ 6.2 mi when high-vert). */
  restDays: number
  /** Extra hours of sleep per night during the recovery window. */
  sleepExtraHrPerNight: number
  /** Number of nights to add the extra sleep (≈ miles / 10, ≥10 after a 100). */
  sleepExtraNights: number
}

export function postRaceRecovery(raceMiles: number, opts?: { highVert?: boolean }): PostRaceRecovery {
  const perRestMi = opts?.highVert ? 6.2 : 10
  const restDays = Math.max(1, Math.round(raceMiles / perRestMi))
  let sleepExtraNights = Math.max(1, Math.round(raceMiles / 10))
  if (raceMiles >= 100) sleepExtraNights = Math.max(10, sleepExtraNights)
  return { restDays, sleepExtraHrPerNight: 1, sleepExtraNights }
}

/**
 * One-line recovery guidance for the coach. Null for short races (5K/10K) that
 * need no structured post-race recovery block.
 */
export function recoverySummaryLine(raceMiles: number): string | null {
  if (raceMiles < 13) return null
  const r = postRaceRecovery(raceMiles)
  return (
    `after the race take about ${r.restDays} day${r.restDays === 1 ? '' : 's'} off running and add an ` +
    `extra hour of sleep for ~${r.sleepExtraNights} nights, then rebuild in reverse taper (volume back ` +
    `before speed). If readiness trends into overreaching or overtraining (State C/D, rising resting HR, ` +
    `falling HRV/sleep), back off and deload rather than pushing through.`
  )
}
