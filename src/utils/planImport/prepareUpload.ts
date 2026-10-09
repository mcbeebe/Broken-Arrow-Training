/**
 * From what the athlete picked (a file, a photo, pasted text) to the body
 * the plan-import endpoint takes (initiative 004, PR 5).
 *
 * Anything the server would refuse is refused here first, from the file's own
 * bytes rather than its name: a PDF must start `%PDF-`, an image is
 * re-encoded to a JPEG the reader takes, and text must fit the server's
 * limit. The athlete hears at once, without sending megabytes to be told no.
 *
 * The file name is not part of the request: the reader never sees it
 * (D10). It labels the review screen and is kept as the plan's source name,
 * which syncs with the plan like the rest of it.
 */

import { resizeImage } from '../imageResize'
import type { ImportSourceKind } from './types'
import { IMAGE_MEDIA_TYPES, UPLOAD_LIMITS } from './uploadLimits'

/** What the endpoint receives. No file name, by design. */
export interface PlanImportBody {
  kind: ImportSourceKind
  /** Base64, no prefix: a PDF or an image. */
  data?: string
  mediaType?: string
  /** CSV or plain text. */
  text?: string
  /** The athlete's note, e.g. which version of the plan to read. */
  hint?: string
}

export type UploadInput =
  | { file: File; hint?: string }
  | { text: string; hint?: string }

/**
 * Why a pick can't be sent:
 * - `office_soon`: Word or Excel, which arrive in a later update (D2).
 * - `legacy_office`: an old .doc/.xls, which must be re-saved.
 */
export type PrepareFailure =
  | 'empty_file'
  | 'too_large'
  | 'too_long'
  | 'not_a_pdf'
  | 'image_unreadable'
  | 'office_soon'
  | 'legacy_office'
  | 'unsupported'

export type PrepareResult =
  | { ok: true; body: PlanImportBody; source: { name: string; kind: ImportSourceKind } }
  | { ok: false; reason: PrepareFailure }

/** Re-encodes a photo for the reader; injectable because jsdom has no canvas. */
export type ResizeFn = (file: Blob) => Promise<{ base64: string; mediaType: string; bytes: number }>

const PASTED_NAME = 'Pasted text'
const TEXT_EXTENSIONS = new Set(['csv', 'tsv', 'txt', 'text', 'md'])
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'])
// A UTF-8 character is at most 4 bytes, so a file this large holds more
// characters than the server takes, without reading it.
const MAX_TEXT_FILE_BYTES = UPLOAD_LIMITS.maxTextChars * 4

function extensionOf(name: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name)
  return m ? m[1].toLowerCase() : ''
}

function startsWith(bytes: Uint8Array, prefix: number[], offset = 0): boolean {
  if (bytes.length < offset + prefix.length) return false
  return prefix.every((b, i) => bytes[offset + i] === b)
}

const ascii = (s: string) => Array.from(s, c => c.charCodeAt(0))

function isPdf(head: Uint8Array): boolean {
  return startsWith(head, ascii('%PDF-'))
}

function isImage(head: Uint8Array): boolean {
  return startsWith(head, [0xff, 0xd8, 0xff])
    || startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    || startsWith(head, ascii('GIF87a')) || startsWith(head, ascii('GIF89a'))
    || (startsWith(head, ascii('RIFF')) && startsWith(head, ascii('WEBP'), 8))
}

function isZip(head: Uint8Array): boolean {
  return startsWith(head, [0x50, 0x4b, 0x03, 0x04])
}

function isLegacyOffice(head: Uint8Array): boolean {
  return startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
}

/** Base64 without the stack overflow `btoa(String.fromCharCode(...all))` hits. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function readBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

function cleanHint(hint: string | undefined): string | undefined {
  const h = (hint ?? '').trim().slice(0, UPLOAD_LIMITS.maxHintChars)
  return h || undefined
}

/** The server refuses a request over its body limit before reading it. */
function withinBody(result: PrepareResult): PrepareResult {
  if (!result.ok) return result
  return new Blob([JSON.stringify(result.body)]).size > UPLOAD_LIMITS.maxBodyBytes
    ? { ok: false, reason: 'too_large' }
    : result
}

