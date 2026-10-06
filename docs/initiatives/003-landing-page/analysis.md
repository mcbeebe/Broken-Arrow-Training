# 003 — Analysis: everything that assumes the app lives at `/`

Audited at commit `ee48584` (2026-10-04). Line numbers are from that commit;
re-grep before editing. Each row says what must happen in [plan.md](plan.md).

## How the site is built and served today

- `vite.config.ts:31` — `base: process.env.VITE_BASE_PATH ?? '/Broken-Arrow-Training/'`.
  `deploy.yml` sets `VITE_BASE_PATH: /` for attune.coach.
- `vite.config.ts:36-43` — multi-page inputs: `index.html` (the app) plus
  `tools/fueling.html`, `tools/predictor.html`, `tools/heat.html`.
- `deploy.yml` publishes `dist/` to `mcbeebe/attune-coach` `gh-pages` with
  `keep_files: true`, writes `dist/CNAME` and `dist/version.json`, then runs
  `scripts/deploy/verify-published.sh` against `https://attune.coach/version.json`.
- There is no `404.html` fallback for attune.coach and no client router. The
  app routes on query params (`?view=`) and uses the hash for the athlete ID
  (`src/App.tsx:168,179,452,490-493`).
- The API is on a **different origin** (`https://broken-arrow-training.vercel.app`),
  found through `VITE_COACH_API_URL || VITE_GARMIN_API_URL`
  (`src/utils/coachApi.ts:26-30`). CORS is `*` on every handler. Moving the
  app's path does not touch the API.
- All client state is origin-scoped `localStorage` (`ba_*`) and
  `sessionStorage`; no cookies, IndexedDB or Cache Storage. Moving from `/` to
  `/app/` on the same origin loses nothing.

## Chosen layout

**Keep `base: '/'` and make the app a second HTML entry at `app/index.html`.**
Landing at `index.html`, tools unchanged at `tools/*.html`. Vite emits
`dist/index.html`, `dist/app/index.html`, `dist/tools/*.html` and shared
`dist/assets/`.

Why not `base: '/app/'`: every root-pinned asset (`/sw.js`, `/version.json`,
the tools) would move or need special-casing, and the service worker scope
would change, which drops existing push subscriptions. A second entry under a
root base moves only the one HTML file.

## Every root dependency and what it needs

