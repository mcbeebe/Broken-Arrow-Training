# PR A — Sync layer (backend + frontend)

Drafted 2026-06-03. This is the canonical scope for the first
Postgres-backed cross-device sync PR; PR B / PR C / PR D follow-ups are
listed at the bottom. Keep this file in the repo so future sessions can
recover the plan even when chat context has been compressed.

---

## A.1 Provision Vercel Postgres (Neon)

1. Vercel dashboard → `mcbeebe/broken-arrow-training` project → Storage
   → Connect Neon (free tier).
2. Vercel injects `POSTGRES_URL` (pooled, recommended for serverless),
   `POSTGRES_URL_NON_POOLING`, `POSTGRES_PRISMA_URL`. Use
   `POSTGRES_URL` from the Python code.
3. Schema — `scripts/db/init.sql`:

   ```sql
   CREATE TABLE IF NOT EXISTS user_state (
     athlete_id TEXT        NOT NULL,
     key        TEXT        NOT NULL,
     value      JSONB       NOT NULL,
     updated_at TIMESTAMPTZ NOT NULL,
     PRIMARY KEY (athlete_id, key)
   );
   CREATE INDEX IF NOT EXISTS user_state_athlete_id_idx
     ON user_state (athlete_id);
   ```

   Apply via `psql $POSTGRES_URL_NON_POOLING -f scripts/db/init.sql`
   once from local. Document in README.

---

## A.2 Backend endpoint — `api/sync.py`

Single file, `do_GET / do_PUT / do_OPTIONS`. Reuse existing shared
helpers from `api/coach/_core.py`:

- `read_json_body(self)`
- `send_json(self, code, body)`
- `send_cors_preflight(self)`

New helper in `api/auth/_helpers.py` — `decode_session_token(token) →
dict | None`. Verifies HMAC, returns payload or None. Symmetric
counterpart to existing `create_session_token`. Uses the secret env
`OAUTH_JWT_SECRET`.

**Auth pattern (both methods):**

```python
auth = self.headers.get('Authorization', '')
token = auth[7:] if auth.startswith('Bearer ') else None
payload = decode_session_token(token)
if not payload:
    send_json(self, 401, {'error': 'missing or invalid session token'})
    return
athlete_id = payload['sub']
```

**GET:** `SELECT key, value, updated_at FROM user_state WHERE
athlete_id = $1`. Returns `{items: [{key, value, updatedAt}],
serverNow: <iso>}`.

**PUT:** Body `{items: [{key, value, updatedAt}]}`. Validate (1) total
body ≤1MB, (2) every key passes `is_preserved(key)` ported from
`migrate.ts` (Python version in `api/_sync/allowlist.py`). LWW upsert:

```sql
INSERT INTO user_state (athlete_id, key, value, updated_at)
VALUES (%s, %s, %s, %s)
ON CONFLICT (athlete_id, key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = EXCLUDED.updated_at
WHERE user_state.updated_at < EXCLUDED.updated_at;
```

Returns `{written: N, skipped: M}` (skipped = rows where stored
timestamp was newer).

**Connection driver:** `psycopg[binary] >= 3.2.0` added to
`api/requirements.txt`. Use the pooled `POSTGRES_URL`. Reuse a
module-level connection (Vercel functions hot-reuse where possible).

**`vercel.json` updates:**

- Add `PUT` to `Access-Control-Allow-Methods` (was `GET,POST,OPTIONS`).
- Add `Authorization` to `Access-Control-Allow-Headers`.
- Add `api/sync.py` to `functions` with `maxDuration: 15`.

---

## A.3 Per-key timestamps — `src/utils/syncStamps.ts` (new)

```ts
const STAMP_PREFIX = '__attune_meta:__stamp:'
export function stampKey(key: string): void {
  localStorage.setItem(STAMP_PREFIX + key, String(Date.now()))
}
export function readStamp(key: string): number {
  return parseInt(localStorage.getItem(STAMP_PREFIX + key) || '0', 10)
}
export function listStampedKeys(): string[] { /* enumerate */ }
```

Instrument the **6 highest-traffic hooks** for PR A. The rest get
coarse timestamps (`Date.now()` at sync time) until PR B:

| File |
| ---- |
| `src/hooks/usePlanEdits.ts` |
| `src/hooks/useManualLog.ts` |
| `src/hooks/useSoreness.ts` |
| `src/hooks/useCoachMemory.ts` |
| `src/hooks/useDaySwap.ts` |
| `src/hooks/useOnboarding.ts` |

Pattern: after every `localStorage.setItem(key, value)`, call
`stampKey(key)`. Each hook already has a single write path — add one
line.

---

## A.4 Sync hook — `src/hooks/useBackendSync.ts` (new)

`useBackendSync(athleteId: string, session: AuthSession | null)`

**On mount (boot hydrate):**

