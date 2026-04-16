# Multi-User Readiness — Open Items

The app started Mike-only and is being opened up to additional athletes
(Lori, Joel, Jim, plus future invites). This doc captures what's safe to
ship now, and what still needs to happen before external use.

## Safe for invited friends/family

- ✅ Per-athlete localStorage scoping: `ba_coach_memory_v1:<athleteId>`,
  Strava tokens, Garmin state, etc. are all keyed by athleteId. No
  cross-leakage.
- ✅ Per-athlete server KV: `coach_memory:<athleteId>`, `coach_budget:…`
  etc. Same isolation server-side.
- ✅ Per-athlete LLM soft budget: 200 calls/day/athlete, enforced in
  `check_and_increment_budget`. Runaway chat loops can't drain the
  whole Anthropic bill.
- ✅ Coach now enabled for all athletes (no more `athleteId === 'mike'`
  gate). Persona, memory, chat, archives all work per-athlete.
- ✅ Deploy Diagnostics + Coach Diagnostics surfaces remain Mike-only
  (gated by `athleteId === 'mike'` in Settings).

## BLOCKERS before opening to strangers / the public

- ⚠️ **No auth**. Any caller can POST to `/api/coach/memory` with any
  `athleteId` and read/write that athlete's memory. Mitigation for
  now: friends-and-family deploy with the URL unlisted. Proper fix:
  signed tokens per athlete (e.g. a simple HMAC of athleteId + server
  secret issued at first login).
- ⚠️ **No rate limiting on the HTTP level**. Budget is per-athlete
  per-day, but a malicious caller could spam the chat endpoint with
  invalid athleteIds to generate Vercel function invocations. Add a
  per-IP rate limiter (e.g. Upstash Redis INCR with TTL) before
  public release.
- ⚠️ **No account management**. Athletes are identified by URL hash
  (`#mike`, `#lori`). Fine for a trusted group, but a stranger could
  pick an in-use athleteId and hijack their memory. Fix: auth +
  account creation flow.

## Nice-to-haves for scale

- Per-athlete daily email/Slack digest (the insight engine already
  renders a "daily read" — just needs a webhook trigger).
- Prompt caching for APP_KNOWLEDGE block (stable across users, ~3KB,
  would meaningfully cut per-turn tokens at scale).
- Admin dashboard for monitoring `coach_budget:*` keys, flagging
  athletes approaching cap.
- Per-athlete persona defaults (e.g. Lori gets "warm" + "motivational"
  by default instead of empty).

## When to revisit

When Mike decides to share a link beyond his household: walk through
the BLOCKERS list above before the first outside invite goes out.
