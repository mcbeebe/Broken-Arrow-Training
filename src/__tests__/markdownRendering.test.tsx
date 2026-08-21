/**
 * Field report: "the chat is currently difficult to read."
 *
 * The screenshot showed the worst of it — a comparison table rendered as
 * literal `| Option | Trade-off |` and `|---|---|` rows in the middle of
 * a coach reply. The model was already emitting tables; the renderer had
 * no idea what they were.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { renderMarkdown } from '../utils/markdown'

const show = (md: string) => render(<div>{renderMarkdown(md)}</div>)

describe('tables', () => {
  // Verbatim from the reported screenshot.
  const FIELD_TABLE = [
    '| Option | Trade-off |',
    '|---|---|',
    '| TT Monday, drop the easy run | Cleanest. Week 2 still has Wed easy + strides. |',
    '| TT Tuesday, strength Wednesday | Shifts the whole week right |',
  ].join('\n')

  it('renders a real table, not pipe soup', () => {
    const { container } = show(FIELD_TABLE)
    const table = container.querySelector('table')
    expect(table).not.toBeNull()
    expect(within(table!).getByText('Option')).toBeInTheDocument()
    expect(within(table!).getByText(/TT Monday, drop the easy run/)).toBeInTheDocument()
    expect(table!.querySelectorAll('tbody tr')).toHaveLength(2)
  })

  it('never leaks the alignment row as visible text', () => {
    const { container } = show(FIELD_TABLE)
    expect(container.textContent).not.toContain('|---|')
    expect(container.textContent).not.toContain('|')
  })

  it('works without an alignment row — the model often omits it', () => {
    const { container } = show('| A | B |\n| one | two |')
    expect(container.querySelector('table')).not.toBeNull()
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1)
  })

  it('scrolls inside its own box so the chat never scrolls sideways', () => {
    const { container } = show(FIELD_TABLE)
    expect(container.querySelector('.overflow-x-auto')).not.toBeNull()
  })

  it('a lone pipe line is prose, not a table', () => {
    const { container } = show('The pace | effort relationship matters.')
    expect(container.querySelector('table')).toBeNull()
  })
})

describe('callouts', () => {
  it('renders each kind with its own label', () => {
    show('> [!WARNING]\n> Your quads are cooked.')
    expect(screen.getByText(/watch out/i)).toBeInTheDocument()
    expect(screen.getByText(/quads are cooked/)).toBeInTheDocument()
  })

  it('accepts GitHub aliases and our own vocabulary', () => {
    for (const [marker, label] of [
      ['[!KEY]', /key thing/i],
      ['[!IMPORTANT]', /key thing/i],
      ['[!TIP]', /good to know/i],
      ['[!CAUTION]', /watch out/i],
      ['[!ACTION]', /do this/i],
    ] as const) {
      const { unmount } = show(`> ${marker}\n> body text here`)
      expect(screen.getByText(label), marker).toBeInTheDocument()
      unmount()
    }
  })

  it('a custom title replaces the default label', () => {
    show('> [!TIP] Fuel earlier\n> Take the gel at 45 minutes.')
    expect(screen.getByText(/Fuel earlier/)).toBeInTheDocument()
    expect(screen.queryByText(/good to know/i)).toBeNull()
  })

  it('an unknown marker stays an ordinary blockquote rather than vanishing', () => {
    const { container } = show('> [!BOGUS]\n> still say this')
    expect(container.textContent).toContain('still say this')
    expect(container.querySelector('blockquote')).not.toBeNull()
  })

  it('a plain blockquote still renders as a quote', () => {
    const { container } = show('> just a quote')
    expect(container.querySelector('blockquote')).not.toBeNull()
    expect(container.textContent).toContain('just a quote')
  })
})

describe('lists and inline formatting', () => {
  it('bullets hang their wrapped text instead of sliding under the marker', () => {
    const { container } = show('- first item\n- second item')
    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(2)
    // flex + flex-1 body is what produces the hanging indent
    expect(items[0].className).toContain('flex')
    expect(container.querySelector('.list-inside')).toBeNull()
  })

  it('numbers an ordered list from one regardless of the source numbers', () => {
    const { container } = show('3. third\n7. seventh')
    expect(container.textContent).toContain('1.')
    expect(container.textContent).toContain('2.')
  })

  it('still handles bold, italic, code and headers', () => {
    const { container } = show('## Heading\n\nSome **bold** and *italic* and `code`.')
    expect(container.querySelector('strong')?.textContent).toBe('bold')
    expect(container.querySelector('em')?.textContent).toBe('italic')
    expect(container.querySelector('code')?.textContent).toBe('code')
    expect(container.textContent).toContain('Heading')
  })

  it('a mixed reply keeps every block distinct', () => {
    const { container } = show([
      '## Your options',
      '',
      '| Option | Trade-off |',
      '|---|---|',
      '| Monday | Cleanest |',
      '',
      '> [!ACTION] My call',
      '> Swap Monday to the time trial.',
      '',
      '- one',
      '- two',
    ].join('\n'))
    expect(container.querySelector('table')).not.toBeNull()
    expect(screen.getByText(/My call/)).toBeInTheDocument()
    expect(container.querySelectorAll('li')).toHaveLength(2)
    expect(container.textContent).not.toContain('|---|')
  })
})
