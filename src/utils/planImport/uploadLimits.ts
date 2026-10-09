/**
 * What the plan-import endpoint accepts (initiative 004), mirrored from
 * `api/coach/_plan_import.py` so the browser refuses a file before it spends
 * one of the athlete's daily uploads. `test_plan_import_client_parity.py`
 * reads this file and fails when the two sides drift apart.
 */

export const UPLOAD_LIMITS = {
  /** MAX_BODY_BYTES: the whole request, answered 413 before it is read. */
  maxBodyBytes: 4_400_000,
  /** MAX_FILE_BYTES: a PDF or image, decoded. */
  maxFileBytes: 3_200_000,
  /** MAX_TEXT_CHARS: pasted or extracted text. */
  maxTextChars: 120_000,
  /** MAX_HINT_CHARS: the athlete's "anything we should know?" note. */
  maxHintChars: 300,
} as const

/** IMAGE_TYPES: the image formats the reader takes. */
export const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

/**
 * How long the browser waits for a reply. The model gives up at 240 s
 * (MODEL_TIMEOUT_S) and the function at 300 s (vercel.json), but those clocks
 * start once the upload has arrived: the rest is for sending the file over a
 * slow phone connection, since a read the browser abandons still counts.
 */
export const CLIENT_TIMEOUT_MS = 600_000
