import { describe, it, expect, vi } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { prepareUpload, bytesToBase64, type ResizeFn } from '../../utils/planImport/prepareUpload'
import { OFFICE_FILE_BYTES, UPLOAD_LIMITS } from '../../utils/planImport/uploadLimits'
import { extractDocx, extractXlsx } from '../../utils/planImport/extractOffice'
import { excelOpenpyxl, wordPythonDocxGrid } from './fixtures/officeFixtures'
import { deflatedZeros, rawZip } from './fixtures/rawZip'

/**
 * Initiative 004, PR 5: what the athlete picked → the endpoint's body.
 * Every request costs one of five daily uploads, so anything the server
 * would refuse must be refused here, by the file's own bytes.
 */

const PDF_HEAD = '%PDF-1.7\n'
const pdf = (body = 'stream', name = 'coach-plan.pdf', type = 'application/pdf') =>
  new File([PDF_HEAD + body], name, { type })
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0])
const OLE = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0])
// A password-protected .docx/.xlsx: an OLE file holding an "EncryptedPackage"
// stream (its directory names it in UTF-16LE). An older .doc/.xls never has one.
const ENCRYPTED = new Uint8Array([...OLE, ...Array.from('EncryptedPackage').flatMap(c => [c.charCodeAt(0), 0])])

const okResize: ResizeFn = vi.fn(async () => ({ base64: 'SlBFRw==', mediaType: 'image/jpeg', bytes: 4 }))

describe('PDFs', () => {
  it('are sent as base64 of their own bytes, by their bytes', async () => {
    const r = await prepareUpload({ file: pdf() })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.body.kind).toBe('pdf')
    expect(atob(r.body.data!)).toBe(PDF_HEAD + 'stream')
    expect(r.source).toEqual({ name: 'coach-plan.pdf', kind: 'pdf' })
  })

  it('are recognised with no type and no extension', async () => {
    const r = await prepareUpload({ file: new File([PDF_HEAD], 'download', { type: '' }) })
    expect(r.ok && r.body.kind).toBe('pdf')
  })

  it('that are not really PDFs are refused before anything is sent', async () => {
    const resize = vi.fn()
    expect(await prepareUpload({ file: new File(['<html>'], 'plan.pdf', { type: 'application/pdf' }) }, { resize }))
      .toEqual({ ok: false, reason: 'not_a_pdf' })
    expect(resize).not.toHaveBeenCalled()
  })

  it('may be exactly the server\'s limit, and not one byte more', async () => {
    const at = new File([PDF_HEAD, new Uint8Array(UPLOAD_LIMITS.maxFileBytes - PDF_HEAD.length)], 'a.pdf')
    const over = new File([PDF_HEAD, new Uint8Array(UPLOAD_LIMITS.maxFileBytes - PDF_HEAD.length + 1)], 'a.pdf')
    expect((await prepareUpload({ file: at })).ok).toBe(true)
    expect(await prepareUpload({ file: over })).toEqual({ ok: false, reason: 'too_large' })
  })

  it('at the limit still fits the server\'s body cap once encoded', async () => {
    const at = new File([PDF_HEAD, new Uint8Array(UPLOAD_LIMITS.maxFileBytes - PDF_HEAD.length)], 'a.pdf')
    const r = await prepareUpload({ file: at, hint: 'x'.repeat(400) })
    expect(r.ok).toBe(true)
    if (r.ok) expect(JSON.stringify(r.body).length).toBeLessThan(UPLOAD_LIMITS.maxBodyBytes)
  })
})

