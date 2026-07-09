"""P0 postmortem, part two — the 504 FUNCTION_INVOCATION_TIMEOUT.

Once the allowlist fix let a backlogged device push again, the push
died a new way: `do_PUT` wrote one row per database round trip under a
15 s function cap, so a weeks-long backlog (plus a cold Neon resume)
could never finish. The fix is structural: ONE multi-row INSERT per PUT
(api/_sync/upsert.py, psycopg-free by design so this keyless env can
import it) and a 60 s time budget in vercel.json.

These tests exercise the real builder — dedupe semantics, SQL shape,
param flattening, the wrap seam — and pin the deploy-config budget so a
future vercel.json edit can't silently reintroduce the timeout.
"""

import json
import pathlib
import sys
from datetime import datetime, timezone

import pytest

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from api._sync.upsert import build_upsert, dedupe_rows


def _dt(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


T1 = _dt("2026-07-01T00:00:00Z")
T2 = _dt("2026-07-02T00:00:00Z")


def test_one_statement_many_rows() -> None:
    rows = [("ba_soreness_t", "{}", T1), ("ba_journal_notes_t", "[]", T2)]
    sql, params = build_upsert("ath", rows)
    # One INSERT, one round trip — the whole point of the fix.
    assert sql.count("INSERT") == 1
    assert sql.count("(%s, %s, %s, %s)") == len(rows)
    # The LWW stale-row guard survives batching.
    assert "ON CONFLICT (athlete_id, key) DO UPDATE" in sql
    assert "WHERE user_state.updated_at < EXCLUDED.updated_at" in sql
    assert params == [
        "ath", "ba_soreness_t", "{}", T1,
        "ath", "ba_journal_notes_t", "[]", T2,
    ]


def test_wrap_value_seam_applies_only_to_values() -> None:
    """api/sync.py injects psycopg's Jsonb through this seam."""
    sql, params = build_upsert("a", [("k", "v", T1)], wrap_value=lambda v: ("wrapped", v))
    assert params == ["a", "k", ("wrapped", "v"), T1]


def test_empty_batch_is_a_programming_error() -> None:
    with pytest.raises(ValueError):
        build_upsert("a", [])


def test_dedupe_keeps_newest_per_key() -> None:
    """Postgres aborts a multi-row INSERT whose ON CONFLICT target
    repeats — a duplicate key in one batch must collapse to its newest
    value, in either arrival order."""
    newest_last = dedupe_rows([("k", "old", T1), ("k", "new", T2)])
    newest_first = dedupe_rows([("k", "new", T2), ("k", "old", T1)])
    assert newest_last == [("k", "new", T2)]
    assert newest_first == [("k", "new", T2)]


def test_dedupe_tie_prefers_later_item() -> None:
    """Equal timestamps: the later item in the batch wins, matching the
    client's ordering."""
    assert dedupe_rows([("k", "first", T1), ("k", "second", T1)]) == [("k", "second", T1)]


def test_dedupe_preserves_distinct_keys() -> None:
    rows = [("a", "1", T1), ("b", "2", T1), ("c", "3", T2)]
    assert sorted(dedupe_rows(rows)) == sorted(rows)


def test_sync_function_time_budget() -> None:
    """15 s was the cap that killed the backlog push; the batched write
    makes 60 s generous, but never let it regress below."""
    cfg = json.loads((_REPO_ROOT / "vercel.json").read_text())
    assert cfg["functions"]["api/sync.py"]["maxDuration"] >= 60


def test_do_put_writes_in_one_round_trip() -> None:
    """Structural guard on api/sync.py (importing it needs psycopg,
    absent here): the PUT path must dedupe, build one statement, and
    contain no per-row execute loop."""
    src = (_REPO_ROOT / "api" / "sync.py").read_text()
    put_body = src.split("def do_PUT", 1)[1]
    assert "dedupe_rows" in put_body
    assert "build_upsert" in put_body
    assert put_body.count("cur.execute") == 1
    assert "for key, value, updated_at in rows" not in put_body
