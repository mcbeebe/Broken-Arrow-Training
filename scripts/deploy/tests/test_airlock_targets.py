"""Covers scripts/airlock/ — the legacy site's hand-off to attune.coach (D12).

The airlock is what mcbeebe.github.io/Broken-Arrow-Training/ serves: it
gathers a legacy visitor's localStorage and carries it to the app. Since
initiative 003 the app lives at attune.coach/app/, so every navigation it
makes must land there, while the postMessage origin check must stay the bare
origin (an origin never carries a path; `ev.origin !== 'https://attune.coach/app'`
would reject every message and strand the popup migration).

The cutover-airlock job publishes on the branch test alone, ahead of the app,
so a wrong URL here is live before anything else could catch it. These tests
run the page's real inline script in Node against a stubbed browser and
record where it navigates.
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import shutil
import subprocess
import urllib.parse

import pytest

AIRLOCK = pathlib.Path(__file__).resolve().parents[2] / "airlock"
INDEX = (AIRLOCK / "index.html").read_text()
NOT_FOUND = (AIRLOCK / "404.html").read_text()
APP = "https://attune.coach/app/"

NODE = shutil.which("node")
needs_node = pytest.mark.skipif(NODE is None, reason="node not on PATH; airlock behaviour unchecked")


def test_ci_has_node():
    """These tests are the only gate on the airlock publish; in CI a missing
    node must fail, not quietly skip them."""
    if os.environ.get("CI"):
        assert NODE, "node not on PATH in CI: the airlock behaviour tests would all skip"

# A stub browser. Runs the page's script, then the scenario, and prints what
# happened as JSON: every location.replace, window.open and postMessage.
HARNESS = r"""
const input = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const log = { replaced: [], opened: [], posted: [], listeners: {} };
const store = Object.assign({}, input.local || {});
const localStorage = {
  get length() { return Object.keys(store).length; },
  key(i) { return Object.keys(store)[i]; },
  getItem(k) { return k in store ? store[k] : null; },
};
const sessionStorage = { getItem() { return null; } };
const elements = {};
const document = {
  getElementById(id) {
    if (!elements[id]) elements[id] = {
      id, hidden: false, textContent: '', innerHTML: '', handlers: {},
      addEventListener(t, fn) { this.handlers[t] = fn; },
    };
    return elements[id];
  },
  createElement() { return { click() {} }; },
};
const popup = input.popupBlocked ? null : {
  postMessage(data, origin) { log.posted.push({ type: data.type, origin }); },
  close() {},
};
const location = {
  pathname: input.pathname, search: input.search || '', hash: input.hash || '',
  replace(u) { log.replaced.push(u); },
};
const window = {
  open(u) { log.opened.push(u); return popup; },
  addEventListener(t, fn) { log.listeners[t] = fn; },
  removeEventListener() {},
};
const navigator = {};
const URL = { createObjectURL() { return 'blob:x'; }, revokeObjectURL() {} };
class Blob { constructor() {} }
const timers = [];
const setTimeout = (fn) => { timers.push(fn); return timers.length; };
const clearTimeout = () => {};
eval(input.script);
for (const step of input.steps || []) {
  if (step.message) log.listeners.message({ origin: step.message.origin, data: { type: step.message.type } });
  if (step.click) elements[step.click].handlers.click();
  if (step.timeout) timers.forEach(fn => fn());
}
log.html = { msg: elements.msg ? elements.msg.innerHTML : '' };
process.stdout.write(JSON.stringify(log));
"""


def inline_script(html: str) -> str:
    scripts = re.findall(r"<script>(.*?)</script>", html, re.S)
    assert len(scripts) == 1, "airlock page has exactly one inline script"
    return scripts[0]


def run(html: str, pathname: str, search: str = "", hash_: str = "", *,
        local: dict | None = None, popup_blocked: bool = True, steps: list | None = None) -> dict:
    payload = {
        "script": inline_script(html), "pathname": pathname, "search": search,
        "hash": hash_, "local": local or {}, "popupBlocked": popup_blocked,
        "steps": steps or [],
    }
    out = subprocess.run([NODE, "-e", HARNESS], input=json.dumps(payload),
                         capture_output=True, text=True, timeout=30)
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)


DATA = {"ba_theme": "dark", "ba_plan_edits_mike": "{}"}


# ── static shape ────────────────────────────────────────────────────────

def test_target_stays_the_bare_origin():
    assert "var TARGET = 'https://attune.coach';" in INDEX


def test_app_path_is_declared_once():
    assert INDEX.count("var APP_PATH = '/app/';") == 1


def test_the_postmessage_origin_checks_use_the_bare_origin():
    assert "ev.origin !== TARGET" in INDEX
    assert "payload: payload }, TARGET)" in INDEX


def test_no_static_link_points_at_the_root_page():
    assert 'content="0;url=https://attune.coach/app/"' in INDEX
    assert 'href="https://attune.coach/app/"' in INDEX
    assert "url=https://attune.coach/\"" not in INDEX
    assert 'href="https://attune.coach/"' not in INDEX


def test_404_forwards_to_the_app():
    assert 'content="0;url=https://attune.coach/app/"' in NOT_FOUND
    assert 'href="https://attune.coach/app/"' in NOT_FOUND
    assert "location.replace('https://attune.coach/app/'" in NOT_FOUND


# ── behaviour ───────────────────────────────────────────────────────────

@needs_node
@pytest.mark.parametrize("pathname", ["/Broken-Arrow-Training/", "/Broken-Arrow-Training"])
def test_a_visitor_with_no_data_is_forwarded_to_the_app_with_query_and_hash(pathname):
    log = run(INDEX, pathname, "?view=plan", "#mike")
    assert log["replaced"] == [APP + "?view=plan#mike"]


@needs_node
def test_a_deeper_legacy_path_keeps_its_tail_under_app():
    log = run(INDEX, "/Broken-Arrow-Training/index.html", "?view=coach")
    assert log["replaced"] == [APP + "index.html?view=coach"]


@needs_node
def test_a_blocked_popup_carries_the_data_to_the_app_in_the_fragment():
    log = run(INDEX, "/Broken-Arrow-Training/", "?view=coach", "", local=DATA)
    assert log["opened"] == [APP + "?__migrate=1"]
    [url] = log["replaced"]
    prefix = APP + "?__migrate=1#__attune_migrate="
    assert url.startswith(prefix)
    env = json.loads(urllib.parse.unquote(url[len(prefix):]))
    assert env["d"] == "/app/?view=coach", "the receiver navigates to d verbatim"
    assert env["p"]["items"] == DATA


@needs_node
def test_the_popup_handshake_answers_only_the_bare_origin_then_forwards():
    log = run(INDEX, "/Broken-Arrow-Training/", "?view=plan", "#mike", local=DATA,
              popup_blocked=False, steps=[
                  {"message": {"origin": "https://attune.coach/app", "type": "MIGRATE_READY"}},
                  {"message": {"origin": "https://evil.example", "type": "MIGRATE_READY"}},
                  {"message": {"origin": "https://attune.coach", "type": "MIGRATE_READY"}},
                  {"message": {"origin": "https://attune.coach", "type": "MIGRATE_ACK"}},
              ])
    assert log["opened"] == [APP + "?__migrate=1"]
    assert log["posted"] == [{"type": "MIGRATE_DATA", "origin": "https://attune.coach"}]
    assert log["replaced"] == [APP + "?view=plan#mike"]


@needs_node
def test_an_unacked_popup_falls_back_to_the_fragment_redirect_into_the_app():
    log = run(INDEX, "/Broken-Arrow-Training/", local=DATA, popup_blocked=False,
              steps=[{"timeout": True}])
    [url] = log["replaced"]
    assert url.startswith(APP + "?__migrate=1#__attune_migrate=")


@needs_node
def test_the_backup_download_points_at_the_app_receiver():
    log = run(INDEX, "/Broken-Arrow-Training/", local=DATA, popup_blocked=False,
              steps=[{"click": "download"}])
    assert f'href="{APP}?__migrate=1"' in log["html"]["msg"]


@needs_node
def test_404_forwards_with_query_and_hash():
    log = run(NOT_FOUND, "/Broken-Arrow-Training/anything", "?view=plan", "#mike")
    assert log["replaced"] == [APP + "?view=plan#mike"]
