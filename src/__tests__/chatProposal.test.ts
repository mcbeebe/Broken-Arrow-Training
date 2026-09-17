import { describe, it, expect } from 'vitest'
import { extractProposal, summarizeOp, summarizeBenchmark, summarizeReshape } from '../utils/chatProposal'

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

describe('extractProposal — benchmarks shape', () => {
  it('parses a benchmark block into a propose_benchmark action, times as seconds', () => {
    const content = 'Nice run. Recording it.\n```proposal\n' + JSON.stringify({
      benchmarks: [{ kind: 'race_5k', value: '21:40', dateIso: '2026-09-16', protocol: 'parkrun', rationale: 'fresh anchor' }],
      rationale: 'Recording yesterday\'s 5K',
    }) + '\n```'
    const { action, content: clean } = extractProposal(content)
    expect(action?.type).toBe('propose_benchmark')
    expect(action?.label).toBe('Save benchmark')
    expect(action?.proposedBenchmarks?.entries).toEqual([
      { kind: 'race_5k', value: 21 * 60 + 40, unit: 'seconds', dateIso: '2026-09-16', protocol: 'parkrun', rationale: 'fresh anchor' },
    ])
    expect(action?.proposedBenchmarks?.rationale).toBe('Recording yesterday\'s 5K')
    expect(action?.detail).toBe('5K 21:40 · 2026-09-16 · parkrun')
    expect(clean).toBe('Nice run. Recording it.')
  })

  it('a preset takes its own unit whatever the model wrote; counts parse from numbers or strings', () => {
    const content = '```proposal\n' + JSON.stringify({
      benchmarks: [
        { kind: 'wall_balls_unbroken', value: '42', unit: 'seconds', dateIso: '2026-09-17' },
        { kind: 'goblet_squat_8rm', value: 55, dateIso: '2026-09-17' },
      ],
    }) + '\n```'
    const entries = extractProposal(content).action?.proposedBenchmarks?.entries
    expect(entries?.map(e => [e.kind, e.value, e.unit])).toEqual([
      ['wall_balls_unbroken', 42, 'reps'],
      ['goblet_squat_8rm', 55, 'lb'],
    ])
  })

  it('a custom benchmark needs a label and keeps its own unit', () => {
    const ok = extractProposal('```proposal\n{"benchmarks":[{"kind":"other","label":"Murph","value":"47:10","unit":"seconds","dateIso":"2026-09-17"}]}\n```').action
    expect(ok?.proposedBenchmarks?.entries[0]).toMatchObject({ kind: 'other', label: 'Murph', value: 47 * 60 + 10, unit: 'seconds' })
    const noLabel = extractProposal('```proposal\n{"benchmarks":[{"kind":"other","value":"47:10","dateIso":"2026-09-17"}]}\n```').action
    expect(noLabel).toBeNull()
  })

  it('rejects the whole block for an implausible value, an unknown kind, or a bad date — never a partial save', () => {
    const implausible = '```proposal\n{"benchmarks":[{"kind":"race_5k","value":"2:10","dateIso":"2026-09-17"}]}\n```'
    expect(extractProposal(implausible).action).toBeNull()
    const unknown = '```proposal\n{"benchmarks":[{"kind":"deadlift_1rm","value":300,"dateIso":"2026-09-17"}]}\n```'
    expect(extractProposal(unknown).action).toBeNull()
    const badDate = '```proposal\n{"benchmarks":[{"kind":"race_5k","value":"21:40","dateIso":"yesterday"}]}\n```'
    expect(extractProposal(badDate).action).toBeNull()
    const oneBad = '```proposal\n' + JSON.stringify({ benchmarks: [
      { kind: 'race_5k', value: '21:40', dateIso: '2026-09-17' },
      { kind: 'race_5k', value: '2:10', dateIso: '2026-09-17' },
    ] }) + '\n```'
    expect(extractProposal(oneBad).action).toBeNull()
  })

  it('benchmarks can ride along with plan ops in one block, on a propose_edit action', () => {
    const content = '```proposal\n' + JSON.stringify({
      ops: [{ op: { kind: 'updateDay', weekNum: 6, dayIndex: 2, updates: { workout: 'Easy 40 min' } } }],
      benchmarks: [{ kind: 'race_5k', value: '21:40', dateIso: '2026-09-16' }],
    }) + '\n```'
    const { action } = extractProposal(content)
    expect(action?.type).toBe('propose_edit')
    expect(action?.proposedEdit?.ops).toHaveLength(1)
    expect(action?.proposedBenchmarks?.entries).toHaveLength(1)
  })

  it('summarizeBenchmark names the kind or the custom label', () => {
    expect(summarizeBenchmark({ kind: 'lthr', value: 168, unit: 'bpm', dateIso: '2026-09-17' })).toBe('Threshold HR 168 bpm · 2026-09-17')
    expect(summarizeBenchmark({ kind: 'other', label: 'Dead hang', value: 70, unit: 'seconds', dateIso: '2026-09-17', protocol: 'rested' })).toBe('Dead hang 1:10 · 2026-09-17 · rested')
  })
})

