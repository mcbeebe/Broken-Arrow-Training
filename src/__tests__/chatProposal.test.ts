import { describe, it, expect } from 'vitest'
import { extractProposal, summarizeOp } from '../utils/chatProposal'

describe('extractProposal — legacy single-day shape', () => {
  it('parses a legacy weekNum/dayIndex/updates block and mirrors it', () => {
    const content = 'Swap Monday to mobility.\n```proposal\n{"weekNum":1,"dayIndex":0,"updates":{"type":"cross","workout":"Mobility"},"rationale":"RED readiness"}\n```'
    const { action, content: clean } = extractProposal(content)
    expect(action?.type).toBe('propose_edit')
    expect(action?.proposedEdit?.ops).toHaveLength(1)
    expect(action?.proposedEdit?.ops[0].op.kind).toBe('updateDay')
    // legacy mirror populated for single updateDay
    expect(action?.proposedEdit?.weekNum).toBe(1)
    expect(action?.proposedEdit?.dayIndex).toBe(0)
    expect(clean).not.toContain('proposal')
  })
})

describe('extractProposal — batch ops shape', () => {
  it('parses a multi-op batch (delete + add + updateWeek)', () => {
    const content = 'Dropping the race and restructuring.\n```proposal\n' + JSON.stringify({
      ops: [
        { op: { kind: 'deleteDay', weekNum: 8, dayIndex: 5 }, rationale: 'not racing' },
        { op: { kind: 'addDay', weekNum: 8, atIndex: 5, day: { day: 'Sat 6/6', type: 'long', workout: 'Taper long run', detail: '60 min Z2', zone: 'Z2', route: 'Trail', time: '60 min' } } },
        { op: { kind: 'updateWeek', weekNum: 9, updates: { focus: 'Taper' } } },
      ],
      rationale: 'replace dropped 10K + ease into race',
    }) + '\n```'
    const { action } = extractProposal(content)
    expect(action?.proposedEdit?.ops).toHaveLength(3)
    expect(action?.proposedEdit?.ops.map(o => o.op.kind)).toEqual(['deleteDay', 'addDay', 'updateWeek'])
    // no legacy mirror for a multi-op batch
    expect(action?.proposedEdit?.weekNum).toBeUndefined()
    expect(action?.label).toBe('Apply all changes')
  })

  it('rejects the WHOLE batch atomically if any op is invalid', () => {
    const content = '```proposal\n' + JSON.stringify({
      ops: [
        { op: { kind: 'deleteDay', weekNum: 8, dayIndex: 5 } },
        { op: { kind: 'addDay', weekNum: 8, atIndex: 5, day: { type: 'run', workout: 'No label' } } }, // missing required day label
      ],
    }) + '\n```'
    const { action } = extractProposal(content)
    expect(action).toBeNull()
  })

  it('rejects an unknown op kind', () => {
    const content = '```proposal\n{"ops":[{"op":{"kind":"nukePlan"}}]}\n```'
    expect(extractProposal(content).action).toBeNull()
  })

  it('drops unknown/invalid day fields but keeps valid ones', () => {
    const content = '```proposal\n{"ops":[{"op":{"kind":"updateDay","weekNum":2,"dayIndex":3,"updates":{"workout":"Tempo","bogus":"x","type":"notatype"}}}]}\n```'
    const op = extractProposal(content).action?.proposedEdit?.ops[0].op
    expect(op?.kind).toBe('updateDay')
    if (op?.kind === 'updateDay') {
      expect(op.updates.workout).toBe('Tempo')
      expect('bogus' in op.updates).toBe(false)
      expect(op.updates.type).toBeUndefined()  // invalid enum dropped
    }
  })
})

describe('summarizeOp', () => {
  it('summarizes each op kind', () => {
    expect(summarizeOp({ kind: 'deleteWeek', weekNum: 3 })).toContain('Remove week 3')
    expect(summarizeOp({ kind: 'addDay', weekNum: 4, atIndex: 0, day: { day: 'Mon 1/1', type: 'run', workout: 'Easy', detail: '—', zone: '—', route: '—', time: '—' } })).toContain('add Mon 1/1')
    expect(summarizeOp({ kind: 'updateWeek', weekNum: 5, updates: { focus: 'Recovery' } })).toContain('Recovery')
  })
})
