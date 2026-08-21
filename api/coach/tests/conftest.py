"""Pytest bootstrap for the coach test tree.

There is deliberately NO ``__init__.py`` under ``api/`` — the production
modules use relative imports and Vercel resolves each ``api/**/*.py`` as a
serverless function; package markers there risk changing that resolution.
So the repo root goes on ``sys.path`` here, making ``api.coach.*`` resolve
as an implicit namespace package.

This file exists at THIS level (not only in ``tests/eval/``) because the
review of the CI-guard tests caught a real collection-order dependency:
``from api.coach._core import ...`` in these modules only resolved when a
full-directory run happened to visit ``eval/`` (whose conftest does the
same bootstrap) or ``test_entitlements.py`` (which bootstraps inline)
first — alphabetical luck. A narrowed run with the console-script pytest
(``pytest api/coach/tests/test_sdk_smoke.py`` — the CI invocation form,
which does not put the CWD on ``sys.path`` the way ``python -m pytest``
does) died with ModuleNotFoundError instead of testing anything. A
directory conftest loads before any module in the tree is imported, in
every invocation shape.
"""

import pathlib
import sys

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]

if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))
