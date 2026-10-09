import { describe, it, expect } from 'vitest'
import { deflateSync, strToU8, Zip, ZipDeflate, zipSync } from 'fflate'
import { extractDocx, officeKindOf, OFFICE_LIMITS } from '../../utils/planImport/extractOffice'
import { wordLibreOffice, wordPythonDocxGrid, excelOpenpyxl } from './fixtures/officeFixtures'
import { deflatedZeros, rawZip } from './fixtures/rawZip'

/**
 * Initiative 004, PR 6: a Word plan, read in the browser. A plan is usually a
 * week-by-day grid, so what is checked is that every day stays under its
 * heading. Real files first (made by python-docx and LibreOffice:
 * scripts/generate-plan-import-office-fixtures.py), then hand-built XML for
 * the cases those tools can't be made to write.
 */

const bytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0))
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const docx = (body: string, extra: Record<string, Uint8Array> = {}) => zipSync({
  '[Content_Types].xml': strToU8('<Types/>'),
  'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`),
  ...extra,
})
const p = (...runs: string[]) => `<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr>${runs.join('')}</w:p>`
const r = (inner: string) => `<w:r><w:rPr><w:b/></w:rPr>${inner}</w:r>`
const t = (s: string) => `<w:t xml:space="preserve">${s}</w:t>`
const cell = (text: string, tcPr = '') => `<w:tc><w:tcPr>${tcPr}</w:tcPr>${p(r(t(text)))}</w:tc>`
const row = (cells: string, trPr = '') => `<w:tr><w:trPr>${trPr}</w:trPr>${cells}</w:tr>`
const text = (out: ReturnType<typeof extractDocx>) => (out.ok ? out.text : out.reason)

describe('real Word files', () => {
  it('python-docx: a grid that opens the document keeps its empty corner, and a merged cell keeps the days after it in place', () => {
    expect(text(extractDocx(bytes(wordPythonDocxGrid))).split('\n')).toEqual([
      '\tMon\tTue\tWed\tThu\tFri\tSat\tSun',
      'Week 1\tRest\tEasy 4\tTempo 5 (Wed or Thu)\t\tEasy 3\tLong 8\tRest',
      'Week 2\tRest\tEasy 5\tHills\tEasy 4\tRest\tLong 10\tRest',
      '',
      'Easy 5-6 mi on tired days',
    ])
  })

  it('LibreOffice: a text box once, on its own lines, and spans kept in their columns', () => {
    expect(text(extractDocx(bytes(wordLibreOffice))).split('\n')).toEqual([
      'Club plan',
      'Key:',
      'E = easy',
      'T = tempo',
      'Week\tMon\tTue\tWed',
      '1\tTravel\t\tE 4',
      '\tRest\tT 5\tRest',
    ])
  })
})

