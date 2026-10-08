"""vercel.json `functions` keys are matched FIRST-MATCH, in key order.

Vercel's builder detection gives each function file the first key that
matches it (`keys.find(key => key === fileName || minimatch(fileName, key))`
in @vercel/fs-detectors' detect-builders.ts). Any key that is no file's
first match fails the whole build with `unused_function`. So a file-specific
entry placed after a glob that also matches the file is not just ignored:
the API stops deploying, and Vercel deploys on push with no gate in front.

That happened to the plan-import function (initiative 004, PR 3) before it
was pushed: its 300 s entry sat below `api/coach/*.py`. These tests replay
the two rules on this repo's files, so the next per-file entry can't repeat it.
"""

import json
import pathlib
import re

import pytest

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
FUNCTIONS = json.loads((_REPO_ROOT / "vercel.json").read_text())["functions"]


def _glob_to_regex(pattern: str) -> re.Pattern[str]:
    """minimatch for the patterns vercel.json uses: `**` crosses folders,
    `*` and `?` don't."""
    out = ""
    i = 0
    while i < len(pattern):
        if pattern.startswith("**", i):
            out += ".*"
            i += 2
        elif pattern[i] == "*":
            out += "[^/]*"
            i += 1
        elif pattern[i] == "?":
            out += "[^/]"
            i += 1
        else:
            out += re.escape(pattern[i])
            i += 1
    return re.compile(f"^{out}$")


def _vercelignored() -> list[str]:
    path = _REPO_ROOT / ".vercelignore"
    lines = path.read_text().splitlines() if path.is_file() else []
    return [ln.strip().rstrip("/") for ln in lines if ln.strip() and not ln.startswith("#")]


def function_files() -> list[str]:
    """The files Vercel turns into functions: api/**/*.py, minus any path with
    a `/_` or `/.` segment, and minus what .vercelignore keeps out."""
    ignored = _vercelignored()
    files = []
    for p in sorted((_REPO_ROOT / "api").rglob("*.py")):
        rel = p.relative_to(_REPO_ROOT).as_posix()
        if "/_" in rel or "/." in rel:
            continue
        if any(rel == ig or rel.startswith(ig + "/") for ig in ignored):
            continue
        files.append(rel)
    return files


def first_match(file: str) -> str | None:
    return next((k for k in FUNCTIONS if k == file or _glob_to_regex(k).match(file)), None)


def test_the_matcher_reads_globs_as_vercel_does():
    assert _glob_to_regex("api/coach/*.py").match("api/coach/chat.py")
    assert not _glob_to_regex("api/coach/*.py").match("api/coach/sub/chat.py")
    assert _glob_to_regex("api/**/*.py").match("api/coach/sub/chat.py")
    assert not _glob_to_regex("api/sync.py").match("api/syncxpy")


def test_the_file_list_is_real():
    files = function_files()
    assert "api/coach/chat.py" in files and "api/coach/plan_import.py" in files
    assert not any("/_" in f or "/tests/" in f for f in files)


@pytest.mark.parametrize("key", list(FUNCTIONS))
def test_every_functions_key_is_some_files_first_match(key):
    """Vercel's checkUnusedFunctions: otherwise the build fails."""
    owners = [f for f in function_files() if first_match(f) == key]
    assert owners, (
        f'"{key}" is no function file\'s first match, so Vercel fails the build '
        "with unused_function. Move a file-specific key above any glob that "
        "also matches the file."
    )


def test_plan_import_gets_its_own_limit_and_chat_keeps_its_own():
    assert first_match("api/coach/plan_import.py") == "api/coach/plan_import.py"
    assert FUNCTIONS["api/coach/plan_import.py"]["maxDuration"] == 300
    assert first_match("api/coach/chat.py") == "api/coach/*.py"
    assert FUNCTIONS["api/coach/*.py"]["maxDuration"] == 60