function prepareText(raw: string, kind: 'csv' | 'text', name: string, hint?: string): PrepareResult {
  const text = raw.replace(/^\uFEFF/, '')
  // NUL bytes mean a binary file under a text name; the reader can do
  // nothing with it.
  if (text.includes('\u0000')) return { ok: false, reason: 'unsupported' }
  if (!text.trim()) return { ok: false, reason: 'empty_file' }
  // UTF-16 units: never fewer than the server's count of characters.
  if (text.length > UPLOAD_LIMITS.maxTextChars) return { ok: false, reason: 'too_long' }
  const body: PlanImportBody = { kind, text }
  const h = cleanHint(hint)
  if (h) body.hint = h
  return withinBody({ ok: true, body, source: { name, kind } })
}

/**
 * Turn the athlete's pick into the endpoint's body, or say why it can't be
 * sent. Never throws, and never sends the file name.
 *
 * @param input  a picked file or pasted text, with the optional note
 * @param deps   `resize` re-encodes a photo (defaults to `resizeImage`)
 */
export async function prepareUpload(
  input: UploadInput,
  deps: { resize?: ResizeFn } = {},
): Promise<PrepareResult> {
  try {
    if ('text' in input) return prepareText(input.text, 'text', PASTED_NAME, input.hint)

    const { file } = input
    const name = file.name || 'My plan'
    if (file.size === 0) return { ok: false, reason: 'empty_file' }
    const ext = extensionOf(name)
    const head = await readBytes(file.slice(0, 16))

    if (isPdf(head)) {
      if (file.size > UPLOAD_LIMITS.maxFileBytes) return { ok: false, reason: 'too_large' }
      const body: PlanImportBody = { kind: 'pdf', data: bytesToBase64(await readBytes(file)) }
      const h = cleanHint(input.hint)
      if (h) body.hint = h
      return withinBody({ ok: true, body, source: { name, kind: 'pdf' } })
    }
    if (ext === 'pdf' || file.type === 'application/pdf') return { ok: false, reason: 'not_a_pdf' }

    if (ext === 'docx' || ext === 'xlsx') return { ok: false, reason: 'office_soon' }
    if (ext === 'doc' || ext === 'xls' || isLegacyOffice(head)) return { ok: false, reason: 'legacy_office' }
    if (isZip(head)) return { ok: false, reason: 'unsupported' }

    if (isImage(head) || file.type.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) {
      let resized: Awaited<ReturnType<ResizeFn>>
      try {
        resized = await (deps.resize ?? resizeImage)(file)
      } catch {
        // HEIC outside Safari, a damaged file: the browser can't open it.
        return { ok: false, reason: 'image_unreadable' }
      }
      if (!resized.base64 || !(IMAGE_MEDIA_TYPES as readonly string[]).includes(resized.mediaType)) {
        return { ok: false, reason: 'image_unreadable' }
      }
      if (resized.bytes > UPLOAD_LIMITS.maxFileBytes) return { ok: false, reason: 'too_large' }
      const body: PlanImportBody = { kind: 'image', data: resized.base64, mediaType: resized.mediaType }
      const h = cleanHint(input.hint)
      if (h) body.hint = h
      return withinBody({ ok: true, body, source: { name, kind: 'image' } })
    }

    if (TEXT_EXTENSIONS.has(ext) || file.type.startsWith('text/')) {
      if (file.size > MAX_TEXT_FILE_BYTES) return { ok: false, reason: 'too_long' }
      const kind = ext === 'csv' || ext === 'tsv' || file.type === 'text/csv' ? 'csv' : 'text'
      return prepareText(await file.text(), kind, name, input.hint)
    }

    return { ok: false, reason: 'unsupported' }
  } catch {
    return { ok: false, reason: 'unsupported' }
  }
}
