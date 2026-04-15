import type { CoachDayNote } from '../utils/coachNotes'

interface CoachDayNoteProps {
  note: CoachDayNote
}

/**
 * Inline coach line rendered on a DayCard. Compact — single line
 * (ish), visual weight scaled by tone. No chat affordances here.
 */
export default function CoachDayNoteView({ note }: CoachDayNoteProps) {
  const toneClass =
    note.tone === 'flag'
      ? 'bg-red-50 text-red-800 border-red-200'
      : note.tone === 'heads_up'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : 'bg-indigo-50 text-indigo-800 border-indigo-200'

  return (
    <div className={`mt-1.5 px-2 py-1.5 rounded-md border text-xs leading-snug ${toneClass}`}>
      <span className="font-semibold">Coach:</span> {note.text}
    </div>
  )
}
