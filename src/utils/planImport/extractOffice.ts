/**
 * Word (.docx) and Excel (.xlsx) files, read in the browser (initiative 004,
 * PR 6, D11). Both are zip files of XML: this unzips only the parts it needs
 * (`fflate`) and turns them into text for the plan reader. A training plan is
 * usually a week-by-day grid, so the grid is what must survive: tables become
 * tab-separated rows with every day under its own heading (merged cells keep
 * their columns), and an Excel cell reads the way Excel shows it (8:30, not
 * 0.354; "Mon", not the date behind it).
 *
 * Loaded only with `import()`, from `prepareUpload`, on first use. fflate
 * itself already ships with the app, because jspdf uses it for PDF export.
 * Never throws: a file it can't read (damaged, password-protected, not really
 * Word or Excel) is `office_unreadable`.
 *
 * Safety. A zip can be built to hang or exhaust a tab, and plans come from
 * coaches and clubs, not only the athlete:
 * - fflate is at least 0.8.3, which fixes the ZIP64 infinite loop in
 *   `unzipSync` (GHSA-px8p-9vwx-vf98).
 * - The zip is read with fflate's streaming `Unzip`, entry by entry, through
 *   decoders here that count the bytes each part actually produces and stop
 *   at `maxEntryBytes` a part and `maxTotalBytes` in all. What the zip
 *   declares is never trusted: `unzipSync` inflates into a buffer of the
 *   declared size and keeps decoding past its end, so a part declaring 100
 *   bytes could make minutes of work. Deflate input goes in 16 KB slices, so
 *   the most that can be produced before a check is about 16.5 MB.
 * - Reading stops after `maxEntries` entries, `maxSheets` sheets, and once
 *   the text passes `maxChars`, far more than the plan reader takes.
 * - XML goes through DOMParser, which loads no external entities.
 */

import { Inflate, strFromU8, Unzip, type AsyncFlateStreamHandler, type UnzipDecoder } from 'fflate'

export const OFFICE_LIMITS = {
  /** One part, as it actually unzips. */
  maxEntryBytes: 20_000_000,
  /** All the parts read from one file, together. */
  maxTotalBytes: 40_000_000,
  /** Entries in the zip. Real Word and Excel files hold dozens; fflate's
   *  streaming reader recurses per entry, so this stays well below where
   *  that would overflow (about 2,500). */
  maxEntries: 1_000,
  /** Visible sheets read from a workbook. */
  maxSheets: 100,
  /** Text read out. The plan reader takes 120,000 characters, so past this
   *  the file is `too_long` whatever happens next. */
  maxChars: 1_000_000,
} as const

export type OfficeLimits = { [K in keyof typeof OFFICE_LIMITS]: number }
export type OfficeKind = 'docx' | 'xlsx'
export type OfficeFailure = 'office_unreadable' | 'empty_file' | 'too_large' | 'too_long'
export type OfficeResult = { ok: true; text: string } | { ok: false; reason: OfficeFailure }

const UNREADABLE = { ok: false, reason: 'office_unreadable' } as const
const TOO_LARGE = { ok: false, reason: 'too_large' } as const
const TOO_LONG = { ok: false, reason: 'too_long' } as const

class PartTooLarge extends Error {}
class TooManyEntries extends Error {}

/** Deflate input handed over at a time: at most about 16.5 MB comes out. */
const SLICE = 16_384
/** Input taken with nothing coming out before a stream is given up on. A
 *  real deflate stream never gets near it; one followed by junk would
 *  otherwise make fflate re-copy its growing backlog on every slice. */
const MAX_STALL = 1 << 20

/** Deflate, decoded a slice at a time so what comes out can be counted. */
class SlicedInflate implements UnzipDecoder {
  static compression = 8
  ondata: AsyncFlateStreamHandler = () => {}
  private stalled = 0
  private readonly inflate = new Inflate((data, final) => {
    if (data.length) this.stalled = 0
    this.ondata(null, data, final)
  })

  push(chunk: Uint8Array, final: boolean): void {
    if (!chunk.length) {
      if (final) this.inflate.push(chunk, true)
      return
    }
    for (let at = 0; at < chunk.length; at += SLICE) {
      const end = Math.min(at + SLICE, chunk.length)
      this.stalled += end - at
      if (this.stalled > MAX_STALL) throw new Error('deflate stream stalled')
      this.inflate.push(chunk.subarray(at, end), final && end === chunk.length)
    }
  }
}

