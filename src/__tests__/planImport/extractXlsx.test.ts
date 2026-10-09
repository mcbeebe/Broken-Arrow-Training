import { describe, it, expect } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { displayNumber, extractXlsx, numberDisplay, OFFICE_LIMITS, serialToIso } from '../../utils/planImport/extractOffice'
import { excelLibreOffice, excelOpenpyxl, excelXlsxwriter, excelXlsxwriter1904 } from './fixtures/officeFixtures'

/**
 * Initiative 004, PR 6: an Excel plan, read in the browser. What matters is
 * that the reader sees what the athlete sees in Excel: every day under its
 * heading, `Mon` rather than the date behind it, 8:30 rather than 0.354.
 * Real files first (openpyxl, xlsxwriter and LibreOffice:
 * scripts/generate-plan-import-office-fixtures.py), then hand-built
 * workbooks for the cases those tools can't be made to write.
 */

const bytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0))
const lines = (out: ReturnType<typeof extractXlsx>) => (out.ok ? out.text.split('\n') : [out.reason])

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

interface Sheet { name: string; rows: string; state?: string; target?: string; before?: string }

const STYLES = `<styleSheet ${NS}>
  <numFmts>
    <numFmt numFmtId="164" formatCode="d\\-mmm\\-yy"/><numFmt numFmtId="165" formatCode="h:mm"/>
    <numFmt numFmtId="166" formatCode="&quot;Week &quot;0"/><numFmt numFmtId="167" formatCode="0.0&quot; mi&quot;"/>
    <numFmt numFmtId="168" formatCode="ddd"/>
  </numFmts>
  <cellXfs>
    <xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="165"/><xf numFmtId="166"/>
    <xf numFmtId="20"/><xf numFmtId="167"/><xf numFmtId="168"/><xf numFmtId="46"/><xf numFmtId="2"/>
  </cellXfs>
</styleSheet>`

function xlsxFiles(sheets: Sheet[], opts: { strings?: string[]; date1904?: boolean } = {}): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {
    'xl/workbook.xml': strToU8(`<workbook ${NS}>${opts.date1904 ? '<workbookPr date1904="1"/>' : '<workbookPr/>'}<sheets>${
      sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}"${s.state ? ` state="${s.state}"` : ''} r:id="rId${i + 1}"/>`).join('')
    }</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${
      sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="worksheet" Target="${s.target ?? `worksheets/sheet${i + 1}.xml`}"/>`).join('')
    }</Relationships>`),
    'xl/sharedStrings.xml': strToU8(`<sst ${NS}>${(opts.strings ?? []).map(s => `<si><t>${s}</t></si>`).join('')}</sst>`),
    'xl/styles.xml': strToU8(STYLES),
  }
  sheets.forEach((s, i) => {
    const path = s.target?.startsWith('/') ? s.target.slice(1) : `xl/${s.target ?? `worksheets/sheet${i + 1}.xml`}`
    files[path] = strToU8(`<worksheet ${NS}>${s.before ?? ''}<sheetData>${s.rows}</sheetData></worksheet>`)
  })
  return files
}

const xlsx = (sheets: Sheet[], opts: { strings?: string[]; date1904?: boolean } = {}) => zipSync(xlsxFiles(sheets, opts))
const c = (ref: string, inner: string, attrs = '') => `<c r="${ref}"${attrs}>${inner}</c>`
const v = (x: string | number) => `<v>${x}</v>`
const str = (ref: string, s: string) => c(ref, v(s), ' t="str"')

