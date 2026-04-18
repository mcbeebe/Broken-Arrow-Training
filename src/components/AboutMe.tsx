import { useState, useEffect } from 'react'

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

export default function AboutMe({ value, onSave, onClear }: AboutMeProps) {
  const [draft, setDraft] = useState(value)
  const [dirty, setDirty] = useState(false)

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

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">About Me</h3>
          <p className="text-[10px] text-slate-400">What the coach knows about you. You own this — edit anytime.</p>
        </div>
      </div>

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
    </div>
  )
}
