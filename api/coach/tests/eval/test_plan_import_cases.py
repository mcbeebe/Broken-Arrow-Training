"""Keyless: the plan-import eval's cases and scorer are honest (NO API).

A live eval is only as good as its fixtures and its scorer. These checks
spend nothing: every case is a request production would accept, every
document actually contains the sessions its truth claims, and the scorer
gives a perfect read 1.0 and a wrong one a low score.
"""

from __future__ import annotations

import re

import pytest

from api.coach._plan_import import MAX_FILE_BYTES, parse_request
from plan_import_cases import (
    INJECTION,
    PLAN_A,
    PLAN_B,
    PLAN_C,
    PLAN_F_BEGINNER,
    PLAN_F_INTERMEDIATE,
    PNG_PATH,
    PNG_ROWS_PATH,
    TITLE_A,
    allowed_misses,
    as_pdf,
    cases,
    cell,
    grid_rows,
    perfect_extraction,
    rows_fingerprint,
    request_body,
    score,
    summary_table,
)

CASES = cases()


@pytest.mark.parametrize("case", CASES, ids=lambda c: c.id)
def test_every_case_is_a_request_production_accepts(case):
    req = parse_request(request_body(case))
    assert req.kind == case.kind
    assert req.hint == case.hint


@pytest.mark.parametrize("case", [c for c in CASES if c.text is not None and c.status == "ok"], ids=lambda c: c.id)
def test_text_documents_contain_every_session_they_claim(case):
    if case.id == "c_no_weekdays":
        # Hand-written: titles and minutes, no weekday grid.
        for w in case.weeks:
            for s in w.sessions:
                assert f"{s.title} - {s.min:g} min" in case.text
        return
    units = "km" if case.units == "km" else "mi"
    for w in case.weeks:
        for s in w.sessions:
            assert cell(s, units) in case.text, f"{case.id}: {w.label} {s.title} missing"


def test_the_pdf_is_well_formed_and_holds_every_cell():
    pdf = as_pdf(TITLE_A, grid_rows(PLAN_A, "mi"))
    assert pdf.startswith(b"%PDF-1.4") and pdf.rstrip().endswith(b"%%EOF")
    # Every xref offset lands on its object.
    xref_at = int(re.search(rb"startxref\n(\d+)", pdf).group(1))
    entries = re.findall(rb"(\d{10}) 00000 n ", pdf[xref_at:])
    assert len(entries) == 6
    for i, off in enumerate(entries, start=1):
        assert pdf[int(off):].startswith(f"{i} 0 obj".encode())
    stream = pdf.decode("latin-1")
    for row in grid_rows(PLAN_A, "mi"):
        for text in row:
            for word in text.split():
                assert f"{word}" in stream, word


def test_the_screenshot_is_committed_and_fits():
    data = PNG_PATH.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    assert len(data) < MAX_FILE_BYTES
    width = int.from_bytes(data[16:20], "big")
    assert width >= 1000, "too small to read"
    assert any(c.id == "a_png" for c in CASES)


def test_the_screenshot_was_drawn_from_todays_plan():
    """Change PLAN_A and this fails until the PNG is regenerated
    (`python api/coach/tests/eval/plan_import_cases.py --write-png`)."""
    assert PNG_ROWS_PATH.read_text().strip() == rows_fingerprint(grid_rows(PLAN_A, "mi"))


def test_the_truth_follows_the_prompts_long_run_rule():
    """The prompt types a run "long" only when the plan calls it long. A truth
    that disagreed would fail a model for following the prompt."""
    for plan in (PLAN_A, PLAN_B, PLAN_C, PLAN_F_BEGINNER, PLAN_F_INTERMEDIATE):
        for w in plan:
            for s in w.sessions:
                says_long = "long" in s.title.lower()
                assert (s.type == "long") == says_long, f"{w.label}: {s.title} is typed {s.type}"


def test_the_tricky_cases_test_what_they_say():
    by_id = {c.id: c for c in CASES}
    assert INJECTION in by_id["e_injection"].text
    # Countdown: the document lists the highest week number first, and that
    # week is trained first.
    b = by_id["b_countdown_km"].text
    assert b.index("Week 4") < b.index("Week 1 (race week)")
    assert by_id["b_countdown_km"].weeks[0].label.startswith("Week 4")
    # Levels: the two levels differ, so the score shows which one was read.
    for beg, inter in zip(PLAN_F_BEGINNER, PLAN_F_INTERMEDIATE):
        assert [s.dist for s in beg.sessions] != [s.dist for s in inter.sessions]
    assert by_id["f_levels"].weeks is PLAN_F_INTERMEDIATE
    assert by_id["d_not_a_plan"].weeks == []


