# 005 — Plan

**Status:** Approved by the owner 2026-10-11 (D5, D7, D8 as recommended) · **Intent:** [intent.md](intent.md)

## Shape: one snapshot, two consumers

The server cannot rebuild the plan, so the client uploads a **check-in
snapshot**. The calendar and the email both read it.

```
weeks memo (App.tsx) ──► buildCheckinSnapshot() ──► POST /api/coach/checkin
   (every edit path,        pure TS: next 6 weeks          │  KV checkin:snapshot:<athlete>
    coach approvals          of days + last 2 weeks         │
    included)                of load/actuals + tz           ├─► calendar diff → Google Calendar
                                                            │     (on upload; near-instant)
hourly cron (existing scheduled_push) ──────────────────────┼─► Sun/Wed 6:00 local → email (Resend)
                                                            └─► 02:00 local → calendar reconcile
```

- **Every plan path is covered without touching it.** Manual edits, swaps,
  locks, travel, replan, season changes and Coach-chat approvals all end at the
  `weeks` memo, the same seam `useGarminAutoRepush` uses. The upload hook sits
  beside it and fires when the snapshot's hash changes (debounced about 5 s).
- **The diff ledger lives on the server.** This departs from the Garmin
  pattern, which keeps its ledger on the client. Here the server stores a
  per-date hash in KV (`gcal:ledger:<athlete>`) and pushes only the days whose
  content changed. A second device then can't double-push, and the nightly
  reconcile works with no app open.
- **One hourly cron, no new cron entry.** The existing hourly fan-out
  (`/api/coach/scheduled_push`, `CRON_SECRET`-protected) already works in each
  device's local time. It gains two calls, each idempotent through a dedup key.

## PRs