describe('extractDocx', () => {
  it('reads paragraphs in order, with tabs and line breaks, and not the tab-stop definitions', () => {
    const out = extractDocx(docx(
      p(r(t('Week 1'))) +
      p(r(t('Tue')), r('<w:tab/>'), r(t('Easy 4 mi'))) +
      p(r(t('Sun: long run')), r('<w:br/>'), r(t('8 mi easy'))),
    ))
    expect(out).toEqual({ ok: true, text: 'Week 1\nTue\tEasy 4 mi\nSun: long run\n8 mi easy' })
  })

  it('a row that starts late, or a cell spanning days, keeps every later day in its column', () => {
    const out = extractDocx(docx(`<w:tbl>${
      row(cell('Mon') + cell('Tue') + cell('Wed') + cell('Thu'))
    }${
      row(cell('Hills') + cell('Easy'), '<w:gridBefore w:val="2"/>')
    }${
      row(cell('Travel', '<w:gridSpan w:val="3"/>') + cell('Long'))
    }</w:tbl>`))
    expect(text(out).split('\n')).toEqual(['Mon\tTue\tWed\tThu', '\t\tHills\tEasy', 'Travel\t\t\tLong'])
  })

  it('rows and cells inside content controls are still rows and cells', () => {
    const sdt = (inner: string) => `<w:sdt><w:sdtPr/><w:sdtContent>${inner}</w:sdtContent></w:sdt>`
    const out = extractDocx(docx(`<w:tbl>${
      row(cell('Mon') + cell('Tue'))
    }${
      sdt(row(cell('Easy 3') + sdt(cell('Rest'))))
    }</w:tbl>${sdt(p(r(t('After'))))}`))
    expect(text(out).split('\n')).toEqual(['Mon\tTue', 'Easy 3\tRest', '', 'After'])
  })

  it('a layout table holding the plan keeps the plan\'s rows; a table inside a grid cell stays in that cell', () => {
    const plan = `<w:tbl>${row(cell('Mon') + cell('Tue'))}${row(cell('Rest') + cell('Easy 4'))}</w:tbl>`
    const layout = extractDocx(docx(`<w:tbl>${row(`<w:tc>${p(r(t('Block 1')))}${plan}</w:tc>`)}</w:tbl>`))
    expect(text(layout).split('\n')).toEqual(['Block 1', 'Mon\tTue', 'Rest\tEasy 4'])
    const inner = `<w:tbl>${row(cell('6 x 800') + cell('90s jog'))}</w:tbl>`
    const grid = extractDocx(docx(`<w:tbl>${row(cell('Thu') + `<w:tc>${p(r(t('Intervals')))}${inner}</w:tc>`)}</w:tbl>`))
    expect(text(grid)).toBe('Thu\tIntervals / 6 x 800 / 90s jog')
  })

  it('a text box is read once, from Word\'s choice and not its fallback copy', () => {
    const box = (s: string) => `<w:txbxContent>${p(r(t(s)))}</w:txbxContent>`
    const alt = `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice Requires="wps"><w:drawing>${box('Key: E = easy')}</w:drawing></mc:Choice><mc:Fallback><w:pict>${box('Key: E = easy')}</w:pict></mc:Fallback></mc:AlternateContent>`
    expect(text(extractDocx(docx(p(r(t('Week 1')), r(alt)))))).toBe('Week 1\nKey: E = easy')
  })

  it('a text box inside a table cell is read once, in that cell', () => {
    const box = (s: string) => `<w:txbxContent>${p(r(t(s)))}</w:txbxContent>`
    const alt = `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice Requires="wps"><w:drawing>${box('Z2 only')}</w:drawing></mc:Choice><mc:Fallback><w:pict>${box('Z2 only')}</w:pict></mc:Fallback></mc:AlternateContent>`
    const out = extractDocx(docx(`<w:tbl>${row(cell('Tue') + `<w:tc>${p(r(t('Easy 4')), r(alt))}</w:tc>`)}</w:tbl>`))
    expect(text(out)).toBe('Tue\tEasy 4 Z2 only')
  })

  it('hidden text and a tracked move\'s source are left out, as Word shows the document', () => {
    const hidden = (s: string, val = '') => `<w:r><w:rPr><w:vanish${val}/></w:rPr>${t(s)}</w:r>`
    const out = extractDocx(docx(
      p(r(t('Tue easy 4')), hidden(' (coach only: skip if HRV low)')) +
      p(r(t('Thu ')), hidden('tempo', ' w:val="false"'), hidden(' hills', ' w:val="1"')) +
      `<w:moveFrom w:id="1">${p(r(t('Sat long 10')))}</w:moveFrom>` +
      p(`<w:moveTo w:id="2">${r(t('Sun long 10'))}</w:moveTo>`, `<w:del w:id="3"><w:r><w:delText>Mon rest</w:delText></w:r></w:del>`) +
      p(r(t('Fri ')), `<w:moveFrom w:id="4">${r(t('moved away '))}</w:moveFrom>`, r(t('rest'))),
    ))
    expect(text(out).split('\n')).toEqual(['Tue easy 4', 'Thu tempo', 'Sun long 10', 'Fri rest'])
  })

  it('keeps hyphens Word won\'t break, drops soft ones, and decodes entities', () => {
    const out = extractDocx(docx(p(r(t('Easy 5')), r('<w:noBreakHyphen/>'), r(t('6 mi, tempo')), r('<w:softHyphen/>'), r(t(' &amp; hills &lt;Z3&gt;')))))
    expect(text(out)).toBe('Easy 5-6 mi, tempo & hills <Z3>')
  })

  it('an empty document is empty, not unreadable', () => {
    expect(extractDocx(docx(p() + p(r(t('   ')))))).toEqual({ ok: false, reason: 'empty_file' })
  })

  it('anything that is not a Word document can\'t be read', () => {
    expect(extractDocx(strToU8('not a zip at all'))).toEqual({ ok: false, reason: 'office_unreadable' })
    expect(extractDocx(zipSync({ 'xl/workbook.xml': strToU8('<workbook/>') }))).toEqual({ ok: false, reason: 'office_unreadable' })
    // Cut off inside the document: unreadable. Cut off after it (an
    // interrupted download that lost only the zip's index): still read.
    const broken = docx(p(r(t('ok'))))
    expect(extractDocx(broken.slice(0, 120))).toEqual({ ok: false, reason: 'office_unreadable' })
    expect(extractDocx(broken.slice(0, broken.length - 30))).toEqual({ ok: true, text: 'ok' })
    expect(extractDocx(zipSync({ 'word/document.xml': strToU8('<w:document><unclosed') }))).toEqual({ ok: false, reason: 'office_unreadable' })
  })
})