/** Stored entries, passed through as they are. */
class Stored implements UnzipDecoder {
  static compression = 0
  ondata: AsyncFlateStreamHandler = () => {}
  push(chunk: Uint8Array, final: boolean): void {
    // A view of the picked file's own bytes, as fflate's pass-through gives.
    this.ondata(null, chunk as Uint8Array<ArrayBuffer>, final)
  }
}

/** Walks the zip's entries, telling `onEntry` each name; `onEntry` returns
 *  true to read that entry, whose bytes then come to `onData`. */
function walkZip(
  bytes: Uint8Array,
  limits: OfficeLimits,
  onEntry: (name: string) => boolean,
  onData: (name: string, chunk: Uint8Array) => void,
): void {
  let entries = 0
  const unzip = new Unzip(file => {
    if (++entries > limits.maxEntries) throw new TooManyEntries()
    if (!onEntry(file.name)) return
    file.ondata = (err, chunk) => {
      if (err) throw err
      onData(file.name, chunk)
    }
    file.start()
  })
  unzip.register(SlicedInflate)
  unzip.register(Stored)
  unzip.push(bytes, true)
}

interface Parts { text: Map<string, string>; bytes: number }

/** The named parts of a zip as text, and the bytes they came to; 'too_large'
 *  when they come to more than the limits allow; null when it can't be read.
 *  A name the zip repeats is read the first time only. */
function unzipParts(bytes: Uint8Array, wanted: (name: string) => boolean, limits: OfficeLimits): Parts | 'too_large' | null {
  const chunks = new Map<string, Uint8Array[]>()
  const sizes = new Map<string, number>()
  let total = 0
  try {
    walkZip(bytes, limits, name => {
      if (!wanted(name) || chunks.has(name)) return false
      chunks.set(name, [])
      sizes.set(name, 0)
      return true
    }, (name, chunk) => {
      const size = sizes.get(name)! + chunk.length
      total += chunk.length
      if (size > limits.maxEntryBytes || total > limits.maxTotalBytes) throw new PartTooLarge()
      sizes.set(name, size)
      chunks.get(name)!.push(chunk)
    })
  } catch (e) {
    return e instanceof PartTooLarge ? 'too_large' : null
  }
  const text = new Map<string, string>()
  for (const [name, parts] of chunks) {
    const whole = new Uint8Array(sizes.get(name)!)
    let at = 0
    for (const part of parts) {
      whole.set(part, at)
      at += part.length
    }
    text.set(name, strFromU8(whole))
  }
  return { text, bytes: total }
}

/**
 * Which kind of Office file a zip is, by the parts it holds, or null. For a
 * file picked with no extension (cloud drives often drop it). Reads entry
 * names only; nothing is unzipped.
 */
export function officeKindOf(bytes: Uint8Array, limits: OfficeLimits = OFFICE_LIMITS): OfficeKind | null {
  let kind: OfficeKind | null = null
  try {
    walkZip(bytes, limits, name => {
      if (name === 'word/document.xml') kind ??= 'docx'
      else if (name === 'xl/workbook.xml') kind ??= 'xlsx'
      return false
    }, () => {})
  } catch {
    return null
  }
  return kind
}

function parseXml(xml: string | undefined): Document | null {
  if (!xml) return null
  // Word and Excel never declare a DOCTYPE; one here could only be for
  // entity tricks, so the part isn't parsed.
  if (/<!DOCTYPE/i.test(xml)) return null
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    return doc.getElementsByTagName('parsererror').length > 0 ? null : doc
  } catch {
    return null
  }
}

/** An element's child elements. Walks siblings: jsdom's `children` costs
 *  time in proportion to the square of their number. */
function elementsIn(el: Element): Element[] {
  const found: Element[] = []
  for (let child = el.firstElementChild; child; child = child.nextElementSibling) found.push(child)
  return found
}

function childrenNamed(el: Element, localName: string): Element[] {
  return elementsIn(el).filter(c => c.localName === localName)
}

function firstNamed(root: Document | Element, localName: string): Element | undefined {
  return root.getElementsByTagNameNS('*', localName)[0]
}