describe('real Excel files', () => {
  it('openpyxl: tabs in their order, hidden sheet, row and column left out, and every number as the cell shows it', () => {
    expect(lines(extractXlsx(bytes(excelOpenpyxl)))).toEqual([
      'Sheet: Paces',
      'Easy pace\t8:30',
      'Long run\t1:30:00',
      'Tempo pace\t07:15',
      'Effort\t80%',
      'Distance\t6.2',
      'Race day\t2026-04-26',
      'Windows text\tLong run 10 mi',
      '',
      'Sheet: Plan',
      'Week\tMon\tTue\tWed\tThu\tFri\tSat\tSun',
      '1\tRest\tEasy 4\tTempo 5\t\tEasy 3\tLong 8\tRest',
      '2\tRest\tEasy 5\tHills 6x1\tEasy 4\tRest\tLong 10\tRest',
    ])
  })

  it('LibreOffice: the same workbook saved again by Calc reads the same', () => {
    const calc = extractXlsx(bytes(excelLibreOffice))
    expect(calc.ok).toBe(true)
    expect(calc).toEqual(extractXlsx(bytes(excelOpenpyxl)))
  })

  it('xlsxwriter: shared strings, Excel\'s escapes, a merged range, weekday headers and times', () => {
    expect(lines(extractXlsx(bytes(excelXlsxwriter)))).toEqual([
      'Sheet: Block',
      'Week\tMon\tTue\tWed\tThu\tFri\tSat\tSun',
      '1\tRest\tEasy 4 @\t8:30',
      '\tTravel (no running)',
      'Tempo\t07:15',
      'Long run 10 mi',
    ])
  })

  it('xlsxwriter: a 1904 workbook\'s dates count from 1904', () => {
    expect(lines(extractXlsx(bytes(excelXlsxwriter1904)))).toEqual(['Sheet: S', '2026-03-16\trace day'])
  })
})

