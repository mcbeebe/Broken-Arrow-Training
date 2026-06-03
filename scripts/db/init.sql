-- Sync layer: per-(athlete, key) JSONB store with last-write-wins on
-- updated_at. Mirrors the localStorage shape so the frontend can round-
-- trip raw values without server-side schema knowledge.
--
-- Apply once after provisioning Neon:
--   psql $POSTGRES_URL_NON_POOLING -f scripts/db/init.sql
-- Re-running is safe (IF NOT EXISTS guards).

CREATE TABLE IF NOT EXISTS user_state (
  athlete_id TEXT        NOT NULL,
  key        TEXT        NOT NULL,
  value      JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (athlete_id, key)
);

-- The composite PK already covers (athlete_id, key) prefix lookups, but
-- a dedicated athlete_id index keeps the GET-all-by-athlete query a
-- single index scan even as the table grows wide.
CREATE INDEX IF NOT EXISTS user_state_athlete_id_idx
  ON user_state (athlete_id);
