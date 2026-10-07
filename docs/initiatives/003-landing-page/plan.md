# 003 — Build plan: landing page at `/`, app at `/app/`

Five PRs, in order. Each references **initiative 003** in its description and
follows `CLAUDE.md` (readable commit subjects, open a PR, run `/adversary`
before review, CLAUDE.md updated in the same PR when layout or deploy changes).

Nothing changes for athletes until PR 5 flips the launch switch. Until
`vars.ATTUNE_LANDING_ENABLED` is `'true'`, the root page forwards every visitor
to `/app/`.

**Ordering rule:** the frontend (GitHub Pages, gated by tests and
`ATTUNE_PUBLISH_ENABLED`) and the API (Vercel, deploys on push with no gate) ship
independently. PR 1 is frontend-only. Backend changes that send people to
`/app/` (push URLs, the approval-email link) are in PR 2, and PR 2 merges only
after PR 1 is live and smoke steps 1–7 pass. Until then the root page's guard
forwards the old `/?view=coach` links, so nothing 404s in between.

## Decisions

| # | Decision | Status |
|---|---|---|
| D1 | **Layout:** Vite `base: '/'` (the default changes from the legacy `'/Broken-Arrow-Training/'`, which nothing builds with any more); the app becomes a second HTML entry at `app/index.html`; the landing page takes `index.html`. `/sw.js`, `/version.json`, `/favicon.svg`, `/tools/*` stay where they are. See [analysis.md § Chosen layout](analysis.md#chosen-layout) | Recommended, adopted in this plan |
| D2 | Design “A v2: adapts to every athlete”, **Signal** palette | Approved by owner 2026-10-05 |
| D3 | Headline “Training that actually adapts to you.” with “A coach in your pocket.” as subhead and coach-section title | Approved by owner 2026-10-05 |
| D4 | The app moves to `/app`, like Waypoint | Approved by owner 2026-10-05 |
| D5 | Invite form posts to the existing request-access queue (no new waitlist service) | Approved by owner 2026-10-05 |
| D6 | “Free during the beta” | Approved by owner 2026-10-05 |
| D7 | Founder named on the page | Approved by owner 2026-10-05 (quote wording still needs sign-off) |
| D8 | **Signed-in visitors to `/` are forwarded to `/app/`**; `/?home=1` shows the landing page anyway | Recommended; owner can override before PR 3 |
| D9 | **Tools’ “Get the full plan” goes to `/?from=tool-x#join`** (the landing page’s invite form), not the app’s sign-in wall | Recommended; owner can override before PR 1 |
| D10 | Launch is a repo variable, `vars.ATTUNE_LANDING_ENABLED`, baked in at build as `VITE_LANDING_ENABLED`. Launch and rollback = change the variable, then dispatch `deploy.yml` on the publishing branch | Recommended, adopted in this plan |
| D11 | The landing bundle never imports app code, recharts or cesium; fonts self-hosted; the landing mark is its own file (`/attune-mark.svg`), never a replacement for `/favicon.svg` | Recommended, adopted in this plan |
| D12 | **The airlock moves to `/app/` in PR 2, not PR 1.** `deploy.yml`'s `cutover-airlock` job publishes on the branch test alone: it ignores `ATTUNE_PUBLISH_ENABLED` and finishes minutes before the attune build. Pointed at `/app/` in PR 1, it would send legacy visitors to a `/app/` that doesn't exist yet. Left at the bare root, its hand-offs (`?__migrate=1`, `#__attune_migrate`, deep links) still reach the app through the root page's guard | Owner 2026-10-06, found while starting PR 1 |

---

## PR 1 — Move the app to `/app/`, root forwards everything (frontend only)

**Subject:** `App moves to /app/: second Vite entry, root page forwards with query and hash intact`

**Scope** (rows of [analysis.md § Every root dependency](analysis.md#every-root-dependency-and-what-it-needs)):

1. `git mv index.html app/index.html`. It keeps its boot-recovery script, `/src/main.tsx`, and the manifest link. Add `<meta name="robots" content="noindex">`.
2. New root `index.html` → `src/landing/main.tsx`. In this PR it renders nothing and always forwards (see 5).
3. `vite.config.ts`: default `base` becomes `'/'` (update CLAUDE.md’s legacy-branding note); add `app: resolve(__dirname, 'app/index.html')` to `rollupOptions.input`; set `build.manifest: true` (used by the layout check). `tailwind.config.js` `content`: add `./app/index.html`.
4. `src/landing/legacyEntry.ts`: the full guard from [design-spec.md § Legacy entry guard](design-spec.md#legacy-entry-guard), plus `forwardAll: boolean`.
5. `src/landing/main.tsx` imports **only** `legacyEntry.ts` and `referral.ts` statically, and forwards when the guard says so (`forwardAll: import.meta.env.VITE_LANDING_ENABLED !== 'true'`). In PR 1 there is no landing page yet, so the not-forwarded branch renders a one-line placeholder (“Attune” and a link to `/app/`), which is unreachable in production while the switch is off. PR 3 replaces the placeholder with `import('./LandingPage')`, a dynamic import, so the redirect always costs a few KB, not the landing bundle.
6. `public/manifest.webmanifest`: add `"id": "/?view=today"`; `start_url` `/app/?view=today`; `scope` `/`; shortcuts `/app/?view=today|coach|plan`; icon `/favicon.svg`.
7. `public/sw.js`:
   - default URLs (~lines 30, 46) become `/app/?view=coach`;
   - in `notificationclick`, only `focus()` + `postMessage` a client whose URL path starts with `/app/`; otherwise `openWindow(url)`. Today it focuses the first window, which after launch could be a landing or tools tab that ignores the message.
   - The file stays at `/sw.js`.
8. `src/utils/strava.ts`: fallback `origin + '/app/'`. `deploy.yml` (`build-and-deploy-attune`): `VITE_STRAVA_REDIRECT_URI: https://attune.coach/app/`; add `VITE_LANDING_ENABLED: ${{ vars.ATTUNE_LANDING_ENABLED }}`.
9. Migration:
   - `src/components/MigrationReceive.tsx` (lines ~84, 102, 117, 172) → `/app/`.
   - `src/utils/migrate.ts`: sender targets (~174, 178, 197) → `/app/`, and the `dest` fallback (~324) `'/'` → `'/app/'`.
   - `scripts/airlock/` is **not** in this PR (D12); it moves in PR 2.
10. `src/tools/ToolShell.tsx`: link to `/?from=${toolId}#join` (D9). Until launch, the root forwards it on to the app anyway (`forwardAll`).
11. `src/landing/referral.ts` (first-touch `ba_referral_source_v1`, same JSON shape as today); `src/main.tsx` calls it instead of its inline block.
12. `scripts/deploy/check-site-layout.mjs`, run in `build-and-deploy-attune` right after `npm run build`. That job already builds on every PR, so PRs catch layout breaks. It reads `dist/.vite/manifest.json` and fails unless:
    - `dist/index.html`, `dist/app/index.html`, `dist/tools/{fueling,predictor,heat}.html`, `dist/sw.js`, `dist/favicon.svg` and `dist/manifest.webmanifest` exist;
    - the manifest has `id` `/?view=today`, and `start_url` plus every shortcut start with `/app/`;
    - `dist/app/index.html` links the manifest and `dist/index.html` does not;
    - the landing entry’s static import closure is under 10 KB gzipped (the guard must stay cheap). The bundle budget comes in PR 3.
13. `CLAUDE.md`: layout and deploy topology (two entries, `/app/`, `ATTUNE_LANDING_ENABLED`, the layout check), the base-path note, and the two stale lines in [analysis.md § CLAUDE.md drift](analysis.md#claudemd-drift-noticed-during-this-audit).
14. Registry row 003: PRs column.

**Not in this PR:** `api/coach/push.py`, `app_url()` and `scripts/airlock/` (they go in PR 2, see the ordering rule and D12).

**Tests** (new files under `src/__tests__/landing/` unless noted):

- `legacyEntry.test.ts`, table-driven, at least:
  - `?view=today` → `/app/?view=today`; `?view=coach#mike` → `/app/?view=coach#mike`
  - Strava `?state=&code=abc&scope=read,activity:read_all` → forwarded verbatim; `?error=access_denied&state=` → forwarded
  - `?__migrate=1#__attune_migrate=xyz` → forwarded verbatim
  - `#mike` → forwarded; every id in `LANDING_ANCHORS` → not forwarded
  - `standalone: true`, no params → `/app/`
  - `hasSession: true` → `/app/`; `hasSession: true` + `?home=1` → null; `?xhome=10` does **not** count as `home=1`
  - `?from=tool-fueling#join` → null; plain `/` → null
  - `forwardAll: true` → always `/app/` + search + hash
  - encoded characters (`?view=coach&x=%2F`) preserved byte-for-byte
- `referral.test.ts`: first touch wins, never overwrites, survives a `localStorage` that throws.
- `manifest.test.ts` (or extend `viewId.test.ts`): `id`, `start_url`, shortcuts, `scope`.
- `sw.test.ts`: load `public/sw.js` with a fake `self`. A notification click with a `/` client and an `/app/` client focuses `/app/`; with only a `/tools/` client, it opens a new window.
- `migrate.test.ts`: add a case where an envelope with no `d` decodes to `dest: '/app/'`. The existing round-trip cases need no change.
- Tools: ToolShell link is `/?from=<id>#join`; the existing pure-client guard still passes.
- `src/__tests__/deploy/checkSiteLayout.test.ts` (`// @vitest-environment node`): import the checker’s pure `checkSiteLayout(distDir)` function and run it against fixture `dist/` folders. It passes on a good one and fails on each missing file or wrong manifest field. Keep it in vitest, not pytest, because the `test` job’s pytest step runs before `setup-node`.

**Acceptance:**
- `npm run lint`, `npm test`, `TZ=Pacific/Kiritimati npm test`, `npm run build && node scripts/deploy/check-site-layout.mjs`, `pytest -m "not eval" api/coach/tests scripts/deploy/tests` all green.
- In `npm run build && npx vite preview`: `/` forwards to `/app/`; `/?view=coach#mike` lands on `/app/?view=coach#mike`; the app works at `/app/`; `/tools/heat.html` works. Paste what you saw in the PR.
- After deploy (with `ATTUNE_LANDING_ENABLED` unset), smoke steps 1–7.

**Rollback:** do not just revert. With `keep_files: true`, the reverted build leaves `/app/index.html` and its bundles on gh-pages. Installs whose manifest already updated would keep opening a frozen `/app/`. Roll back with a PR that restores the root app **and** replaces `app/index.html` with a two-line page that forwards to `/` plus search and hash.

---

## PR 2 — Backend: point at /app/, and harden request access before it is public

**Merge only after PR 1 is live and smoke steps 1–7 pass.**

**Subject:** `Request access: honeypot, per-IP throttle, a daily cap on admin emails, and no more queue wipe when KV hiccups; push and approval links point at /app/`

**Scope:**
1. `api/coach/push.py` (~185, 302): `"url": "/app/?view=coach"`.
2. `api/auth/_helpers.py` `app_url()` default `https://attune.coach/app`.
3. **Latent bug, fix first:** `get_access_requests()` returns `[]` when the KV read fails (`_kv_get` swallows errors), so the next `add_access_request()` overwrites the whole queue with one entry. Add a strict read that raises on failure. `add_access_request()` must refuse to write when the read failed.
4. **Error contract:** `_handle_access_request` today catches only `RuntimeError`. A KV network error (`URLError`) falls through to the outer handler and returns `500 "Google auth failed…"`. Catch `Exception` around the queue write and return `503` with the existing message. Keep the 400 for a bad email, and keep the 200 for an already-approved email (no membership disclosure).
5. **Honeypot:** the client sends a hidden field named `hp_contact_ref` (a name browsers don’t autofill). If it is a non-empty string, return `200 {"ok": true}` and do nothing else (no queue write, no email), and log one line with a hit counter.
6. **Per-IP throttle**, allowing 5 per hour:
   - The IP is the first entry of `x-forwarded-for` (Vercel sets it).
   - The key is `access_req:ip:<sha256(ACCESS_REQUEST_SALT + ip)[:32]>`. Never store the raw IP.
   - Use one Upstash `/multi-exec` transaction: `SET key 0 EX 3600 NX`, then `INCR key`. (`/pipeline` is not transactional.) Setting the TTL before the increment means a lost call can never leave a counter without an expiry, so an IP can’t be locked out forever.
   - Over the limit → `429 {"error": "Too many requests"}`.
   - If the throttle call itself fails, let the request through (the queue write still has its own 503 path).
7. **Admin email cap:** at most 20 admin notification emails per UTC day (`access_req:mail:<yyyymmdd>`, same transaction pattern, 2-day TTL). Requests past the cap still queue, but send no email.
8. **Source:** accept optional `source` (`^[a-z0-9-]{1,40}$`; `None` or invalid → dropped; never `str(None)`). Store it on the request record and print it in the admin email (“Source: tool-heat”). The Settings → Athletes list is unchanged in this initiative.
9. Owner actions in the PR description: set `ACCESS_REQUEST_SALT` on Vercel; if `APP_URL` is set on Vercel, change it to `https://attune.coach/app`.
10. Airlock (D12), moved here from PR 1:
   - `scripts/airlock/index.html`: **keep `TARGET` as the bare origin** (it is the `postMessage` origin check at ~213/216); add `APP_PATH = '/app/'` for the URLs at ~9, 35, 115, 175, 184; `destRel()` (~97) maps the legacy prefix to `/app/`.
   - `scripts/airlock/404.html` → `/app/`.
   - This is frontend, so it rides PR 2 only because PR 2 already waits for PR 1 to be live; then run smoke step 6 again.

**Tests:**
- `api/coach/tests/test_access_request.py`, the first tests this handler has had. Mock KV and email:
  - valid request queues and emails once; invalid email → 400 with the existing message
  - already-approved email → 200, nothing queued, no email
  - honeypot filled → 200, nothing queued, no email
  - 6th request from one IP within an hour → 429; a different IP → 200
  - throttle pipeline fails → the request still queues (when the queue store works)
  - queue read fails → 503 and the existing queue is **not** overwritten
  - queue write raises `URLError` → 503, not 500
  - 21st admin email in a day → queued, no email
  - `source` stored when valid; dropped when invalid or `None`; note still truncated to 200
  - the raw IP never appears in any KV key or value
- `test_push_urls.py`: both push payloads use `/app/?view=coach`. `test_app_url.py`: the default.

**Acceptance:** keyless pytest green. After the Vercel deploy: a request from the app’s existing login form lands in Settings → Athletes, and the admin email arrives; a test push opens the app on Coach.

**As built** (details the scope above left open):
- `ACCESS_REQUEST_SALT` unset → the per-IP throttle is **off** (one log line per request), not run with an empty salt: an unsalted SHA-256 of an IPv4 address is reversible by enumeration, so it would amount to storing the IP. The honeypot and the email cap don't need the salt.
- The admin-email counter fails **open**: if that one KV call fails right after the queue write succeeded, the email still sends.
- A repeat of an email already in the queue only refreshes its entry: no second alert, and it doesn't count toward the daily cap, so one address can't silence the day's alerts. The note is truncated to 200 before the email as well as the queue.
- The two counter transactions use a 3 s timeout (auth functions get 15 s on Vercel), so a hung KV can't spend 10 s on the throttle before the queue write starts.
- The honeypot answers before email validation, so a bot gets the same 200 whatever it sent. Any value other than missing or `""` is a hit (the real form always sends `""`), so `1` or `true` can't slip past a string check. The throttle runs before the membership check, so members and strangers both get the 429.
- `source` is checked with `fullmatch` (a `$` anchor would also accept `"tool-heat\n"`).
- A stored queue that isn't a JSON list also answers 503 and is left for a human, rather than overwritten.
- The airlock is tested in `scripts/deploy/tests/test_airlock_targets.py`, which runs the page's inline script in Node against a stubbed browser.
- Smoke step 3 (push) was N/A after PR 1 because push was never configured in production, so the step-3 repeat after PR 2 stays N/A until it is.
- **Shipped** (mcbeebe/Broken-Arrow-Training#471, merged 2026-10-07). `ACCESS_REQUEST_SALT` set on Vercel and production redeployed with it; `APP_URL` was not set there. Smoke step 6 passed again after the airlock move (owner, 2026-10-07).

---

## PR 3 — The landing page (static), behind the launch switch

**Subject:** `Landing page: hero, paths, coach, tools and FAQ at attune.coach, dark until ATTUNE_LANDING_ENABLED`

**Scope:**
1. Everything in [design-spec.md § Files](design-spec.md#files) except the interactive behavior of the MorningCard tabs, the PlanChart toggle, CoachDemo Approve and MakeItYours. They render in their default state; PR 4 wires them.
2. `content.ts` holds every string from [copy.md](copy.md). `tokens.ts` holds Signal from [tokens.json](tokens.json). Styling uses a **separate** `tailwind.landing.config.js` (content: `./index.html`, `./src/landing/**/*.{ts,tsx}`; the Signal colors under `landing-*`), loaded from the landing CSS with `@config "../../tailwind.landing.config.js"`. With the shared config, Tailwind 3 would emit every utility the app uses into the landing CSS. The app’s `tailwind.config.js` is not touched.
3. Self-hosted fonts under `public/fonts/`, with `@font-face` in a landing-only CSS file; preload the 800 weight.
4. InviteForm wired to `requestInvite()` with every state in copy.md, honeypot included.
5. The guard switches from forward-all to its rules when `VITE_LANDING_ENABLED === 'true'`.
6. eslint `no-restricted-imports` override for `src/landing/**`. The rule matches the import **string** (gitignore-style patterns), not the resolved path, so the landing page’s own `./components/…` and `../components/…` imports must be re-allowed with negations: `patterns: ["**/App", "**/engines/**", "**/hooks/**", "**/utils/**", "**/data/**", "**/components/**", "!./components/**", "!../components/**", "recharts", "cesium", "cesium/**"]`. (The build-manifest check in item 7 is the backstop if a path slips past the strings.) Add a test case file that the rule rejects (e.g. `import '../../components/LoginScreen'` from `src/landing/components/`), and check that `npx eslint` fails on it before deleting the fixture.
7. Budget in `check-site-layout.mjs`. Sizes come from `dist/.vite/manifest.json`: walk the landing entry’s `imports` for the 10 KB guard budget; add `dynamicImports` and `css` for the whole-page budget, **≤ 90 KB gzipped including the shared React chunk and the landing CSS**. The manifest can’t say which source modules a shared chunk contains, so add a small Vite plugin (`scripts/deploy/vite-plugin-module-map.ts`) whose `generateBundle` hook writes `dist/.vite/module-map.json` (chunk file → `chunk.moduleIds`). The checker fails if any chunk in the landing closure contains a module from `src/components/`, `src/engines/`, `recharts` or `cesium`.
8. `public/attune-mark.svg` (the landing logo and favicon link). `/favicon.svg` is not touched.
9. Export what the claims test needs, as small exports with no behavior change:
   - `HYROX_DIVISIONS = ['open', 'pro'] as const` in `src/engines/hyrox/spec.ts` (derive `HyroxDivision` from it);
   - `MAX_BLOCK_WEEKS` and `DELOAD_EVERY` from `src/engines/generalFitness/index.ts`;
   - `CARDIO_MODALITIES = ['running', 'cycling', 'rowing', 'swimming', 'mixed'] as const` next to `CardioModality` in `src/hooks/useOnboarding.ts` (derive the type from it).

**Tests:**
- `content.test.ts`: every string in copy.md’s tables is present in content.ts (keep a fixture list).
- `claims.test.ts`, which renders `<LandingPage />` and checks:
  - none of the banned words in copy.md § “must never appear” appear;
  - the methods named on the page map, **by id**, to onboarding-eligible methods in `src/data/methods/index.ts`; every method named on the Road races card is rated at least `OK` for 5K, 10K, half and marathon, and every method named on the Trail card exists;
  - the divisions named equal `HYROX_DIVISIONS`;
  - every trait label shown is a `COACH_TRAITS` label, no two shown traits sit in the same `COACH_TRAIT_EXCLUSIVE_GROUPS` pair, “17” equals `COACH_TRAITS.length`, the default name equals `DEFAULT_COACH_NAME`, and the name input’s `maxLength` matches the app’s (30);
  - “up to 16 weeks” and the every-4th-week deload match `MAX_BLOCK_WEEKS` and `DELOAD_EVERY`;
  - the cardio options named (run, bike, row, swim, a mix) map one-to-one to `CARDIO_MODALITIES`.
  - So if the code changes, the copy test fails.
- `api.test.ts`: request body shape (honeypot `hp_contact_ref`, `source`), `API_BASE` resolution, 200/400/429/503/500/network/timeout mapping.
- `InviteForm.test.tsx`: client validation, “Sending…” disables the button, success panel and focus move, each error message.
- `a11y.test.tsx`: one h1; every input labelled; every button has a name; skip link first; landmarks present.
- `LandingPage.test.tsx`: renders every id in `SECTION_IDS`; every rendered `id` used as an in-page link target is in the guard’s `LANDING_ANCHORS`, so a reload on an anchor never forwards to the app.

**Acceptance:** all gates green. `VITE_LANDING_ENABLED=true npm run dev` shows a page matching `reference/A2-Signal-desktop.jpg` and `reference/A2-phone.jpg` at 1280 and 390 px, with no horizontal scroll at 320 px. Attach screenshots to the PR. Production does not change.

**As built** (owner-approved choices and details the scope left open):
- **Screenshots** are committed in [screenshots/](screenshots/) (the PR API can't attach images). The phone layout follows `A2-Signal-phone-fluid.jpg` and copy.md: the header wraps to two rows with only Sign in and the invite button, no ☰ menu, and the same copy as desktop. `A2-phone.jpg`'s shortened phone copy is not in copy.md, so it isn't used (owner, 2026-10-07).
- **Font:** the Latin variable woff2 (46.7 KB; its weight axis runs 400–900, the page uses 400–800) from `@fontsource-variable/schibsted-grotesk` 5.3.0 is committed in `public/fonts/` with its OFL licence; no runtime dependency (owner, 2026-10-07). It is preloaded by `main.tsx` only when the landing page renders, not from `index.html`, so installed apps forwarded to `/app/` never download it.
- **`SECTION_IDS` moved to `src/landing/sections.ts`** (re-exported from content.ts). The guard imports it; importing content.ts there would have put every word of the page into the guard chunk. `check-site-layout.mjs` now fails if content.ts reaches the guard.
- **The page loads through `src/landing/mount.tsx`**, not `import('./LandingPage')` directly: the react-refresh lint rule keeps the `createRoot` call out of a component file. If that chunk fails to load, the root shows a link to `/app/` instead of a blank page.
- `claims.test.tsx` is `.tsx` (it renders the page). It also checks that no recommendable method the Road card doesn't claim is named on it, that “all 8 stations” equals `stationSpecs().length`, and that the No race chart eases off exactly every `DELOAD_EVERY`-th week. `tokens.test.ts` keeps tokens.ts equal to tokens.json.
- **The module-map check is an allowlist**, not the listed paths: the landing page may ship only `src/landing/`, react, react-dom, scheduler and the Vite/Rolldown runtime. A list of banned paths missed `src/types/` (where `COACH_TRAITS` lives, which PR 4 will want) and other app modules; the pre-review proved it with a real build. The eslint rule also bans `types`, `schema`, `tools` and `palettes` now, but it matches import strings, so the build check is the guarantee.
- **Departure:** the app's `tailwind.config.js` now excludes `src/landing/**` (plan item 2 said not to touch it). Scanning the landing files there put landing-only utilities into every app and tool page's CSS (+5 KB raw); excluding them restores the base size exactly.
- `api.ts` reads `VITE_COACH_API_URL` and `VITE_GARMIN_API_URL` by name: passing `import.meta.env` whole inlined every `VITE_*` setting into the landing chunk.
- A `#tools` / `#coach` link scrolls to its section after the page renders (`scrollToAnchor.ts`): the browser's own jump runs before the dynamically loaded page exists.
- The honeypot is read from the form at submit, so a bot that sets the field without input events is caught; a stored referral the server would reject is replaced by `'landing'`; placeholders use `muted` (Tailwind's default grey is 2.5:1).
- **Measured** (switch on): guard 2.5 KB gzipped; whole page 76.3 KB of 90 (React and react-dom 56.5 KB, landing JS 10.9 KB, CSS 4.6 KB).
- **Shipped** (mcbeebe/Broken-Arrow-Training#472, merged 2026-10-07). Pre-review fixes and departures are in the PR description: the module-map check became an allowlist, the app's Tailwind config skips `src/landing/`, env variables are read by name, and `#section` links scroll after the page renders.

---

## PR 4 — Interactions

**Subject:** `Landing page: athlete tabs, racing/no-race plan chart, coach demo and persona picker`

**Scope:** SegmentedControl, MorningCard tabs, PlanChart (bars, Today label, toggle), CoachDemo Approve, MakeItYours, and the sync rules in [design-spec.md § Shared state](design-spec.md#shared-state-landingpage-owns-it).

**Tests:** port `reference/interaction_tests.cjs` to vitest + Testing Library. 15 of its 19 cases port directly. The palette case doesn’t apply (one palette ships), and the three form cases are superseded by PR 3’s async `InviteForm.test.tsx`. Then add:
- tabs: four, in order, Running selected by default; each shows distinct planned/adjusted copy; `aria-pressed` follows the selection
- sync: Fitness → No race; HYROX keeps Racing; No race → Fitness; Racing from Fitness → Running; Racing from Trail stays Trail
- chart: 16 bars; only index 8 is Today; Today’s fill is lower than its outline; the No race data dips every 4th week; Racing tapers over the last 3; every bar ≤ 200 px
- coach: Approve swaps to the confirmation (`role="status"`); the input and mic are disabled
- persona: the name updates the header and initial; blank → “Your coach”; trait toggles update the summary in canonical order; none selected → “Pick a personality below.”
- keyboard: every control reachable by Tab and operable with Enter and Space

**Acceptance:** gates green; manual check at 390 and 1280 px in Safari and Chrome; screenshots of each tab and both chart modes in the PR.

**As built:**
- The sync rules are a pure reducer, `src/landing/state.ts` (`state.test.ts`); LandingPage holds it with `useReducer`, and the components already took the `on…` props from PR 3.
- `interactions.test.tsx` drives the rendered page with `@testing-library/user-event` (added as a devDependency, owner-approved 2026-10-07), so Enter and Space are real key presses. With only the wiring reverted (PR 3's `LandingPage.tsx`, these components), 26 of its 34 cases fail; the 8 that pass check things already true of the default state (tab order and default tab, the 16 default bars, the taper, the default status line, Keep my plan, the disabled demo input, Tab order). An earlier count of “25 of 30” reverted all of `src/landing`, which also removed the chart's test hooks; the pre-review corrected it.
- Approve moves focus to the confirmation, which replaces the focused button (otherwise focus drops to the page). The confirmation keeps `role="status"` and gets an `aria-label`, since a status role takes no name from its text. Focus moves in an effect on the approved transition, not a callback ref: an inline callback ref re-runs every render and would pull focus back while the visitor types a coach name (tested).
- The name is capped at 30 in the reducer as well as by `maxLength`.
- Chrome checked here at 390 and 1280 px by keyboard: every control operable, a focus ring on every Tab stop, no console errors, no horizontal scroll. **Safari is the owner's check** (WebKit can't be installed in the session sandbox; owner-approved 2026-10-07).
- Screenshots of each tab and both chart modes, at 1280 and 390 px, are in [screenshots/](screenshots/) as `PR4-*`.

---

## PR 4b — Revisions from the owner’s review of PR 4 (added 2026-10-07)

**Subject:** `Landing page: four different mornings, a coach that changes voice, and real app screens`

**Why:** after checking PR 4 locally, the owner asked for: one of each outcome on “This morning” instead of four ease-offs; “Mike reviews every request” gone from the hero line (only); “Make it yours” combined with the chat, with written replies per personality, Ask something else, Reset, and at most 3 tries per visit; real app screenshots; and the final founder quote. Copy approved 2026-10-07 (copy.md).

**As built:**
- **Mornings:** Running eases off (unchanged), Trail pivots (travel mode’s room cardio), HYROX is a peak morning at full intensity, Fitness stands as planned. `claims.test.tsx` ties each to the app: the ring sits in `classifyStatus`’s band for its readiness line; the readings point the same way; the pivot is `travelSwap(…, 'bodyweight')`’s own “Room cardio (travel)”, 20–30 min and 10 min mobility; peak and steady keep the planned session and never claim added work (the app never adds any); “full intensity” and “All clear” are the app’s own words.
- **Chart:** week 9 is cut back with a dashed outline only when the morning changed today; otherwise it is full, the outline sentence leaves the caption, and the aria-label says “Week 9 is on plan.”
- **Coach demo:** one personality at a time (5 shown); 3 questions × 5 voices, written, not generated; Ask something else, Reset, and the 3-try limit in the reducer (`state.ts`), with `aria-disabled` controls that stay focusable and a `role="status"` invite at the limit.
- **App screens:** 6 crops of the owner’s own screens, with no name, race, status bar or calf note; journal limited to its header and one note; the recommendations stack left out (owner, 2026-10-07). 167 KB in all, lazy-loaded. `check-site-layout.mjs` now fails if a screenshot the page names is missing, over 80 KB, or if all of them pass 240 KB.
- **Page weight:** the landing page is 79.3 KB of 90 gzipped (+2.5 KB for the written replies).

## PR 4c — A free weekly mileage planner (owner-approved 2026-10-07)

**Subject:** `Free weekly mileage planner: the app's own ramp, for a 5K to a marathon`

A fourth tool page, `/tools/mileage.html`, on the app’s own ramp. Copy approved 2026-10-07 (copy.md § Weekly mileage planner page).

**As built:**
- `mileagePlan` (`src/tools/mileageMath.ts`) runs the app’s own `generatePlanFromMethod` (Daniels) for one stated athlete: intermediate, 35, 5 days, healthy, no race time, racing on the Saturday ending week N. It reads each week’s `targetMi` and long-run card. So the tool is the app’s plan by construction, including the generator’s plan-length snapping, its long-run caps (Daniels’ 30%) and its content ceiling.
- Inputs: race (5K, 10K, half, marathon), current weekly miles (5–200, decimals allowed), weeks to race (4–24). Out: start, peak and its week, longest run, a bar per week (easier weeks, i.e. lower than the week before, lighter), and a collapsed table of every week so nothing depends on the chart or colour. When the plan peaks below what you run now, the page says so.
- `mileageMath.ts` is its own module, so only `/tools/mileage.html` loads the generator (~182 KB gzipped on that page); the other three tool pages stay at ~67 KB of JS.
- `mileageMath.test.ts` compares it with a direct generator call across 240 combinations and holds the footnote to the generator’s output: no building week more than 10% above the last full week (allowing for 0.1 mi rounding), every fourth week before the peak easier, “easier” meaning lower than the week before, and the long run within Daniels’ 30% of its week.
- Copy: see copy.md § Weekly mileage planner page. The footnote was tightened twice in review (pending the owner’s look).
- Wired into the Vite inputs, `check-site-layout.mjs`’s required files, and “Try it before you’re in”, now “Four free calculators” in a 2×2 grid. `claims.test` checks the count word against the cards and that every card’s page is a Vite input.

---

## PR 5 — Go live

**Subject:** `Landing page goes live: SEO, privacy and terms pages, and the launch switch on`

**Blocked on the owner:** privacy and terms text. (The founder quote shipped in PR 4b, and the owner checked PR 4 locally on 2026-10-07.)

**Scope:**
1. `privacy.html` and `terms.html` as Vite inputs (served at `/privacy.html`, `/terms.html`), styled like the landing page, with the owner-supplied text verbatim. Claude Code must not write policy text. If the text isn’t supplied, stop and ask.
2. Meta, canonical, Open Graph and Twitter tags; `public/og-image.png` (1200×630, the MorningCard on the Signal ground); `robots.txt`; `sitemap.xml` ([design-spec.md § SEO](design-spec.md#seo-and-sharing-pr-5)).
3. ~~The founder quote updated to the owner-approved wording~~ (done in PR 4b).
4. Launch: the owner sets `vars.ATTUNE_LANDING_ENABLED = 'true'`, then dispatches `deploy.yml` (Run workflow) on the publishing branch.
5. Run the full smoke checklist; record Lighthouse mobile scores in the PR.
6. Close-out: registry row 003 → **Shipped** with PR numbers; stamp this plan “Shipped YYYY-MM-DD”. `reference/` stays as the design record.

**Tests:** `seo.test.ts` (title, description, canonical and og tags present; `app/index.html` has noindex). `check-site-layout.mjs` also asserts `robots.txt`, `sitemap.xml`, `privacy.html` and `terms.html` exist.

**Rollback:** set `ATTUNE_LANDING_ENABLED` to anything but `'true'` and dispatch `deploy.yml` on the publishing branch. The root page goes back to forwarding everyone to `/app/`.

---

## Smoke checklist

Run steps 1–7 after PR 1, steps 3 and 6 again after PR 2, and all of them after PR 5. Use the production site, from a phone and a laptop. Any failure means roll back.

1. `attune.coach/app/` loads the app; sign in with Google works.
2. **Installed home-screen app** (iPhone and Android, installed before PR 1) opens straight into the app on Today.
3. Tap a **coach push notification** (send a test from Settings), once with the app closed and once with a `/tools/` tab open → the app opens on Coach.
4. **Connect Strava** from Settings → authorize → you land back in the app, connected.
5. `attune.coach/?view=plan#<your-athlete-id>` → the app, on Plan.
6. Legacy airlock: open `mcbeebe.github.io/Broken-Arrow-Training/` → it migrates into `attune.coach/app/` with your data intact.
7. Settings → Deploy Diagnostics shows the same SHA for the browser, `version.json` and the API.
8. *(After PR 5)* Signed out, `attune.coach` shows the landing page; signed in, it opens the app; `attune.coach/?home=1` shows the landing page.
9. *(After PR 5)* Submit the invite form with a test address → “Request sent.” → it appears in Settings → Athletes with its note → the admin email arrives showing “Source: landing” → approve → the approval email links to `attune.coach/app` → sign in works.
10. *(After PR 5)* `/tools/fueling.html` → “Get the full plan” → the landing page, scrolled to the form; submitting sends an admin email showing “Source: tool-fueling”.

## Definition of done (initiative)

- All five PRs merged, each with its `/adversary` memo.
- The smoke checklist passes in production after PR 5.
- Registry row 003 is **Shipped** with PR numbers, and this plan is stamped.
- `CLAUDE.md` describes the two entries, `/app/`, the landing switch, the layout check and the claims test.