/** A whole-number attribute by local name, whatever its prefix (`w:val`). */
function intAttr(el: Element | undefined, localName: string): number {
  if (!el) return 0
  for (const a of Array.from(el.attributes)) {
    if (a.localName === localName) {
      const n = Number(a.value)
      return Number.isInteger(n) && n > 0 ? Math.min(n, 64) : 0
    }
  }
  return 0
}

/**
 * `s` without any of `chars` at its end (and its start, with `both`), in one
 * pass. An anchored regex (`/[ \t]+$/`) backtracks over every run it can't
 * finish, in time that grows with the square of the run.
 */
function trimChars(s: string, chars: string, both = false): string {
  let start = 0
  let end = s.length
  if (both) while (start < end && chars.includes(s[start])) start++
  while (end > start && chars.includes(s[end - 1])) end--
  return start === 0 && end === s.length ? s : s.slice(start, end)
}

/** Lines → text: no trailing spaces, at most one blank line in a row, no
 *  blank lines at either end. A line's leading tabs are kept: they are a
 *  grid's empty first cells. */
function tidy(lines: string[]): string {
  const text = lines.map(l => trimChars(l, ' \t')).join('\n').replace(/\n{3,}/g, '\n\n')
  return trimChars(text, '\n', true)
}

function finish(lines: string[], limits: OfficeLimits): OfficeResult {
  const text = tidy(lines)
  if (text.length > limits.maxChars) return TOO_LONG
  return text.trim() ? { ok: true, text } : { ok: false, reason: 'empty_file' }
}

// ── Word ────────────────────────────────────────────────────────────────

// Property blocks hold tab-stop definitions (`w:tab`) and the like, which
// are not text. `Fallback` repeats a text box `Choice` already holds.
// Tracked changes read as accepted: deleted text and a move's source go.
const WORD_SKIP = new Set(['pPr', 'rPr', 'sectPr', 'tblPr', 'trPr', 'tcPr', 'Fallback', 'delText', 'instrText', 'moveFrom'])
// Elements that only wrap rows, cells or blocks: content controls, custom
// XML, smart tags.
const WORD_WRAPPERS = new Set(['sdt', 'sdtContent', 'customXml', 'smartTag'])

/** A run Word hides (`w:vanish`) is left out, as Excel's hidden rows are. */
function hiddenRun(run: Element): boolean {
  const rPr = childrenNamed(run, 'rPr')[0]
  const vanish = rPr && childrenNamed(rPr, 'vanish')[0]
  if (!vanish) return false
  const val = Array.from(vanish.attributes).find(a => a.localName === 'val')?.value
  return val === undefined || !/^(false|0|off)$/i.test(val)
}

function wordInline(node: Element, out: string[]): void {
  for (const child of elementsIn(node)) {
    switch (child.localName) {
      case 'r': if (!hiddenRun(child)) wordInline(child, out); break
      case 't': out.push(child.textContent ?? ''); break
      case 'tab': out.push('\t'); break
      case 'br': case 'cr': out.push('\n'); break
      case 'noBreakHyphen': out.push('-'); break
      case 'softHyphen': break
      case 'txbxContent':
        // A text box: its own lines, not glued to the paragraph it sits in.
        out.push('\n', childrenNamed(child, 'p').map(wordParagraph).join('\n'), '\n')
        break
      default: if (!WORD_SKIP.has(child.localName)) wordInline(child, out)
    }
  }
}

/** A paragraph's text. Line breaks at either end are dropped: a text box
 *  ending the paragraph would otherwise leave a blank line after it. */
function wordParagraph(p: Element): string {
  const out: string[] = []
  wordInline(p, out)
  return trimChars(out.join(''), '\n', true)
}

/** Children named `name`, looking through wrappers (a row or cell inside a
 *  repeating-section content control is still a row or a cell). */
function wordItems(el: Element, name: string): Element[] {
  const found: Element[] = []
  for (const child of elementsIn(el)) {
    if (child.localName === name) found.push(child)
    else if (WORD_WRAPPERS.has(child.localName)) found.push(...wordItems(child, name))
  }
  return found
}

/** The paragraphs under an element, including those of a table inside it,
 *  but not looking into a paragraph: its text boxes are its own text. */
function wordParagraphsIn(el: Element, found: Element[] = []): Element[] {
  for (const child of elementsIn(el)) {
    if (child.localName === 'p') found.push(child)
    else if (!WORD_SKIP.has(child.localName)) wordParagraphsIn(child, found)
  }
  return found
}

