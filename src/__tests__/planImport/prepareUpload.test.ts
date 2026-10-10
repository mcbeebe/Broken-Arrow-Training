import { describe, it, expect, vi } from 'vitest'
import { prepareUpload, bytesToBase64, type ResizeFn } from '../../utils/planImport/prepareUpload'
import { UPLOAD_LIMITS } from '../../utils/planImport/uploadLimits'

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

describe('files we can\'t read yet', () => {
  it('Word and Excel are coming, and say so without sending anything', async () => {
    expect(await prepareUpload({ file: new File([ZIP], 'Coach-block-2.xlsx') })).toEqual({ ok: false, reason: 'office_soon' })
    expect(await prepareUpload({ file: new File([ZIP], 'plan.docx') })).toEqual({ ok: false, reason: 'office_soon' })
  })

  it('old .doc and .xls files ask to be re-saved, by name or by bytes', async () => {
    expect(await prepareUpload({ file: new File([OLE], 'plan.xls') })).toEqual({ ok: false, reason: 'legacy_office' })
    expect(await prepareUpload({ file: new File([OLE], 'attachment') })).toEqual({ ok: false, reason: 'legacy_office' })
  })

  it('anything else is refused', async () => {
    expect(await prepareUpload({ file: new File([ZIP], 'plans.zip') })).toEqual({ ok: false, reason: 'unsupported' })
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