describe('extractXlsx', () => {
  it('reads a week-by-day grid as tab-separated rows', () => {
    const book = xlsx([{
      name: 'Block 1',
      rows: `<row r="1">${c('A1', v(0), ' t="s"')}${c('B1', v(1), ' t="s"')}${c('C1', v(2), ' t="s"')}</row>` +
        `<row r="2">${c('A2', v(1))}${c('B2', v(3), ' t="s"')}${c('C2', v(4), ' t="s"')}</row>`,
    }], { strings: ['Week', 'Mon', 'Tue', 'Rest', 'Easy 4 mi'] })
    expect(extractXlsx(book)).toEqual({ ok: true, text: 'Sheet: Block 1\nWeek\tMon\tTue\n1\tRest\tEasy 4 mi' })
  })

  it('keeps a gap between columns, so a day stays under its heading', () => {
    const book = xlsx([{ name: 'S', rows: `<row r="3">${str('A3', 'a')}${str('C3', 'c')}</row>` }])
    expect(extractXlsx(book)).toEqual({ ok: true, text: 'Sheet: S\na\t\tc' })
  })

  it('reads inline and rich strings, booleans, a formula\'s cached value and errors', () => {
    const rich = '<is><r><t>Tempo </t></r><r><rPr><b/></rPr><t>3 x 2</t></r><rPh><t>ignored</t></rPh></is>'
    const book = xlsx([{
      name: 'S',
      rows: `<row r="1">${c('A1', rich, ' t="inlineStr"')}${c('B1', v(1), ' t="b"')}${c('C1', `<f>SUM(1,2)</f>${v(3)}`)}${c('D1', v('#N/A'), ' t="e"')}</row>`,
    }])
    expect(extractXlsx(book)).toEqual({ ok: true, text: 'Sheet: S\nTempo 3 x 2\tTRUE\t3\t#N/A' })
  })

  it('shows each number the way its format does, built-in and custom alike', () => {
    const cells = [
      c('A1', v(45000), ' s="1"'), c('B1', v(45001.75), ' s="2"'), c('C1', v(0.25), ' s="3"'),
      c('D1', v(3), ' s="4"'), c('E1', v(0.5), ' s="5"'), c('F1', v(6.21371), ' s="6"'),
      c('G1', v(46097), ' s="7"'), c('H1', v(1.0625), ' s="8"'), c('I1', v(1.5), ' s="9"'), c('J1', v(45000)),
    ]
    expect(lines(extractXlsx(xlsx([{ name: 'S', rows: `<row r="1">${cells.join('')}</row>` }])))).toEqual([
      'Sheet: S',
      ['2023-03-15', '2023-03-16', '6:00', 'Week 3', '12:00', '6.2 mi', 'Mon', '25:30:00', '1.50', '45000'].join('\t'),
    ])
  })

  it('reads a 1904 workbook\'s dates from its own epoch', () => {
    const book = xlsx([{ name: 'S', rows: `<row r="1">${c('A1', v(43538), ' s="1"')}</row>` }], { date1904: true })
    expect(extractXlsx(book)).toEqual({ ok: true, text: 'Sheet: S\n2023-03-15' })
  })

  it('names every visible sheet, in tab order, and skips hidden ones and empty rows', () => {
    const book = xlsx([
      { name: 'Beginner', rows: `<row r="1">${str('A1', 'B plan')}</row><row r="2"/>` },
      { name: 'Scratch', state: 'hidden', rows: `<row r="1">${str('A1', 'secret')}</row>` },
      { name: 'Coach', state: 'veryHidden', rows: `<row r="1">${str('A1', 'secret too')}</row>` },
      { name: 'Intermediate', rows: `<row r="1">${str('A1', 'I plan')}</row>`, target: '/xl/worksheets/other.xml' },
    ])
    expect(extractXlsx(book)).toEqual({ ok: true, text: 'Sheet: Beginner\nB plan\n\nSheet: Intermediate\nI plan' })
  })

  it('leaves hidden rows and columns out, and the columns after them stay in order', () => {
    const book = xlsx([{
      name: 'S',
      before: '<cols><col min="1" max="1" width="9"/><col min="2" max="3" hidden="1"/><col min="7" max="99999" hidden="true"/></cols>',
      rows: `<row r="1">${str('A1', 'a')}${str('B1', 'b')}${str('C1', 'c')}${str('E1', 'e')}${str('F1', 'f')}${str('G1', 'g')}${str('XFD1', 'z')}</row>` +
        `<row r="2" hidden="1">${str('A2', 'coach only')}</row>` +
        `<row r="3">${str('A3', 'last')}</row>`,
    }])
    expect(lines(extractXlsx(book))).toEqual(['Sheet: S', 'a\t\te\tf', 'last'])
  })

  it('keeps a cell on its line, through Excel\'s _x000D_ escapes and real line breaks', () => {
    const book = xlsx([{
      name: 'S',
      rows: `<row r="1">${c('A1', v(0), ' t="s"')}${str('B1', 'Tempo_x000D_\n3 x 2')}${str('C1', 'x')}</row>`,
    }], { strings: ['Long run_x000D_\n10 mi'] })
    expect(extractXlsx(book)).toEqual({ ok: true, text: 'Sheet: S\nLong run 10 mi\tTempo 3 x 2\tx' })
  })

  it('an empty shared-string cell is empty, not the first string', () => {
    const book = xlsx([{ name: 'S', rows: `<row r="1">${c('A1', '<v></v>', ' t="s"')}${str('B1', 'x')}</row>` }], { strings: ['Week'] })
    expect(extractXlsx(book)).toEqual({ ok: true, text: 'Sheet: S\n\tx' })
  })

  it('a damaged row with its cells out of order still keeps them apart', () => {
    const book = xlsx([{ name: 'S', rows: `<row r="1">${str('C1', 'c')}${str('A1', 'a')}${str('C1', 'again')}</row>` }])
    expect(extractXlsx(book)).toEqual({ ok: true, text: 'Sheet: S\n\t\tc\ta\tagain' })
  })

  it('an empty workbook is empty; a broken one is unreadable', () => {
    expect(extractXlsx(xlsx([{ name: 'S', rows: '' }]))).toEqual({ ok: false, reason: 'empty_file' })
    expect(extractXlsx(strToU8('PK nope'))).toEqual({ ok: false, reason: 'office_unreadable' })
    expect(extractXlsx(zipSync({ 'word/document.xml': strToU8('<d/>') }))).toEqual({ ok: false, reason: 'office_unreadable' })
    const files = xlsxFiles([{ name: 'S', rows: `<row r="1">${str('A1', 'x')}</row>` }])
    files['xl/worksheets/sheet1.xml'] = strToU8('<worksheet><sheetData><row>')
    expect(extractXlsx(zipSync(files))).toEqual({ ok: false, reason: 'office_unreadable' })
  })
})