| PR | What | Ships |
|----|------|-------|
| **0** | This intent and plan, plus the registry row (#499) | docs only |
| **1** | **Check-in email.** `buildCheckinSnapshot` and the upload hook, `api/coach/checkin.py` (authed POST, owner-gated), `api/coach/_checkin.py` (composer: HTML and plain text), and the Sun/Wed hook in the cron. In Settings → Notifications: a "Coach check-in email" switch and a **Send a test now** button. | the email |
| **2** | **Connect Google Calendar.** `api/auth/google_calendar.py`: start (signed `state`, 10 min), callback (code → refresh token in KV, creates the **attune.coach** calendar in the athlete's time zone), status, disconnect (deletes the calendar, revokes the token, clears KV). A Settings → Connections card. | connect / disconnect, empty calendar |
| **3** | **Calendar sync.** The server-side diff on snapshot upload, events upserted under deterministic IDs (one per date), and the 02:00 reconcile. | workouts on the calendar, kept in step |

Each PR runs the full gate (tsc, lint, build, `check-site-layout`, `npm test`
twice, the keyless pytest suite), then `/adversary`, before review. PR 1 is
useful on its own, so if the Google setup stalls, the email still ships.

## Decisions

The owner made D1–D4 on 2026-10-11 and approved the rest as recommended the
same day.

| # | Decision | Choice |
|---|----------|--------|
| D1 | Design | **B**: a connected calendar with `calendar.app.created`, and the email via Resend |
| D2 | Audience | Owner (`mike`) only. One gate, `checkinOpenTo` / `calendarOpenTo` in `src/utils/checkin/access.ts`, mirrored server-side by the admin athlete plus anyone in `CHECKIN_ATHLETES` |
| D3 | Workout time | 6:00 am local; length = the midpoint of the workout's planned duration (60 min when unknown) |
| D4 | Email days | Sunday and Wednesday |
| D5 | Email time | **6:00 am local** (recommended), the same slot as the existing morning briefing |
| D6 | Time zone | The device's IANA zone, sent with every snapshot (as `usePushNotifications` already does). The calendar is created in that zone |
| D7 | Coach paragraph | **Model-written; the templated sections are the fallback** (approved). The numbers and the day-by-day lists are always templated, so they can't be wrong. Only the 3–5 sentence "coach's read" uses the model, through the existing Anthropic client with a 20 s deadline and no retries, about 2 calls a week. If the model fails, is slow or the day's coach budget is spent, the email goes out without that paragraph |
| D8 | Rest days | **Left off the calendar** (recommended): less clutter. Race day always appears |
| D9 | Calendar window | Today through +6 weeks. Past events are never edited or deleted, so the calendar keeps a history of what was planned |
| D10 | Edits made in Google | The app's plan is the source of truth. If the athlete drags an event in Google, it stays until that day changes in the app or the nightly reconcile runs, then it is put back. Moving a workout is done in the app |
| D11 | Stale data | Each email states "Based on your data as of <date, time>". If the last upload is 3 or more days old (Sunday to Wednesday included), it says so plainly and asks the athlete to open the app. Sessions after that date are counted as not yet synced, never as missed, and load numbers older than a day carry their own date |
| D12 | Token storage | Refresh token in KV, the same as Garmin tokens. Never logged, never returned to the client. A test asserts both |

## What the email contains

The week, the phase and every window are worked out for the send date, not
the upload date.

1. **Coach's read** (D7), at the top.
2. **This week so far:** sessions done vs planned, miles, any missed key
   session, sessions not yet synced, and today's session(s).
3. **Last 2 weeks:** sessions and key sessions done vs planned, logged
   miles and time, Fitness with its 14-day change, Fatigue, Recovery Balance
   and Load Ratio with their zone words.
4. **Next 2 weeks:** every session day by day, through the end of that plan
   week.
5. **Further ahead:** time to the next race, the current phase and the next
   one, and the later weeks' focus and miles.
6. The data date, and an **Open attune.coach** button.

## Tests (by PR)

- **PR 1 (vitest):**
  - the snapshot builder's window, rest-day handling and stable hash;
  - the gate;
  - the hook uploads only on a hash change and never for non-owners.

  **PR 1 (pytest):**
  - the composer: every section, the stale-data line, HTML escaping of
    workout names;
  - the scheduler: Sun/Wed only, 6:00 local in several zones (including
    `Pacific/Kiritimati` and a DST weekend), dedup, nothing sent without a
    snapshot or to a non-owner;
  - the endpoint: auth, size cap, schema validation.
- **PR 2 (pytest):**
  - `state` signing and expiry, plus a forged state rejected;
  - code exchange with Google mocked;
  - disconnect deletes the calendar;
  - the token never appears in a response or a log line.

  **PR 2 (vitest):** the Settings card's states.
- **PR 3 (pytest):**
  - diff and upsert with Google mocked: only changed days are sent, removed
    days are deleted, past days are untouched;
  - deterministic IDs are valid base32hex;
  - a 401 from Google marks the connection broken instead of looping;
  - reconcile.

  `test_vercel_functions.py` covers each new file.

## What the owner sets up (no code can)

1. **Google Cloud:**
   - an OAuth **Web** client (the existing sign-in client can be reused);
   - add the redirect URI that PR 2 prints;
   - enable the **Google Calendar API**;
   - on the consent screen, add the `calendar.app.created` scope and yourself
     as a test user.
2. **Vercel environment variables:**
   - `GOOGLE_OAUTH_CLIENT_SECRET`;
   - `GCAL_REDIRECT_URI`;
   - optionally `CHECKIN_ATHLETES`.

   `GOOGLE_CLIENT_ID`, `RESEND_API_KEY`, `EMAIL_FROM` and `CRON_SECRET` are
   expected to exist already; PR 1 will confirm.
3. **Resend:** the default sender `onboarding@resend.dev` only delivers to the
   Resend account's own address. If the inbox you want is different, verify a
   sending domain (e.g. attune.coach) in Resend and set `EMAIL_FROM`.

## Risks, to verify before PR 2

- **Testing-mode refresh tokens expire after 7 days.** Google issues 7-day
  refresh tokens to apps whose consent screen is "Testing". To keep the
  calendar connected, either publish the app ("In production"), which may need
  verification depending on the scope's tier, or reconnect weekly. PR 2 detects
  the expiry and shows "Reconnect" rather than failing silently.
- **`calendar.app.created`'s sensitivity tier is unconfirmed.** Its entry in
  Google's Calendar scope reference, or your consent-screen scope picker, is
  authoritative. One forum report says the picker doesn't list it. If so, PR 2
  falls back to `calendar.events` scoped in code to the one calendar it
  created, and says so in the PR.
