import type { ReactNode } from 'react'

/**
 * Lightweight inline-and-block markdown renderer for chat/insight
 * bubbles. Handles:
 *   - Headers: # H1, ## H2, ### H3 (single-line paragraphs)
 *   - Bullet lists: lines starting with -, •, *
 *   - Numbered lists: lines starting with 1., 1)
 *   - Inline **bold**, *italic*, `code`
 *
 * Paragraphs are separated by blank lines; single newlines within a
 * paragraph are preserved as <br>.
 */
export function renderMarkdown(text: string): ReactNode {
  const paragraphs = text.split(/\n{2,}/)
  return paragraphs.map((para, pi) => {
    const lines = para.split('\n')

    // Headers (single-line paragraphs only)
    if (lines.length === 1) {
      const h3 = lines[0].match(/^###\s+(.+)/)
      if (h3) return <p key={pi} className="text-base font-bold text-slate-800 mt-2 mb-0.5">{renderInline(h3[1])}</p>
      const h2 = lines[0].match(/^##\s+(.+)/)
      if (h2) return <p key={pi} className="text-lg font-bold text-slate-800 mt-2 mb-0.5">{renderInline(h2[1])}</p>
      const h1 = lines[0].match(/^#\s+(.+)/)
      if (h1) return <p key={pi} className="text-xl font-bold text-slate-800 mt-2 mb-0.5">{renderInline(h1[1])}</p>
    }

    // Bullet list (every non-blank line starts with -, •, or *)
    const isBulletList = lines.length > 0 && lines.every(l => /^\s*[-•*]\s/.test(l) || l.trim() === '')
    if (isBulletList) {
      const items = lines.filter(l => l.trim()).map(l => l.replace(/^\s*[-•*]\s*/, ''))
      return (
        <ul key={pi} className="list-disc list-inside space-y-0.5 my-1">
          {items.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
        </ul>
      )
    }

    // Numbered list (1. / 1)  / 2. / etc.)
    const isNumberedList = lines.length > 0 && lines.every(l => /^\s*\d+[.)]\s/.test(l) || l.trim() === '')
    if (isNumberedList) {
      const items = lines.filter(l => l.trim()).map(l => l.replace(/^\s*\d+[.)]\s*/, ''))
      return (
        <ol key={pi} className="list-decimal list-inside space-y-0.5 my-1">
          {items.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
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
    if (match[2]) parts.push(<strong key={key++}>{match[2]}</strong>)
    else if (match[3]) parts.push(<em key={key++}>{match[3]}</em>)
    else if (match[4]) parts.push(
      <code key={key++} className="bg-slate-200/60 rounded px-1 py-0.5 text-sm font-mono">{match[4]}</code>
    )
    lastIndex = re.lastIndex
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts.length > 0 ? parts : text
}
