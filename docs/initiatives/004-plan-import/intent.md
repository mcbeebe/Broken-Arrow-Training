# 004 — Upload your own plan (PDF, Word, Excel, photo)

**Date:** 2026-10-08 · **Status:** Open
**Artifacts:** intent.md (this) → [plan.md](plan.md) (PR-numbered, with the
decisions) → mockup (8 screens, owner-approved 2026-10-08:
<https://claude.ai/artifact/6qcgCp3n98vJBn9rTbZuto>, private to the owner)

## Problem

Many athletes already train from a plan someone else wrote: a coach's
spreadsheet, a plan from a book, a club PDF. The app can only follow a plan it
generated itself. An athlete with their own plan has two bad choices: retype it
day by day with the workout editor, or give it up and take a generated plan.

Under the hood the app never stores a plan at all. `App.tsx` rebuilds it from
the onboarding answers on every render, so there is nowhere to put a plan that
did not come from a generator. Only the four seed athletes (`src/data/*-plan.ts`)
run on a fixed plan, which shows a text-only plan works end to end once it is
in the right shape.

## Proposed outcome

Checkable when all of these are true:

- From **Settings → Training Plan** and from the **first onboarding question**
  ("I already have a plan"), an athlete can upload a PDF, Word (.docx), Excel
  (.xlsx) or CSV file, take a photo, or paste text.
- The app turns it into its own weeks and days. **Nothing goes live until the
  athlete has checked it** on a review screen: start date (or "I'm already on
  week N"), race, a week-by-week preview, and every point the reader was unsure
  of.
- Once accepted, the plan behaves like any plan: Today, the Plan view, logging,
  Strava/Garmin matching, per-day edits, coach replies, Plan Start, Restore and
  Redo all work. It survives sync to a second device.
- The plan is followed **as written**: the app does not reshape, recalibrate or
  level it up. The coach may suggest day-level tweaks the athlete approves.
- The uploaded file is never stored and never logged. Only the plan the athlete
  approves is saved.

## Affected parties / surfaces

- **Surfaces:** the web app (`App.tsx`, onboarding, Settings, a new
  `src/utils/planImport/`), and the Python API on Vercel (a new
  `api/coach/plan_import.py` with its own time limit in `vercel.json`). The
  Cloudflare worker, the iOS companion and the landing page are unaffected.
- **Athletes with their own plan:** the people this is for.
- **Every other athlete:** must notice nothing. Generated plans keep their
  current behaviour, including how the current week is worked out.
- **The coach:** reads a new "this is the athlete's own plan" line in its
  context.

## Constraints

- Vercel caps a request body at about 4.5 MB (`api/sync.py:40`), so a file sent
  as base64 must stay under about 3 MB.
- `api/coach/*.py` runs with `maxDuration: 60`. Reading an 18-week plan can take
  longer, so the new function gets its own limit (Vercel Pro allows 300 s).
- `api/requirements.txt` pins are the deployment. Word and Excel are read in the
  browser so this initiative adds no Python dependency. `anthropic` stays
  `<1.0.0`.
- No npm `xlsx` (SheetJS): the registry version carries CVE-2023-30533 and
  CVE-2024-22363. `fflate` is already in the lockfile.
- Backups and Restore keep only the onboarding config plus the edit logs
  (`src/utils/planBackups.ts`), so the imported plan lives inside the config.
- Plan step IDs in onboarding never shift (`onboarding/steps.ts`).
- Uploaded documents never reach `log_sample_event` or any log.

## Open questions

Answered by the owner on 2026-10-08:

- *Follow as written, or let the app adapt it?* Follow as written. The coach
  suggests day tweaks; reshape, recalibration, level-up and season splicing are
  off for an uploaded plan.
- *Which formats first?* Staged: PDF, photo, CSV and pasted text first; Word and
  Excel one PR later.
- *Which model reads the file?* A live eval on plans we write ourselves picks
  between Haiku 4.5 and Sonnet 4.6. Spending a few dollars of API budget on it
  is approved.
- *Who gets it first?* The owner only, then everyone once the eval and the
  owner's own uploads look right. Five uploads per athlete per day.

Still open:

- Should effort words in a plan ("easy", "tempo") map to the app's heart-rate
  zones, or should a plan's own zone table be adopted?
- When a coach sends the next block, does it replace the plan or add weeks?
- Metric athletes will see miles (the app is miles-only today). Is that
  acceptable for v1?
