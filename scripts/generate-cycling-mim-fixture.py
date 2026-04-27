#!/usr/bin/env python3
"""
Generate src/__tests__/__fixtures__/cycling-mim.json from the canonical source
spreadsheet `Hill_Running_Load_Multipliers_v1.1.xlsx` → `Cycling MIM` sheet.

The xlsx is the human-edited source of truth for the cycling musculoskeletal
impact multiplier formula `MIM = a + b × IF²` (with `a = b = 0.4`) and the
intensity-zone reference table.

The xlsx is checked into the repo at `docs/research/`. Edit it there, re-run
this script, and commit both the xlsx and the regenerated JSON in the same PR.
Pass `--input <path>` (or set HILL_RUNNING_XLSX) to point at a copy that lives
elsewhere.

Usage:
    python scripts/generate-cycling-mim-fixture.py
    python scripts/generate-cycling-mim-fixture.py --input /path/to/xlsx
"""

import argparse
import json
import os
import sys
from pathlib import Path

try:
    from openpyxl import load_workbook
except ImportError:
    sys.stderr.write("openpyxl is required: pip install openpyxl\n")
    sys.exit(2)

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_XLSX = REPO_ROOT / "docs/research/Hill_Running_Load_Multipliers_v1.1.xlsx"
OUTPUT = REPO_ROOT / "src/__tests__/__fixtures__/cycling-mim.json"

COEFF_CELLS = {"a": ("J", 3), "b": ("J", 4)}
SAMPLE_FIRST_ROW = 6
SAMPLE_LAST_ROW = 11


def cell(sheet, col_letter, row):
    return sheet[f"{col_letter}{row}"].value


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", default=os.environ.get("HILL_RUNNING_XLSX", str(DEFAULT_XLSX)))
    args = ap.parse_args()

    xlsx_path = Path(args.input).expanduser()
    if not xlsx_path.exists():
        sys.stderr.write(f"xlsx not found: {xlsx_path}\n")
        sys.exit(1)

    wb = load_workbook(xlsx_path, data_only=True)
    sheet = wb["Cycling MIM"]

    formula = {k: float(cell(sheet, c, r)) for k, (c, r) in COEFF_CELLS.items()}

    samples = []
    for row in range(SAMPLE_FIRST_ROW, SAMPLE_LAST_ROW + 1):
        samples.append({
            "label": str(cell(sheet, "A", row)),
            "description": str(cell(sheet, "B", row)),
            "intensityFactor": round(float(cell(sheet, "D", row)), 4),
            "kneeCompressionBW": round(float(cell(sheet, "E", row)), 4),
            "mim": round(float(cell(sheet, "F", row)), 4),
        })

    fixture = {
        "version": "1.1",
        "source": xlsx_path.name,
        "formula": formula,
        "samples": samples,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w") as f:
        json.dump(fixture, f, indent=2)
        f.write("\n")
    print(f"wrote {OUTPUT.relative_to(Path(__file__).resolve().parent.parent)} ({OUTPUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
