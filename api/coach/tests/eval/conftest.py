"""Pytest bootstrap for the Coach eval harness.

We deliberately add NO `__init__.py` under `api/` — the production coach
modules use relative imports (`from ._core import ...`) and Vercel resolves
each `api/**/*.py` as a serverless function; adding package markers there
risks changing that resolution. Instead we put the repo root on `sys.path`
so `api.coach.*` resolves as an implicit namespace package, and the eval
dir itself so `import harness` / `import assertions` work as plain modules.
Both `_core` and `insight` import cleanly with no env vars and no network
(the anthropic client is constructed lazily, only on a live call).
"""

import pathlib
import sys

_HERE = pathlib.Path(__file__).resolve().parent           # api/coach/tests/eval
_REPO_ROOT = _HERE.parents[3]                              # repo root

for _p in (str(_REPO_ROOT), str(_HERE)):
    if _p not in sys.path:
        sys.path.insert(0, _p)