1. `GET /api/sync` with `Authorization: Bearer ${session.token}`.
2. For each `{key, value, updatedAt}`:
   - If local absent → write, `stampKey(key)` with server timestamp.
   - If local present → compare `readStamp(key)`. Write if incoming
     newer; bump stamp.
3. After hydrate, dispatch `storage` event for affected keys so
   reactive hooks (e.g. `useDisplayPreferences`) re-read.

**Upload triggers:**

- Visibility change → visible: debounce 1s, then push.
- Interval: every 60s while visible.

**Upload body:** all preserve-list keys whose `readStamp(key) >
lastUploadedStamp(key)`. Track `lastUploadedStamp` in-memory **and** in
`__attune_meta:__lastUpload:<key>` so cross-session uploads don't
re-send unchanged data.

**Failure handling:** retry with backoff (max 3); never block UI; log
to console at debug level.

---

## A.5 Wire-up + UI

- `src/App.tsx` — inside `AuthenticatedApp`, call
  `useBackendSync(athleteId, session)` once. Guard on `session.token`
  (skip when no session).
- `src/components/Settings.tsx` (Diagnostics subsection) — add two
  buttons:
  - **"Sync now"** — `pushAll()` immediately.
  - **"Pull from server (replaces local)"** — fetches GET, writes
    unconditionally, bumps every stamp to server's `updatedAt`.
    Confirmation prompt before firing.
  - Show last-synced timestamp (`<time ago>`) beneath the buttons.
- `src/components/MigrationReceive.tsx` — after the receiver's
  `MIGRATE_ACK`, trigger an immediate sync push so migrated data lands
  in Postgres on first arrival.

---

## A.6 Files added / modified

**New:**

- `api/sync.py`
- `api/_sync/__init__.py`, `api/_sync/allowlist.py` (Python port of
  `isPreserved`)
- `scripts/db/init.sql`
- `src/hooks/useBackendSync.ts`
- `src/utils/syncStamps.ts`
- `src/__tests__/syncStamps.test.ts`

**Modified:**

- `api/auth/_helpers.py` — add `decode_session_token()`.
- `api/requirements.txt` — add `psycopg[binary] >= 3.2.0`.
- `vercel.json` — add `PUT` to CORS methods; `api/sync.py` to
  `functions` with `maxDuration: 15`.
- `src/App.tsx` — call `useBackendSync` inside `AuthenticatedApp`.
- `src/components/Settings.tsx` — add sync UI.
- `src/components/MigrationReceive.tsx` — fire sync push on ack.
- 6 hooks (see A.3 table) — call `stampKey()` after each
  `localStorage.setItem`.
- `README.md` — document the one-time `psql … -f scripts/db/init.sql`
  step.

---

## Verification

### Local

- `psql $POSTGRES_URL_NON_POOLING -c '\dt'` shows `user_state` table.
- `vercel dev`. With a valid Bearer token (from `getStoredSession()`):

  ```bash
  curl -X PUT -H "Authorization: Bearer …" \
    -d '{"items":[{"key":"ba_theme","value":"dark","updatedAt":"…"}]}' \
    http://localhost:3000/api/sync
  # expect {"written":1,"skipped":0}

  curl -H "Authorization: Bearer …" http://localhost:3000/api/sync
  # expect row back
  ```

- Repeat PUT with `updatedAt: "2026-06-01T00:00:00Z"` (older) →
  `{"written":0,"skipped":1}`.
- PUT without Bearer → 401.
- PUT with key `ba_evil` (not on allowlist) → 400.

### End-to-end multi-device

- Sign in to attune.coach on Device A. Make a plan edit. Wait 60s.
- Sign in on Device B. Refresh. The edit appears within 1s of boot
  hydrate.
- Edit on B. Tap "Sync now". On A, refresh after 60s → B's edit wins
  (later timestamp).
- Tap "Pull from server" on A → A's local state matches server exactly.

### Hotfix migration re-run (Jim rescue)

- Seed `localStorage` on `mcbeebe.github.io/Broken-Arrow-Training/`
  with `ba_coach_memory_v1:jim` (colon) and `ba_plan_edits_jim`
  (underscore).
- Visit legacy URL → airlock → attune.coach receiver.
- After receiver ack, both keys land in Postgres (visible via the
  curl GET).

### Tests

- `src/__tests__/syncStamps.test.ts` — stamp read/write/listStampedKeys.
- All existing tests pass.

---

## Out of scope (follow-ups)

- **PR B**: Instrument the remaining 15 preserve-list hooks to call
  `stampKey()` on every write — finer-grained timestamps + smaller
  diffs in the periodic upload.
- **PR C**: Weekly GitHub Action that dumps `SELECT * FROM user_state`
  to a private backup repo. Schema-version field for forward
  migrations. Sentry/error reporting for sync failures.
- **PR D** (future): Realtime push via Neon's `LISTEN/NOTIFY` or
  migration to Supabase realtime — only if 60s sync feels too laggy
  for active two-device users.