describe('safety', () => {
  it('a part that declares more than the limit is refused before it is unzipped', () => {
    const book = xlsx([{ name: 'S', rows: `<row r="1">${str('A1', 'x')}</row>` }])
    expect(extractXlsx(book).ok).toBe(true)
    expect(extractXlsx(book, { ...OFFICE_LIMITS, maxEntryBytes: 100 })).toEqual({ ok: false, reason: 'too_large' })
  })

  it('the sheets share one budget with the parts read before them', () => {
    const files = xlsxFiles([{ name: 'S', rows: `<row r="1">${str('A1', 'x')}</row>` }])
    const meta = ['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml', 'xl/styles.xml']
      .reduce((sum, name) => sum + files[name].length, 0)
    const all = meta + files['xl/worksheets/sheet1.xml'].length
    const book = zipSync(files)
    expect(extractXlsx(book, { ...OFFICE_LIMITS, maxTotalBytes: all }).ok).toBe(true)
    expect(extractXlsx(book, { ...OFFICE_LIMITS, maxTotalBytes: all - 1 })).toEqual({ ok: false, reason: 'too_large' })
  })

  it('a hidden sheet, or a part no sheet names, is never unzipped, however large', () => {
    const files = xlsxFiles([
      { name: 'Plan', rows: `<row r="1">${str('A1', 'Easy 4')}</row>` },
      { name: 'Scratch', state: 'hidden', rows: '' },
    ])
    const huge = new Uint8Array(OFFICE_LIMITS.maxEntryBytes + 1)
    files['xl/worksheets/sheet2.xml'] = huge
    files['xl/worksheets/sheet9.xml'] = huge
    expect(extractXlsx(zipSync(files))).toEqual({ ok: true, text: 'Sheet: Plan\nEasy 4' })
  })

  it('stops reading once the text is far past what the reader takes', () => {
    const row = (n: number) => `<row r="${n}">${str(`A${n}`, 'a')}${str(`XFD${n}`, 'z')}</row>`
    const book = xlsx([{ name: 'S', rows: Array.from({ length: 200 }, (_, i) => row(i + 1)).join('') }])
    const started = Date.now()
    expect(extractXlsx(book)).toEqual({ ok: false, reason: 'too_long' })
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(extractXlsx(xlsx([{ name: 'S', rows: row(1) }]), { ...OFFICE_LIMITS, maxChars: 16_000 }))
      .toEqual({ ok: false, reason: 'too_long' })
  })

  it('one row of 16,384 copies of a long string stops at the limit, not after building it', () => {
    // No `r` on the cells: each takes the column after the one before.
    const cells = '<c t="s"><v>0</v></c>'.repeat(16_384)
    const book = xlsx([{ name: 'S', rows: `<row r="1">${cells}</row>` }], { strings: ['x'.repeat(30_000)] })
    expect(extractXlsx(book)).toEqual({ ok: false, reason: 'too_long' })
  })

  it('a far column costs nothing when its cells are empty', () => {
    const rows = Array.from({ length: 20_000 }, (_, i) => `<row r="${i + 2}">${c(`XFD${i + 2}`, '<v></v>', ' t="s"')}</row>`).join('')
    const book = xlsx([{ name: 'S', rows: `<row r="1">${str('A1', 'Plan')}</row>${rows}` }], { strings: ['x'] })
    const started = Date.now()
    expect(extractXlsx(book)).toEqual({ ok: true, text: 'Sheet: S\nPlan' })
    // About 1 s here, nearly all of it jsdom parsing the XML.
    expect(Date.now() - started).toBeLessThan(10_000)
  }, 30_000)
})

