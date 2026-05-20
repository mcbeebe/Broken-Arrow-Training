// Small text helpers shared between the full CoachInsightCard (Coach tab)
// and the Summary-tab CoachInsightPreview. Kept side-effect-free so both
// mount points display the same trigger pill / 1-sentence preview.

const TRIGGERED_BY_RE = /^[*_\s]*triggered by:\s*([^\n]+?)[*_\s]*$/im

export interface TriggerExtract {
  signal: string | null
  body: string
}

/** Pull the "Triggered by:" prefix from a daily-insight body and return
 *  the signal + cleaned body. Returns `{ signal: null, body: text }` when
 *  the prefix is absent. */
export function extractTriggerSignal(text: string): TriggerExtract {
  const m = text.match(TRIGGERED_BY_RE)
  if (!m) return { signal: null, body: text }
  const start = text.indexOf(m[0])
  const end = start + m[0].length
  let body = text.slice(0, start) + text.slice(end)
  body = body.replace(/^\s*\n/, '')
  return { signal: m[1].trim(), body: body.trim() }
}

/** Single-sentence preview (≤ ~100 chars) of an insight body — used on
 *  Summary to surface enough of the coach's read that the athlete can
 *  decide whether to open the full message in the Coach tab. */
export function firstSentencePreview(text: string, maxChars = 100): string {
  const stripped = text.replace(/[*_`#>]/g, '').trim()
  const sentence = stripped.split(/(?<=[.!?])\s/)[0] || stripped
  if (sentence.length <= maxChars) return sentence
  return sentence.slice(0, maxChars - 1).replace(/\s+\S*$/, '') + '…'
}
