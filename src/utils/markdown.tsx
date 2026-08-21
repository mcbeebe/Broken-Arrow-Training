import type { ReactNode } from 'react'

/**
 * Block-and-inline markdown renderer for chat / insight bubbles.
 *
 * Handles:
 *   - Headers: # H1, ## H2, ### H3 (single-line paragraphs)
 *   - Bullet lists (-, •, *) and numbered lists (1. / 1))
 *   - TABLES — pipe tables, alignment row optional
 *   - CALLOUTS — GitHub-style alert blocks (> [!WARNING] …)
 *   - Blockquotes
 *   - Inline **bold**, *italic*, `code`
 *
 * Paragraphs are separated by blank lines; single newlines within a
 * paragraph are preserved as <br>.
 *
 * Tables and callouts exist because the coach model already emits them.
 * Before this, a comparison table rendered as literal `| Option |` and
 * `|---|---|` rows mid-reply — the worst thing on the chat screen — and
 * the one sentence that actually mattered had nowhere to live except a
 * wall of identical grey text.
 */

// ── Callouts ──────────────────────────────────────────────────────────
// One shared vocabulary, so the coach's "watch out" always looks like a
// warning and never like a tip.

type CalloutKind = 'key' | 'tip' | 'warn' | 'action'

const CALLOUTS: Record<CalloutKind, { label: string; icon: string; box: string; labelClass: string }> = {
  key: {
    label: 'The key thing',
    icon: '🎯',
    box: 'border-indigo-200 dark:border-indigo-800/60 bg-indigo-50 dark:bg-indigo-950/40',
    labelClass: 'text-indigo-700 dark:text-indigo-300',
  },
  tip: {
    label: 'Good to know',
    icon: '💡',
    box: 'border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40',
    labelClass: 'text-amber-700 dark:text-amber-300',
  },
  warn: {
    label: 'Watch out',
    icon: '⚠️',
    box: 'border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40',
    labelClass: 'text-rose-700 dark:text-rose-300',
  },
  action: {
    label: 'Do this',
    icon: '✅',
    box: 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40',
    labelClass: 'text-emerald-700 dark:text-emerald-300',
  },
}

/** Alias table — the model writes GitHub's vocabulary or ours; both land. */
const CALLOUT_ALIASES: Record<string, CalloutKind> = {
  key: 'key', important: 'key', note: 'key',
  tip: 'tip', info: 'tip',
  warning: 'warn', caution: 'warn', danger: 'warn', watchout: 'warn',
  action: 'action', todo: 'action', do: 'action',
}

/** `> [!WARNING] Optional title` followed by more `>` lines. */
function parseCallout(lines: string[]): { kind: CalloutKind; title?: string; body: string[] } | null {
  const first = lines[0]?.match(/^>\s*\[!(\w+)\]\s*(.*)$/i)
  if (!first) return null
  const kind = CALLOUT_ALIASES[first[1].toLowerCase()]
  if (!kind) return null
  const body = lines.slice(1).map(l => l.replace(/^>\s?/, '')).filter(l => l.trim() !== '')
  return { kind, title: first[2].trim() || undefined, body }
}

/** Plain render helper, deliberately not a component: this is a utils
 *  module, and declaring components beside non-component exports breaks
 *  fast-refresh boundaries. */
function renderCallout(pi: number, { kind, title, body }: { kind: CalloutKind; title?: string; body: string[] }): ReactNode {
  const s = CALLOUTS[kind]
  return (
    <div key={pi} className={`my-2.5 rounded-xl border px-3 py-2.5 ${s.box}`}>
      <p className={`flex items-center gap-1.5 text-[0.7em] font-bold uppercase tracking-wide ${s.labelClass}`}>
        <span aria-hidden>{s.icon}</span>
        {title || s.label}
      </p>
      {body.length > 0 && (
        <div className="mt-1 space-y-1 text-slate-700 dark:text-slate-200">
          {body.map((l, i) => <p key={i}>{renderInline(l)}</p>)}
        </div>
      )}
    </div>
  )
}

// ── Tables ────────────────────────────────────────────────────────────

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l)
const isAlignRow = (l: string) => /^\s*\|[\s:|-]+\|\s*$/.test(l)

function splitRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
}

/** A pipe table needs a header row plus at least one body row. The
 *  alignment row (|---|---|) is optional — the model does not always
 *  bother, and a table without one is still obviously a table. */
function parseTable(lines: string[]): { head: string[]; rows: string[][] } | null {
  const rows = lines.filter(l => l.trim() !== '')
  if (rows.length < 2 || !rows.every(isTableRow)) return null
  const body = rows.slice(1).filter(l => !isAlignRow(l))
  if (body.length === 0) return null
  return { head: splitRow(rows[0]), rows: body.map(splitRow) }
}

