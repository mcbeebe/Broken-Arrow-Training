# Project preferences

This file is the standing brief for any Claude Code session in this repo. It
is only useful while it is true.

**Keep it true:** any PR that changes commands, repo layout, deploy topology,
or a convention below updates this file *in the same PR*. A stale instruction
is worse than a missing one, because the agent believes it.

## What this is

**attune.coach** — an endurance training app. A Vite + React + TypeScript
frontend, a Python serverless API, an LLM coach, a Cloudflare worker for
Strava OAuth, and an iOS wrapper.

**Site layout (initiative 003):** one Vite build, several HTML entries, base
`/`. `index.html` is the root page (the landing page, behind a switch) and the
app is `app/index.html`, served at `/app/`. `/tools/*.html`, `/sw.js`,
`/version.json`, `/favicon.svg` and `/manifest.webmanifest` stay at the root.
So do `/robots.txt`, `/sitemap.xml` (the root page and the tools) and
`/og-image.png`, the share image (made by
`docs/initiatives/003-landing-page/og-image.mjs`). `/app/` is kept out of
search by its `noindex` alone: **never `Disallow` it in robots.txt**, which
would hide the `noindex` from Google and let it index `/app/` from links. The root
page's title, description and share tags are copy.md § Meta, verbatim
(`seo.test.ts`).
The root page's entry (`src/landing/main.tsx`) statically imports only the
guard (`boot.ts`, `legacyEntry.ts`, `sections.ts`) and `referral.ts`: it
forwards installed apps, deep links (`?view=`), Strava callbacks, airlock
hand-offs, athlete hashes and signed-in visitors to `/app/` with query and
hash intact, and an inline script in `index.html` forwards if the guard fails
to load. Everyone else gets the landing page, loaded with
`import('./mount')`. Its shared state and sync rules (athlete tabs ⇔ chart
toggle, the coach demo's personality, questions and try limit, whose value
is `COACH.tryLimit` in content.ts) live in `src/landing/state.ts`, a pure
reducer. Its coach replies are written in
content.ts, never generated live. Its app screenshots are cropped WebPs in
`public/landing/app/`, with nothing personal in them.

The landing page (`src/landing/`) **never imports app code**, recharts or
cesium. The guarantee is `check-site-layout.mjs`: it allowlists what the
landing page may ship (`src/landing/`, react, react-dom, scheduler, the
bundler runtime) and fails the build on anything else. An eslint
`no-restricted-imports` override catches the common cases earlier, but it
matches import strings, so don't rely on it alone. The app's
`tailwind.config.js` skips `src/landing/`. Its words live only
in `src/landing/content.ts`, verbatim from
`docs/initiatives/003-landing-page/copy.md`; `claims.test.tsx` checks every
factual claim (methods, HYROX divisions, coach traits, cardio options, block
lengths) against the app's code, so changing that code fails the test until
the copy is updated. It has its own Tailwind config
(`tailwind.landing.config.js`, colors `landing-*` from `src/landing/tokens.ts`)
and a self-hosted font in `public/fonts/`. Its logo and favicon is
`/attune-mark.svg`; `/favicon.svg` is the app's icon and is never edited.

"Broken Arrow Training" is legacy branding: the repo name, the airlock's
legacy path and `scripts/airlock/` still carry it. The product is
attune.coach.

## Commands

```bash
npm test                  # vitest, 343 files / ~4830 tests — gates every publish
npm run build             # tsc -b && vite build — the typecheck gate lives here
npm run lint              # eslint — blocking in CI; 0 errors (initiative 002)
npm run dev               # local dev server: the app is at /app/, the root page at /
node scripts/deploy/check-site-layout.mjs   # after a build: dist/ layout, budgets, no app code on the landing page
VITE_LANDING_ENABLED=true npm run dev       # see the landing page locally (it forwards to /app/ otherwise)

pytest -m "not eval" api/coach/tests     # keyless Python suite (what CI runs)
npm run test:coach-eval                  # LIVE model calls — spends API budget
```

