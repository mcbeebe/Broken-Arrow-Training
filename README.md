# attune.coach

An endurance training app: adaptive plan generation across nine published
coaching methodologies, readiness and load engines, an LLM coach, and
Garmin / Strava / Apple Health integration. Live at
**[attune.coach](https://attune.coach)**.

> "Broken Arrow Training" is legacy branding. The repo name, the migration
> airlock's legacy path, and `vite.config.ts`'s fallback base path still carry
> it; the product does not.

## Layout

| Path | What it is |
|---|---|
| `src/engines/` | The domain engines — plan generator, readiness, MIM, terrain, descent, running, hyrox, general fitness |
| `src/__tests__/` | 212 test files / ~2789 tests, including property-invariant "laws" and golden plan snapshots |
| `api/` | Python serverless functions (coach, sync, auth, garmin, apple) deployed by Vercel |
| `worker/` | Cloudflare worker for the Strava OAuth token exchange |
| `ios/` | iOS wrapper app |
| `scripts/airlock/` | Standalone migration page served at the legacy origin; carries users' local data to attune.coach |
| `docs/initiatives/` | Intent → plan → close-out per initiative, with a registry |
| `docs/adr/` | Architecture decision records |

## Working here

```bash
npm install
npm run dev               # local dev server
npm test                  # vitest — gates every publish
npm run build             # tsc -b && vite build
pytest -m "not eval" api/coach/tests    # keyless Python suite
```

`CLAUDE.md` is the standing brief — commands, deploy topology, and the hard
constraints (notably: Vercel Hobby caps this project at 12 serverless
functions and `api/` sits at exactly 12). Read it before changing anything
under `api/` or `.github/workflows/`.

## How it ships

Three surfaces, three independent routes:

- **Web app** — `deploy.yml` runs the suite, builds, and publishes `dist/` to
  the separate repo `mcbeebe/attune-coach` (`gh-pages`), which serves
  attune.coach. That repo is a build artifact; it takes no hand-authored
  commits.
- **Python API** — Vercel's git integration, on push.
- **Cloudflare worker** — manual `wrangler deploy`.

Because they are independent, they can drift. Every build stamps its commit
SHA into `version.json` and the bundle, and `/api/version` reports what Vercel
built; **Settings → Deploy Diagnostics** compares all three so a stale browser
is distinguishable from a stale backend.

## Database setup (one-time, per environment)

The cross-device sync layer (`/api/sync`) stores per-(athlete, key)
JSONB rows in a Vercel Postgres (Neon) database. Provisioning the
database via Vercel automatically injects `POSTGRES_URL`,
`POSTGRES_URL_NON_POOLING`, and `POSTGRES_PRISMA_URL` into the
project's env vars; the schema still has to be applied once per fresh
database:

```bash
# 1. Pull the env vars Vercel injected into this project
vercel env pull .env.local

# 2. Apply the schema (idempotent — re-running is safe)
psql "$(grep '^POSTGRES_URL_NON_POOLING=' .env.local | cut -d= -f2- | tr -d '"')" \
  -f scripts/db/init.sql
```

Use the **non-pooling** URL for DDL like this (the pooled URL goes
through PgBouncer in transaction mode and rejects some DDL). The
serverless functions in `api/sync.py` use the pooled `POSTGRES_URL`
because they're short-lived.

To verify:

```bash
psql "$POSTGRES_URL_NON_POOLING" -c '\dt'
# expect to see user_state in the list
```

Full PR scope, verification matrix, and follow-up roadmap (PR B / C /
D) live in [`docs/pr-a-sync-plan.md`](./docs/pr-a-sync-plan.md).
