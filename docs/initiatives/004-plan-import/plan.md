# 004 — Build plan: upload your own plan

Seven PRs, in order. Each references **initiative 004** in its description and
follows `CLAUDE.md` (readable commit subjects, open a PR, run `/adversary`
before review, CLAUDE.md updated in the same PR when layout or deploy changes).

Nothing changes for athletes until PR 5. PRs 2–4 add a render path and an
endpoint that nothing in the UI calls yet. PR 5 shows the Settings card to the
owner only (D8).

**Ordering rule:** the frontend (GitHub Pages, gated by tests) and the API
(Vercel, deploys on push with no gate) ship independently. PR 3 (the endpoint)
must be live on Vercel before PR 5 (the first caller) is published. The client
treats a 404 from the endpoint as "not available yet" and says so.

## Decisions

| # | Decision | Status |
|---|---|---|
| D1 | **Follow the plan as written.** Reshape, recalibration, level-up, weak-station reweighting and season splicing are off for an uploaded plan. The coach may suggest day-level edits the athlete approves | Owner 2026-10-08 |
| D2 | **Formats staged:** PDF, photo/screenshot, CSV and pasted text in PR 5; Word (.docx) and Excel (.xlsx) in PR 6. Legacy `.doc`/`.xls` are refused with "re-save as .docx/.xlsx or PDF" | Owner 2026-10-08 |
| D3 | **Model chosen by a live eval** (Haiku 4.5 vs Sonnet 4.6) on plans we write ourselves. Default until then: `SONNET_MODEL`, overridable with `ANTHROPIC_PLAN_IMPORT_MODEL` | Owner 2026-10-08 |
| D4 | **The imported plan lives inside `OnboardingConfig`** (`importedPlan`), not under a new storage key. Sync, backups, Restore, Redo and the edit-log reset all already work off the config | Recommended, adopted |
| D5 | Its presence is the only switch (`isImportedPlan(cfg)`). No new `goalMode` value is stored | Recommended, adopted |
| D6 | **Sessions are stored by week number and weekday**, and week 1 is anchored to the existing `planStartPinnedIso`. Settings → Plan Start moves an uploaded plan with no new code. Dates are worked out in code, never by the model | Recommended, adopted |
| D7 | **A dedicated function, `api/coach/plan_import.py`,** not an `op` on `chat.py`: it needs `maxDuration: 300`, and raising chat's limit would change how every chat turn fails | Recommended, adopted |
| D8 | **Owner-only first**, behind the same owner check as Settings' owner-only sections. Opens to everyone after the eval and the owner's own uploads | Owner 2026-10-08 |
| D9 | **Five uploads per athlete per day**, a KV counter separate from the coach's daily budget; each upload also spends one budget unit | Owner 2026-10-08 |
| D10 | **The file is never stored or logged.** The endpoint never calls `log_sample_event` and logs only kind, size and token counts | Recommended, adopted |
| D11 | **Word and Excel are read in the browser** with `fflate` (already in the lockfile, lazy-loaded). No SheetJS (CVEs on the npm registry), no new Python packages | Recommended, adopted |
| D12 | **Miles only in v1.** Distances in km are converted; the original "10 km" stays in the day's detail | Recommended; owner to confirm (intent § Open questions) |

---

## PR 1 — Initiative docs

`intent.md`, this plan, and the registry row. No code.

## PR 2 — Uploaded plans render like any plan (no uploader yet)

**Subject:** `Uploaded plans render like any plan: stored sessions become weeks, dates worked out in code`

1. `src/utils/planImport/types.ts`: `ImportedPlanV1` (version, source file name
   and kind, title, sport, weeks of sessions keyed by weekday) and a
   `readImportedPlan(raw)` check with size limits, so stored or synced data
   that is broken is refused instead of crashing the app.
2. `src/utils/planImport/toTrainingPlan.ts`: stored sessions → `TrainingWeek[]`
   with `startIso` on every week, `"Ddd M/D"` day labels, and the `zone` /
   `time` / `detail` strings `utils/targets.ts`, `rezone.ts` and the day cards
   already read. Days with no session become rest days. Reuses `planDates.ts`,
   `blockWeeks.ts`, `heartRate.ts` and the zone helpers.
3. `useOnboarding.ts`: `importedPlan?` on `OnboardingConfig`; `isImportedPlan`.
4. `App.tsx`: the imported branch runs first in plan generation; method pick,
   method and zones primers, and season splicing are skipped; the current week
   is the week whose dates contain today (new `weekNumContaining` in
   `planDates.ts`), for uploaded plans only. A broken stored plan shows a
   "re-upload or redo onboarding" message instead of a blank app.

**Tests:** label and date maths (Monday anchor, December → January, both CI
time zones), round trip through the `targets.ts` parsers, `rezoneWeeks` leaves
our strings intact, `validatePlan` runs clean, the app boots on an uploaded
plan and on a corrupt one, and a backup/restore round trip keeps the plan.

## PR 3 — The reading endpoint (Vercel; not called by the app yet)

**Subject:** `Plan import endpoint: reads a PDF, photo or text into weeks and sessions, never keeps the file`

1. `api/coach/plan_import.py`: auth first (`athlete_from_bearer`), 413 above
   4.4 MB, 415 for an unsupported kind, the daily cap (D9), one budget unit,
   then the model call and server-side checks.
