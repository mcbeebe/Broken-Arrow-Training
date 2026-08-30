import { useState, type ReactNode } from 'react'

/**
 * A Progress-tab section that folds away. The header is the toggle (title +
 * chevron); the body hides when collapsed. The choice is remembered per
 * device so a section the athlete folded stays folded next visit — a
 * lightweight per-viewer convenience, not synced state.
 */
interface Props {
  title: string
  /** Stable identifier for the remembered open/closed state. */
  storageKey: string
  /** Collapsed on first ever view (before the athlete has chosen). */
  defaultCollapsed?: boolean
  /** Optional right-aligned header content (kept clear of the toggle). */
  children: ReactNode
}

function keyFor(storageKey: string) {
  return `ba_collapsed_${storageKey}`
}

function readCollapsed(storageKey: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(keyFor(storageKey))
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}

function writeCollapsed(storageKey: string, collapsed: boolean) {
  try {
    localStorage.setItem(keyFor(storageKey), collapsed ? '1' : '0')
  } catch { /* private mode / quota — the fold just won't persist */ }
}

export default function CollapsibleSection({ title, storageKey, defaultCollapsed = false, children }: Props) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(storageKey, defaultCollapsed))

  const toggle = () => setCollapsed(prev => {
    const next = !prev
    writeCollapsed(storageKey, next)
    return next
  })

  return (
    <section data-testid={`section-${storageKey}`} data-collapsed={collapsed ? 'true' : undefined}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="w-full flex items-center justify-between gap-2 mb-2 text-left"
        data-testid={`section-toggle-${storageKey}`}
      >
        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
        <span className="text-slate-400 text-sm shrink-0" aria-hidden>{collapsed ? '⌄' : '⌃'}</span>
      </button>
      {!collapsed && children}
    </section>
  )
}
