"""Auth helper for the Apple Health endpoint.

This module used to carry its own copy of the session-JWT verification to
avoid a cross-directory import, which made three implementations of "is this
session valid" across the API (here, api/auth/_helpers, and sync.py's own
`_authenticate`) — and they had already diverged in one visible way: sync
lower-cases the token subject and the other two do not. It now delegates to
api/auth/_helpers. Behaviour here is unchanged; sync keeps its lower-casing
because its storage keys were written that way.
"""

from ..auth._helpers import athlete_from_bearer


def authenticate(handler_self) -> tuple[bool, int, str, str]:
    """Validate Authorization: Bearer <session-jwt>.

    Returns (ok, status_code, error_message, athlete_id).

    Delegates to the shared implementation in api/auth/_helpers so the coach,
    device and sync endpoints cannot drift apart on what counts as a valid
    session. Behaviour is unchanged: fails closed when OAUTH_JWT_SECRET is
    not configured.
    """
    return athlete_from_bearer(handler_self.headers)