describe('photos and screenshots', () => {
  it('are re-encoded for the reader', async () => {
    const r = await prepareUpload({ file: new File([JPEG], 'IMG_0412.jpg', { type: 'image/jpeg' }) }, { resize: okResize })
    expect(r).toEqual({
      ok: true,
      body: { kind: 'image', data: 'SlBFRw==', mediaType: 'image/jpeg' },
      source: { name: 'IMG_0412.jpg', kind: 'image' },
    })
  })

  it('are recognised by their bytes whatever they are called', async () => {
    const r = await prepareUpload({ file: new File([PNG], 'schedule', { type: '' }) }, { resize: okResize })
    expect(r.ok && r.body.kind).toBe('image')
  })

  it('that come out in a format the reader refuses, or too big to send, are refused here', async () => {
    const tiff: ResizeFn = async () => ({ base64: 'AAAA', mediaType: 'image/tiff', bytes: 3 })
    expect(await prepareUpload({ file: new File([JPEG], 'a.jpg') }, { resize: tiff })).toEqual({ ok: false, reason: 'image_unreadable' })
    const huge: ResizeFn = async () => ({ base64: 'A'.repeat(UPLOAD_LIMITS.maxBodyBytes), mediaType: 'image/jpeg', bytes: 1 })
    expect(await prepareUpload({ file: new File([JPEG], 'a.jpg') }, { resize: huge })).toEqual({ ok: false, reason: 'too_large' })
  })

  it('the browser can\'t open (HEIC outside Safari) say so', async () => {
    const resize: ResizeFn = async () => { throw new Error('image decode failed') }
    expect(await prepareUpload({ file: new File(['....'], 'IMG.heic', { type: 'image/heic' }) }, { resize }))
      .toEqual({ ok: false, reason: 'image_unreadable' })
  })
})

describe('text and CSV', () => {
  it('CSV goes as text, its byte-order mark dropped', async () => {
    const r = await prepareUpload({ file: new File(['\uFEFFweek,mon\n1,rest'], 'block.csv', { type: 'text/csv' }) })
    expect(r).toEqual({ ok: true, body: { kind: 'csv', text: 'week,mon\n1,rest' }, source: { name: 'block.csv', kind: 'csv' } })
  })

  it('pasted text goes as text', async () => {
    const r = await prepareUpload({ text: 'Week 1: Tue easy 4 mi', hint: '  Intermediate  ' })
    expect(r).toEqual({
      ok: true,
      body: { kind: 'text', text: 'Week 1: Tue easy 4 mi', hint: 'Intermediate' },
      source: { name: 'Pasted text', kind: 'text' },
    })
  })

  it('may be exactly the server\'s limit, and not one character more', async () => {
    expect((await prepareUpload({ text: 'a'.repeat(UPLOAD_LIMITS.maxTextChars) })).ok).toBe(true)
    expect(await prepareUpload({ text: 'a'.repeat(UPLOAD_LIMITS.maxTextChars + 1) })).toEqual({ ok: false, reason: 'too_long' })
  })

  it('that is empty or a binary file under a text name is refused', async () => {
    expect(await prepareUpload({ text: '  \n ' })).toEqual({ ok: false, reason: 'empty_file' })
    expect(await prepareUpload({ file: new File(['a\u0000b'], 'plan.txt') })).toEqual({ ok: false, reason: 'unsupported' })
    expect(await prepareUpload({ file: new File([], 'plan.csv') })).toEqual({ ok: false, reason: 'empty_file' })
  })
})

