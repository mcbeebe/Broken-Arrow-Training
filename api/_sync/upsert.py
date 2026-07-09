"""Pure SQL builder for the batched LWW upsert.

One PUT batch = ONE multi-row INSERT = one database round trip.
P0 postmortem, part two (the 504 FUNCTION_INVOCATION_TIMEOUT): the old
`do_PUT` looped `cur.execute` per row, so a device pushing a weeks-long
backlog paid one Neon round trip per key — plus a cold DB resume — and
blew the function's time budget. The backlog could never drain.

psycopg-free on purpose: the keyless CI environment has no psycopg, and
keeping this module import-clean lets tests exercise the real dedupe and
SQL/param behavior instead of grepping source text. `wrap_value` is the
seam where api/sync.py injects psycopg's Jsonb adapter.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Callable

# (key, raw localStorage value, parsed updatedAt)
Row = tuple[str, str, datetime]


def dedupe_rows(rows: list[Row]) -> list[Row]:
    """Collapse duplicate keys, newest ``updatedAt`` winning.

    Postgres aborts an entire multi-row INSERT whose ON CONFLICT target
    repeats ("command cannot affect row a second time"), so duplicates
    must collapse before the statement is built. On an updatedAt tie the
    later item in the batch wins, matching the client's ordering.
    """
    best: dict[str, Row] = {}
    for row in rows:
        prev = best.get(row[0])
        if prev is None or row[2] >= prev[2]:
            best[row[0]] = row
    return list(best.values())


def build_upsert(
    athlete_id: str,
    rows: list[Row],
    wrap_value: Callable[[str], Any] = lambda v: v,
) -> tuple[str, list[Any]]:
    """Multi-row LWW upsert statement + flattened param list.

    Caller must ``dedupe_rows`` first. The executed statement's rowcount
    is the number of rows written (fresh insert or LWW update); the
    WHERE guard silently drops stale incoming rows, which the caller
    reports as skipped.
    """
    if not rows:
        raise ValueError("build_upsert requires at least one row")
    placeholders = ", ".join(["(%s, %s, %s, %s)"] * len(rows))
    params: list[Any] = []
    for key, value, updated_at in rows:
        params.extend((athlete_id, key, wrap_value(value), updated_at))
    sql = (
        "INSERT INTO user_state (athlete_id, key, value, updated_at) "
        f"VALUES {placeholders} "
        "ON CONFLICT (athlete_id, key) DO UPDATE SET "
        "  value = EXCLUDED.value, "
        "  updated_at = EXCLUDED.updated_at "
        "WHERE user_state.updated_at < EXCLUDED.updated_at"
    )
    return sql, params