/** A cell as one line: its paragraphs, and any table inside it, joined. */
function wordCellText(tc: Element): string {
  return wordParagraphsIn(tc)
    .map(p => wordParagraph(p).replace(/[\t\n]+/g, ' ').trim())
    .filter(Boolean)
    .join(' / ')
}

/**
 * One table row per line, cells tab-separated and kept in their grid
 * columns: a cell merged across days (`gridSpan`) is followed by an empty
 * field for each further day it covers, and a row that starts late
 * (`gridBefore`) starts with empty fields. A one-cell row holding a table is
 * a layout table: its content is read as blocks, so the table inside keeps
 * its own rows.
 */
function wordTable(tbl: Element, lines: string[]): void {
  for (const tr of wordItems(tbl, 'tr')) {
    const cells = wordItems(tr, 'tc')
    // Its own tables only: a search of every descendant at each level of a
    // nested chain costs the chain's depth times its size.
    if (cells.length === 1 && wordItems(cells[0], 'tbl').length > 0) {
      wordBlocks(cells[0], lines)
      continue
    }
    const trPr = childrenNamed(tr, 'trPr')[0]
    const fields: string[] = Array(intAttr(trPr && firstNamed(trPr, 'gridBefore'), 'val')).fill('')
    for (const tc of cells) {
      fields.push(wordCellText(tc))
      const tcPr = childrenNamed(tc, 'tcPr')[0]
      const span = intAttr(tcPr && firstNamed(tcPr, 'gridSpan'), 'val')
      for (let i = 1; i < span; i++) fields.push('')
    }
    lines.push(fields.join('\t'))
  }
  lines.push('')
}

function wordBlocks(container: Element, lines: string[]): void {
  for (const child of elementsIn(container)) {
    if (child.localName === 'p') lines.push(wordParagraph(child))
    else if (child.localName === 'tbl') wordTable(child, lines)
    else if (WORD_WRAPPERS.has(child.localName)) wordBlocks(child, lines)
  }
}

/**
 * The text of a Word document's body, in order: paragraphs as lines, tables
 * as tab-separated rows in their grid columns, text boxes once.
 */
export function extractDocx(bytes: Uint8Array, limits: OfficeLimits = OFFICE_LIMITS): OfficeResult {
  try {
    const parts = unzipParts(bytes, n => n === 'word/document.xml', limits)
    if (parts === 'too_large') return TOO_LARGE
    const doc = parts && parseXml(parts.text.get('word/document.xml'))
    const body = doc && firstNamed(doc, 'body')
    if (!body) return UNREADABLE
    const lines: string[] = []
    wordBlocks(body, lines)
    return finish(lines, limits)
  } catch {
    return UNREADABLE
  }
}

// ── Excel ───────────────────────────────────────────────────────────────

const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const DAY_MS = 86_400_000
/** 9999-12-31, Excel's last date, in each date system. */
const MAX_SERIAL = 2_958_465
const MAX_SERIAL_1904 = 2_957_003
/** XFD, Excel's last column. */
const MAX_COLUMN = 16_384
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** How a number displays: Excel's own reading of its format. */
export type NumberDisplay =
  | { kind: 'general'; prefix?: string; suffix?: string }
  | { kind: 'fixed'; decimals: number; optional?: number; grouped?: boolean; prefix?: string; suffix?: string }
  | { kind: 'percent' }
  | { kind: 'date' }
  | { kind: 'weekday'; long: boolean }
  | { kind: 'month'; long: boolean; digits?: 1 | 2 }
  | { kind: 'time'; hours: boolean; seconds: boolean; ampm: boolean; padMinutes?: boolean }
  | { kind: 'elapsed'; unit: 'h' | 'm' | 's'; seconds: boolean }
  | { kind: 'hidden' }

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}

const BUILT_IN: Record<number, NumberDisplay> = {
  1: { kind: 'fixed', decimals: 0 },
  2: { kind: 'fixed', decimals: 2 },
  3: { kind: 'fixed', decimals: 0, grouped: true },
  4: { kind: 'fixed', decimals: 2, grouped: true },
  9: { kind: 'percent' },
  10: { kind: 'percent' },
  18: { kind: 'time', hours: true, seconds: false, ampm: true },
  19: { kind: 'time', hours: true, seconds: true, ampm: true },
  20: { kind: 'time', hours: true, seconds: false, ampm: false },
  21: { kind: 'time', hours: true, seconds: true, ampm: false },
  45: { kind: 'time', hours: false, seconds: true, ampm: false, padMinutes: true },
  46: { kind: 'elapsed', unit: 'h', seconds: true },
  47: { kind: 'time', hours: false, seconds: true, ampm: false, padMinutes: true },
}
for (const id of [14, 15, 16, 17, 22, ...range(27, 36), ...range(50, 58)]) BUILT_IN[id] = { kind: 'date' }