`pytest.ini` defaults to `-m "not eval"` so a stray `pytest` can never spend
API budget. Live coach evals run only on a manual dispatch or a PR labelled
**`run-coach-eval`**. Keep it that way.

## Deploy topology

Three surfaces ship from this one repo, by three independent routes. They are
not coordinated, and any of them can lag or fail silently while the others
succeed.

| Surface | Route | Gate |
|---|---|---|
| Web app → `attune.coach` | `deploy.yml` publishes `dist/` to the **separate** repo `mcbeebe/attune-coach`, branch `gh-pages` | `needs: test` (credential check, `pytest scripts/deploy/tests`, lint, `npm test` twice — the second under `TZ=Pacific/Kiritimati` — and `ground-truth:check`); then in the deploy job `npm run build` (`tsc -b`) and `check-site-layout.mjs` |
| Python API | Vercel's own git integration, on push | none yet — see initiative 001 |
| Cloudflare worker | manual `wrangler deploy` | none |

- The publishing branch is `claude/broken-arrow-training-app-P4N1p`
  (`PUBLISH_REF` in `deploy.yml`). `main` is pre-wired as a second publishing
  arm for a future migration — **keep both arms** in the publish conditionals.
- `vars.ATTUNE_PUBLISH_ENABLED` is the kill switch. Set it to anything but
  `'true'` to pause publishing without touching code.
- `vars.ATTUNE_LANDING_ENABLED` is the landing page's launch switch, baked in
  at build as `VITE_LANDING_ENABLED`. Anything but `'true'` makes the root page
  forward every visitor to `/app/`. Launch or roll back by changing it, then
  dispatching `deploy.yml` on the publishing branch.
- `scripts/deploy/check-site-layout.mjs` runs after the build on every PR and
  every publishing-branch push: it fails if the root page, `/app/`, the
  tools, `/sw.js` or the manifest move, if the manifest loses its `id`
  (`/?view=today`, the identity existing installs derived) or stops pointing
  into `/app/`, if the root page loses its inline fallback, if the root
  page's guard exceeds 10 KB gzipped, if the whole landing page (shared React
  chunk and CSS included) exceeds 90 KB gzipped, or if any chunk the landing
  page loads holds anything outside its allowlist (read from
  `dist/.vite/module-map.json`, written by
  `scripts/deploy/vite-plugin-module-map.ts`), or if the guard's font preload
  and the landing CSS's `@font-face` stop naming the same file, or if a
  screenshot the landing page names is missing from `dist/landing/app/`, over
  80 KB, or if they total over 240 KB, or if `robots.txt` or `sitemap.xml` is
  missing, a sitemap URL isn't a built `.html` page (or is under `/app/`),
  `og:image`/`twitter:image` names a file the build lacks, or the `og:image`
  isn't a whole PNG of the size `og:image:width`/`og:image:height` state.
- The `cutover-airlock` job publishes on the branch test alone — it ignores
  `ATTUNE_PUBLISH_ENABLED` and finishes before the attune build — so an
  airlock change goes live before the app it points at.
- Every published commit stamps `dist/version.json` with the build SHA, and
  `VITE_GIT_COMMIT_SHA` is baked into the bundle. `/api/version` reports what
  Vercel built. Deploy Diagnostics in Settings compares all three — that is how
  you tell a stale browser from a stale backend.
- `mcbeebe/attune-coach` is a **build artifact repo**. It takes no
  hand-authored commits.
- **If "attune.coach is serving this commit" fails** but `gh-pages` in
  `mcbeebe/attune-coach` already carries the right `version.json`, GitHub
  Pages didn't build it (2026-10-07: an Actions incident left its run queued).
  Don't re-push; request a build:
  `gh api -X POST repos/mcbeebe/attune-coach/pages/builds`.
