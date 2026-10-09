/**
 * What the athlete reads when an upload doesn't become a plan
 * (initiative 004, PR 5): every server code, every browser-side outcome,
 * every file refused before sending, and every reply that held no plan.
 *
 * Each says whether that attempt used one of the day's uploads. The server
 * counts an upload just before the model reads it, and gives it back only
 * when the model never read it (`busy`, `llm_unavailable`), so a refused
 * file costs nothing and a failed read does. `test_plan_import_client_parity.py`
 * checks that every code the server can send has an entry here.
 */

import type { ImportErrorCode } from './client'
import type { NormalizeFailure } from './normalize'
import type { PrepareFailure } from './prepareUpload'

export type ImportProblem = ImportErrorCode | NormalizeFailure | PrepareFailure

export interface ImportProblemCopy {
  title: string
  body: string
  /** Whether this attempt used one of today's uploads. */
  spent: 'yes' | 'no' | 'maybe'
  /** Show the "what usually works" tips: the file was read but held no plan. */
  tips?: true
}

const TRY_ANOTHER = 'Try another file, a photo of the schedule, or paste the text.'

export const IMPORT_PROBLEMS: Record<ImportProblem, ImportProblemCopy> = {
  // ── Read, but no plan came out ──
  not_a_plan: { title: "We couldn't find a plan in that file", body: "It doesn't look like a week-by-week schedule.", spent: 'yes', tips: true },
  empty: { title: "We couldn't find any sessions", body: 'The file was read, but no training days came out of it.', spent: 'yes', tips: true },
  unreadable: { title: "We couldn't read that plan", body: TRY_ANOTHER, spent: 'yes', tips: true },
  read_failed: { title: "We couldn't read that plan", body: TRY_ANOTHER, spent: 'yes', tips: true },
  plan_too_long: { title: 'That plan is too long to read in one go', body: 'Upload one block at a time, for example the first 16 weeks.', spent: 'yes' },
  file_unreadable: { title: "We couldn't open that file", body: 'It may be password-protected or damaged. Save it again as a PDF, or take a photo of the schedule.', spent: 'yes' },

  // ── The reader or the connection ──
  timeout: { title: 'Reading took too long', body: 'Long plans can take a few minutes. Try again, or upload fewer weeks at a time.', spent: 'maybe' },
  busy: { title: 'The reader is busy', body: 'Try again in a minute.', spent: 'no' },
  llm_unavailable: { title: "The reader isn't available right now", body: 'Try again later.', spent: 'no' },
  network: { title: "We couldn't reach the server", body: 'Check your connection and try again.', spent: 'maybe' },
  aborted: { title: 'Upload cancelled', body: 'Nothing was changed.', spent: 'maybe' },
  server_error: { title: 'Something went wrong', body: 'Try again in a minute.', spent: 'maybe' },
  unavailable: { title: "Uploading isn't available right now", body: 'Try again later.', spent: 'no' },
  not_deployed: { title: "Uploading a plan isn't available yet", body: 'It arrives with the next update.', spent: 'no' },

  // ── Who and how many ──
  signed_out: { title: 'Sign in again to upload', body: 'Your session has ended. Sign in, then try again.', spent: 'no' },
  not_available: { title: "Uploading a plan isn't open to your account yet", body: "It's in beta.", spent: 'no' },
  import_limit: { title: "That's today's uploads used", body: 'Try again tomorrow.', spent: 'no' },
  budget_exceeded: { title: 'Your coach has done a lot today', body: "Uploads share the coach's daily allowance. Try again tomorrow.", spent: 'no' },

  // ── The file, refused before it was read ──
  too_large: { title: 'That file is too big', body: 'Files up to 3 MB work. Try a smaller PDF, a photo of the schedule, or paste the text.', spent: 'no' },
  too_long: { title: "That's more text than we can read at once", body: 'Upload or paste one block at a time.', spent: 'no' },
  not_a_pdf: { title: "That file isn't a working PDF", body: 'Save it again as a PDF, or take a photo of the schedule.', spent: 'no' },
  unsupported_image: { title: "We can't read that image format", body: 'Use a JPEG or PNG photo or screenshot.', spent: 'no' },
  image_unreadable: { title: "We couldn't open that photo", body: 'Try a JPEG or a screenshot. iPhone HEIC photos open only in Safari.', spent: 'no' },
  office_soon: { title: 'Word and Excel are coming soon', body: 'For now, save it as a PDF and upload that.', spent: 'no' },
  legacy_office: { title: "That's an older Word or Excel file", body: 'Save it again as a PDF and upload that.', spent: 'no' },
  unsupported: { title: "We can't read that kind of file", body: 'Upload a PDF, a CSV, a photo of the plan, or paste the text.', spent: 'no' },
  unsupported_kind: { title: "We can't read that kind of file", body: 'Upload a PDF, a CSV, a photo of the plan, or paste the text.', spent: 'no' },
  empty_file: { title: 'That file is empty', body: 'Pick the file with your schedule in it.', spent: 'no' },
  bad_request: { title: "We couldn't send that file", body: TRY_ANOTHER, spent: 'no' },
  data_required: { title: "We couldn't send that file", body: TRY_ANOTHER, spent: 'no' },
  bad_data: { title: "We couldn't send that file", body: TRY_ANOTHER, spent: 'no' },
  text_required: { title: 'There was no text to read', body: 'Paste the plan, or pick a file.', spent: 'no' },
}

/** The line under an error saying whether the attempt cost an upload. */
export function spentLine(spent: ImportProblemCopy['spent']): string {
  if (spent === 'yes') return "This counted as one of today's uploads."
  if (spent === 'maybe') return "It may have counted as one of today's uploads."
  return "This didn't count toward today's uploads."
}
