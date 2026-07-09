"""Keyless guard: the client and server sync allowlists can NEVER drift.

P0 postmortem: `ba_journal_notes` was added to the client preserve list
(src/utils/migrate.ts) but not the server allowlist (api/_sync/allowlist.py).
The server 400'd any PUT batch containing an un-allowlisted key — so one
missing entry silently killed 100% of pushes from every device that had a
journal note, for weeks, with no visible error. Cross-device sync appeared
"on" while nothing moved.

This test parses BOTH files (no imports — psycopg isn't needed) and asserts
strict set equality of prefixes and exact keys. Adding a synced key to one
list without the other is now a CI failure, not a production outage.
"""

import pathlib
import re

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
_CLIENT = _REPO_ROOT / "src" / "utils" / "migrate.ts"
_SERVER = _REPO_ROOT / "api" / "_sync" / "allowlist.py"


def _client_sets() -> tuple[set[str], set[str]]:
    src = _CLIENT.read_text()
    prefixes = set(re.findall(r"'([A-Za-z_0-9.:]+)',", src.split("PRESERVE_PREFIXES")[1].split("]")[0]))
    exact = set(re.findall(r"'([A-Za-z_0-9.:]+)',", src.split("PRESERVE_EXACT")[1].split("]")[0]))
    return prefixes, exact


def _server_sets() -> tuple[set[str], set[str]]:
    src = _SERVER.read_text()
    prefixes = set(re.findall(r'"([A-Za-z_0-9.:]+)",', src.split("PRESERVE_PREFIXES")[1].split(")")[0]))
    exact = set(re.findall(r'"([A-Za-z_0-9.:]+)",', src.split("PRESERVE_EXACT")[1].split(")")[0]))
    return prefixes, exact


def test_parsers_found_real_lists() -> None:
    c_prefixes, c_exact = _client_sets()
    s_prefixes, s_exact = _server_sets()
    # Sanity floor so a refactor that breaks the regex fails loudly instead
    # of passing on two empty sets.
    assert len(c_prefixes) > 10 and len(s_prefixes) > 10
    assert "ba_plan_edits" in c_prefixes and "ba_plan_edits" in s_prefixes
    assert len(c_exact) > 0 and len(s_exact) > 0


def test_prefix_lists_identical() -> None:
    c_prefixes, _ = _client_sets()
    s_prefixes, _ = _server_sets()
    client_only = sorted(c_prefixes - s_prefixes)
    server_only = sorted(s_prefixes - c_prefixes)
    assert not client_only, (
        f"Client pushes these prefixes but the SERVER REJECTS them (the P0 "
        f"sync-outage shape): {client_only} — add them to api/_sync/allowlist.py"
    )
    assert not server_only, (
        f"Server allows prefixes the client never syncs (dead entries breed "
        f"confusion): {server_only} — add to migrate.ts or remove"
    )


def test_exact_key_lists_identical() -> None:
    _, c_exact = _client_sets()
    _, s_exact = _server_sets()
    assert c_exact == s_exact, (
        f"exact-key drift — client-only: {sorted(c_exact - s_exact)}, "
        f"server-only: {sorted(s_exact - c_exact)}"
    )


def test_journal_notes_is_on_both_lists() -> None:
    """The specific key that caused the outage, pinned by name."""
    c_prefixes, _ = _client_sets()
    s_prefixes, _ = _server_sets()
    assert "ba_journal_notes" in c_prefixes
    assert "ba_journal_notes" in s_prefixes


def test_server_put_is_fail_soft() -> None:
    """The structural half of the fix: api/sync.py must partition invalid
    items into a `rejected` report instead of 400-ing the whole batch.
    Parsed textually (importing api.sync needs psycopg, absent in the
    keyless env)."""
    src = (_REPO_ROOT / "api" / "sync.py").read_text()
    assert "def partition_items" in src
    body = src.split("def partition_items", 1)[1]
    # Rejections are collected per-item…
    assert "rejected.append" in body
    # …and the batch response reports them rather than erroring.
    assert '"rejected": rejected' in src
    # The old batch-fatal pattern is gone: no 400 for allowlist misses.
    assert "not on allowlist:" not in src