- **Vercel and Supabase are on Pro** (confirmed by the owner 2026-09-26), so
  the Hobby 12-function cap that shaped `api/` no longer applies. Its traces
  stay on purpose: `api/version.py` is folded into `sync.py`, and
  `.vercelignore` still keeps the test directory out of the deployment.
  Prefer a new `surface` on an existing endpoint (e.g. `/api/coach/insight`)
  over a new file when the handler would be the same.

## Hard constraints

- **`api/requirements.txt` pins *are* the deployment** — Vercel installs fresh
  on every build. Both directions have taken production down: an unpinned floor
  let a new major ship itself, and a guessed upper bound silently downgraded a
  package. Set an upper bound from the version actually working in production,
  never from the current major. `test_requirements_pins.py` enforces this.
- **The DB schema is applied by hand**, once per environment:
  `psql "$POSTGRES_URL_NON_POOLING" -f scripts/db/init.sql`. Use the
  non-pooling URL for DDL.

## Workflow

- **Always open a pull request** after pushing a feature branch. Opening the PR
  is part of "done" — this overrides the default "don't open a PR unless
  asked" behavior.
- **Before requesting review on a non-trivial PR, run `/adversary`.** A
  fresh-context subagent attacks the diff, and its memo goes in the PR
  description. The session that produced a change does not vouch for it.
- **Initiatives:** work spanning ≥3 PRs or ≥2 sessions, touching a deploy
  surface, or changing a locked decision gets a folder under
  `docs/initiatives/` and a row in its registry — intent written *before*
  analysis. Below that bar, the PR description is the record. See
  `docs/initiatives/README.md`.
- **Commit style:** the subject is a readable changelog line, not a
  Conventional Commits prefix (`Erg benchmark: 1k time alongside the split,
  and a manual override that wins`). The body narrates the field bug, the fix,
  and the test count. This is the de facto convention across ~360 PRs; ignore
  `docs/PROJECT_PLAN.md`'s prescription of Conventional Commits, release tags
  and a CHANGELOG — none of that was ever adopted.

## Product / UX decisions

Apply the **Witchel 3-rule check** to non-trivial product, UX, or framing
decisions — new features, refactors, narrative wording, prioritization:

1. **Massive market** — does this matter to a meaningful share of paying users?
2. **Visceral solve** — does it remove a real-world friction the user feels?
3. **Customer language** — does the surfacing use the words customers use?

If a proposal can't pass all three, simplify or cut it.

> **Status note (2026-08-29):** this file used to require the check inline in
> every user-facing PR description. In practice that stopped on 2026-07-07 and
> has not appeared in the ~65 PRs since, though the filter is still applied in
> planning and roadmap docs. The rule is recorded here as it is actually
> practised — a planning-time filter — pending a decision to either re-scope it
> formally or revive it with a PR-template checkbox.

## Coach chat formatting

**Bold and bullet lists are the house style** for coach replies — they're what
the athlete finds readable, and they are the default for advice, options,
comparisons and multi-point answers. Anything richer is an exception layered on
top, never a replacement:

- **Callouts** (`> [!KEY]` / `[!TIP]` / `[!WARNING]` / `[!ACTION]`) — for the
  one sentence that matters most. Cap at two per reply; warnings only for real
  risk. A screen where everything is highlighted is the same as one where
  nothing is.
- **Tables** — rare. Only when every option is scored on the same 2–3 named
  dimensions and the grid carries meaning a list cannot. A comparison whose
  points differ per option is a bullet list.

The guidance lives in `api/coach/_core.py` (the chat system prompt); the
renderer is `src/utils/markdown.tsx`. Keep the two in step — the renderer
supporting a syntax the prompt never teaches is dead code, and the reverse
prints raw markdown at the athlete.

The renderer deliberately accepts a **superset**: four canonical callout kinds
plus ~13 aliases, because the model sometimes writes GitHub's vocabulary
instead of ours. So the contract is *prompt ⊆ renderer*, not equality. There is
no test enforcing this yet; it is an open item in initiative 001.