describe('Word and Excel (PR 6)', () => {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
  const docx = (text: string) => new File([zipSync({
    'word/document.xml': strToU8(`<w:document ${W}><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`),
  })], 'Coach-Riley-block.docx')
  const xlsx = () => new File([zipSync({
    'xl/workbook.xml': strToU8('<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Block 2" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="str"><v>Tue</v></c><c r="B1" t="str"><v>Easy 4</v></c></row></sheetData></worksheet>'),
  })], 'Coach-Riley-block.xlsx')

  it('are read here and sent as their text, never as the file or its name', async () => {
    const w = await prepareUpload({ file: docx('Week 1: Tue easy 4 mi'), hint: 'Block 2' })
    expect(w).toEqual({
      ok: true,
      body: { kind: 'docx', text: 'Week 1: Tue easy 4 mi', hint: 'Block 2' },
      source: { name: 'Coach-Riley-block.docx', kind: 'docx' },
    })
    const x = await prepareUpload({ file: xlsx() })
    expect(x).toEqual({
      ok: true,
      body: { kind: 'xlsx', text: 'Sheet: Block 2\nTue\tEasy 4' },
      source: { name: 'Coach-Riley-block.xlsx', kind: 'xlsx' },
    })
    expect(JSON.stringify([w.ok && w.body, x.ok && x.body])).not.toContain('Coach-Riley')
  })

  it('one that won\'t open (damaged, or password-protected and so not a zip) says so', async () => {
    expect(await prepareUpload({ file: new File([ZIP], 'Coach-block-2.xlsx') })).toEqual({ ok: false, reason: 'office_unreadable' })
    for (const name of ['protected.docx', 'protected.docm', 'protected.dotx', 'protected.xlsx', 'protected.xlsm', 'protected.xltm']) {
      expect(await prepareUpload({ file: new File([ENCRYPTED], name) })).toEqual({ ok: false, reason: 'office_unreadable' })
    }
  })

  it('a damaged one, known as Word or Excel only by its name or type, says it won\'t open', async () => {
    // Neither zip nor OLE: only the name or the type says what it should be.
    for (const name of ['plan.docx', 'plan.docm', 'plan.dotx', 'plan.xlsx', 'plan.xlsm', 'plan.xltm']) {
      expect(await prepareUpload({ file: new File(['damaged'], name) })).toEqual({ ok: false, reason: 'office_unreadable' })
    }
    for (const type of ['application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel.sheet.macroEnabled.12']) {
      expect(await prepareUpload({ file: new File(['damaged'], 'Plan', { type }) })).toEqual({ ok: false, reason: 'office_unreadable' })
    }
  })

  it('an older file renamed .docx or .xlsx asks to be re-saved, not "password-protected"', async () => {
    expect(await prepareUpload({ file: new File([OLE], 'plan.docx') })).toEqual({ ok: false, reason: 'legacy_office' })
    expect(await prepareUpload({ file: new File([OLE], 'plan.xlsx') })).toEqual({ ok: false, reason: 'legacy_office' })
  })

  it('one with no text in it (a picture of the plan, pasted in) says what to do instead', async () => {
    expect(await prepareUpload({ file: docx('') })).toEqual({ ok: false, reason: 'office_no_text' })
  })

  it('one whose contents unzip past the limits says to copy the plan out, not "too big"', async () => {
    const bomb = rawZip([{ name: 'word/document.xml', method: 8, data: deflatedZeros(32) }])
    expect(await prepareUpload({ file: new File([bomb], 'huge.docx') })).toEqual({ ok: false, reason: 'office_too_big' })
  }, 20_000)

  it('the reader for them is loaded only when one is picked', () => {
    const src = Object.values(import.meta.glob('../../utils/planImport/prepareUpload.ts', { query: '?raw', import: 'default', eager: true }))[0] as string
    expect(src).toContain("await import('./extractOffice')")
    // Type-only imports are erased at build; anything else would load it at once.
    expect(src).not.toMatch(/^import (?!type )[^\n]*'\.\/extractOffice'/m)
  })

  it('a reader that won\'t load (offline) says so, not "we can\'t read that kind of file"', async () => {
    vi.resetModules()
    vi.doMock('../../utils/planImport/extractOffice', () => { throw new Error('Failed to fetch dynamically imported module') })
    try {
      const fresh = await import('../../utils/planImport/prepareUpload')
      expect(await fresh.prepareUpload({ file: docx('Week 1') })).toEqual({ ok: false, reason: 'reader_unavailable' })
    } finally {
      vi.doUnmock('../../utils/planImport/extractOffice')
      vi.resetModules()
    }
  })

  it('text past the server\'s limit is refused, and a file past 15 MB is not read at all', async () => {
    expect(await prepareUpload({ file: docx('x'.repeat(UPLOAD_LIMITS.maxTextChars + 1)) })).toEqual({ ok: false, reason: 'too_long' })
    expect(OFFICE_FILE_BYTES).toBe(15_000_000)
    // At the limit it is read (and, being zeros, won't open); one byte more and it isn't.
    expect(await prepareUpload({ file: new File([new Uint8Array(OFFICE_FILE_BYTES)], 'big.xlsx') })).toEqual({ ok: false, reason: 'office_unreadable' })
    expect(await prepareUpload({ file: new File([new Uint8Array(OFFICE_FILE_BYTES + 1)], 'big.xlsx') })).toEqual({ ok: false, reason: 'too_large' })
    expect(await prepareUpload({ file: new File([ZIP, new Uint8Array(OFFICE_FILE_BYTES)], 'download') })).toEqual({ ok: false, reason: 'too_large' })
  })

  const real = (b64: string, name: string, type = '') => new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], name, { type })
  const sent = async (file: File) => {
    const r = await prepareUpload({ file })
    return r.ok ? { kind: r.body.kind, text: r.body.text } : r.reason
  }
  const word = extractDocx(Uint8Array.from(atob(wordPythonDocxGrid), c => c.charCodeAt(0)))
  const excel = extractXlsx(Uint8Array.from(atob(excelOpenpyxl), c => c.charCodeAt(0)))

  it('real files are sent as exactly the text the reader takes from them', async () => {
    expect(word.ok && excel.ok).toBe(true)
    expect(await sent(real(wordPythonDocxGrid, 'grid.docx'))).toEqual({ kind: 'docx', text: word.ok && word.text })
    expect(await sent(real(excelOpenpyxl, 'plan.xlsx'))).toEqual({ kind: 'xlsx', text: excel.ok && excel.text })
  })

  it('macro-enabled files and templates are read too, as Word or Excel', async () => {
    for (const name of ['plan.docm', 'plan.dotx', 'plan.dotm']) expect(await sent(real(wordPythonDocxGrid, name))).toMatchObject({ kind: 'docx' })
    for (const name of ['plan.xlsm', 'plan.xltx', 'plan.xltm']) expect(await sent(real(excelOpenpyxl, name))).toMatchObject({ kind: 'xlsx' })
  })

  it('what the zip holds decides, whatever the file is called', async () => {
    expect(await sent(real(wordPythonDocxGrid, 'Plan'))).toMatchObject({ kind: 'docx' })
    expect(await sent(real(excelOpenpyxl, 'Plan (1)', 'application/octet-stream'))).toMatchObject({ kind: 'xlsx' })
    expect(await sent(real(wordPythonDocxGrid, 'misnamed.xlsx'))).toMatchObject({ kind: 'docx' })
    // A dot in the name is not an extension we know: the contents still decide.
    expect(await sent(real(excelOpenpyxl, 'Marathon plan v1.2'))).toMatchObject({ kind: 'xlsx' })
  })

  it('a file whose type says Word or Excel but won\'t open says so, rather than asking for a re-save', async () => {
    const xlsxType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    expect(await prepareUpload({ file: new File([ENCRYPTED], 'Plan', { type: xlsxType }) })).toEqual({ ok: false, reason: 'office_unreadable' })
    expect(await prepareUpload({ file: new File([ENCRYPTED], 'Plan', { type: 'application/vnd.ms-excel.sheet.macroEnabled.12' }) })).toEqual({ ok: false, reason: 'office_unreadable' })
    expect(await prepareUpload({ file: new File([zipSync({ 'readme.txt': strToU8('hi') })], 'plan.docx') })).toEqual({ ok: false, reason: 'office_unreadable' })
  })

  it('old .doc and .xls files ask to be re-saved, by name, type or bytes', async () => {
    expect(await prepareUpload({ file: new File([OLE], 'plan.xls') })).toEqual({ ok: false, reason: 'legacy_office' })
    expect(await prepareUpload({ file: new File([OLE], 'attachment') })).toEqual({ ok: false, reason: 'legacy_office' })
    // By type or name alone: these bytes are not OLE, so only those can say so.
    expect(await prepareUpload({ file: new File(['junk'], 'plan', { type: 'application/vnd.ms-excel' }) })).toEqual({ ok: false, reason: 'legacy_office' })
    expect(await prepareUpload({ file: new File(['junk'], 'plan', { type: 'application/msword' }) })).toEqual({ ok: false, reason: 'legacy_office' })
    expect(await prepareUpload({ file: new File(['junk'], 'plan.doc') })).toEqual({ ok: false, reason: 'legacy_office' })
  })

  it('an Excel binary workbook (.xlsb), a zip we can\'t read, asks to be re-saved', async () => {
    const xlsb = zipSync({ 'xl/workbook.bin': new Uint8Array([1, 2, 3]) })
    expect(await prepareUpload({ file: new File([xlsb], 'plan.xlsb') })).toEqual({ ok: false, reason: 'legacy_office' })
    const binaryType = 'application/vnd.ms-excel.sheet.binary.macroEnabled.12'
    expect(await prepareUpload({ file: new File([xlsb], 'Plan', { type: binaryType }) })).toEqual({ ok: false, reason: 'legacy_office' })
  })

  it('a CSV that Windows calls an Excel file is still read as CSV', async () => {
    // Windows with Excel installed gives every .csv this type.
    const r = await prepareUpload({ file: new File(['week,tue\n1,easy 4'], 'block.csv', { type: 'application/vnd.ms-excel' }) })
    expect(r).toEqual({ ok: true, body: { kind: 'csv', text: 'week,tue\n1,easy 4' }, source: { name: 'block.csv', kind: 'csv' } })
    const txt = await prepareUpload({ file: new File(['Week 1: easy 4'], 'plan.txt', { type: 'application/msword' }) })
    expect(txt.ok && txt.body.kind).toBe('text')
  })

  it('a big zip of another kind (Pages, Numbers) is refused as that, not as a big Word file', async () => {
    expect(await prepareUpload({ file: new File([ZIP, new Uint8Array(OFFICE_FILE_BYTES)], 'plan.numbers') })).toEqual({ ok: false, reason: 'unsupported' })
    expect(await prepareUpload({ file: new File([zipSync({ 'Index/Document.iwa': new Uint8Array(3) })], 'plan.pages') })).toEqual({ ok: false, reason: 'unsupported' })
  })

  it('anything else is refused, other zips included (OpenDocument, Pages, a folder of files)', async () => {
    expect(await prepareUpload({ file: new File([ZIP], 'plans.zip') })).toEqual({ ok: false, reason: 'unsupported' })
    const odt = zipSync({ mimetype: strToU8('application/vnd.oasis.opendocument.text'), 'content.xml': strToU8('<office:document/>') })
    expect(await prepareUpload({ file: new File([odt], 'plan.odt') })).toEqual({ ok: false, reason: 'unsupported' })
    expect(await prepareUpload({ file: new File(['x'], 'plan.pages') })).toEqual({ ok: false, reason: 'unsupported' })
  })
})

