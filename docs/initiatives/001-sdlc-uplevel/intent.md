# 001 — SDLC uplevel

**Date:** 2026-08-29 · **Status:** Open
**Artifacts:** intent.md (this) → analysis: the eight reader reports and three
adversarial critic reports summarized in the proposal → this PR, then one PR
per remaining item

## Problem

Standing rules written as prose decay; rules encoded as machine checks hold.
That is not a hypothesis here, it is the repo's own record — of seven such
rules across this portfolio, all four prose rules lapsed and all three
machine-checked rules held without exception. The Witchel product filter was
last used on 2026-07-07 and is absent from the ~65 PRs since; "keep the coach
prompt and the renderer in step" never got a parity test, though
`test_sync_allowlist_parity.py` proves the pattern was already understood.

Separately, the plan → PR → audit chain runs when work starts from a committed
document and breaks when it starts from a chat session. Three of the four large
August initiatives shipped with no plan doc written before building, so their
sequencing survives nowhere.

## Proposed outcome

Checkable when all of these are true:

- The keyless Python suite has run against the exact commit Vercel deployed.
- A manual workflow dispatch cannot publish a non-publishing branch.
- Every PR produces a `test` check, so branch protection can be required
  without deadlocking PRs from branches outside `claude/*`.
- `CLAUDE.md` contains no statement that is false, and names the commands and
  deploy topology a fresh session currently has to rediscover from YAML
  comments and Python docstrings.
- Every initiative meeting the threshold in `docs/initiatives/README.md` has a
  folder, and its row shows the PRs that shipped it.

## Affected parties / surfaces

- **Surfaces:** the GitHub Pages publish (`deploy.yml`), the Vercel API
  deploy, and the two CI workflows. No application code changes in this PR.
- **Users:** none directly. Every change here is about what must be true
  before code reaches them.
- **Future sessions:** the main beneficiary — this is institutional knowledge
  moving from chat scrollback into versioned files.

## Constraints

- **Vercel Hobby caps functions at 12 and `api/` sits at exactly 12** — a
  binding limit, already the reason `api/version.py` was folded into
  `sync.py`. Nothing here may add a function.
- **`api/requirements.txt` pins are the deployment**, because Vercel installs
  fresh on every build. Both an unpinned floor and a guessed upper bound have
  taken production down.
- **`coach-eval.yml` must not gate `deploy.yml`.** The push trigger added here
  makes the suite cover the deployed revision without coupling the workflows.
- **Live model evals stay opt-in.** `pytest.ini`'s `-m "not eval"` default and
  the `run-coach-eval` label are budget guards, not accidents.
- No change may make a required check red on arrival — hence 002.

## Open questions

- **Witchel check:** re-scope to planning docs, or revive with a PR-template
  checkbox? Practice since July says the former. *Unresolved — Mike's call.*
- **Repo rename to `attune-coach-app`:** recommended against. The airlock
  strips `/Broken-Arrow-Training/` from legacy paths to carry old users'
  localStorage history to attune.coach; a rename either 404s that origin or
  breaks the regex, and both lose user data. *Unresolved — Mike's call.*
- **Vercel deploy ordering:** replacing git auto-deploy with a `deploy-api`
  job needs a `VERCEL_TOKEN` and a dashboard change. Not in this PR.
- **Branch protection:** the required contexts are check-run *display* names —
  `test` and `Coach harness — fixture honesty + assertions (keyless)`. Turn on
  only after this PR merges, or PRs deadlock.
