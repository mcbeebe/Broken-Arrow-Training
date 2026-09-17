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


def ensure_garminconnect():
    """Make ``import garminconnect`` succeed for the unit suite.

    The real library is a production dependency (installed in CI via
    requirements-dev.txt) and is preferred whenever it imports. It is not
    always present locally, and ``api.garmin._session`` imports it at module
    scope — including ``garminconnect.exceptions`` — so a missing library
    would silently void every Garmin endpoint test. Stand in a stub with the
    same public surface instead. Nothing here contacts Garmin.
    """
    import importlib
    import sys
    import types

    try:
        importlib.import_module("garminconnect.exceptions")
        return
    except ImportError:
        pass

    exceptions = types.ModuleType("garminconnect.exceptions")
    for name in (
        "GarminConnectConnectionError",
        "GarminConnectTooManyRequestsError",
        "GarminConnectAuthenticationError",
        "GarminConnectInvalidFileFormatError",
    ):
        setattr(exceptions, name, type(name, (Exception,), {}))

    stub = types.ModuleType("garminconnect")
    stub.__path__ = []  # marks it as a package so the submodule import resolves
    stub.Garmin = type("Garmin", (), {})
    stub.exceptions = exceptions
    for name in dir(exceptions):
        if name.startswith("GarminConnect"):
            setattr(stub, name, getattr(exceptions, name))
    sys.modules["garminconnect"] = stub
    sys.modules["garminconnect.exceptions"] = exceptions


# Run it here, not from the tests: a conftest is imported before any module
# in its directory, in every invocation shape, and `import conftest` from a
# test file is ambiguous once a second conftest (tests/eval/) is on the path.
ensure_garminconnect()
