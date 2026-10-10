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
import type { OfficeFailure } from './extractOffice'
import { IMAGE_MEDIA_TYPES, OFFICE_FILE_BYTES, UPLOAD_LIMITS } from './uploadLimits'

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
 * - `office_unreadable`: a .docx/.xlsx that won't open (damaged, or
 *   password-protected, which makes it no longer a zip).
 * - `office_no_text`: a Word or Excel file with no text in it, often a
 *   picture of the plan pasted in.
 * - `office_too_big`: one whose contents unzip past the reader's limits,
 *   often from a large hidden data sheet or style bloat.
 * - `legacy_office`: an old .doc/.xls, or an Excel binary .xlsb, which must
 *   be re-saved.
 * - `reader_unavailable`: the Word and Excel reader didn't load (offline).
 */
export type PrepareFailure =
  | 'empty_file'
  | 'too_large'
  | 'too_long'
  | 'not_a_pdf'
  | 'image_unreadable'
  | 'office_unreadable'
  | 'office_no_text'
  | 'office_too_big'
  | 'legacy_office'
  | 'reader_unavailable'
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
// Documents, macro-enabled documents and templates: the same zip inside.
const WORD_EXTENSIONS = new Set(['docx', 'docm', 'dotx', 'dotm'])
const EXCEL_EXTENSIONS = new Set(['xlsx', 'xlsm', 'xltx', 'xltm'])

// Formats we can't read that a re-save fixes: Word 97-2003 and Excel
// 97-2003 files and templates, and Excel's binary workbook (a zip, but of
// binary parts).
const LEGACY_EXTENSIONS = new Set(['doc', 'dot', 'xls', 'xlt', 'xlsb'])
const LEGACY_TYPES = new Set(['application/msword', 'application/vnd.ms-excel'])

const isBinaryWorkbook = (type: string) => type.includes('sheet.binary')
// Other formats that are zips inside, never read as Word or Excel.
const OTHER_ZIP_EXTENSIONS = new Set(['zip', 'pages', 'numbers', 'key', 'keynote', 'odt', 'ods', 'odp', 'epub'])

// A file's type comes from the system it was picked on, and only counts
// when the name has no extension: Windows with Excel installed calls every
// .csv `application/vnd.ms-excel`.

/** A Word or Excel file we read, by its name, or its type if it has no extension. */
function namedOffice(ext: string, type: string): boolean {
  if (ext) return WORD_EXTENSIONS.has(ext) || EXCEL_EXTENSIONS.has(ext)
  return type.includes('officedocument.wordprocessingml') || type.includes('officedocument.spreadsheetml')
    || type.startsWith('application/vnd.ms-word.') || type.startsWith('application/vnd.ms-excel.')
}

/** An older Word or Excel format, by its name, or its type if it has no extension. */
function namedLegacy(ext: string, type: string): boolean {
  if (ext) return LEGACY_EXTENSIONS.has(ext)
  return LEGACY_TYPES.has(type) || isBinaryWorkbook(type)
}

// "EncryptedPackage" as an OLE directory names it (UTF-16LE): the stream a
// password-protected .docx/.xlsx keeps its zip in. Older .doc/.xls files
// never have it.
const ENCRYPTED_PACKAGE = Array.from('EncryptedPackage').flatMap(c => [c.charCodeAt(0), 0])

function holds(bytes: Uint8Array, pattern: number[]): boolean {
  const last = bytes.length - pattern.length
  for (let i = bytes.indexOf(pattern[0]); i !== -1 && i <= last; i = bytes.indexOf(pattern[0], i + 1)) {
    if (pattern.every((b, j) => bytes[i + j] === b)) return true
  }
  return false
}

/** An OLE file: a password-protected .docx/.xlsx, or an older format. */
async function oleVerdict(file: Blob): Promise<PrepareFailure> {
  if (file.size > OFFICE_FILE_BYTES) return 'legacy_office'
  return holds(await readBytes(file), ENCRYPTED_PACKAGE) ? 'office_unreadable' : 'legacy_office'
}

/** What the reader's failures mean to the athlete. */
const OFFICE_FAILURES: Record<OfficeFailure, PrepareFailure> = {
  office_unreadable: 'office_unreadable',
  // Parts that unzip past the limits, though the file was under 15 MB:
  // usually a big hidden data sheet or bloated styles, not the plan.
  too_large: 'office_too_big',
  too_long: 'too_long',
  empty_file: 'office_no_text',
}

function extensionOf(name: string): string {
  const m = /\.([a-z0-9]{1,10})$/i.exec(name)
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

function prepareText(raw: string, kind: 'csv' | 'text' | 'docx' | 'xlsx', name: string, hint?: string): PrepareResult {
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

    // Word and Excel are read here and sent as text (D11), as whichever the
    // zip holds, whatever it is called. By name before bytes: a
    // password-protected one is not a zip, and must not read as legacy.
    // Any other zip is read too, unless its name says it's another format
    // (.pages, .numbers, .zip): a Word file saved as "Plan v1.2" is still one.
    const named = namedOffice(ext, file.type)
    if (named || (isZip(head) && !OTHER_ZIP_EXTENSIONS.has(ext))) {
      if (file.size > OFFICE_FILE_BYTES) return { ok: false, reason: 'too_large' }
      let office: typeof import('./extractOffice')
      try {
        office = await import('./extractOffice')
      } catch {
        return { ok: false, reason: 'reader_unavailable' }
      }
      const bytes = await readBytes(file)
      const kind = office.officeKindOf(bytes)
      if (!kind) {
        if (namedLegacy(ext, file.type)) return { ok: false, reason: 'legacy_office' }
        if (!named) return { ok: false, reason: 'unsupported' }
        return { ok: false, reason: isLegacyOffice(head) ? await oleVerdict(file) : 'office_unreadable' }
      }
      const read = kind === 'docx' ? office.extractDocx(bytes) : office.extractXlsx(bytes)
      if (!read.ok) return { ok: false, reason: OFFICE_FAILURES[read.reason] }
      return prepareText(read.text, kind, name, input.hint)
    }
    if (isLegacyOffice(head)) return { ok: false, reason: await oleVerdict(file) }
    if (namedLegacy(ext, file.type)) return { ok: false, reason: 'legacy_office' }
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