describe('the note and the file name', () => {
  it('the note is trimmed to the server\'s limit, and left out when blank', async () => {
    const long = await prepareUpload({ text: 'plan', hint: 'n'.repeat(UPLOAD_LIMITS.maxHintChars + 50) })
    expect(long.ok && long.body.hint).toHaveLength(UPLOAD_LIMITS.maxHintChars)
    const blank = await prepareUpload({ text: 'plan', hint: '   ' })
    expect(blank.ok && 'hint' in blank.body).toBe(false)
  })

  it('the file name is never sent', async () => {
    const name = 'Coach-Riley-Private-Plan-9f3a.pdf'
    for (const file of [pdf('x', name), new File(['a,b'], name.replace('.pdf', '.csv'))]) {
      const r = await prepareUpload({ file })
      expect(r.ok).toBe(true)
      expect(JSON.stringify(r.ok && r.body)).not.toContain('Coach-Riley')
    }
    const photo = await prepareUpload({ file: new File([JPEG], name.replace('.pdf', '.jpg')) }, { resize: okResize })
    expect(JSON.stringify(photo.ok && photo.body)).not.toContain('Coach-Riley')
  })
})

describe('bytesToBase64', () => {
  it('matches btoa, including files larger than one chunk', () => {
    const bytes = Uint8Array.from({ length: 0x8000 * 2 + 17 }, (_, i) => (i * 31) % 256)
    expect(bytesToBase64(bytes)).toBe(btoa(String.fromCharCode(...bytes)))
  })
})
