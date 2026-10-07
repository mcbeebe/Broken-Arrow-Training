# 003 — Public landing page at attune.coach, app moves to /app

**Date:** 2026-10-05 · **Status:** Open
**Artifacts:** intent.md (this) → [analysis.md](analysis.md) (everything that
assumes the app lives at `/`) → [plan.md](plan.md) (PR-numbered) →
[design-spec.md](design-spec.md), [copy.md](copy.md), [tokens.json](tokens.json),
[reference/](reference/) (approved mockup) → [kickoff-prompt.md](kickoff-prompt.md)

## Problem

Anyone who hears about Attune and types `attune.coach` lands on a Google
sign-in screen that says "A coach in your pocket" and nothing else. There is no
page that explains what the product does, who it is for, or how to get in. The
only way to ask for access is a small "Request access" form on that sign-in
screen. The free calculators at `/tools/*` were built as an acquisition funnel
(G10) but their "Get the full plan" link drops people at the same sign-in wall.

The product is broader than it looks from the outside: road races, trail and
ultra, HYROX, and general fitness with no race, each with its own plan
builder, plus readiness-driven daily adjustment and an AI coach. None of that
is visible before sign-in.

## Proposed outcome

Checkable when all of these are true:

- `https://attune.coach/` serves the landing page approved on 2026-10-05
  (design "A v2: adapts to every athlete", Signal palette).
- The app is served from `https://attune.coach/app/` and works exactly as
  before: sign-in, Strava connect, push notifications, home-screen launch,
  deep links (`?view=`), the legacy migration airlock.
- Every pre-existing entry into the app at `/` (installed home-screen apps,
  notification clicks, Strava's OAuth callback, airlock hand-offs, links with
  `?view=` or an athlete hash, and signed-in users) reaches `/app/` with its
  query string and hash intact.
- The landing page's invite form writes to the existing request-access queue
  (`/api/auth/athletes`, `action: request_access`), and that endpoint is
  hardened against abuse before the page is public.
- `/tools/*.html` URLs are unchanged, and their call to action leads to the
  landing page's invite form with the tool recorded as the source.
- Every factual claim on the page is backed by code, enforced by tests that
  fail if the code and the copy drift apart.

## Affected parties / surfaces

- **Surfaces:** the GitHub Pages publish (`deploy.yml`, `vite.config.ts`,
  `public/manifest.webmanifest`, `public/sw.js`), the Python API
  (`api/auth/_helpers.py` `app_url()`, `api/auth/google.py` request access,
  `api/coach/push.py` notification URLs), `scripts/airlock/`, `src/tools/`.
  The Cloudflare worker and the iOS companion are unaffected.
- **Existing athletes:** must notice nothing, except that `attune.coach` with
  no session now shows the landing page.
- **Prospective athletes:** get a page that explains the product and a way in.
- **Mike (admin):** receives the same access-request emails and approves in the
  same Settings → Athletes queue.

## Constraints

- `mcbeebe/attune-coach` is a build artifact repo: the landing page must come
  out of this repo's build and `deploy.yml`, never be hand-committed there.
- Keep both publishing arms (`PUBLISH_REF` and `main`) and the
  `ATTUNE_PUBLISH_ENABLED` kill switch.
- `/version.json` stays at the site root (Deploy Diagnostics,
  `check-drift.py`, `verify-published.sh` all read it there).
- `/sw.js` stays at the site root so existing push subscriptions survive.
- The API (Vercel, deploys on push) and the frontend (GitHub Pages) ship
  independently, so no backend change may point people at `/app/` before the
  frontend serves it.
- Tools stay pure client (locked rule, plan §1-D6): no API calls from
  `src/tools/`.
- No claims the code can't back: no App Store app, no Apple Watch workout push,
  no "official" Garmin integration, no pricing, no user counts, no testimonials
  other than the founder's.
- Lint, `npm test`, `npm run build`, and the keyless pytest suite must stay
  green on every PR.

## Open questions

Owner decisions are recorded in [plan.md § Decisions](plan.md#decisions). Still
open, each one blocks only the PR named:

1. **Privacy and Terms text** (blocks PR 5b): the owner must supply the text.
   Claude Code builds the pages, not the policy. *(2026-10-07: the owner chose
   to go live first; PR 5 ships without the footer links and PR 5b adds the
   pages and the links.)*
2. ~~**Founder quote**~~: resolved. The owner’s wording shipped in PR 4b.
3. **`APP_URL` on Vercel** (PR 2): if the env var is set in the Vercel project,
   it must change to `https://attune.coach/app` when PR 2 deploys; the code
   default changes in PR 2, which merges only after PR 1 is live.
4. **Google Cloud authorized JavaScript origins** (PR 1): Google Sign-In uses
   popup mode, so only the origin matters and no change is expected. Confirm
   `https://attune.coach` is listed.
