"""Web Push (VAPID) sender for Coach notifications.

Thin wrapper over pywebpush so the payload encryption + VAPID signing
live in one place. Reads the VAPID keypair from env:

  VAPID_PRIVATE_KEY  — EC P-256 private key (PEM contents or base64url)
  VAPID_PUBLIC_KEY   — applicationServerKey (base64url; informational)
  VAPID_SUBJECT      — mailto: or https: contact (RFC 8292 'sub' claim)

send_web_push returns (ok, status_code, should_prune). should_prune is
True when the endpoint reports the subscription is gone (404/410), so
the caller can drop it from KV.
"""

from __future__ import annotations

import json
import os
from typing import Any


def vapid_configured() -> bool:
    return bool(os.environ.get("VAPID_PRIVATE_KEY", "").strip())


def send_web_push(
    subscription: dict[str, Any],
    payload: dict[str, Any],
) -> tuple[bool, int, bool]:
    private_key = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
    subject = os.environ.get(
        "VAPID_SUBJECT", "mailto:coach@brokenarrowtraining.app"
    ).strip()
    if not private_key:
        raise RuntimeError("VAPID_PRIVATE_KEY not configured")

    endpoint = subscription.get("endpoint")
    keys = subscription.get("keys") or {}
    if not endpoint or not keys.get("p256dh") or not keys.get("auth"):
        return False, 0, True  # malformed record → prune

    try:
        from pywebpush import webpush, WebPushException
    except Exception as e:  # dependency not installed in this runtime
        raise RuntimeError(f"pywebpush unavailable: {e}")

    try:
        webpush(
            subscription_info={"endpoint": endpoint, "keys": keys},
            data=json.dumps(payload, separators=(",", ":")),
            vapid_private_key=private_key,
            vapid_claims={"sub": subject},
            ttl=600,
        )
        return True, 201, False
    except WebPushException as e:
        status = 0
        resp = getattr(e, "response", None)
        if resp is not None:
            status = getattr(resp, "status_code", 0) or 0
        return False, status, status in (404, 410)
