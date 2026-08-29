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

"Broken Arrow Training" is legacy branding: the repo name, the airlock's
legacy path, and `vite.config.ts`'s fallback base path still carry it. The
product is attune.coach.

## Commands

```bash
npm test                  # vitest, 212 files / ~2789 tests — gates every publish
npm run build             # tsc -b && vite build — the typecheck gate lives here
npm run lint              # eslint — NOT yet in CI; 43 errors today (initiative 002)
npm run dev               # local dev server

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
| Web app → `attune.coach` | `deploy.yml` publishes `dist/` to the **separate** repo `mcbeebe/attune-coach`, branch `gh-pages` | `needs: test` (vitest + `tsc -b`) |
| Python API | Vercel's own git integration, on push | none yet — see initiative 001 |
| Cloudflare worker | manual `wrangler deploy` | none |

- The publishing branch is `claude/broken-arrow-training-app-P4N1p`
  (`PUBLISH_REF` in `deploy.yml`). `main` is pre-wired as a second publishing
  arm for a future migration — **keep both arms** in the publish conditionals.
- `vars.ATTUNE_PUBLISH_ENABLED` is the kill switch. Set it to anything but
  `'true'` to pause publishing without touching code.
- Every published commit stamps `dist/version.json` with the build SHA, and
  `VITE_GIT_COMMIT_SHA` is baked into the bundle. `/api/version` reports what
  Vercel built. Deploy Diagnostics in Settings compares all three — that is how
  you tell a stale browser from a stale backend.
- `mcbeebe/attune-coach` is a **build artifact repo**. It takes no
  hand-authored commits.

## Hard constraints

- **Vercel Hobby caps the project at 12 serverless functions, and `api/` sits
  at exactly 12.** Every `api/**/*.py` file counts. This is why `api/version.py`
  was folded into `sync.py` and why `.vercelignore` excludes the test
  directory. Adding a function breaks the deploy.
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