// Text a number format prints around the number: quoted, escaped, or one
// of the characters Excel shows as typed.
const AFFIX = String.raw`(?:"[^"]*"|\\.|[ $+\-()])*`
const NUMBER_FORMAT = new RegExp(`^(${AFFIX})(general|[#0,]+(?:\\.0*#*)?)(${AFFIX})$`, 'i')
const unquote = (s: string) => s.replace(/"([^"]*)"|\\(.)/g, (_, quoted?: string, escaped?: string) => quoted ?? escaped ?? '')

/**
 * How a custom number format displays a number. Quoted text, escapes and
 * [colors] don't decide the kind; `[h]`, `[m]` and `[s]` mark an elapsed
 * time. A plain number keeps the text around it (`"Week "0`, `0.0" mi"`).
 */
export function numberDisplay(code: string): NumberDisplay {
  // Padding (`_)`) and fill (`* `) only space the number out.
  const positive = code.split(';')[0].replace(/"[^"]*"|[_*]./g, t => (t.startsWith('"') ? t : ''))
  // `;;;` and the like: an empty first section hides the number in Excel.
  if (code.includes(';') && !positive.trim()) return { kind: 'hidden' }
  const elapsed = /\[(h+|m+|s+)\]/i.exec(positive)?.[1]?.[0]?.toLowerCase() as 'h' | 'm' | 's' | undefined
  const bare = positive.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[[^\]]*\]/g, '').toLowerCase().trim()
  if (bare.includes('%')) return { kind: 'percent' }
  const hasS = /s/.test(bare)
  if (elapsed) return { kind: 'elapsed', unit: elapsed, seconds: hasS || elapsed === 's' }
  if (/y/.test(bare) || /(^|[^d])d{1,2}(?!d)/.test(bare)) return { kind: 'date' }
  const hasH = /h/.test(bare)
  if (/ddd/.test(bare) && !hasH) return { kind: 'weekday', long: /dddd/.test(bare) }
  if (hasH || hasS) return { kind: 'time', hours: hasH, seconds: hasS, ampm: /am\/pm|a\/p/.test(bare), padMinutes: /mm/.test(bare) }
  if (/m{3,}/.test(bare)) return { kind: 'month', long: /mmmm/.test(bare) }
  if (/^m{1,2}$/.test(bare)) return { kind: 'month', long: false, digits: bare.length === 2 ? 2 : 1 }
  const parts = NUMBER_FORMAT.exec(positive.replace(/\[[^\]]*\]/g, '').trim())
  if (!parts) return { kind: 'general' }
  const [, before, digits, after] = parts
  const affixes = { prefix: unquote(before), suffix: unquote(after) }
  if (/^general$/i.test(digits)) return { kind: 'general', ...affixes }
  const places = /\.(0*)(#*)$/.exec(digits)
  // A comma between digit places groups thousands; a trailing one (which
  // would scale) is left alone.
  const grouped = /[#0],[#0]/.test(digits)
  return { kind: 'fixed', decimals: places?.[1].length ?? 0, optional: places?.[2].length ?? 0, grouped, ...affixes }
}

/**
 * An Excel date serial as an ISO date (UTC, so every time zone agrees).
 * The 1900 system counts from 1899-12-31, with Excel's phantom 29 Feb 1900
 * as serial 60 (null here); from serial 61 it counts from 1899-12-30. The
 * 1904 system counts from 1904-01-01. Past Excel's last date (9999-12-31)
 * in either system: null.
 */
export function serialToIso(serial: number, date1904: boolean): string | null {
  if (!Number.isFinite(serial)) return null
  const whole = Math.floor(serial)
  if (whole > (date1904 ? MAX_SERIAL_1904 : MAX_SERIAL)) return null
  let ms: number
  if (date1904) {
    if (whole < 0) return null
    ms = Date.UTC(1904, 0, 1) + whole * DAY_MS
  } else if (whole >= 61) {
    ms = Date.UTC(1899, 11, 30) + whole * DAY_MS
  } else if (whole >= 1 && whole <= 59) {
    ms = Date.UTC(1899, 11, 31) + whole * DAY_MS
  } else {
    return null
  }
  // utc-domain: `ms` is built with Date.UTC from a day count, so the UTC
  // calendar date IS the date; no local time is involved at any step.
  return new Date(ms).toISOString().slice(0, 10)
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** `0.0#` shows one decimal place, and a second only when it isn't zero. */
function fixedText(n: number, decimals: number, optional: number, grouped: boolean): string {
  let text = n.toFixed(Math.min(decimals + optional, 20))
  if (optional) text = text.replace(new RegExp(`0{1,${optional}}$`), '').replace(/\.$/, '')
  if (!grouped) return text
  const [whole, fraction] = text.split('.')
  const signed = /^-/.test(whole) ? '-' : ''
  const digits = whole.replace(/^-/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${signed}${digits}${fraction !== undefined ? `.${fraction}` : ''}`
}

const affixed = (display: { prefix?: string; suffix?: string }, text: string) =>
  `${display.prefix ?? ''}${text}${display.suffix ?? ''}`

/** A number as the cell shows it, or the raw value when there's no reading. */
export function displayNumber(raw: string, display: NumberDisplay, date1904: boolean): string {
  const n = Number(raw)
  if (raw.trim() === '' || !Number.isFinite(n)) return raw
  switch (display.kind) {
    case 'hidden': return ''
    case 'fixed': return affixed(display, fixedText(n, display.decimals, display.optional ?? 0, display.grouped ?? false))
    case 'percent': return `${Number((n * 100).toFixed(2))}%`
    case 'date': return serialToIso(n, date1904) ?? raw
    case 'weekday': case 'month': {
      const iso = serialToIso(n, date1904)
      if (!iso) return raw
      const d = new Date(`${iso}T00:00:00Z`)
      if (display.kind === 'month' && display.digits) {
        const month = d.getUTCMonth() + 1
        return display.digits === 2 ? pad2(month) : String(month)
      }
      const name = display.kind === 'weekday' ? WEEKDAYS[d.getUTCDay()] : MONTHS[d.getUTCMonth()]
      return display.long ? name : name.slice(0, 3)
    }
    case 'time': {
      if (n < 0) return raw
      const secs = Math.round((n - Math.floor(n)) * 86_400) % 86_400
      const h = Math.floor(secs / 3600)
      const m = Math.floor(secs / 60) % 60
      const s = secs % 60
      // A minutes-and-seconds time (a pace, `mm:ss` or `m:ss`) has no hour to show.
      if (!display.hours) return `${display.padMinutes ? pad2(m) : m}:${pad2(s)}`
      const tail = `${pad2(m)}${display.seconds ? `:${pad2(s)}` : ''}`
      if (display.ampm) return `${h % 12 === 0 ? 12 : h % 12}:${tail} ${h < 12 ? 'AM' : 'PM'}`
      return `${h}:${tail}`
    }
    case 'elapsed': {
      if (n < 0) return raw
      const secs = Math.round(n * 86_400)
      const s = secs % 60
      if (display.unit === 's') return String(secs)
      if (display.unit === 'm') return `${Math.floor(secs / 60)}:${pad2(s)}`
      return `${Math.floor(secs / 3600)}:${pad2(Math.floor(secs / 60) % 60)}${display.seconds ? `:${pad2(s)}` : ''}`
    }
    default: return affixed(display, String(Number(n.toPrecision(12))))
  }
}

/** Excel's `_xHHHH_` escapes (`_x000D_` for a carriage return). */
function unescapeExcel(s: string): string {
  return s.replace(/_x([0-9a-fA-F]{4})_/g, (_, hex: string) => {
    const code = parseInt(hex, 16)
    // Control characters other than tab and line breaks mean nothing to a
    // reader, and a NUL would make the text look like a binary file.
    return code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d ? '' : String.fromCharCode(code)
  })
}

/** Rich-text runs included, phonetic guides (`rPh`) left out. */
function stringItemText(si: Element): string {
  const out: string[] = []
  const walk = (el: Element) => {
    for (const child of elementsIn(el)) {
      if (child.localName === 't') out.push(child.textContent ?? '')
      else if (child.localName !== 'rPh') walk(child)
    }
  }
  walk(si)
  return unescapeExcel(out.join(''))
}

/** Zero-based column from a cell reference ("C7" → 2). */
function columnOf(ref: string | null): number | null {
  const letters = /^([A-Z]+)\d*$/i.exec(ref ?? '')?.[1]
  if (!letters) return null
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** A relationship's target as a path in the zip: absolute, or relative to
 *  `xl/`, with `.` and `..` resolved. */
function sheetPath(target: string): string {
  const parts: string[] = []
  for (const seg of (target.startsWith('/') ? target : `xl/${target}`).split('/')) {
    if (seg === '..') parts.pop()
    else if (seg && seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

const truthy = (v: string | null) => v === '1' || v === 'true'

/** A cell on one line, as the reader gets it. */
const cleanCell = (s: string) => s.replace(/[\t\n\r]+/g, ' ').trim()

/** Real format codes are a few dozen characters. A longer one is read as
 *  General, so a crafted one can't make every number in a sheet slow. */
const MAX_FORMAT_CODE = 255

/**
 * A sheet's columns as the reader sees them: a zero-based column's place
 * among the visible ones, or null when it's hidden. Built once per sheet in
 * steps proportional to its `<col>` entries plus Excel's column count, however
 * wide the ranges they hide.
 */
function visibleColumns(sheet: Document): (col: number) => number | null {
  const ranges = Array.from(sheet.getElementsByTagNameNS('*', 'col')).filter(c => truthy(c.getAttribute('hidden')))
  if (!ranges.length) return col => col
  const edges = new Int32Array(MAX_COLUMN + 1)
  for (const range of ranges) {
    const min = Math.max(1, Number(range.getAttribute('min')) || 1)
    const max = Math.min(Number(range.getAttribute('max')) || min, MAX_COLUMN)
    if (max < min) continue
    edges[min - 1]++
    edges[max]--
  }
  const hiddenBefore = new Int32Array(MAX_COLUMN + 1)
  const hidden = new Uint8Array(MAX_COLUMN)
  let depth = 0
  for (let i = 0; i < MAX_COLUMN; i++) {
    depth += edges[i]
    hidden[i] = depth > 0 ? 1 : 0
    hiddenBefore[i + 1] = hiddenBefore[i] + hidden[i]
  }
  return col => (hidden[col] ? null : col - hiddenBefore[col])
}

/**
 * Every visible sheet of a workbook, in tab order, as "Sheet: <name>" and
 * then its visible rows, cells tab-separated in their columns (hidden
 * columns left out). Numbers read the way the cell shows them: dates as ISO
 * dates, weekday and month headers as names, times and paces as h:mm or
 * mm:ss, percentages with %.
 */
export function extractXlsx(bytes: Uint8Array, limits: OfficeLimits = OFFICE_LIMITS): OfficeResult {
  try {
    const meta = unzipParts(bytes, n =>
      n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/sharedStrings.xml' || n === 'xl/styles.xml', limits)
    if (meta === 'too_large') return TOO_LARGE
    if (!meta) return UNREADABLE
    const workbook = parseXml(meta.text.get('xl/workbook.xml'))
    const rels = parseXml(meta.text.get('xl/_rels/workbook.xml.rels'))
    if (!workbook || !rels) return UNREADABLE

    const date1904 = truthy(firstNamed(workbook, 'workbookPr')?.getAttribute('date1904') ?? null)
    const targets = new Map<string, string>()
    for (const rel of Array.from(rels.getElementsByTagNameNS('*', 'Relationship'))) {
      const id = rel.getAttribute('Id')
      const target = rel.getAttribute('Target')
      // Worksheets only: a chart sheet has no cells to read.
      if (id && target && (rel.getAttribute('Type') ?? '').endsWith('worksheet')) targets.set(id, sheetPath(target))
    }
    // Each part once: a crafted workbook can name one part many times.
    const seen = new Set<string>()
    const sheets = Array.from(workbook.getElementsByTagNameNS('*', 'sheet'))
      .filter(s => (s.getAttribute('state') ?? 'visible') === 'visible')
      .map(s => ({
        name: s.getAttribute('name') ?? '',
        path: targets.get(s.getAttributeNS(REL_NS, 'id') ?? s.getAttribute('r:id') ?? '') ?? '',
      }))
      .filter(s => s.path && !seen.has(s.path) && seen.add(s.path))
      .slice(0, limits.maxSheets)
    // Only the visible sheets the workbook names are unzipped, within what
    // the limits leave after the parts above.
    const sheetPaths = new Set(sheets.map(s => s.path))
    const sheetParts = unzipParts(bytes, n => sheetPaths.has(n), {
      ...limits, maxTotalBytes: limits.maxTotalBytes - meta.bytes,
    })
    if (sheetParts === 'too_large') return TOO_LARGE
    if (!sheetParts) return UNREADABLE

    // Shared strings are cleaned once, here: a cell only points at one, and
    // any number of cells can point at the same long string.
    const strings = Array.from(parseXml(meta.text.get('xl/sharedStrings.xml'))?.getElementsByTagNameNS('*', 'si') ?? [])
      .map(si => cleanCell(stringItemText(si).slice(0, limits.maxChars + 1)))
    const styles = parseXml(meta.text.get('xl/styles.xml'))
    const custom = new Map<number, string>()
    for (const f of Array.from(styles?.getElementsByTagNameNS('*', 'numFmt') ?? [])) {
      custom.set(Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode') ?? '')
    }
    // Each format read once, however many styles use it.
    const byFormat = new Map<number, NumberDisplay>()
    const displayFor = (id: number): NumberDisplay => {
      let display = byFormat.get(id)
      if (!display) {
        const code = custom.get(id)
        display = code === undefined ? BUILT_IN[id] ?? { kind: 'general' }
          : code.length > MAX_FORMAT_CODE ? { kind: 'general' } : numberDisplay(code)
        byFormat.set(id, display)
      }
      return display
    }
    const cellXfs = styles ? firstNamed(styles, 'cellXfs') : undefined
    const displays: NumberDisplay[] = (cellXfs ? childrenNamed(cellXfs, 'xf') : [])
      .map(xf => displayFor(Number(xf.getAttribute('numFmtId') ?? 0)))

    const cellText = (c: Element): string => {
      const type = c.getAttribute('t')
      const v = childrenNamed(c, 'v')[0]?.textContent ?? ''
      if (type === 's') return v === '' ? '' : strings[Number(v)] ?? ''
      return cleanCell(ownCellText(c, type, v))
    }
    const ownCellText = (c: Element, type: string | null, v: string): string => {
      if (type === 'inlineStr') {
        const is = childrenNamed(c, 'is')[0]
        return is ? stringItemText(is) : ''
      }
      if (type === 'b') return v === '1' ? 'TRUE' : v === '0' ? 'FALSE' : v
      if (type === 'd') return v.slice(0, 10)
      if (type === 'str') return unescapeExcel(v)
      if (type === 'e') return v
      return displayNumber(v, displays[Number(c.getAttribute('s') ?? 0)] ?? { kind: 'general' }, date1904)
    }

    const lines: string[] = []
    let chars = 0
    for (const sheet of sheets) {
      // A sheet the workbook names but the file lacks, or can't parse, is a
      // damaged file, not an empty one.
      const xml = parseXml(sheetParts.text.get(sheet.path))
      if (!xml) return UNREADABLE
      const data = firstNamed(xml, 'sheetData')
      if (!data) continue
      const visible = visibleColumns(xml)
      // Rows go straight into the lines: no spread, which a long sheet
      // would overflow.
      let named = false
      for (const row of childrenNamed(data, 'row')) {
        if (truthy(row.getAttribute('hidden'))) continue
        // Only the cells present are visited, so a row's cost is its cells
        // and its text, not the column its last cell sits in.
        let line = ''
        let at = 0
        let next = 0
        for (const c of childrenNamed(row, 'c')) {
          const col = columnOf(c.getAttribute('r')) ?? next
          if (col >= MAX_COLUMN) break
          next = col + 1
          const position = visible(col)
          if (position === null) continue
          const value = cellText(c)
          if (!value) continue
          // A cell out of order (a damaged file) still gets its own field.
          const gap = position - at
          line += (line ? '\t'.repeat(Math.max(gap, 1)) : '\t'.repeat(gap)) + value
          at = Math.max(at, position)
          if (chars + line.length > limits.maxChars) return TOO_LONG
        }
        if (!line.trim()) continue
        if (!named) lines.push(`Sheet: ${sheet.name}`)
        named = true
        lines.push(line)
        chars += line.length + 1
      }
      if (named) lines.push('')
    }
    return finish(lines, limits)
  } catch {
    return UNREADABLE
  }
}