function renderTable(pi: number, { head, rows }: { head: string[]; rows: string[][] }): ReactNode {
  return (
    // Wide tables scroll inside their own box — never the whole chat.
    <div key={pi} className="my-2.5 -mx-1 overflow-x-auto">
      <table className="min-w-full text-left border-collapse">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                className="border-b border-slate-300 dark:border-slate-600 px-2 py-1.5 text-[0.7em] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 align-bottom"
              >
                {renderInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className={ri % 2 === 1 ? 'bg-slate-50/70 dark:bg-slate-700/30' : undefined}>
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className={`px-2 py-1.5 align-top border-b border-slate-100 dark:border-slate-700/60 ${
                    ci === 0 ? 'font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {renderInline(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
export function renderMarkdown(text: string): ReactNode {
  const paragraphs = text.split(/\n{2,}/)
  return paragraphs.map((para, pi) => {
    const lines = para.split('\n')

    const callout = parseCallout(lines)
    if (callout) return renderCallout(pi, callout)

    const table = parseTable(lines)
    if (table) return renderTable(pi, table)

    // Plain blockquote (no [!KIND] marker)
    if (lines.some(l => l.trim()) && lines.every(l => /^>/.test(l) || l.trim() === '')) {
      const quoted = lines.filter(l => l.trim()).map(l => l.replace(/^>\s?/, ''))
      return (
        <blockquote key={pi} className="my-2 border-l-[3px] border-slate-300 dark:border-slate-600 pl-3 text-slate-600 dark:text-slate-300 italic">
          {quoted.map((l, i) => <p key={i}>{renderInline(l)}</p>)}
        </blockquote>
      )
    }

    // Headers (single-line paragraphs only)
    if (lines.length === 1) {
      const h3 = lines[0].match(/^###\s+(.+)/)
      if (h3) return <p key={pi} className="text-[0.95em] font-bold text-slate-900 dark:text-slate-100 mt-3 mb-1">{renderInline(h3[1])}</p>
      const h2 = lines[0].match(/^##\s+(.+)/)
      if (h2) return <p key={pi} className="text-[1.05em] font-bold text-slate-900 dark:text-slate-100 mt-3 mb-1">{renderInline(h2[1])}</p>
      const h1 = lines[0].match(/^#\s+(.+)/)
      if (h1) return <p key={pi} className="text-[1.15em] font-bold text-slate-900 dark:text-slate-100 mt-3 mb-1">{renderInline(h1[1])}</p>
    }

    // Bullet list (every non-blank line starts with -, •, or *)
    const isBulletList = lines.length > 0 && lines.every(l => /^\s*[-•*]\s/.test(l) || l.trim() === '')
    if (isBulletList) {
      const items = lines.filter(l => l.trim()).map(l => l.replace(/^\s*[-•*]\s*/, ''))
      return (
        // Hanging indent, not list-inside: wrapped lines used to slide back
        // under the bullet, which is most of why dense replies read as mush.
        <ul key={pi} className="my-1.5 space-y-1">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="select-none text-indigo-400 dark:text-indigo-500">•</span>
              <span className="flex-1">{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      )
    }

    // Numbered list (1. / 1)  / 2. / etc.)
    const isNumberedList = lines.length > 0 && lines.every(l => /^\s*\d+[.)]\s/.test(l) || l.trim() === '')
    if (isNumberedList) {
      const items = lines.filter(l => l.trim()).map(l => l.replace(/^\s*\d+[.)]\s*/, ''))
      return (
        <ol key={pi} className="my-1.5 space-y-1">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="select-none font-semibold text-indigo-500 dark:text-indigo-400 tabular-nums">{i + 1}.</span>
              <span className="flex-1">{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      )
    }

    // Regular paragraph with inline formatting + <br> for single newlines
    return (
      <p key={pi} className={pi > 0 ? 'mt-2' : ''}>
        {lines.map((line, li) => (
          <span key={li}>
            {li > 0 && <br />}
            {renderInline(line)}
          </span>
        ))}
      </p>
    )
  })
}

/** Parse inline **bold**, *italic*, `code` within a single line. */
export function renderInline(text: string): ReactNode {
  const parts: ReactNode[] = []
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
  let lastIndex = 0
  let key = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[2]) parts.push(<strong key={key++} className="font-semibold text-slate-900 dark:text-white">{match[2]}</strong>)
    else if (match[3]) parts.push(<em key={key++}>{match[3]}</em>)
    else if (match[4]) parts.push(
      <code key={key++} className="bg-slate-200/70 dark:bg-slate-700 rounded px-1 py-0.5 text-[0.9em] font-mono">{match[4]}</code>
    )
    lastIndex = re.lastIndex
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts.length > 0 ? parts : text
}
