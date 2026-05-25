/**
 * Index at which the proactive daily insight should be spliced into the
 * (chronologically-ordered) turn list. It lands just before the first turn
 * newer than the insight, so a fresh daily update sits at the bottom of the
 * thread and later replies flow below it — a continuous conversation rather
 * than a card pinned to the top or bottom. Returns `turnTimestamps.length`
 * when the insight is newer than every turn (→ append at the bottom).
 */
export function proactiveInsightIndex(turnTimestamps: number[], insightTs: number): number {
  let i = 0
  while (i < turnTimestamps.length && turnTimestamps[i] <= insightTs) i++
  return i
}
