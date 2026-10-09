#!/usr/bin/env python3
"""Real Word and Excel files for the plan-import tests (initiative 004, PR 6).

The browser reads .docx/.xlsx itself (src/utils/planImport/extractOffice.ts).
Hand-written XML in tests only proves the reader agrees with its author, so
these are made by the tools athletes' coaches actually use, each with the
layout a training plan takes: a week-by-day grid, merged cells, times typed
as paces, weekday headers stored as dates.

  python-docx  a Word grid that opens the document, with a merged cell and a
               non-breaking hyphen
  LibreOffice  a Word file with a text box and row/column spans (converted
               from ODF, as LibreOffice writes .docx)
  openpyxl     a workbook with a hidden sheet, tabs in a different order from
               their files, `ddd` weekday headers, merged cells, times,
               durations, a percentage, a one-decimal number, a hidden row
               and a hidden column
  xlsxwriter   a workbook written the way Excel writes one (`_x000D_`
               escapes, shared strings), and a 1904-date-system workbook
  LibreOffice  the openpyxl workbook saved again by LibreOffice Calc

Writes src/__tests__/planImport/fixtures/officeFixtures.ts (base64), so the
tests need no file system. Needs python-docx, openpyxl, xlsxwriter and
LibreOffice (`soffice`). Rerun after changing what a fixture holds:

  python3 scripts/generate-plan-import-office-fixtures.py
"""

import base64
import datetime as dt
import pathlib
import subprocess
import tempfile

import openpyxl
import xlsxwriter
from docx import Document
from docx.oxml import OxmlElement

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "__tests__" / "planImport" / "fixtures" / "officeFixtures.ts"

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def word_grid(path: pathlib.Path) -> None:
    doc = Document()
    table = doc.add_table(rows=3, cols=8)
    for i, h in enumerate([""] + DAYS):
        table.cell(0, i).text = h
    for i, v in enumerate(["Week 1", "Rest", "Easy 4", "Tempo 5", "", "Easy 3", "Long 8", "Rest"]):
        table.cell(1, i).text = v
    merged = table.cell(1, 3).merge(table.cell(1, 4))
    merged.text = "Tempo 5 (Wed or Thu)"
    for i, v in enumerate(["Week 2", "Rest", "Easy 5", "Hills", "Easy 4", "Rest", "Long 10", "Rest"]):
        table.cell(2, i).text = v
    para = doc.add_paragraph("Easy 5")
    run = para.add_run()
    run._r.append(OxmlElement("w:noBreakHyphen"))
    para.add_run("6 mi on tired days")
    doc.save(path)


ODT = """<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" office:version="1.2" office:mimetype="application/vnd.oasis.opendocument.text">
<office:body><office:text>
<text:p>Club plan<draw:frame draw:name="Key" text:anchor-type="paragraph" svg:width="6cm" svg:height="3cm"><draw:text-box><text:p>Key:</text:p><text:p>E = easy</text:p><text:p>T = tempo</text:p></draw:text-box></draw:frame></text:p>
<table:table table:name="T"><table:table-column table:number-columns-repeated="4"/>
<table:table-row><table:table-cell><text:p>Week</text:p></table:table-cell><table:table-cell><text:p>Mon</text:p></table:table-cell><table:table-cell><text:p>Tue</text:p></table:table-cell><table:table-cell><text:p>Wed</text:p></table:table-cell></table:table-row>
<table:table-row><table:table-cell table:number-rows-spanned="2"><text:p>1</text:p></table:table-cell><table:table-cell table:number-columns-spanned="2"><text:p>Travel</text:p></table:table-cell><table:covered-table-cell/><table:table-cell><text:p>E 4</text:p></table:table-cell></table:table-row>
<table:table-row><table:covered-table-cell/><table:table-cell><text:p>Rest</text:p></table:table-cell><table:table-cell><text:p>T 5</text:p></table:table-cell><table:table-cell><text:p>Rest</text:p></table:table-cell></table:table-row>
</table:table>
</office:text></office:body></office:document>
"""


def libreoffice(src: pathlib.Path, target: str, outdir: pathlib.Path) -> pathlib.Path:
    outdir.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["soffice", "--headless", "--convert-to", target, "--outdir", str(outdir), str(src)],
        check=True, capture_output=True, timeout=180,
    )
    return outdir / (src.stem + "." + target.split(":")[0])