/** The fflate version installed, the one the tests run, as [major, minor, patch]. */
function installedFflate(): number[] {
  const pkg = Object.values(import.meta.glob('/node_modules/fflate/package.json', { query: '?raw', import: 'default', eager: true }))[0] as string
  return String(JSON.parse(pkg).version).split('.').map(Number)
}
const PATCHED = [0, 8, 3]
const patched = (v: number[]) => v[0] > PATCHED[0] || (v[0] === PATCHED[0] && (v[1] > PATCHED[1] || (v[1] === PATCHED[1] && v[2] >= PATCHED[2])))

/**
 * GHSA-px8p-9vwx-vf98's trigger: a ZIP64 archive whose entry gives the
 * ZIP64 sentinel as its compressed size but has no ZIP64 field to read it
 * from. A ZIP64 end record, its locator and the classic end record go after
 * the central directory.
 */
function zip64WithoutField(): Uint8Array {
  const inner = zipSync({ 'word/document.xml': strToU8('<w:document/>') }, { level: 0 })
  const iv = new DataView(inner.buffer, inner.byteOffset, inner.byteLength)
  const end = inner.length - 22
  const cdSize = iv.getUint32(end + 12, true)
  const cdOffset = iv.getUint32(end + 16, true)
  // In the entry's own header (what a streaming read sees) and in the
  // central directory (what unzipSync sees).
  iv.setUint32(18, 0xffffffff, true)
  iv.setUint32(cdOffset + 20, 0xffffffff, true)
  const out = new Uint8Array(end + 56 + 20 + 22)
  out.set(inner.subarray(0, end))
  const dv = new DataView(out.buffer)
  const z = end
  dv.setUint32(z, 0x06064b50, true); dv.setUint32(z + 4, 44, true)
  dv.setUint32(z + 24, 1, true); dv.setUint32(z + 32, 1, true)
  dv.setUint32(z + 40, cdSize, true); dv.setUint32(z + 48, cdOffset, true)
  const locator = z + 56
  dv.setUint32(locator, 0x07064b50, true); dv.setUint32(locator + 8, z, true); dv.setUint32(locator + 16, 1, true)
  const eocd = locator + 20
  dv.setUint32(eocd, 0x06054b50, true); dv.setUint16(eocd + 8, 0xffff, true); dv.setUint16(eocd + 10, 0xffff, true)
  dv.setUint32(eocd + 12, cdSize, true); dv.setUint32(eocd + 16, 0xffffffff, true)
  return out
}

