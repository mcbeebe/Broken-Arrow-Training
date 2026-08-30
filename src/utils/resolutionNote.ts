/**
 * The sentence a resolved day writes into the Journal.
 *
 * The Journal is the athlete's own record, but it only ever heard from the
 * sync: a day you skipped on purpose, moved, or sat out sick left no trace
 * at all. Reading back a training block, those days were simply absent —
 * which reads as forgetting, and quietly makes the record agree with the
 * old narrative bug that treated an unlogged day as nothing.
 *
 * These notes are written in the first person because they are the
 * athlete's record of their own decision, not the app's report on them.
 */
import type { ReplanKind } from '../engines/planGenerator/replanLog'

export interface ResolutionNoteInput {
  kind: ReplanKind
  /** What the plan had asked for, e.g. 'Station intervals'. */
  workout: string
  /** Where a moved session landed, when it moved. */
  movedToDay?: string | null
}

export function resolutionNote(input: ResolutionNoteInput): string {
  const what = input.workout || 'The planned session'
  switch (input.kind) {
    case 'move':
      return input.movedToDay
        ? `Moved ${what} to ${input.movedToDay}. The week rebalanced around it.`
        : `Tried to move ${what}, but no later day this week had room — skipped instead.`
    case 'illness':
      return `Sick — sat ${what} out. Easing back rather than picking up where I left off.`
    case 'skip':
    default:
      return `Skipped ${what} on purpose. Not made up later; the plan bends forward.`
  }
}

/** Days resolved this way are the athlete's decision, not a failure, and
 *  the record should never imply otherwise. */
export const FORBIDDEN_IN_NOTES = ['missed', 'failed', 'lazy', 'excuse']
