"""app_url() — the sign-in link in the access-request emails (initiative 003).

The app moved to attune.coach/app/ in PR 1, and `/` becomes the landing page
at launch, so the approval email must link to /app. APP_URL on Vercel still
overrides it.
"""

import pytest

from api.auth import _helpers as H


def test_the_default_points_at_the_app(monkeypatch):
    monkeypatch.delenv("APP_URL", raising=False)
    assert H.app_url() == "https://attune.coach/app"


@pytest.mark.parametrize("value", ["https://attune.coach/app/", "https://attune.coach/app"])
def test_an_override_wins_without_a_trailing_slash(monkeypatch, value):
    monkeypatch.setenv("APP_URL", value)
    assert H.app_url() == "https://attune.coach/app"


def test_the_approval_email_links_to_the_app(monkeypatch):
    monkeypatch.delenv("APP_URL", raising=False)
    sent = []
    monkeypatch.setattr(H, "send_email", lambda to, subject, html, text=None: sent.append((html, text)))
    H.notify_user_approved("new@example.com")
    [(html, text)] = sent
    assert "href='https://attune.coach/app'" in html
    assert "https://attune.coach/app " in text