| # | Where | Today | Needed |
|---|---|---|---|
| 1 | `index.html` (app shell) | the app | Move to `app/index.html`; new `index.html` is the landing page. Fix relative script path (`/src/main.tsx` stays absolute, fine) |
| 2 | `vite.config.ts` inputs | `main: index.html` | Add `app: app/index.html`; `main` becomes the landing |
| 3 | `tailwind.config.js` `content` | `./index.html`, `./src/**` | Add `./app/index.html` (landing files live in `src/` and `index.html`) |
| 4 | `public/manifest.webmanifest` | `start_url: ./?view=today`, `scope: ./`, no `id`, shortcuts `./?view=…` | `id: "/?view=today"` (keeps the identity Chrome derived for existing installs), `start_url: "/app/?view=today"`, `scope: "/"`, shortcuts `/app/?view=…`. Linked only from `app/index.html` |
| 5 | `public/sw.js:30,46,49-57` | default URL `/?view=coach`; `notificationclick` focuses the **first** open window | `/app/?view=coach`; focus only a client under `/app/`, else `openWindow`. File stays at `/sw.js` |
| 6 | `src/main.tsx:50`, `src/hooks/usePushNotifications.ts:87` | `register('/sw.js')` | Unchanged (scope `/` covers `/app/`; keeps existing subscriptions) |
| 7 | `api/coach/push.py:185,302` | `"url": "/?view=coach"` | `/app/?view=coach`, **in PR 2, after PR 1 is live** (the API deploys on push with no gate; the guard covers the old URL meanwhile) |
| 8 | `deploy.yml` `VITE_STRAVA_REDIRECT_URI` | `https://attune.coach/` | `https://attune.coach/app/`. Strava's callback domain is domain-only; no Strava app change |
| 9 | `src/utils/strava.ts:6-7` | `VITE_STRAVA_REDIRECT_URI \|\| origin + BASE_URL` | Fallback must become `origin + '/app/'` (BASE_URL stays `/`) |
| 10 | `src/components/MigrationReceive.tsx:84,102,117,172` | `location.replace(… '/' …)`, `<a href="/">` | `/app/` |
| 11 | `scripts/airlock/index.html:9,35,40,97,115,175,184,213,216`, `scripts/airlock/404.html:8,11` | `TARGET = 'https://attune.coach'` is both the URL base **and** the `postMessage` origin check (`ev.origin !== TARGET`, ~213/216); `destRel()` maps the legacy prefix to `/` | Keep `TARGET` as the bare origin. Add `APP_PATH = '/app/'` for the navigation URLs, and make `destRel()` map to `/app/`. Changing `TARGET` itself breaks migration. The landing guard also forwards `__migrate` URLs, so a stale airlock still works |
| 12 | `src/utils/migrate.ts:174,178,197,324` | sender `${targetOrigin}/?__migrate=1`; receiver `dest` fallback `'/'` | Point both at `/app/`; guard covers stragglers |
| 13 | `src/tools/ToolShell.tsx:19,43` | `` `${BASE_URL}?from=${toolId}` `` → `/?from=tool-x` | `/?from=tool-x#join` (landing invite form, source recorded). Landing must **not** forward `?from=` alone |
| 14 | `api/auth/_helpers.py:195-196` `app_url()` | default `https://attune.coach` | default `https://attune.coach/app` **in PR 2**; check whether Vercel sets `APP_URL` |
| 15 | `src/components/DeployDiagnostics.tsx:57`, `scripts/deploy/check-drift.py:34`, `verify-published.sh:18` | root `/version.json` | Unchanged; `version.json` stays at the root |
| 16 | **Installed home-screen apps, old notifications, Strava callbacks, airlock hand-offs, bookmarks with `?view=` or `#athleteId`** | land on `/` | New `legacyEntryTarget()` guard in the landing entry forwards them to `/app/` with search + hash intact (spec in [design-spec.md § Legacy entry guard](design-spec.md#legacy-entry-guard)). iOS never refreshes a saved home-screen URL, so this guard is permanent |
| 17 | Signed-in users typing `attune.coach` | the app | Guard forwards when `localStorage.ba_auth_session` exists, unless `?home=1` |
| 18 | `vite.config.ts:31` legacy fallback `'/Broken-Arrow-Training/'` | Only CI sets `VITE_BASE_PATH=/`; local `npm run dev`/`vite preview` still serve under the legacy prefix, and no job builds with that prefix any more | Default becomes `'/'` so local checks match production; update CLAUDE.md’s legacy-branding note |
| 19 | `public/favicon.svg` | app favicon, manifest icon, apple-touch-icon, push icon and badge (`sw.js:37-38`) | Untouched. The landing mark is a separate `/attune-mark.svg` |
| 20 | Installs made before `start_url` became `?view=today` (older `?view=summary`, `src/utils/viewId.ts`) | their derived manifest id differs from `/?view=today` | The new `id` can’t adopt them; they keep working through the guard (row 16) |

## Tests that touch these paths

- `src/__tests__/viewId.test.ts:50-71` reads the manifest's `view=` IDs (not
  paths). Keep passing; extend to assert `id`, `start_url`, `scope`.
- `src/__tests__/migrate.test.ts:255` uses `dest: '/?view=readiness#mike'` in a
  pure round trip; it needs no change. Add a case for the new `dest` fallback.
- `src/__tests__/tools/toolMath.test.ts:91-101` bans `fetch(`, `localStorage`,
  `/api/` in `src/tools/`. The ToolShell change (row 13) is a link only, so it
  stays compliant.
- `scripts/deploy/tests/test_check_drift.py` assumes root `version.json`. Unchanged.

## The request-access endpoint (the form's backend)

- `api/auth/google.py:67` routes `action: request_access`; handler at
  `google.py:~133-158`. `vercel.json` rewrites `/api/auth/athletes` →
  `/api/auth/google`.
- Validates with `EMAIL_RE`, returns `400 {"error": "Please enter a valid email address."}`
  on a bad address, and `200 {"ok": true}` otherwise, including for
  already-approved emails (so the form can't be used to probe membership).
  Keep both.
- `503` is returned only when KV is **unconfigured** (`_kv_set` raises
  `RuntimeError`). A KV network failure raises `URLError`, which the handler
  doesn't catch, so the outer handler at `google.py:128` answers
  `500 "Google auth failed…"`. PR 2 makes that a 503.
- **Latent bug:** `_kv_get` swallows errors and returns `None`, so
  `get_access_requests()` reads a failed fetch as an empty queue, and the next
  `add_access_request()` overwrites every pending request with one entry. A
  public form makes this far more likely. PR 2 fixes it first.
- `add_access_request()` (`_helpers.py:137-147`) de-dupes by email and caps the
  queue at `MAX_ACCESS_REQUESTS`; the note is truncated to `MAX_REQUEST_NOTE_LEN`.
- **Gap:** no rate limit and no bot check, and `notify_admin_of_request()`
  emails Mike on every request. A public form makes the inbox the target.
  PR 2 adds a honeypot and a per-IP throttle before the page is public.

## Out of the repo (owner checks)

- Google Cloud authorized JavaScript origins: popup mode (`LoginScreen.tsx:83`),
  origin-only. Expect no change; confirm `https://attune.coach` is listed.
- Vercel project env: is `APP_URL` set? If so, update it when PR 2 ships.

## CLAUDE.md drift noticed during this audit

Not part of this initiative's scope, but a session will read them as true:

- `CLAUDE.md` says lint is "NOT yet in CI; 43 errors today". `deploy.yml` now
  runs `npm run lint` as a blocking step (initiative 002 reached zero).
- The deploy-topology table says the web gate is "vitest + `tsc -b`". The
  `test` job also runs the credential check, `pytest scripts/deploy/tests`,
  lint, `npm test` twice (second run under `TZ=Pacific/Kiritimati`) and
  `ground-truth:check`; `tsc -b` runs inside `npm run build` in the deploy job.

PR 1 updates the deploy-topology section anyway (repo layout changes), so it
fixes these two lines in the same edit.
