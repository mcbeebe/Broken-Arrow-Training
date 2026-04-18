import type { CoachAction, PlannedDay } from '../types'

/**
 * Parse ```proposal fenced code blocks from LLM output.
 * Returns the content with the block stripped + a structured CoachAction
 * of type 'propose_edit'. If the block is malformed, returns the original
 * content and action: null (graceful degradation).
 */
const PROPOSAL_BLOCK_RE = /```proposal\s*\n([\s\S]*?)\n```/

const ALLOWED_UPDATE_FIELDS: (keyof Omit<PlannedDay, 'day' | 'actual'>)[] = [
  'type', 'workout', 'detail', 'zone', 'route', 'time',
]

export function extractProposal(content: string): { content: string; action: CoachAction | null } {
  const match = content.match(PROPOSAL_BLOCK_RE)
  if (!match) return { content, action: null }

  const jsonStr = match[1].trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    return { content, action: null }
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

  const cleanContent = content.replace(PROPOSAL_BLOCK_RE, '').trim()

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
