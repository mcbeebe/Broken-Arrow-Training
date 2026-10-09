# 004 — Build plan: upload your own plan

Seven PRs, in order. Each references **initiative 004** in its description and
follows `CLAUDE.md` (readable commit subjects, open a PR, run `/adversary`
before review, CLAUDE.md updated in the same PR when layout or deploy changes).

Nothing changes for athletes until PR 5. PRs 2–4 add a render path and an
endpoint that nothing in the UI calls yet. PR 5 shows the Settings card to the
owner only (D8).

**Ordering rule:** the frontend (GitHub Pages, gated by tests) and the API
(Vercel, deploys on push with no gate) ship independently. PR 3 (the endpoint)
must be live on Vercel before PR 5 (the first caller) is published. Merging the
PRs in order guarantees it. The client can't tell "not deployed" apart: the
browser's CORS preflight to a missing function fails, which reads as a network
error ("We couldn't reach the server").

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
| D11 | **Word and Excel are read in the browser** with `fflate` (already in the lockfile via jspdf; now a direct dependency at `^0.8.3`, with the reader lazy-loaded). No SheetJS (CVEs on the npm registry), no new Python packages | Recommended, adopted |
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
   "Any day" sessions are placed, always in the plan's order (seven become
   Mon–Sun; otherwise they spread across the usual training days, and a long
   run that closes the week takes Sunday); km → miles. Sessions stay separate: combining a day's sessions happens in one
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
Saving goes through `useOnboarding.importPlan()`. It backs up the current
plan, with its latest day edits, as "before upload", then `save()` clears the
old edit log. (`save()` itself backs up only *after* writing.)

**Tests:** the sheet (request body, review, apply, errors, cancel, backdrop
close, `85dvh`), the hook, `buildImportedConfig`, and the card's owner gate.

**As built (2026-10-09):**
- **The flow:**
  - **Modules:** `prepareUpload.ts` (pick → body), `client.ts` (the request), `importErrors.ts` (the athlete's words for every outcome), the `usePlanImport` hook, and `ImportReview` / `PlanImportSheet` / `PlanImportCard`.
  - **Checked locally first.** The browser checks everything the server would refuse, from the file's own bytes, so the athlete hears at once and no megabytes are sent to be told no. (The server refuses those before counting an upload, so this saves time, not uploads.)
  - **The file name is not part of the request** (D10). It is kept as the plan's source name, which syncs with the plan like the rest of it.
  - **Word and Excel** say "coming soon, save it as a PDF" until PR 6.
- **`buildImportedConfig`** decides, field by field, what an upload keeps and clears. A typed table makes a new config field fail the type check until it gets a rule.
  - **Cleared:** the old race's distance, vert, description and goal (or an uploaded 10K reads "Marathon"); the method; the reshapes.
  - **Kept:** the athlete, their season answers and the screens they've seen.
- **The season calendar is kept, through an upload and back.**
  - **The upload:** App.tsx doesn't re-seed the calendar while the plan is uploaded. An upload is a new plan generation, and re-seeding would have dropped every race added in the Season panel.
  - **The undo:** backups now hold the calendar. Restore writes it back marked as seeded for the restored plan, so restoring doesn't re-seed it either. (Before this, any Restore re-seeded the calendar and dropped the panel's races.)
- **The injury ramp note** ("harder from Week 3") is off for an uploaded plan.
- **Backups:**
  - A same-plan capture now takes the newest day edits, but never trades the edits it holds for none.
  - "before upload" is a new label.
  - **Every backup has its own id** (`savedAt`). A "before …" capture and `save()`'s own capture can land in the same millisecond, and Restore, which finds a backup by its id, could restore the wrong one. `rebuildWithShape` had the same collision.
  - **Backups are written with `setItemWithRoom`,** which drops regenerable caches to make room. `importPlan` refuses the upload unless the outgoing plan is in the backups.
- **The client waits 600 s.** The model gives up at 240 s and the function at 300 s, but their clocks start once the upload has arrived, and a read the browser abandons still counts.
- **Owner-only in two places:** the server (`PLAN_IMPORT_OPEN` / `PLAN_IMPORT_ATHLETES`) and the Settings card (`athleteId === 'mike'`). Opening it to anyone else, by either setting, also needs the card's check changed.
- **Existing bug found, outside this initiative:** Restore brings back a plan but not its day edits. `configForRestore` re-stamps `completedAt`, and the edit hooks drop every edit older than that. A separate fix is proposed to the owner.

## PR 6 — Word and Excel

Word and Excel read in the browser with `fflate`, lazy-loaded. Word tables
become tab-separated rows; Excel date cells become ISO dates (including 1904
workbooks). Tests build the zip files in the test itself.