describe('extractProposal — reshape shape', () => {
  const shapeJson = { mon: 'rest', tue: 'strength', wed: 'run', thu: 'quality', fri: 'rest', sat: 'long', sun: 'cross' }

  it('parses a reshape block into a propose_reshape action with the seven days by name', () => {
    const content = 'Long run to Saturday, as asked.\n```proposal\n' + JSON.stringify({ reshape: { shape: shapeJson, fromWeek: 7, mode: 'in_place' }, rationale: 'Sunday is family day' }) + '\n```'
    const { action, content: clean } = extractProposal(content)
    expect(action?.type).toBe('propose_reshape')
    expect(action?.proposedReshape).toEqual({
      shape: { 1: 'rest', 2: 'strength', 3: 'run', 4: 'quality', 5: 'rest', 6: 'long', 7: 'cross' },
      fromWeek: 7, mode: 'in_place', rationale: 'Sunday is family day',
    })
    expect(clean).toBe('Long run to Saturday, as asked.')
  })

  it('accepts numeric weekday keys and mixed case; rejects a missing day, an unknown role, a bad week or mode', () => {
    const ok = extractProposal('```proposal\n' + JSON.stringify({ reshape: { shape: { '1': 'Rest', '2': 'QUALITY', '3': 'run', '4': 'strength', '5': 'run', '6': 'long', '7': 'rest' } } }) + '\n```').action
    expect(ok?.proposedReshape?.shape[2]).toBe('quality')
    expect(ok?.proposedReshape?.fromWeek).toBeUndefined()
    const missing = { ...shapeJson } as Record<string, string>; delete missing.sun
    expect(extractProposal('```proposal\n' + JSON.stringify({ reshape: { shape: missing } }) + '\n```').action).toBeNull()
    expect(extractProposal('```proposal\n' + JSON.stringify({ reshape: { shape: { ...shapeJson, tue: 'yoga' } } }) + '\n```').action).toBeNull()
    expect(extractProposal('```proposal\n' + JSON.stringify({ reshape: { shape: shapeJson, fromWeek: 0 } }) + '\n```').action).toBeNull()
    expect(extractProposal('```proposal\n' + JSON.stringify({ reshape: { shape: shapeJson, mode: 'later' } }) + '\n```').action).toBeNull()
  })

  it('summarizeReshape names each change against the layout in force', () => {
    const current = { 1: 'rest', 2: 'quality', 3: 'run', 4: 'strength', 5: 'run', 6: 'run', 7: 'long' } as const
    const r = { shape: { 1: 'rest', 2: 'strength', 3: 'run', 4: 'quality', 5: 'rest', 6: 'long', 7: 'cross' } as const }
    expect(summarizeReshape(r, current)).toBe('Tue: quality → strength · Thu: strength → quality · Fri: easy run → rest · Sat: easy run → long run · Sun: long run → cross-train')
    expect(summarizeReshape({ shape: current }, current)).toBe('no change to the week')
  })
})