describe('safety', () => {
  it('fflate is at least 0.8.3, which stops unzipSync looping forever (GHSA-px8p-9vwx-vf98)', () => {
    // Checked first, so a downgrade fails here at once: the file below
    // would hang an older fflate, beyond any test timeout's reach.
    expect(patched(installedFflate()), `fflate ${installedFflate().join('.')} is below 0.8.3`).toBe(true)
  })

  it.runIf(patched(installedFflate()))('the advisory\'s own file is refused at once', () => {
    const started = Date.now()
    expect(extractDocx(zip64WithoutField())).toEqual({ ok: false, reason: 'office_unreadable' })
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it('a part that unzips to more than the limit is refused', () => {
    const file = docx(p(r(t('Week 1: Tue easy 4 mi'))))
    expect(extractDocx(file).ok).toBe(true)
    expect(extractDocx(file, { ...OFFICE_LIMITS, maxEntryBytes: 100 })).toEqual({ ok: false, reason: 'too_large' })
  })

  it('text far past what the reader takes is too long', () => {
    const file = docx(p(r(t('x'.repeat(200)))))
    expect(extractDocx(file, { ...OFFICE_LIMITS, maxChars: 200 }).ok).toBe(true)
    expect(extractDocx(file, { ...OFFICE_LIMITS, maxChars: 199 })).toEqual({ ok: false, reason: 'too_long' })
  })

  it('a part that claims a few bytes but unzips to megabytes stops at the real limit, at once', () => {
    // 32 MB of zeros claiming to be 100 bytes. Trusting the claim, fflate's
    // unzipSync decodes all of it into nowhere: minutes, for a few MB of file.
    const bomb = rawZip([{ name: 'word/document.xml', method: 8, data: deflatedZeros(32), declaredSize: 100 }])
    const started = Date.now()
    expect(extractDocx(bomb)).toEqual({ ok: false, reason: 'too_large' })
    expect(Date.now() - started).toBeLessThan(5_000)
  }, 20_000)

  it('a stored part counts what it really holds, not what it claims', () => {
    const xml = strToU8(`<w:document ${W}><w:body>${p(r(t('x'.repeat(2_000))))}</w:body></w:document>`)
    const lying = rawZip([{ name: 'word/document.xml', method: 0, data: xml, declaredSize: 1 }])
    expect(extractDocx(lying).ok).toBe(true)
    expect(extractDocx(lying, { ...OFFICE_LIMITS, maxEntryBytes: 1_000 })).toEqual({ ok: false, reason: 'too_large' })
  })

  it('the walk stops after the entry limit', () => {
    const doc = deflateSync(strToU8(`<w:document ${W}><w:body>${p(r(t('Plan')))}</w:body></w:document>`))
    const entries = [...Array.from({ length: 5 }, (_, i) => ({ name: `pad${i}.txt`, method: 0 as const, data: strToU8('x') })),
      { name: 'word/document.xml', method: 8 as const, data: doc }]
    expect(extractDocx(rawZip(entries), { ...OFFICE_LIMITS, maxEntries: 6 })).toEqual({ ok: true, text: 'Plan' })
    expect(extractDocx(rawZip(entries), { ...OFFICE_LIMITS, maxEntries: 5 })).toEqual({ ok: false, reason: 'office_unreadable' })
  })

  it('a zip written as a stream, sizes after the data, reads the same', () => {
    const chunks: Uint8Array[] = []
    const zip = new Zip((err, data) => { if (err) throw err; chunks.push(data) })
    const entry = new ZipDeflate('word/document.xml')
    zip.add(entry)
    entry.push(strToU8(`<w:document ${W}><w:body>${p(r(t('Week 1')))}</w:body></w:document>`), true)
    zip.end()
    const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
    chunks.reduce((at, c) => (bytes.set(c, at), at + c.length), 0)
    expect(new DataView(bytes.buffer).getUint16(6, true) & 8).toBe(8)
    expect(extractDocx(bytes)).toEqual({ ok: true, text: 'Week 1' })
  })

  it('long runs of spaces or line breaks are trimmed in one pass, not one per character', () => {
    // A trailing-run regex backtracks over each run: 100,000 of either took 9-11 s.
    const run = (filler: string) => docx(`<w:p><w:r><w:t xml:space="preserve">a${filler}b</w:t></w:r></w:p>`)
    const started = Date.now()
    expect(text(extractDocx(run(' '.repeat(100_000))))).toBe(`a${' '.repeat(100_000)}b`)
    expect(text(extractDocx(run('\n'.repeat(100_000))))).toBe('a\n\nb')
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it('a deflate stream followed by junk is given up on, not ground through', () => {
    const doc = deflateSync(strToU8(`<w:document ${W}><w:body>${p(r(t('Plan')))}</w:body></w:document>`))
    const withJunk = (n: number) => {
      const data = new Uint8Array(doc.length + n)
      data.set(doc)
      data.fill(0x41, doc.length)
      return rawZip([{ name: 'word/document.xml', method: 8, data }])
    }
    // A little after the stream is harmless; megabytes made fflate re-copy
    // its backlog on every slice (8 MB took 1.8 s, 15 MB 7 s).
    expect(extractDocx(withJunk(1_000))).toEqual({ ok: true, text: 'Plan' })
    const started = Date.now()
    expect(extractDocx(withJunk(8_000_000))).toEqual({ ok: false, reason: 'office_unreadable' })
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it('reads a zip at the entry limit, and refuses one past it', () => {
    const doc = deflateSync(strToU8(`<w:document ${W}><w:body>${p(r(t('Plan')))}</w:body></w:document>`))
    const zip = (pads: number) => rawZip([...Array.from({ length: pads }, (_, i) => ({ name: `p${i}`, method: 0 as const, data: strToU8('x') })),
      { name: 'word/document.xml', method: 8 as const, data: doc }])
    expect(OFFICE_LIMITS.maxEntries).toBe(1_000)
    expect(extractDocx(zip(999))).toEqual({ ok: true, text: 'Plan' })
    expect(extractDocx(zip(1_000))).toEqual({ ok: false, reason: 'office_unreadable' })
  })

  it('a part that declares a DOCTYPE is never parsed', () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE w:document [<!ENTITY a "aaaaaaaaaa">]><w:document ${W}><w:body>${p(r(t('&a;')))}</w:body></w:document>`
    expect(extractDocx(zipSync({ 'word/document.xml': strToU8(xml) }))).toEqual({ ok: false, reason: 'office_unreadable' })
  })

  it('parts it doesn\'t need are never unzipped, however large', () => {
    const photo = new Uint8Array(OFFICE_LIMITS.maxEntryBytes + 1)
    expect(extractDocx(docx(p(r(t('Plan'))), { 'word/media/image1.png': photo }))).toEqual({ ok: true, text: 'Plan' })
  })

  it('a 98-byte zip claiming billions of entries is refused in moments, not hours', () => {
    // The reader walks the entries actually there, so a directory's claims
    // cost nothing (unzipSync would loop once per claimed entry).
    const hang = new Uint8Array(98)
    const dv = new DataView(hang.buffer)
    dv.setUint32(0, 0x06064b50, true); dv.setUint32(32, 0xffffffff, true); dv.setUint32(48, 0x7fffffff, true)
    dv.setUint32(56, 0x07064b50, true); dv.setUint32(64, 0, true)
    dv.setUint32(76, 0x06054b50, true); dv.setUint16(84, 0xffff, true); dv.setUint16(86, 0xffff, true); dv.setUint32(92, 0xffffffff, true)
    const started = Date.now()
    expect(extractDocx(hang)).toEqual({ ok: false, reason: 'office_unreadable' })
    expect(officeKindOf(hang)).toBeNull()
    expect(Date.now() - started).toBeLessThan(2_000)
  })
})

describe('officeKindOf', () => {
  it('tells Word from Excel by what the zip holds, whatever the file is called', () => {
    expect(officeKindOf(bytes(wordPythonDocxGrid))).toBe('docx')
    expect(officeKindOf(bytes(excelOpenpyxl))).toBe('xlsx')
    expect(officeKindOf(zipSync({ 'readme.txt': strToU8('hi') }))).toBeNull()
    expect(officeKindOf(strToU8('not a zip'))).toBeNull()
  })
})