def openpyxl_book(path: pathlib.Path) -> None:
    wb = openpyxl.Workbook()
    notes = wb.active
    notes.title = "Notes"
    notes["A1"] = "internal scratch"
    notes.sheet_state = "hidden"
    plan = wb.create_sheet("Plan")
    paces = wb.create_sheet("Paces")
    plan["A1"] = "Week"
    monday = dt.date(2026, 3, 16)
    for i in range(7):
        c = plan.cell(row=1, column=2 + i, value=monday + dt.timedelta(days=i))
        c.number_format = "ddd"
    for j, v in enumerate([1, "Rest", "Easy 4", "Tempo 5", None, "Easy 3", "Long 8", "Rest"]):
        plan.cell(row=2, column=1 + j, value=v)
    plan.merge_cells("D2:E2")
    for j, v in enumerate([2, "Rest", "Easy 5", "Hills 6x1", "Easy 4", "Rest", "Long 10", "Rest"]):
        plan.cell(row=3, column=1 + j, value=v)
    plan["A4"] = "coach only: check HR strap"
    plan.row_dimensions[4].hidden = True
    plan["J1"] = "scratch column"
    plan["J2"] = "x"
    plan.column_dimensions["J"].hidden = True
    rows = [
        ("Easy pace", dt.time(8, 30), "h:mm"),
        ("Long run", dt.timedelta(hours=1, minutes=30), "[h]:mm:ss"),
        ("Tempo pace", dt.time(0, 7, 15), "mm:ss"),
        ("Effort", 0.8, "0%"),
        ("Distance", 10 * 0.621371, "0.0"),
        ("Race day", dt.date(2026, 4, 26), "d-mmm-yy"),
    ]
    for i, (label, value, fmt) in enumerate(rows, start=1):
        paces.cell(row=i, column=1, value=label)
        cell = paces.cell(row=i, column=2, value=value)
        cell.number_format = fmt
    paces["A7"] = "Windows text"
    paces["B7"] = "Long run\r\n10 mi"
    # Tabs in a different order from the sheet files.
    wb._sheets = [notes, paces, plan]
    wb.save(path)


def xlsxwriter_books(path: pathlib.Path, path1904: pathlib.Path) -> None:
    wb = xlsxwriter.Workbook(str(path))
    s = wb.add_worksheet("Block")
    ddd = wb.add_format({"num_format": "ddd"})
    hm = wb.add_format({"num_format": "h:mm"})
    mmss = wb.add_format({"num_format": "mm:ss"})
    s.write(0, 0, "Week")
    for i in range(7):
        s.write_datetime(0, 1 + i, dt.datetime(2026, 3, 16) + dt.timedelta(days=i), ddd)
    s.write(1, 0, 1)
    s.write(1, 1, "Rest")
    s.write(1, 2, "Easy 4 @")
    s.write_datetime(1, 3, dt.datetime(1899, 12, 31, 8, 30), hm)
    s.merge_range(2, 1, 2, 3, "Travel (no running)")
    s.write(3, 0, "Tempo")
    s.write_datetime(3, 1, dt.datetime(1899, 12, 31, 0, 7, 15), mmss)
    s.write(4, 0, "Long run\r\n10 mi")
    wb.close()

    wb = xlsxwriter.Workbook(str(path1904), {"date_1904": True})
    s = wb.add_worksheet("S")
    s.write_datetime(0, 0, dt.datetime(2026, 3, 16), wb.add_format({"num_format": "yyyy-mm-dd"}))
    s.write(0, 1, "race day")
    wb.close()


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        t = pathlib.Path(tmp)
        files: dict[str, pathlib.Path] = {}

        files["wordPythonDocxGrid"] = t / "grid.docx"
        word_grid(files["wordPythonDocxGrid"])

        (t / "club.fodt").write_text(ODT)
        files["wordLibreOffice"] = libreoffice(t / "club.fodt", 'docx:MS Word 2007 XML', t / "lo")

        files["excelOpenpyxl"] = t / "openpyxl.xlsx"
        openpyxl_book(files["excelOpenpyxl"])

        files["excelXlsxwriter"] = t / "xlsxwriter.xlsx"
        files["excelXlsxwriter1904"] = t / "xlsxwriter1904.xlsx"
        xlsxwriter_books(files["excelXlsxwriter"], files["excelXlsxwriter1904"])

        files["excelLibreOffice"] = libreoffice(files["excelOpenpyxl"], 'xlsx:Calc MS Excel 2007 XML', t / "lo-calc")

        lines = [
            "/**",
            " * Real Word and Excel files for the plan-import tests, as base64.",
            " * GENERATED by scripts/generate-plan-import-office-fixtures.py: edit that",
            " * script and rerun it, never this file. See the script for what each holds.",
            " */",
            "",
        ]
        for name, path in files.items():
            data = base64.b64encode(path.read_bytes()).decode()
            chunks = [data[i:i + 100] for i in range(0, len(data), 100)]
            lines.append(f"export const {name} =")
            lines.extend(f"  '{c}' +" for c in chunks[:-1])
            lines.append(f"  '{chunks[-1]}'")
            lines.append("")
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text("\n".join(lines))
        for name, path in files.items():
            print(f"{name}: {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