2. `api/coach/_plan_import.py`: the prompt (transcribe, never invent; dates only
   if printed; weekday or "any"; notes for anything unsure), the compact JSON
   shape, the message builder (PDF document block, image block, or wrapped
   text), and `validate_extraction` (allowed values, at most 40 weeks and 14
   sessions a week, string lengths, finite numbers).
3. `vercel.json`: `"api/coach/plan_import.py": {"maxDuration": 300}`.
4. CLAUDE.md: the new function and its time limit.

**Tests:** add `plan_import` to `test_endpoint_auth.py`; `test_plan_import.py`
covers the checks, size and kind refusals, the cap, the content blocks per
kind, and **privacy** (a sentinel string from the document never reaches KV or
the logs). A live eval under `-m eval` on our own synthetic plans, run only on
the `run-coach-eval` label, compares Haiku 4.5 and Sonnet 4.6 on accuracy and
time (D3).

## PR 4 — From the model's answer to a stored plan, and the guardrails

1. `src/utils/planImport/normalize.ts`: the endpoint's JSON → `ImportedPlanV1`.
   "Any day" sessions are placed (seven in order become Mon–Sun; otherwise the
   long run goes to Sunday and the rest fill the usual training days); km →
   miles. Sessions stay separate: combining a day's sessions happens in one
   place only, `toTrainingPlan.ts` (PR 2).
2. Guardrails (D1), all required before PR 5 lets anyone write a plan:
   - "Shape my week" (in place and Rebuild) and the coach's reshape proposals
     are hidden or refused. Rebuild would call `save()`, clearing the
     athlete's edits and returning the same plan.
   - Weak-station reweighting, recalibration and level-up offers are hidden.
   - The season is off end to end: the season panel, the primary-race pick
     in the Plan view, and the season context sent to the coach
     (`buildSeasonContext`), which would otherwise describe layered sessions
     that don't exist.
   - Check the HYROX screens for anything that assumes structured station data.
3. The coach snapshot carries `planSource: imported`, and `_core.py` tells the
   coach: the athlete's own plan; respect its structure; suggest day edits only.

**As built (2026-10-09):**
- **Refusal rule.** One helper, `src/utils/planImport/guardrails.ts`, decides
  what a coach proposal may change. Refused: week layouts, and the whole-week
  ops `addWeek`, `deleteWeek` and `updateWeek`. Day edits are approved by the
  athlete.
- **Prompt parity.** The prompt's OWN PLAN section names the same refused ops.
  A keyless test checks the two lists match.
- **Also gated** (found by tracing every plan-changing surface):
  - the "Rebuild the rest of my plan" and weekly-recap rebuild buttons, which
    call `requestRedo` and would delete the uploaded plan;
  - the Monday review's restart-tier rebuild;
  - pace recalibration and benchmark re-anchor, which rewrite the plan's own
    detail text;
  - the strength-load banner;
  - HYROX simulation detection on uploaded days;
  - the Today arc, which now uses the plan's own week focus instead of
    base/build/taper by position;
  - the welcome letter's season text.
- **Found by the adversary review, and gated too:**
  - the Monday review now scores an uploaded week but proposes no changes
    (its "ease the paces" rewrote the plan's own pace text);
  - the coach's realignment nudge, the Plan view's base/build/peak race
    narrative, and Settings → Training Methodology;
  - a refused proposal from a coach insight now reads as kept, not "applied".
  - The coach prompt now says what the app really does: the zone band is the
    app's, and a benchmark doesn't change this plan's paces.
  - Coach-insight cache keys carry `planSource`, so a take written for a
    generated plan is never served for an uploaded one.
  - `uploadedPlanWiring.test.ts` reads the `App.tsx` source, so dropping any
    of these gates fails a named test.
- **Left as designed, for the owner to weigh:**
  - The rule filters by op kind, so seven approved `updateDay`s can still
    rewrite a week.
  - App changes the athlete approves (travel, the Adjust sheet) stay on.
- **Owner to confirm:** the morning autopilot is off for an uploaded plan.
  It applies same-day changes without asking, which D1's "the athlete
  approves" rules out. The coach can still propose a day edit. Re-enabling it
  is one line in `App.tsx`.
- **Deferred to PR 5:** Settings copy (the Hyrox-division note, and Redo
  noting it replaces the uploaded plan).

## PR 5 — Settings: upload, check, use (owner-only)

`PlanImportSheet` (upload sheet, mockup screens 6–7), `ImportReview` (screen
4, shared with onboarding), `usePlanImport`, and the "Upload my own plan" card
in Settings → Training Plan (screen 5). PDF, photo, CSV and pasted text.
Saving goes through `useOnboarding.save()`, so the current plan is backed up
first and the old edit log is cleared.

**Tests:** the sheet (request body, review, apply, errors, cancel, backdrop
close, `85dvh`), the hook, `buildImportedConfig`, and the card's owner gate.

## PR 6 — Word and Excel

`extractDocx.ts` and `extractXlsx.ts` with `fflate`, lazy-loaded. Word tables
become tab-separated rows; Excel date cells become ISO dates (including 1904
workbooks). Tests build the zip files in the test itself.

## PR 7 — Onboarding: "I already have a plan"

A fourth card on the first question (screen 1) and a new step
`STEP_IMPORT_PLAN = 22` (`'import_plan'`). The upload starts on that step and
reads while the athlete answers experience, profile and wearable (screens 2–3);
the review step collects the result (screen 4). Other modes' step lists do not
change.

**Tests:** `onboardingSteps.test.ts` (exact step list per mode, review still
last) and an `Onboarding.test.tsx` flow with a slow mocked endpoint.
