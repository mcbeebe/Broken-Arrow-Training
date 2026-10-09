import { describe, it, expect } from 'vitest'
import { IMPORT_PROBLEMS } from '../../utils/planImport/importErrors'
import { OFFICE_FILE_BYTES, UPLOAD_LIMITS } from '../../utils/planImport/uploadLimits'

/**
 * Initiative 004, PR 6: the words an athlete reads when a file is refused
 * name the limits the code enforces, so changing a limit fails here until
 * the copy says the new figure.
 */

describe('file problems', () => {
  it('"too big" quotes the PDF and photo limit and the Word and Excel limit', () => {
    const body = IMPORT_PROBLEMS.too_large.body
    expect(body).toContain(`${Math.floor(UPLOAD_LIMITS.maxFileBytes / 1_000_000)} MB`)
    expect(body).toContain(`${OFFICE_FILE_BYTES / 1_000_000} MB`)
    expect(body).toMatch(/Word or Excel/)
  })

  it('Word and Excel are named wherever the athlete is told what works', () => {
    for (const key of ['unsupported', 'unsupported_kind'] as const) expect(IMPORT_PROBLEMS[key].body).toMatch(/Word, Excel/)
    expect(IMPORT_PROBLEMS.legacy_office.body).toContain('.docx, .xlsx or PDF')
    expect(IMPORT_PROBLEMS.legacy_office.body).toContain('.xlsb')
  })

  it('a Word or Excel file with no text says what to do, not "pick the file with your schedule"', () => {
    expect(IMPORT_PROBLEMS.office_no_text.body).toMatch(/PDF/)
    expect(IMPORT_PROBLEMS.office_no_text.body).toMatch(/screenshot/)
  })

  it('a file refused in the browser never cost an upload', () => {
    for (const key of ['too_large', 'too_long', 'office_unreadable', 'office_no_text', 'office_too_big', 'legacy_office', 'reader_unavailable', 'unsupported', 'empty_file'] as const) {
      expect(IMPORT_PROBLEMS[key].spent).toBe('no')
    }
  })
})