describe('numberDisplay and displayNumber', () => {
  const shown = (code: string, raw: string | number, date1904 = false) => displayNumber(String(raw), numberDisplay(code), date1904)

  it.each([
    ['General', '1234.5', '1234.5'],
    ['General', '0.30000000000000004', '0.3'],
    ['General" mi"', '4', '4 mi'],
    ['0', '6.6', '7'],
    ['0.00', '1.5', '1.50'],
    ['#,##0.0', '1234.56', '1,234.6'],
    ['0.0#', '6', '6.0'],
    ['0.0#', '6.2', '6.2'],
    ['0.0#', '6.25', '6.25'],
    ['"Week "0', '3', 'Week 3'],
    ['0.0" mi"', '6.21371', '6.2 mi'],
    ['0\\ "km"', '10', '10 km'],
    ['[Red]0.0', '-2.24', '-2.2'],
    ['#,##0_);(#,##0)', '42', '42'],
    ['0.' + '0'.repeat(150), '1', '1.' + '0'.repeat(20)],
    ['0%', '0.8', '80%'],
    ['0.0%', '0.805', '80.5%'],
    ['d-mmm-yy', '45000', '2023-03-15'],
    ['yyyy-mm-dd hh:mm', '45000.5', '2023-03-15'],
    ['[$-409]d mmmm yyyy', '45000', '2023-03-15'],
    ['mm/dd/yyyy', '45000', '2023-03-15'],
    ['ddd d mmm', '46097', '2026-03-16'],
    ['ddd', '46097', 'Mon'],
    ['dddd', '46097', 'Monday'],
    ['[$-409]dddd', '46098', 'Tuesday'],
    ['mmm', '46097', 'Mar'],
    ['mmmm', '46097', 'March'],
    ['h:mm', '0.3541666667', '8:30'],
    ['h:mm', '45000.75', '18:00'],
    ['h:mm:ss AM/PM', '0.75', '6:00:00 PM'],
    ['h:mm AM/PM', '0', '12:00 AM'],
    ['mm:ss', String(435 / 86_400), '07:15'],
    ['m:ss', String(435 / 86_400), '7:15'],
    [';;;', '5', ''],
    ['0;-0;;@', '5', '5'],
    ['#,##0', '1234567', '1,234,567'],
    ['#,##0', '-1234567', '-1,234,567'],
    ['#,##0.00', '1234.5', '1,234.50'],
    ['#,##0.0#', '1234.5', '1,234.5'],
    ['0', '-1234', '-1234'],
    ['m', '46097', '3'],
    ['mm', '46097', '03'],
    ['[h]:mm:ss', '1.0625', '25:30:00'],
    ['[mm]:ss', String(95 / 86_400), '1:35'],
    ['[ss]', String(95 / 86_400), '95'],
    ['0.00E+00', '12345.678', '12345.678'],
    ['@', '7', '7'],
  ])('%s shows %s as %s', (code, raw, expected) => {
    expect(shown(code, raw)).toBe(expected)
  })

  it('a value the format can\'t show is left as it is', () => {
    expect(shown('h:mm', '-0.5')).toBe('-0.5')
    expect(shown('[h]:mm', '-0.5')).toBe('-0.5')
    expect(shown('d-mmm-yy', '60')).toBe('60')
    expect(shown('ddd', '3000000')).toBe('3000000')
    expect(shown('0.0', 'abc')).toBe('abc')
    expect(shown('0.0', '')).toBe('')
  })

  it('a 1904 workbook\'s weekday headers count from 1904', () => {
    expect(shown('ddd', 46097 - 1462, true)).toBe('Mon')
  })
})

describe('serialToIso', () => {
  it('counts the 1900 system around Excel\'s phantom 29 February 1900', () => {
    expect(serialToIso(1, false)).toBe('1900-01-01')
    expect(serialToIso(59, false)).toBe('1900-02-28')
    expect(serialToIso(60, false)).toBeNull()
    expect(serialToIso(61, false)).toBe('1900-03-01')
    expect(serialToIso(45000, false)).toBe('2023-03-15')
    expect(serialToIso(46315.99, false)).toBe('2026-10-20')
    expect(serialToIso(0, false)).toBeNull()
    expect(serialToIso(-1, false)).toBeNull()
  })

  it('counts the 1904 system from 1 January 1904', () => {
    expect(serialToIso(0, true)).toBe('1904-01-01')
    expect(serialToIso(43538, true)).toBe('2023-03-15')
    expect(serialToIso(-1, true)).toBeNull()
  })

  it('ends at Excel\'s last date, 9999-12-31, in both systems', () => {
    expect(serialToIso(2_958_465, false)).toBe('9999-12-31')
    expect(serialToIso(2_958_466, false)).toBeNull()
    expect(serialToIso(2_957_003, true)).toBe('9999-12-31')
    expect(serialToIso(2_957_004, true)).toBeNull()
    expect(serialToIso(1e300, false)).toBeNull()
    expect(serialToIso(Number.NaN, false)).toBeNull()
  })
})

