"""Coach push notifications open the app at /app/ (initiative 003).

The service worker opens whatever `url` the payload carries. Since PR 1 the
app lives at /app/, and `/` becomes the landing page at launch, so a payload
still pointing at `/?view=coach` would open a tap on the marketing page
instead of Coach. Read from the source with `ast` so this runs without
pywebpush (which push.py imports) installed.
"""

import ast
import pathlib

PUSH = pathlib.Path(__file__).resolve().parents[1] / "push.py"


def _payload_urls() -> list[str]:
    tree = ast.parse(PUSH.read_text())
    urls = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Dict):
            for k, v in zip(node.keys, node.values):
                if isinstance(k, ast.Constant) and k.value == "url":
                    assert isinstance(v, ast.Constant), "push url must be a literal"
                    urls.append(v.value)
    return urls


def test_both_push_payloads_open_the_app_on_coach():
    urls = _payload_urls()
    assert len(urls) == 2, f"expected the briefing and the test payload, found {urls}"
    assert urls == ["/app/?view=coach", "/app/?view=coach"]


def test_no_push_payload_points_at_the_root_page():
    assert all(u.startswith("/app/") for u in _payload_urls())
