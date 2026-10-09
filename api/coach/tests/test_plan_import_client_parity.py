"""Keyless test: the browser and the plan-import endpoint agree (NO API).

Initiative 004, PR 5. The browser refuses a file the server would refuse
before sending it, because every request spends one of the athlete's five
uploads a day; and it has words for every error the server can send. Both
only hold while the two sides say the same thing, so this reads the
TypeScript and compares:
  1. the size and length limits (src/utils/planImport/uploadLimits.ts);
  2. the file kinds and image types;
  3. every error code the server can send, which the client knows
     (client.ts) and has copy for (importErrors.ts);
  4. the browser waits longer than the server works;
  5. the client never names a file name field.
"""

import json
import pathlib
import re
import sys

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from api.coach import _plan_import as pi

_SRC = _REPO_ROOT / "src" / "utils" / "planImport"
_SERVER_FILES = [_REPO_ROOT / "api" / "coach" / "plan_import.py", _REPO_ROOT / "api" / "coach" / "_plan_import.py"]


def _ts(name: str) -> str:
    return (_SRC / name).read_text()


def _ts_number(src: str, key: str) -> int:
    match = re.search(rf"\b{key}:\s*([\d_]+)", src)
    assert match, f"{key} not found"
    return int(match.group(1).replace("_", ""))


def _ts_string_list(src: str, const: str) -> set[str]:
    match = re.search(rf"{const}\s*=\s*\[([^\]]*)\]", src)
    assert match, f"{const} not found"
    return set(re.findall(r"'([^']+)'", match.group(1)))


def _server_error_codes() -> set[str]:
    codes: set[str] = set()
    for path in _SERVER_FILES:
        src = path.read_text()
        codes |= set(re.findall(r'RequestError\(\d{3},\s*"(\w+)"\)', src))
        codes |= set(re.findall(r'"error":\s*"(\w+)"', src))
        codes |= set(re.findall(r'return \d{3},\s*"(\w+)"', src))
    return codes


def test_the_limits_match() -> None:
    limits = _ts("uploadLimits.ts")
    assert _ts_number(limits, "maxBodyBytes") == pi.MAX_BODY_BYTES
    assert _ts_number(limits, "maxFileBytes") == pi.MAX_FILE_BYTES
    assert _ts_number(limits, "maxTextChars") == pi.MAX_TEXT_CHARS
    assert _ts_number(limits, "maxHintChars") == pi.MAX_HINT_CHARS


def test_the_kinds_and_image_types_match() -> None:
    assert _ts_string_list(_ts("types.ts"), "IMPORT_SOURCE_KINDS") == pi.KINDS
    assert _ts_string_list(_ts("uploadLimits.ts"), "IMAGE_MEDIA_TYPES") == pi.IMAGE_TYPES


def test_the_client_knows_every_error_the_server_sends() -> None:
    server = _server_error_codes()
    # The scrape itself must be finding things, or this test proves nothing.
    assert {"not_available", "import_limit", "too_large", "plan_too_long", "busy", "text_required"} <= server
    client = _ts_string_list(_ts("client.ts"), "SERVER_ERROR_CODES")
    assert client == server, f"client lacks {server - client}, has extra {client - server}"


def test_every_error_has_words_for_the_athlete() -> None:
    copy = _ts("importErrors.ts")
    block = copy.split("IMPORT_PROBLEMS", 1)[1]
    keys = set(re.findall(r"^\s+(\w+):\s*\{", block, re.M))
    missing = _server_error_codes() - keys
    assert not missing, f"no copy for {sorted(missing)}"


def test_the_browser_waits_longer_than_the_server_works() -> None:
    timeout_ms = _ts_number(_ts("uploadLimits.ts").replace("CLIENT_TIMEOUT_MS =", "CLIENT_TIMEOUT_MS:"), "CLIENT_TIMEOUT_MS")
    functions = json.loads((_REPO_ROOT / "vercel.json").read_text())["functions"]
    max_duration = functions["api/coach/plan_import.py"]["maxDuration"]
    assert timeout_ms / 1000 > pi.MODEL_TIMEOUT_S
    assert timeout_ms / 1000 > max_duration


def test_the_client_never_names_a_file_name_field() -> None:
    for name in ("client.ts", "prepareUpload.ts", "uploadLimits.ts"):
        assert "fileName" not in _ts(name), name
