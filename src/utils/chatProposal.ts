import type { CoachAction, PlannedDay } from '../types'

/**
 * Parse ```proposal fenced code blocks from LLM output.
 * Returns the content with the block stripped + a structured CoachAction
 * of type 'propose_edit'. If the block is malformed, returns the original
 * content and action: null (graceful degradation).
 */
// Match proposal blocks with various backtick counts (1-4) and optional whitespace.
// The LLM sometimes uses single backticks instead of triple.
const PROPOSAL_BLOCK_RE = /`{1,4}\s*proposal\s*\n([\s\S]*?)\n`{1,4}/

// Fallback: proposal block with opening backticks but missing closing (truncated response)
const PROPOSAL_BLOCK_OPEN_RE = /`{1,4}\s*proposal\s*\n([\s\S]*)/

// Also try to match a standalone JSON object with weekNum/dayIndex/updates
// at the end of the message (fallback when the LLM doesn't use a fenced block)
const PROPOSAL_JSON_RE = /\n\s*(\{[\s\S]*?"weekNum"\s*:\s*\d[\s\S]*?"updates"\s*:[\s\S]*?\})\s*$/

const ALLOWED_UPDATE_FIELDS: (keyof Omit<PlannedDay, 'day' | 'actual'>)[] = [
  'type', 'workout', 'detail', 'zone', 'route', 'time',
]

export function extractProposal(content: string): { content: string; action: CoachAction | null } {
  let match = content.match(PROPOSAL_BLOCK_RE)
  let matchedFull = match?.[0]
  let jsonStr = match?.[1]?.trim()

  // Fallback: try to find a bare JSON object with proposal fields at the end
  if (!jsonStr) {
    match = content.match(PROPOSAL_JSON_RE)
    matchedFull = match?.[0]
    jsonStr = match?.[1]?.trim()
  }

  // Fallback: proposal block with opening backticks but no closing (truncated)
  if (!jsonStr) {
    match = content.match(PROPOSAL_BLOCK_OPEN_RE)
    matchedFull = match?.[0]
    jsonStr = match?.[1]?.trim()
  }

  if (!jsonStr || !matchedFull) return { content, action: null }
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    // Try to repair truncated JSON by closing open braces
    const repaired = repairJSON(jsonStr)
    if (repaired) {
      try { parsed = JSON.parse(repaired) } catch { /* give up */ }
    }
    if (!parsed) return { content, action: null }
  }

  if (!isValidProposal(parsed)) {
    return { content, action: null }
  }

  const p = parsed as {
    weekNum: number
    dayIndex: number
    updates: Record<string, unknown>
    rationale?: string
  }

  // Keep only allowed fields in updates
  const cleanUpdates: Partial<Omit<PlannedDay, 'day' | 'actual'>> = {}
  for (const key of ALLOWED_UPDATE_FIELDS) {
    if (key in p.updates && typeof p.updates[key] === 'string') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cleanUpdates as any)[key] = p.updates[key]
    }
  }
  if (Object.keys(cleanUpdates).length === 0) {
    return { content, action: null }
  }

  const cleanContent = content.replace(matchedFull, '').trim()

  const summary = summarizeUpdates(cleanUpdates)
  const action: CoachAction = {
    type: 'propose_edit',
    label: 'Apply this change',
    detail: summary,
    proposedEdit: {
      weekNum: p.weekNum,
      dayIndex: p.dayIndex,
      updates: cleanUpdates,
      rationale: p.rationale,
    },
  }

  return { content: cleanContent, action }
}

function repairJSON(s: string): string | null {
  // Trim trailing backticks/whitespace the LLM might have left
  let cleaned = s.replace(/`+\s*$/, '').trim()
  // Truncate at last complete value (before a trailing comma or truncated string)
  cleaned = cleaned.replace(/,\s*"[^"]*$/, '')    // trailing incomplete key
  cleaned = cleaned.replace(/,\s*$/, '')           // trailing comma
  cleaned = cleaned.replace(/:\s*"[^"]*$/, ': ""') // truncated string value
  // Count braces and close any that are open
  let braces = 0
  for (const c of cleaned) {
    if (c === '{') braces++
    if (c === '}') braces--
  }
  if (braces <= 0) return null
  cleaned += '}'.repeat(braces)
  return cleaned
}

function isValidProposal(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  if (typeof o.weekNum !== 'number' || o.weekNum < 1 || o.weekNum > 20) return false
  if (typeof o.dayIndex !== 'number' || o.dayIndex < 0 || o.dayIndex > 6) return false
  if (!o.updates || typeof o.updates !== 'object') return false
  return true
}

function summarizeUpdates(updates: Partial<Omit<PlannedDay, 'day' | 'actual'>>): string {
  const parts: string[] = []
  if (updates.workout) parts.push(updates.workout)
  if (updates.detail) parts.push(updates.detail.length > 80 ? updates.detail.slice(0, 77) + '…' : updates.detail)
  if (parts.length === 0 && updates.type) parts.push(`Change type to ${updates.type}`)
  return parts.join(' · ')
}
