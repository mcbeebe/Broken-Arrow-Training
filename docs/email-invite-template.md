# Broken Arrow Training — New Athlete Invite Email

Casual, buddy-tone invite for the friends-and-family deploy. Swap
`[First name]` and `[ATHLETE_ID]` before sending. Keep the URL unlisted
until auth ships (see `docs/MULTI_USER_TODO.md`).

A ready-to-send HTML version lives at
[`email-invite.html`](./email-invite.html).

---

## Subject lines (pick one)

- come break my training app
- you're in — Broken Arrow Training
- wanna be a guinea pig?

---

## Body

hey [First name] —

so I've been building this trail-running app, **Broken Arrow Training**,
and it's finally at the point where it's actually useful. I want you on it.

short version: you plug in Strava (and Garmin / Apple Health if you've
got 'em), and every morning it tells you how cooked you are, what to do
about it, and lets you argue with an AI coach that remembers what you
told it last week. it knows the difference between flat miles and a
techy 4k-vert day, which is most of why I built it.

to get going:

1. hit https://attune.run
2. pick **[ATHLETE_ID]** from the athlete dropdown — I already set you up
3. Settings → Integrations → connect whatever you use
4. give it a day or two to sync, then check the Today view

a few heads-ups:

- this is friends-and-family only right now, so please don't pass the
  link around — there's no real login yet
- your data is yours, nobody else on the app sees your stuff and you
  don't see theirs
- the AI coach has a daily message budget. it's high, but if it stops
  talking that's why
- stuff will break. tell me when it does — screenshots are gold. this
  is the stage where your feedback actually shapes what gets built

hit reply with questions or just dive in. stoked to have you on it.

— Mike

---

## Notes for sender

- **App URL:** https://attune.run
- **[ATHLETE_ID]** — the slug for this athlete (e.g. `lori`, `joel`, `jim`).
  Before sending, add the athlete's Google email in
  **Settings → Athletes** (owner-only). They're recognized on first
  sign-in — no redeploy. Their plan builds itself through onboarding.
- Send one at a time so replies stay personal; do not BCC a list.
- Until auth ships, do not forward this email to anyone outside the
  intended athlete.