@pytest.mark.parametrize("case", CASES, ids=lambda c: c.id)
def test_a_perfect_read_scores_one(case):
    s = score(case, perfect_extraction(case))
    assert s["accuracy"] == 1.0 and s["extra"] == 0 and s["misses"] == []


def test_weeks_in_the_wrong_order_score_low():
    case = next(c for c in CASES if c.id == "b_countdown_km")
    flipped = perfect_extraction(case)
    flipped["weeks"].reverse()
    assert score(case, flipped)["accuracy"] < 0.5


def test_the_wrong_level_scores_low():
    case = next(c for c in CASES if c.id == "f_levels")
    beginner = perfect_extraction(case)
    for w, truth in zip(beginner["weeks"], PLAN_F_BEGINNER):
        for s, t in zip(w["s"], truth.sessions):
            s["t"], s["dist"] = t.type, t.dist
    assert score(case, beginner)["accuracy"] < 0.5


def test_misses_extras_and_rest_days():
    case = next(c for c in CASES if c.id == "a_text")
    plan = perfect_extraction(case)
    plan["weeks"][0]["s"].pop()                                    # long run lost
    plan["weeks"][1]["s"][0]["dist"] = 40                          # misread distance
    plan["weeks"][2]["s"][2]["t"] = "run"                          # tempo read as easy
    plan["weeks"][3]["s"].append({"d": "mon", "t": "run", "w": "Invented", "dist": 3})
    plan["weeks"][4]["s"].append({"d": "fri", "t": "rest", "w": "Rest"})  # ignored
    s = score(case, plan)
    assert s["expected"] - s["exact"] == 3
    assert s["extra"] == 1
    assert len(s["misses"]) == 3


def test_renamed_sessions_score_low():
    case = next(c for c in CASES if c.id == "a_text")
    plan = perfect_extraction(case)
    for w in plan["weeks"]:
        for s in w["s"]:
            s["w"] = "Workout"
    assert score(case, plan)["accuracy"] == 0.0


def test_a_shortened_title_in_the_plans_words_is_fine():
    case = next(c for c in CASES if c.id == "a_text")
    plan = perfect_extraction(case)
    plan["weeks"][4]["s"][2]["w"] = "intervals"   # "Intervals 6x800m"
    assert score(case, plan)["accuracy"] == 1.0


def test_inventing_weekdays_for_a_plan_without_them_scores_low():
    case = next(c for c in CASES if c.id == "c_no_weekdays")
    plan = perfect_extraction(case)
    for w in plan["weeks"]:
        for s, day in zip(w["s"], ["mon", "wed", "fri"]):
            s["d"] = day
    assert score(case, plan)["accuracy"] == 0.0


@pytest.mark.parametrize("expected,allowed", [(9, 1), (19, 1), (20, 2), (28, 2)])
def test_allowed_misses(expected, allowed):
    assert allowed_misses(expected) == allowed


def test_any_day_sessions_match_in_order():
    case = next(c for c in CASES if c.id == "c_no_weekdays")
    plan = perfect_extraction(case)
    plan["weeks"][1]["s"].reverse()
    assert score(case, plan)["exact"] < score(case, perfect_extraction(case))["exact"]


def test_the_report_names_every_model_and_case():
    rows = [
        {"model": "m1", "case": "a_text", "passed": True, "seconds": 10.0, "input": 100, "output": 50,
         "exact": 9, "expected": 10, "extra": 0, "accuracy": 0.9, "weeks": 6, "misses": ["w1 sun Long run: missing"]},
        {"model": "m2", "case": "a_text", "passed": False, "seconds": 3.0, "input": 0, "output": 0, "error": "APITimeoutError"},
    ]
    table = summary_table(rows)
    assert "| m1 | 1/1 | 9/10 |" in table
    assert "| m2 | 0/1 | 0/0 |" in table
    assert "APITimeoutError" in table and "w1 sun Long run: missing" in table