**As built (2026-10-09):**
- **One module, `extractOffice.ts`,** loaded with `import()` the first time a Word or Excel file is picked (4.9 KB gzipped). It reads the file in the browser and sends `{kind:'docx'|'xlsx', text}`, under the same 120,000-character limit as any text. The server already took these kinds as text, so nothing changes there, and the file itself never leaves the phone.
- **What counts as Word or Excel:** `.docx/.docm/.dotx/.dotm` and `.xlsx/.xlsm/.xltx/.xltm`, their MIME types, or any zip that holds `word/document.xml` or `xl/workbook.xml` (a cloud-drive download often has no extension). The contents decide which reader runs. Files are capped at 15 MB in the browser (`OFFICE_FILE_BYTES`).
- **fflate is a direct dependency at `^0.8.3`.** 0.8.2, which jspdf had put in the lockfile, has `unzipSync` loop forever on a crafted ZIP64 archive ([GHSA-px8p-9vwx-vf98](https://github.com/advisories/GHSA-px8p-9vwx-vf98), moderate, CVSS v4 6.6; fixed in 0.8.3), and unzipping a file the athlete picked is exactly that call. jspdf shares the one copy.
  - A test checks the installed version first. The advisory's own file (built in the test) would hang an older fflate beyond any timeout's reach, so it runs only when that check passes. Verified on 0.8.2: the check fails and nothing hangs.
- **The bundle:** fflate already shipped up front through jspdf's PDF export. Now that the reader uses its unzip code too, fflate sits in a small shared chunk, and the app's up-front JS grows by **3.5 KB gzipped** (807.4 → 810.9 KB, both builds on the same node_modules). The reader stays lazy.
- **Limits (`OFFICE_LIMITS`), on what the file really holds, never on what it claims:**
  - **The zip is read with fflate's streaming `Unzip`,** entry by entry, through two decoders of our own (deflate and stored). They count the bytes each part actually produces and stop at 20 MB a part and 40 MB in total.
    - Deflate input goes in 16 KB slices, so at most about 16.5 MB comes out between checks.
    - **The first version trusted the sizes the zip declares.** `unzipSync` inflates into a buffer of the declared size and keeps decoding past its end, so a part claiming 100 bytes cost 4 s per MB of file (the adversary's measurement). A stored part copied its real size whatever it claimed. Both are now refused at once: 64 MB of zeros claiming 100 bytes → `too_large` in 0.2 s (measured in jsdom).
    - Only the entries actually present are walked, so a directory's claims ("billions of entries") cost nothing.
    - A zip missing only its index at the end (an interrupted download) is still read.
  - **At most 1,000 entries and 100 sheets,** and a sheet part named by many sheets is read once. A 3.7 KB crafted workbook naming one hidden-row sheet 80 times took 60 s before. fflate's streaming reader recurses per entry and overflows at about 2,500, so the entry cap sits well below that.
  - **A deflate stream that takes 1 MB of input with nothing coming out is given up on.** No real stream comes close; junk after a stream's end made fflate re-copy its backlog on every slice (8 MB: 1.8 s, then "ok").
  - **Reading stops past 1,000,000 characters** (`too_long`). A sheet with a stray cell in column XFD on every row can't grow the text without end. Rows go straight into the output, so a 200,000-row sheet no longer overflows a spread and reads as "unreadable".
- **Work, not just bytes (the second review).** Byte caps don't bound work: a small file could still make the reader do a lot. Each case found is closed and has a test that the old code fails:
  - **Trailing runs are trimmed in one pass.** An anchored regex (`/[ \t]+$/`, `/\n+$/`) backtracks over every run it can't finish: 100,000 spaces or line breaks in a 1 KB file took 9–11 s. Now about 20 ms.
  - **A shared string is cleaned once,** not once per cell that points at it (a 1M-space string in 4,000 cells: 7.8 s → 0.3 s).
  - **A number format is worked out once,** and a code longer than 255 characters (real ones are a few dozen) reads as General (a 1 MB code on 2,000 styles: 19 s → 77 ms).
  - **A part that declares a DOCTYPE is never parsed.** Word and Excel never write one, so it could only be there for entity tricks.
  - **A one-cell layout table looks for its own tables only,** not every descendant at each level. Measured honestly, the deep-nesting case's time was jsdom's own XML parser (9.5 s to parse 300 levels around 50,000 paragraphs), not this search (about 0.3 s of it). Browsers parse natively.
- **Word:**
  - Body paragraphs in order: `w:tab` → tab, `w:br` → newline, non-breaking hyphens kept, soft hyphens dropped. Tab-stop definitions are skipped.
  - **What Word shows is what's read.** Hidden text (`w:vanish`), deleted text and a tracked move's source are left out, as Excel's hidden rows are.
  - **Tables keep their grid.** One line per row, cells tab-separated. A cell spanning days (`gridSpan`) is followed by an empty field per extra day, and a row that starts late (`gridBefore`) starts with empty fields, so every day stays in its column. A cell's paragraphs, and any table inside it, are joined with " / ". A one-cell layout table around the plan is read as its contents.
  - Content controls, custom XML and smart tags are looked through. A text box is read once (Word's `Choice`, not its `Fallback` copy), on its own lines.
- **Excel:**
  - Every visible sheet, in tab order, as `Sheet: <name>` and then its rows. Hidden and very hidden sheets, hidden rows and hidden columns are left out, and chart sheets are never opened. Column gaps are kept, so a day stays under its heading.
  - Shared, inline and rich strings (no phonetic guides; `_x000D_` escapes decoded), booleans, formulas' cached values and errors.
  - **A number reads the way its cell shows it.**
    - Dates become ISO dates: Excel's 1900 system with its phantom 29 Feb 1900, and the 1904 system, in UTC, up to 9999-12-31 in each.
    - `ddd` headers become `Mon`; times, paces and durations become 8:30, 07:15 (`m:ss` gives 7:15) and 1:30:00.
    - Percentages keep %; `#,##0` groups thousands; a lone `m` is the month number; `;;;` hides the value.
    - Words in a format stay: `"Week "0` reads "Week 3" and `0.0" mi"` reads "6.2 mi".
  - A row costs what its cells hold, not the column its last cell sits in.
  - A sheet that the workbook names but is missing or broken makes the file unreadable rather than "empty".
- **Errors, each telling the athlete what to do:**
  - **Password-protected or damaged:** a password-protected .docx/.xlsx (an OLE file holding an `EncryptedPackage` stream), or a damaged one.
  - **Asked to be re-saved as .docx, .xlsx or PDF:**
    - an older `.doc`/`.xls`, by name, by its exact MIME type, or by its bytes; this includes one renamed `.docx`, since an OLE file with no `EncryptedPackage` is an older format, not a protected one;
    - an Excel binary `.xlsb`, by name or type.
  - **"Save it as a PDF or take a screenshot":** a file with no text in it, often a picture of the plan pasted in (`office_no_text`).
  - **"Copy just the plan into a new file, or save it as a PDF":** contents that unzip past the limits (`office_too_big`), usually a big hidden data sheet or bloated styles, not "too big", since the file itself was under 15 MB. Text past 1,000,000 characters is "more text than we can read at once" (`too_long`).
  - **A file's type counts only when its name has no extension.** Windows with Excel installed calls every .csv `application/vnd.ms-excel`, which had refused CSVs as old Excel files.
  - **Other zip formats** (`.zip`, `.pages`, `.numbers`, `.key`, `.odt`, …) are "we can't read that kind of file" whatever their size. Any other zip is read, so a Word file saved as "Plan v1.2" still is.
  - **"Check your connection":** the reader failed to load (`reader_unavailable`).
- **Tested against real files** made by python-docx, openpyxl, xlsxwriter and LibreOffice (`scripts/generate-plan-import-office-fixtures.py` writes them, base64, into `src/__tests__/planImport/fixtures/officeFixtures.ts`), then hand-built XML for what those tools can't be made to write.
- **Known limits, accepted:**
  - A Word numbered list loses its numbers (they are list formatting, not text).
  - An Excel merged range shows its text in the first cell only, like any other single session.
  - Text hidden by a character *style* (not on the run itself) is still read.
  - The main parts are found by their usual names (`word/document.xml`, `xl/workbook.xml`): the names every tool behind the test files writes (python-docx, openpyxl, xlsxwriter, LibreOffice). A producer that names them otherwise reads as unreadable; following `_rels/.rels` would cover it if one turns up.
  - Parts are read as UTF-8, which every producer above writes.
  - Formula cells show their cached value. Excel always writes one; a library-written workbook never opened in Excel may not, and those cells read empty.
  - A layout table of two or more cells, each holding a plan table, reads each nested plan as one " / "-joined line. Only a one-cell layout table is unwrapped.
  - **Reading is synchronous on the main thread.** Every way the two reviews found for a small file to make large work is closed and tested, but that is not a proof that none is left. A Worker with a time limit would contain any that remain; it needs an XML parser that doesn't use the DOM, since `DOMParser` doesn't exist in workers. That is a follow-up if a real file is ever slow. The "Reading your plan…" screen, with its Cancel, now shows from the moment the athlete taps Read, not after the file is prepared.
  - **No fixture comes from Microsoft Word or Excel, Google Docs or Sheets, or Apple Pages or Numbers.** They come from python-docx, openpyxl, xlsxwriter and LibreOffice, the tools that can be scripted here. The owner's first real uploads are the check on the rest.
  - **The zip's own entries are read, not its central directory** (fflate's streaming reader). A crafted file could show one thing in Word and hold another; the review screen shows what was read before anything is saved.
  - **Text only (D11):** colour coding, bold week headers and what a merge meant don't reach the reader.

## PR 7 — Onboarding: "I already have a plan"

A fourth card on the first question (screen 1) and a new step
`STEP_IMPORT_PLAN = 22` (`'import_plan'`). The upload starts on that step and
reads while the athlete answers experience, profile and wearable (screens 2–3);
the review step collects the result (screen 4). Other modes' step lists do not
change.

**Tests:** `onboardingSteps.test.ts` (exact step list per mode, review still
last) and an `Onboarding.test.tsx` flow with a slow mocked endpoint.
