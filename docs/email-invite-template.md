# Broken Arrow Training — New Athlete Invite Email

Plain-text template for inviting a new athlete to the friends-and-family
deploy. Replace the bracketed fields before sending. Keep the URL unlisted
until proper auth ships (see `docs/MULTI_USER_TODO.md`).

---

## Subject lines (pick one)

- You're invited — Training App is ready for you!
- 
---

## Body

Hi [First name],

I've been building an all-purpose training app called **Broken Arrow
Training**, and I'd love for you to be one of the first athletes on it.

It's a coaching tool that turns your day-to-day training data into a daily
readiness score, a session prescription, and a conversation with an AI
coach that actually remembers your history. Today it covers:

- **Training Readiness** — HRV, sleep, recent load, and lifestyle stressors rolled
  into a single go/easy/rest signal each morning.
- **Load & Impact** — TRIMP plus a Movement Intensity Matrix so vertical,
  technical, cycling, lifting, HITT workouts and flat miles each count for what they actually cost.
- **AI coach** — chat, persona, and per-athlete memory. It sees your
  numbers and your notes, and adapts week to week.
- **Integrations** — Strava and Garmin sync, plus HealthKit on iOS.

### Getting started

1. Open the app: **[APP_URL]**
2. Pick your athlete profile from the dropdown (I've pre-created
   **[ATHLETE_ID]** for you).
3. Connect Strava (and Garmin / Apple Health if you use them) from
   Settings → Integrations.
4. Give it a day or two of syncs, then check the Today view — that's
   where readiness, load, and the coach all come together.

### A few things to know

- **Friends-and-family release.** You're feedback is much appreciated. You're helping build the next great app.
- **Your data is yours.** Every athlete's data is scoped separately on
  device and on the server — you won't see anyone else's training and
  they won't see yours.
- **The coach has a daily budget.** It's generous (200 messages a day),
  but if you ever see it pause, that's why.
- **Bugs are expected.** If something looks wrong — a number that
  doesn't match Strava, the coach saying something weird, a screen that
  won't load — please tell me. Screenshots help. This is the stage where
  your feedback shapes the product.

Reply to this email with any questions, or just hop in and start poking.
I'm excited to have you on it.

— Mike

---

## Notes for sender

- **[APP_URL]** — the current Vercel deployment URL.
- **[ATHLETE_ID]** — the slug pre-seeded for this athlete (e.g. `lori`,
  `joel`, `jim`). Coordinate with the athlete-list seed before sending.
- Send one at a time so replies stay personal; do not BCC a list.
- Until auth ships, do not forward this email to anyone outside the
  intended athlete.
