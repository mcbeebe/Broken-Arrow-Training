// Three follow-up chips rendered below every assistant message in the coach
// chat. Each chip submits a canned user turn that the backend system prompt
// recognises and answers in a specific shape:
//   - "Simpler"        → plain-English rewrite, no acronyms
//   - "What should I do?" → one concrete action
//   - "Show sources"   → name the engines + cited studies

const FOLLOW_UPS: { label: string; seed: string }[] = [
  { label: 'Simpler', seed: 'Explain that in simpler words, no acronyms.' },
  { label: 'What should I do?', seed: 'What specifically should I do today?' },
  { label: 'Show sources', seed: 'What data is that based on? Cite the engines or studies.' },
]

interface Props {
  onSelect: (seed: string) => void
  disabled?: boolean
}

export default function CoachFollowUpChips({ onSelect, disabled }: Props) {
  return (
    <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Follow-up actions">
      {FOLLOW_UPS.map(({ label, seed }) => (
        <button
          key={label}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(seed)}
          className="text-xs font-semibold px-3.5 py-2 rounded-full border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {label}
        </button>
      ))}
    </div>
  )
}
