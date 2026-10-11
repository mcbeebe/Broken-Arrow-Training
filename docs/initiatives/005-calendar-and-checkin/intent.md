# 005 — Workouts on Google Calendar, Coach check-in by email

**Date:** 2026-10-11 · **Status:** Open
**Artifacts:** intent.md (this) → [plan.md](plan.md) (PR-numbered, with the
decisions)

## Problem

The plan lives only inside the app. To know what tomorrow holds, the athlete
opens attune.coach. Their day is run from Google Calendar, which shows nothing
about training. Between sessions, the coach only speaks when the athlete opens
the chat. Nothing reaches them unprompted with "here is how the week went, and
here is what's next."

## Proposed outcome

Checkable when all of these are true:

- **Calendar.** After one "Connect Google Calendar" tap in Settings, the planned
  workouts appear in a dedicated **attune.coach** calendar in the athlete's
  Google account, at **6:00 am local** by default.
- **The calendar follows the plan.** A change made by the athlete (edit, swap,
  lock, travel, replan, season change) or approved from the Coach chat reaches
  the calendar on that day, without the athlete doing anything. A nightly
  reconcile repairs anything that was missed.
- **Disconnecting** removes the attune.coach calendar and forgets the token.
- **Check-in email.** Every **Sunday and Wednesday**, a Coach check-in arrives
  in the athlete's inbox. It covers how this week is going, progress over the
  last 2 weeks, the next 2 weeks, and the horizon beyond them (next race,
  block). It states the date of the data it was written from.
- **Owner only first.** Both features are open to athlete `mike` alone, behind
  one gate, until the owner has lived with them.

## Affected parties / surfaces

- **Surfaces:** the web app (Settings, a sync hook beside `useGarminAutoRepush`)
  and the Python API on Vercel (OAuth, calendar sync, check-in composer, a cron
  path in `vercel.json`). The Cloudflare worker, the iOS wrapper and the landing
  page are unaffected.
- **The owner:** the first and only user at launch.
- **Every other athlete:** sees nothing new and is affected by nothing.
- **Google Cloud:** a project with an OAuth client and consent screen. The owner
  configures it; no code can.

## Constraints

- **The server cannot rebuild the plan.** It exists only on the client
  (`App.tsx` → the `weeks` memo). So the client must upload what the server
  sends, and both the calendar and the email use the last upload.
- **Narrowest Google scope:** `calendar.app.created` lets the app make its own
  calendar and touch only that calendar. No Gmail scope: email goes through the
  existing Resend integration (`send_email`, `api/auth/_helpers.py`).
- **Pinned dependencies:** `api/requirements.txt` pins are the deployment.
  Google's REST endpoints are called with `urllib`, as Resend's are, so this
  initiative adds no Python dependency.
- **The API deploys with no gate.** Every `vercel.json` change replays through
  `test_vercel_functions.py`.
- **The Google token is a credential.** It must never be logged or returned to
  the client, and never stored outside KV.

## Open questions

Answered by the owner on 2026-10-11:

- *Which design?* B: a connected Google Calendar (incremental OAuth,
  `calendar.app.created`, a dedicated calendar, near-instant push of changed
  days) plus a Resend email. Not chosen: A (an ICS feed, refreshed by Google
  every 8–24 h) and C (Gmail API sending).
- *Who first?* The owner only.
- *Default workout time?* 6:00 am.
- *Email cadence?* Sunday and Wednesday.

Answered the same day (approved as recommended, plan.md § Decisions):

- *Coach paragraph?* Model-written, with a templated fallback (D7).
- *Email time?* 6:00 am local (D5).
- *Rest days on the calendar?* Left off; race day always shows (D8).
