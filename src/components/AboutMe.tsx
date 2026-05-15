import { useEffect, useState } from 'react'

interface AboutMeProps {
  value: string
  onSave: (next: string) => void
  onClear: () => void
}

/**
 * Editable "About Me" free-text field in Settings. Auto-saves on blur
 * and via an explicit Save button. The Coach reads this as its primary
 * memory surface — you own the content, the Coach reads it.
 *
 * Since "What I remember about you" (CoachMemoryPanel) renders the same
 * content as a structured fact list with per-fact edit / delete, this
 * card is now collapsed by default — a short preview only, with an
 * "Edit raw text" toggle for bulk paste / journal imports. Keeps the
 * Settings page scannable when memory has grown to 14k+ chars.
 *
 * Placeholder is intentionally suggestive: the examples model the
 * kind of detail that actually pays off (injuries, what works, what
 * doesn't, preferences, PT/provider context).
 */

const PLACEHOLDER = `Things the coach should know about you. Examples:

• Injuries — old or current (knee, hamstring, etc) and what helps (ice works, foam-rolling hip flexors > quad, etc)
• What works for you (ice baths, morning runs, fueling patterns)
• What doesn't (specific terrain, weather, icy-hot, static stretching)
• PT / provider context (who, when, what they're treating)
• Training preferences (pace, time of day, routes you love/hate)
• Races you're targeting and why

The more specific, the better the coach's advice gets.`

/** First N chars to show as a preview when collapsed. ~10% of a 14k
 *  blob is a touch over 1k; that's still more than fits in a small
 *  preview, so we cap at ~200 chars for the collapsed card. */
const PREVIEW_CHARS = 200

export default function AboutMe({ value, onSave, onClear }: AboutMeProps) {
  const [draft, setDraft] = useState(value)
  const [dirty, setDirty] = useState(false)
  // Expanded means the raw textarea is visible. Default collapsed so
  // the page stays scannable when memory is large. Auto-expand on
  // first mount if the saved value is empty (so brand-new athletes
  // see the placeholder and can start typing immediately).
  const [expanded, setExpanded] = useState(() => value.length === 0)

  // Keep draft in sync when athlete switches (value changes from parent)
  useEffect(() => {
    setDraft(value)
    setDirty(false)
  }, [value])

  function handleChange(next: string) {
    setDraft(next)
    setDirty(next !== value)
  }

  function handleSave() {
    onSave(draft)
    setDirty(false)
  }

  function handleBlur() {
    if (dirty) {
      onSave(draft)
      setDirty(false)
    }
  }

  const charCount = draft.length
  // Strip leading/trailing whitespace + bullet markers from the
  // preview so the collapsed view doesn't lead with "- - I...".
  const previewText = (value || '')
    .replace(/^[-•\s]+/, '')
    .slice(0, PREVIEW_CHARS)
    .trim()
  const hasMore = (value || '').length > previewText.length

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">About Me (raw)</h3>
          <p className="text-[10px] text-slate-400 leading-snug">
            Bulk-edit the full doc. Use "What I remember about you" below to add or trim individual facts.
          </p>
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-200 shrink-0"
        >
          {expanded ? 'Collapse' : 'Edit raw text'}
        </button>
      </div>

      {!expanded ? (
        <div className="rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-2.5 py-2">
          {value ? (
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug">
              {previewText}{hasMore ? '…' : ''}
            </p>
          ) : (
            <p className="text-xs italic text-slate-400">Nothing here yet. Tap "Edit raw text" to add.</p>
          )}
          <p className="text-[10px] text-slate-400 mt-1.5">
            {charCount.toLocaleString()} chars · saved locally on this device
          </p>
        </div>
      ) : (
        <>
          <textarea
            value={draft}
            onChange={e => handleChange(e.target.value)}
            onBlur={handleBlur}
            rows={10}
            placeholder={PLACEHOLDER}
            className="w-full px-2.5 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-y leading-relaxed font-normal"
          />

          <div className="mt-2 flex items-center justify-between">
            <p className="text-[10px] text-slate-400">
              {charCount.toLocaleString()} chars · saved locally on this device
            </p>
            <div className="flex items-center gap-2">
              {dirty && (
                <button
                  onClick={handleSave}
                  className="text-xs font-semibold px-3 py-1 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors"
                >
                  Save
                </button>
              )}
              {!dirty && value.length > 0 && (
                <button
                  onClick={() => {
                    if (confirm('Clear everything from About Me? This cannot be undone.')) {
                      onClear()
                      setDraft('')
                    }
                  }}
                  className="text-[11px] text-slate-400 hover:text-red-600 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
