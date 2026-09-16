"""Shared parsing for the token-expiry header, used by both deploy guards.

GitHub returns `github-authentication-token-expiration` on any authenticated
response, but not in one fixed shape: it has been seen as
"2026-09-16 21:28:14 UTC", as ISO-8601 with a Z, and with a numeric offset.
datetime.fromisoformat accepts only the last of those, and only sometimes.

This lives in one place because both guards read the same header and neither
should be the one with the subtly different parser. Getting it wrong is
quiet in the worst way: an unparsable date means no warning, which is
indistinguishable from a healthy token right up until publishing stops.
"""
from __future__ import annotations

from datetime import datetime, timezone


def parse_expiry(raw: str) -> datetime | None:
    """The header as an aware UTC datetime, or None if it cannot be read."""
    raw = (raw or "").strip()
    if not raw:
        return None

    candidates = (
        raw.replace("Z", "+00:00"),
        raw.replace(" UTC", "+00:00").replace(" ", "T", 1),
        # "2030-01-01 00:00:00 +0000" -> "2030-01-01T00:00:00+0000"
        raw.replace(" ", "T", 1).replace(" ", ""),
        raw.split(" ")[0],
    )
    for candidate in candidates:
        try:
            parsed = datetime.fromisoformat(candidate)
        except ValueError:
            continue
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return None


def days_until(raw: str) -> int | None:
    """Whole days until the token expires, or None if the header is unreadable."""
    parsed = parse_expiry(raw)
    if parsed is None:
        return None
    return (parsed - datetime.now(timezone.utc)).days
