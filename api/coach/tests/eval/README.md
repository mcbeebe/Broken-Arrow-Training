# Coach behavioral eval harness (R1)

The first automated test of what the Coach **says** (not just the engine math).
It reproduces the real `daily` insight surface — the same `build_system_prompt`
+ `build_context_block` + model routing as `api/coach/insight.py` — runs the
model once per scenario, and asserts the reply behaves.

## Layout
- `harness.py` — reproduces the `daily` call. `build_daily_call()` is pure
  (no API); `run_fixture()` makes the live call.
- `assertions.py` — deterministic, behavioral assertions (the SHARP-lite
  rubric: no false PR claims, no "go hard" on a RED day, defer on injury,
  one `Triggered by:` chip, persona not flat, …).
- `fixtures/*.json` — frozen `CoachSnapshot`s + an `_expect` block. Each
  scenario is produced by *real* fields (e.g. a slower-than-baseline race
  effort → `PR_STATUS: NO`), and the keyless honesty test proves it.
- `test_fixture_honesty.py` — **keyless.** Builds each fixture's context and
  asserts the claimed scenario actually appears. No API budget.
- `test_assertions.py` — **keyless.** Unit-tests the rubric, incl. the
  negative control (a "go hard on RED" reply must fail).
- `test_coach_report_card.py` — **live**, marked `eval`, skipped without
  `ANTHROPIC_API_KEY`.

## Running
```bash
# keyless — fixture honesty + assertion unit tests (default; no budget):
pytest api/coach/tests

# live report-card (real model calls, needs a key):
ANTHROPIC_API_KEY=sk-... npm run test:coach-eval
```

## Extending
Each later PR tightens coverage by adding `_expect` keys / fixtures:
- **R2** adds the readiness-directive assertion + RED/PEAK ceiling expectations.
- **R5** flips on `require_defer_to_pro` for `injury_note`.
- **R6** adds citation-grounding (reusing R3's output validator) + masters fixtures.
- **R7** adds personalization fixtures (masters / beginner / injury history).

No `__init__.py` lives under `api/` — `conftest.py` puts the repo root on
`sys.path` so `api.coach.*` resolves as a namespace package, leaving Vercel's
per-file function resolution untouched.