describe('work a cell can cause', () => {
  it('one long shared string, used by thousands of cells, is cleaned once', () => {
    // Cleaned per cell, a 1M-space string in 4,000 cells took 7.8 s.
    const cells = Array.from({ length: 4_000 }, (_, i) => `<row r="${i + 2}">${c(`A${i + 2}`, v(0), ' t="s"')}</row>`).join('')
    const book = xlsx([{ name: 'S', rows: `<row r="1">${str('A1', 'Plan')}</row>${cells}` }], { strings: [' '.repeat(1_000_000)] })
    const started = Date.now()
    expect(extractXlsx(book)).toEqual({ ok: true, text: 'Sheet: S\nPlan' })
    expect(Date.now() - started).toBeLessThan(3_000)
  })

  it('a format code far longer than any real one reads as General, worked out once', () => {
    // Worked out per style, a 1 MB code on 2,000 styles took 19 s.
    const files = xlsxFiles([{ name: 'S', rows: `<row r="1">${c('A1', v(5), ' s="1999"')}</row>` }])
    files['xl/styles.xml'] = strToU8(`<styleSheet ${NS}><numFmts><numFmt numFmtId="164" formatCode="0${' '.repeat(1_000_000)}&quot;mi&quot;"/></numFmts>` +
      `<cellXfs>${'<xf numFmtId="164"/>'.repeat(2_000)}</cellXfs></styleSheet>`)
    const started = Date.now()
    expect(extractXlsx(zipSync(files))).toEqual({ ok: true, text: 'Sheet: S\n5' })
    expect(Date.now() - started).toBeLessThan(3_000)
  })

  it('escaped control characters are dropped, so a NUL can\'t make the text look binary', () => {
    const book = xlsx([{ name: 'S', rows: `<row r="1">${str('A1', 'Tempo_x0000_ 3_x0009_x 2')}</row>` }])
    expect(extractXlsx(book)).toEqual({ ok: true, text: 'Sheet: S\nTempo 3 x 2' })
  })
})

describe('sheet parts', () => {
  it('a part named by many sheets is read once', () => {
    const files = xlsxFiles([{ name: 'S', rows: `<row r="1">${str('A1', 'Easy 4')}</row>` }])
    const many = Array.from({ length: 80 }, (_, i) => `<sheet name="S${i}" sheetId="${i + 1}" r:id="rId1"/>`).join('')
    files['xl/workbook.xml'] = strToU8(`<workbook ${NS}><sheets>${many}</sheets></workbook>`)
    expect(extractXlsx(zipSync(files))).toEqual({ ok: true, text: 'Sheet: S0\nEasy 4' })
  })

  it('reads at most the sheet limit', () => {
    const book = xlsx(['A', 'B', 'C'].map(name => ({ name, rows: `<row r="1">${str('A1', name.toLowerCase())}</row>` })))
    expect(lines(extractXlsx(book, { ...OFFICE_LIMITS, maxSheets: 2 }))).toEqual(['Sheet: A', 'a', '', 'Sheet: B', 'b'])
  })


  it('a chart sheet is skipped, and a target with ../ is followed', () => {
    // The sheet's part is xl/worksheets/sheet1.xml; the relationship below
    // reaches it through `..`.
    const files = xlsxFiles([{ name: 'Plan', rows: `<row r="1">${str('A1', 'Easy 4')}</row>` }])
    files['xl/workbook.xml'] = strToU8(`<workbook ${NS}><sheets><sheet name="Mileage chart" sheetId="2" r:id="rId9"/><sheet name="Plan" sheetId="1" r:id="rId1"/></sheets></workbook>`)
    files['xl/_rels/workbook.xml.rels'] = strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="../xl/worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chartsheet" Target="chartsheets/sheet1.xml"/>' +
      '</Relationships>')
    // Never opened: were it read, its broken XML would make the file unreadable.
    files['xl/chartsheets/sheet1.xml'] = strToU8('<chartsheet><unclosed')
    expect(extractXlsx(zipSync(files))).toEqual({ ok: true, text: 'Sheet: Plan\nEasy 4' })
  })

  it('a sheet the workbook names but the file lacks is a damaged file, not an empty one', () => {
    const files = xlsxFiles([{ name: 'Plan', rows: `<row r="1">${str('A1', 'Easy 4')}</row>` }])
    delete files['xl/worksheets/sheet1.xml']
    expect(extractXlsx(zipSync(files))).toEqual({ ok: false, reason: 'office_unreadable' })
  })
})
