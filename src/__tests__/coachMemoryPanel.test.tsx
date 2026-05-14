import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CoachMemoryPanel from '../components/CoachMemoryPanel'
import type { ConversationTurn, CoachPersona } from '../types'

const emptyPersona: CoachPersona = { name: '', traits: [] }
const filledPersona: CoachPersona = { name: 'Chuck', traits: ['analytical', 'direct'] }

function turn(overrides: Partial<ConversationTurn> = {}): ConversationTurn {
  return {
    id: overrides.id ?? 't1',
    role: overrides.role ?? 'assistant',
    content: overrides.content ?? 'hello',
    ts: overrides.ts ?? Date.UTC(2026, 4, 12, 8, 30),
    ...overrides,
  } as ConversationTurn
}

describe('<CoachMemoryPanel>', () => {
  it('renders empty states when no memory is stored', () => {
    render(
      <CoachMemoryPanel
        aboutMe=""
        coachPersona={emptyPersona}
        conversation={[]}
        pendingInferences={[]}
        dailyArchives={[]}
        onClearConversation={() => {}}
      />,
    )
    expect(screen.getByText(/haven't shared anything/i)).toBeInTheDocument()
    expect(screen.getByText(/default voice/i)).toBeInTheDocument()
    expect(screen.getByText(/no turns yet/i)).toBeInTheDocument()
  })

  it('renders persona name + traits when set', () => {
    render(
      <CoachMemoryPanel
        aboutMe=""
        coachPersona={filledPersona}
        conversation={[]}
        pendingInferences={[]}
        dailyArchives={[]}
        onClearConversation={() => {}}
      />,
    )
    expect(screen.getByText(/Chuck · analytical · direct/)).toBeInTheDocument()
  })

  it('counts visible conversation turns (excluding system-handoff)', () => {
    render(
      <CoachMemoryPanel
        aboutMe=""
        coachPersona={emptyPersona}
        conversation={[
          turn({ id: '1', role: 'user', content: 'hi' }),
          turn({ id: '2', role: 'assistant', content: 'hey' }),
          turn({ id: '3', role: 'system-handoff', content: '[PERSONA UPDATED] ...' }),
        ]}
        pendingInferences={[]}
        dailyArchives={[]}
        onClearConversation={() => {}}
      />,
    )
    expect(screen.getByText(/2 turns stored/i)).toBeInTheDocument()
  })

  it('summarises pending observations and daily archives counts', () => {
    render(
      <CoachMemoryPanel
        aboutMe=""
        coachPersona={emptyPersona}
        conversation={[]}
        pendingInferences={[
          { id: 'p1', text: 'note', proposedAt: 0 },
          { id: 'p2', text: 'note2', proposedAt: 0 },
        ]}
        dailyArchives={[{ id: 'a1', date: '2026-05-01' }]}
        onClearConversation={() => {}}
      />,
    )
    expect(screen.getByText(/2 unaccepted notes/i)).toBeInTheDocument()
    expect(screen.getByText(/1 archived day of chat/i)).toBeInTheDocument()
  })

  it('requires confirmation before clearing the conversation', () => {
    const onClear = vi.fn()
    render(
      <CoachMemoryPanel
        aboutMe=""
        coachPersona={emptyPersona}
        conversation={[turn()]}
        pendingInferences={[]}
        dailyArchives={[]}
        onClearConversation={onClear}
      />,
    )
    fireEvent.click(screen.getByText(/clear conversation/i))
    expect(onClear).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText(/yes, clear it/i))
    expect(onClear).toHaveBeenCalledTimes(1)
  })
})
