#!/usr/bin/env python3
"""
Generate src/__tests__/__fixtures__/hill-running-multipliers.json from the
canonical source spreadsheet `Hill_Running_Load_Multipliers_v1.0.xlsx`.

The xlsx is the human-edited source of truth for the Minetti 2002 5th-order
polynomial coefficients (run + walk) and a sweep of grade samples used to
verify the polynomial reproduces the published values.

The xlsx is checked into the repo at `docs/research/`. Edit it there, re-run
this script, and commit both the xlsx and the regenerated JSON in the same
PR. Pass `--input <path>` (or set HILL_RUNNING_XLSX) to point at a copy that
lives elsewhere.

Usage:
    python scripts/generate-hill-running-fixture.py
    python scripts/generate-hill-running-fixture.py --input /path/to/xlsx
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
DEFAULT_XLSX = REPO_ROOT / "docs/research/Hill_Running_Load_Multipliers_v1.0.xlsx"
OUTPUT = REPO_ROOT / "src/__tests__/__fixtures__/hill-running-multipliers.json"

RUN_COEFF_CELLS = {"a0": ("K", 8), "a1": ("K", 7), "a2": ("K", 6), "a3": ("K", 5), "a4": ("K", 4), "a5": ("K", 3)}
WALK_COEFF_CELLS = {"b0": ("K", 16), "b1": ("K", 15), "b2": ("K", 14), "b3": ("K", 13), "b4": ("K", 12), "b5": ("K", 11)}
SAMPLE_FIRST_ROW = 5
SAMPLE_LAST_ROW = 23


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
    sheet = wb["Multipliers"]

    polynomial = {
        "run": {k: float(cell(sheet, c, r)) for k, (c, r) in RUN_COEFF_CELLS.items()},
        "walk": {k: float(cell(sheet, c, r)) for k, (c, r) in WALK_COEFF_CELLS.items()},
    }

    samples = []
    for row in range(SAMPLE_FIRST_ROW, SAMPLE_LAST_ROW + 1):
        samples.append({
            "grade": round(float(cell(sheet, "B", row)), 4),
            "runCost": round(float(cell(sheet, "D", row)), 4),
            "runMult": round(float(cell(sheet, "E", row)), 4),
            "walkMult": round(float(cell(sheet, "F", row)), 4),
            "ecc": int(cell(sheet, "G", row)),
        })

    fixture = {
        "version": "1.0",
        "source": xlsx_path.name,
        "polynomial": polynomial,
        "samples": samples,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w") as f:
        json.dump(fixture, f, indent=2)
        f.write("\n")
    print(f"wrote {OUTPUT.relative_to(Path(__file__).resolve().parent.parent)} ({OUTPUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
