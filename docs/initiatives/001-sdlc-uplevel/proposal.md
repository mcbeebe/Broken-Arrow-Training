# SDLC Uplevel — Proposal

**Date:** 2026-08-29 · **Status:** Open — awaiting Mike's review
**Scope:** attune.coach (source `mcbeebe/Broken-Arrow-Training`, deploy `mcbeebe/attune-coach`), `mcbeebe/Waypoint`, `mcbeebe/LEGO-Sorter`
**Artifacts:** intent (this doc) → per-repo application PRs on approval → 30-day re-audit

**The thesis, in one line:** your rituals are real but they live in your head and in chat scrollback, so they survive exactly as long as your attention does. Every prose rule in these repos decayed; every machine-checked rule held. The uplevel is moving the load-bearing ones into files the agent reads and gates the machine enforces.

> **Moved 2026-10-06.** This proposal and `templates/` were drafted in `mcbeebe/attune-coach` and, because that repo's `gh-pages` is published with `keep_files: true`, were served at `attune.coach/docs/sdlc/`. They now live here, as this document recommended, and were deleted from the deploy branch. The templates are the original drafts; the adopted versions are `.claude/skills/adversary/`, `.claude/skills/recap/` and the chain in `docs/initiatives/README.md`.

**How this was produced:** eight fresh-context subagents read the repos independently; three adversarial critics then attacked the draft (facts, fidelity to source, pragmatics). They returned two chronology/mechanism blockers, four "this would break production" blockers, and one fidelity blocker. All are corrected below; §5 records what changed.

---

## Decisions required

Six calls are yours. Recommended default in bold.

1. **Witchel check** — re-scope it to planning docs (**recommended**, matches practice since July 7), or revive it with a PR-template checkbox?
2. **Repo rename** to `attune-coach-app` — **drop it** (recommended: the airlock's hardcoded legacy path is a user-data migration route), or make it its own initiative with the checklist in §3.1.9?
3. **Waypoint auto-ship** — keep producer self-merge on green for mechanical changes (**recommended, with the boundary in M6**), or require the adversary memo on everything?
4. **gas-mvp** — wire clasp so production deploys are committed pushes, or **declare it frozen-legacy** in CLAUDE.md? It is labelled "Active — Production" and deploys by copy-paste.
5. **Live coach evals** — keep them opt-in-by-label (**recommended**, preserves the budget-safety property), or schedule them weekly with a stated budget cap?
6. **Where this document lives** — see the placement warning above.

**What "yes" authorizes:** one starter PR per repo (skills, initiative registry, the CI gate file, regenerated CLAUDE.md), then the §3 items in listed order, each as its own PR.
**What happens first:** LEGO's gate session — smallest effort, whole-repo risk reduction, and a rehearsal before touching the bigger repos.

---

## 1. The diagnosis

Your three repos are well above typical solo practice: attune has 212 frontend test files with property-invariant "laws" and evidence-tiered constant registries; Waypoint runs a dated analysis→decision chain with a supersession banner; LEGO has a 550-test offline suite where the 60-pieces-per-minute target is an executable assertion. Two failure modes recur across all three.

### Failure mode 1 — prose rules decay, machine rules hold

| Rule, and where it lives | What happened |
|---|---|
| "Include the Witchel check in PR descriptions" — attune `CLAUDE.md` | **Decayed.** Last use 2026-07-07; zero mentions in the ~65 PRs since (#279–#363) |
| "Keep the coach prompt and renderer in step" — attune `CLAUDE.md` | **Decayed to manual.** No parity test, though `test_sync_allowlist_parity.py` proves you know the pattern |
| "Ship when tsc/vitest/eslint pass" — Waypoint `CLAUDE.md` | **Partly fictional.** eslint is not in `ci.yml`; the gate is self-policed |
| "pytest must pass before any milestone is called done" — LEGO `CLAUDE.md:269` | **Self-reported.** ~29 commit bodies say "Full suite N green"; there is no CI at all |
| Dependency pin policy — `test_requirements_pins.py` | **Held** since PR #329 |
| Sync allowlist client/server parity — `test_sync_allowlist_parity.py` | **Held** since the silent-sync P0 |
| Plan-generator invariants P1–P12 — `property-invariants.test.ts` (P1–P5, P8, P9, P11, P12) and `phase2-volume-dosing.test.ts` (P6, P7, P10) | **Held.** Every publish is gated on them |

Seven rules, one clean split. This is the advisory-vs-deterministic distinction made empirical in your own repos.

### Failure mode 2 — the chain runs when work starts from a document, and breaks when it starts from chat

The pattern is *not* decay over time — I originally wrote it that way and the fact-checker proved it false. Within a single week in August, all four large initiatives ran differently:

- **Chained:** the running-plan audit (2026-08-18) produced an R0–R4 roadmap that shipped as PRs #306–#311 *the same day*. Earlier, `gap-closure-build-plan.md` (2026-07-07) drove PR-2…PR-11 over two days with G-tags in every subject.
- **Unchained:** Hyrox P0–P6 (#296–#305, Aug 16–17), PRD-101–110 (#312–#319, Aug 18 — the same day as the exemplary chain), and Adaptive engine 1–9 (#344–#352, Aug 26) each shipped with no plan doc committed *before* building. A retrospective record exists — `PLAN_GENERATOR_ALGORITHM.md` was updated in-flight to describe PRD-101/103 as-built, and Hyrox committed three docs of its own — but the initiative-level sequencing (which PR does what, in what order, why) exists nowhere.

The same split shows in the other repos. Waypoint's one archive pass (`51b5e57`, March 15) was exemplary and never repeated: 11 binary business documents still sit at the repo root and another 27 outside `Archive/`, none carrying a supersession marker, and the August pivot's own decision inputs were never committed — two decision records cite them clause-by-clause. LEGO's `CLAUDE.md` was maintained as-built through M8 (honest "(simulated)" annotations included), then froze on July 10 while 57 further commits built a phone/PWA product; the README still calls it "the full software specification" with "milestones (M1–M4)".

The dead-citation problem deserves its own line, because it is the largest single class: 16 references to four never-committed `BA_*` documents across `PROJECT_PLAN.md` and ADR 0001; the ADR's phantom `specs/terrain-descent-engine-v1/`; `deploy.yml:73` citing a Claude session plan file that no longer exists on disk. Also: three unrelated R-series and six restart-at-1 PR-numberings, which makes commit subjects ambiguous to any future session.

---

## 2. The six mechanisms

### M1 — The artifact chain, with a materiality threshold

*Every stage commits something the next stage reads; the chain of commits is the audit trail.*

```
docs/initiatives/
  README.md                     # registry: ID · name · status · PR range · artifacts
  017-hyrox-expert-loop/
    intent.md                   # before analysis
    analysis.md                 # optional; the research/audit the plan rests on
    plan.md                     # PR-numbered build plan
docs/archive/                   # superseded docs, stamped, in the same commit as their successor
```

**The threshold matters more than the folder.** You merged 15 PRs on 2026-08-26 alone; "a folder per initiative" without a boundary guarantees the rule breaks in a week. So: **a folder is required only when work is expected to span ≥3 PRs or ≥2 sessions, touches a deploy surface, or changes a locked decision.** Everything else needs nothing beyond its PR description.

**Two mechanisms, because M5 applies to this rule too.** A PR-template `Initiative:` field, plus a CI check that a PR touching `src/engines/**` or `api/**` names an existing ID in the registry. And a weekly scheduled workflow that opens an issue when a registry row is still `Open` while all its PRs have been merged for over a week — replacing "close out in the same session," which is not survivable on a 15-PR day.

IDs come from one global sequence per repo, ending the numbering collisions.

### M2 — Intent before analysis

A **one-pager**: problem, proposed outcome, affected parties, constraints, open questions. Template at `templates/intent-template.md`. The test of a good one is that someone could check the finished work against it.

### M3 — Standing instructions encoded once, and kept true

All three `CLAUDE.md` files currently contain falsehoods, so a fresh session starts from bad information. One-time regeneration each: commands, deploy topology, the conventions you actually practice. Fold in knowledge that today lives only in Python docstrings and YAML comments — the `run-coach-eval` label, `ATTUNE_PUBLISH_ENABLED`, the CRON_SECRET pairing, and the Vercel 12-function cap (which already has a canonical home as standing rule **D7** in `gap-closure-build-plan.md`, and is *live*: `api/` sits at exactly 12).

Then the self-healing rule, in each file: *any PR that changes commands, layout, deploy topology, or conventions updates this file in the same PR.* LEGO proves the mechanism works — ROADMAP phase markers got flipped in their shipping PRs because that was the doc being read; `CLAUDE.md` froze because it wasn't.

Plus portfolio skills in `.claude/skills/`: **`/recap`** (refresh stale state first, then goal in the requester's words, status *with evidence*, blocked-on-person vs blocked-on-technical, next steps each tagged `[Claude]` or `[Mike]`, no new work during a recap) and **`/adversary`** (M6). Both templates are shipped.

### M4 — Verification is mechanical, or it isn't verification

*"Every figure traces to a cited source" beats "check the numbers."*

Generalize your own best pattern — `test_sync_allowlist_parity.py`, born from a P0 and never regressed — to the contracts still held by prose:

- **Documents.** The source's own example is document verification, and dead citations are your largest documented failure class. Add a CI check that every path, PR, and ADR reference in a doc of record resolves. This is the cheapest high-value check in the proposal.
- **attune:** coach prompt ↔ markdown renderer. Note this needs a decision plus a source change, not just a test: the prompt lists `[!KEY] [!TIP] [!WARNING] [!ACTION]` as prose inside a system-prompt string, while the renderer deliberately accepts 13 aliases ("the model writes GitHub's vocabulary or ours; both land"). Strict equality fails on day one. The workable contract is **prompt ⊆ renderer**, and the item includes extracting the taught tokens into a named Python constant the prompt interpolates.
- **attune:** `onboarding-ground-truth.json` freshness — regenerate in CI, diff against committed. Pin `tsx` and add an npm script first; it is currently invoked via bare `npx` in the repo whose flagship guard exists because unpinned dependencies took production down twice in one night.
- **Waypoint:** the classifier prompt duplicated verbatim in `ai.ts` and `prompt-regression.mjs`, guarded only by a `// Must mirror` comment.
- **LEGO:** promote `tools/segment_parity.py` from manual script into pytest.

### M5 — Advisory vs deterministic

One test, applied to every control: **what happens if the agent forgets?** If the answer is "production breaks" or "a paying user sees it," it must be a required check, a hook, or a physical impossibility — not a sentence in CLAUDE.md. Everything else stays advisory, and honestly so. The concrete gates are in §3; they are not repeated here.

### M6 — Separation of duties: the producer never approves, and nothing leaves the desk unread

The source has two halves and I dropped one in the first draft. Restored: *the agent that produced the work has no route to approve it, **and** everything leaving the desk gets a second read even in a one-person workflow.*

1. **`/adversary` before human review.** A fresh-context subagent that has not seen the producing conversation attacks the diff for correctness and simplicity; the memo — findings, assumptions, design decisions, and the 2–4 spots to focus on — goes in the PR description so you read the hot spots instead of the diff cold. That is exactly what happened to this document, and it caught six things that would have broken production.
2. **Named-human sign-off, with an actual mechanism.** GitHub environments with required reviewers on deploy-touching workflows, so the gate is enforced by the platform rather than self-reported. For surfaces with no PR — App Store submission, the DDS/vendorization packet, payer-facing letters — a signed close-out line in the initiative folder naming what was approved and when. Anything touching paying users' money (`stripe-webhook`) or schema (migrations) is in scope.
3. **Branch protection as the mechanical second signer.** Solo, you cannot have a second human on every merge, but you can make the machine's verdict non-optional. Note this is *not* the second read the source means — the CI the producing session wrote is not independent of it.
4. **`/recap` at session boundaries**, so you re-enter with true state rather than the agent's narrative of it.

**The deviation, stated plainly:** if you keep Waypoint's auto-ship-on-green for mechanical changes (decision 3), that is producer self-approval without a second read. It is a defensible velocity trade, but it is a deliberate deviation from the source, not compliance with it. The boundary: user-facing behavior, money, schema, and anything leaving the desk go through the adversary memo and your read.

---

## 3. Per-repo plans

Gates first — they protect everything else. `[Mike]` marks what Claude cannot do.

### 3.1 attune.coach (source repo)

**Gates (≈5–6 sessions, not 3 — items 1 and 3 have an ordering dependency):**

1. **Run the Python suite on the revision that actually deploys.** Add `push: branches: [main, 'claude/*']` to `coach-eval.yml`'s triggers. Do *not* duplicate the job into `deploy.yml` — that file records a deliberate decision that Python tests "can never gate or interfere with the deploy pipeline," and the real gap is narrower: `coach-unit` runs on PRs but never on the squash-merge commit Vercel deploys. Add `npm run lint` to the `test` job (`tsc -b` already gates via `npm run build`; only eslint runs nowhere). Add a `pull_request:` trigger to `deploy.yml` so the `test` check exists on every PR, not only on `claude/*` branches.
2. **Fix the `workflow_dispatch` footgun correctly.** A manual dispatch from any branch currently publishes to production. The fix is to **drop the dispatch disjunct**, leaving `(github.ref == env.PUBLISH_REF || github.ref == 'refs/heads/main')`. Appending `&& github.ref == env.PUBLISH_REF` — what I proposed in the draft — would collapse the parenthesized condition at `deploy.yml:108–110` to PUBLISH_REF only, silently killing the `main` arm that the trunk migration depends on, as a skipped step in a green workflow.
3. **Gate the API deploy by ordering, not by polling.** Do not use a Vercel "Ignored Build Step" keyed on commit status: Vercel and Actions fire on the same push concurrently, so the check is *pending* when Vercel evaluates it, the build is skipped, and Vercel does not retry when it later turns green — leaving a silently stale API, the exact shape you want to avoid. Instead disconnect Vercel's production git auto-deploy and add a `deploy-api` job to `deploy.yml` with `needs: [test, coach-unit]` running `vercel deploy --prod`. Requires a `VERCEL_TOKEN` secret and a dashboard change `[Mike]`.
4. **Post-deploy alarm** (not a gate — it runs after the deploy): assert `attune.coach/version.json` and `/api/version` report the pushed SHA, with retry/backoff of at least five minutes for Pages propagation. Never a required check.
5. **Branch protection** `[Mike]` — requires the exact check-run names, which are display names: `test`, and `Coach harness — fixture honesty + assertions (keyless)` (not `coach-unit`). Do this *after* item 1, or PRs from non-`claude/*` branches deadlock on a check that never runs. Current protection state was not readable from this session; verify before relying on it.
6. **Prompt ↔ renderer parity**, per M4's note (decision + source change + test).

**Chain and record (≈2 sessions):** create `docs/initiatives/` and the registry; backfill stubs for the three unchained August initiatives while the commits are fresh; extract the D1–D8 locked decisions into ADRs 0002+; stamp `PROJECT_PLAN.md` SUPERSEDED and archive it (it prescribes tags and a CHANGELOG that have never existed — `git tag` is empty); flip the two design-doc "do not start coding until approved" headers; repair the 16 dead `BA_*` references and ADR 0001's `specs/` link; **replace** `deploy.yml:73`'s citation of a Claude session plan file with a two-paragraph cutover summary written from the file's own comments — the cited path no longer exists, so there is nothing to rescue; commit the expert-review exhibit generator and the running-audit reproduction harness.

**Standing instructions:** regenerate CLAUDE.md and the README (still the Vite template); add `.claude/skills/` and a settings allowlist; resolve the Witchel decision.

**Deferred, high risk (own initiative if approved):** the repo rename and trunk migration. The rename's real hazard is not the two things I first flagged — `ATTUNE_DEPLOY_TOKEN` pushes to a *different* repo and Vercel keys on repo ID. It is `scripts/airlock/index.html:97`, which strips `/Broken-Arrow-Training/` from legacy paths to carry old users' localStorage training history to attune.coach; a rename either 404s that origin or breaks the regex, and both are user-visible data loss. Also `vite.config.ts:31`'s fallback base path and `ios/README.md:151`'s documented API base. The trunk migration must be a *rename* (which retargets open PRs), sequenced: rename → update `PUBLISH_REF` → change Vercel's Production Branch `[Mike]`, or the API silently freezes on the old branch → verify both SHAs → re-apply protection.

### 3.2 Waypoint

**Gates (≈2 sessions):** add eslint to `ci.yml` so the self-merge rule's third gate exists; add a typecheck/test job for the five Edge Functions (`tsconfig.json` excludes `supabase/functions`, so they ship to production unchecked); make `prompt-regression.yml` fail red when its secrets are unset instead of `exit 0` — today "green" can mean "never ran" — and finish the QA-account ops item so it has ever actually run; one source of truth for the classifier prompt; a migration-drift guard asserting the highest applied migration ≥ the highest the code requires (commit `e0bdcdd` is the production bug this catches); delete `pages.yml`'s dead `dev` trigger. Before enabling branch protection, add a companion workflow with the inverse `paths-ignore` filter declaring a job of the same name that exits 0 — otherwise a docs-only PR blocks forever on a check that never runs.

**Record (≈2 sessions):** second archive pass (superseded PRD/persona binaries, `SETUP-FOR-CLAUDE-CODE.md` whose steps all completed in March, the 300KB session transcript after distilling an Entity-Navigation-Matrix spec; delete the byte-identical KB duplicate); `[Mike]` commit the missing August pivot inputs — Claude cannot commit files that do not exist; write the supersession rule and `Archive/README.md` bucket convention; four-line decision-record headers on `Roadmap/*.md`; markdown-first for documents of record; regenerate CLAUDE.md's five-months-stale structure section.

Note: Waypoint has **no** marked human-approval boundary today — the "provisioning I shouldn't stand up unsupervised" line I attributed to it in the draft is actually LEGO's `docs/ROADMAP.md` Phase 4b. So M6.2 would be the first such boundary here, not a continuation.

### 3.3 LEGO-Sorter

**Gates (1 session + one `[Mike]` toggle):**

1. Add the CI workflow running the offline suite on push and PR. **It does not gate the Render deploy on its own** — Render triggers on the push itself and never reads GitHub check status. To actually gate: set `autoDeploy: false` in `render.yaml` and fire Render's deploy hook from a workflow step that runs after the tests pass `[Mike]` for the dashboard/hook side. Without that, CI converts self-reported pytest into *observed* pytest, which is worth having but is not a gate.
2. Pin dependencies from an actual `pip freeze` of a working environment — all of them, not just `pulp`; `opencv-python-headless`, `flask`, `pillow` and `requests` are load-bearing and equally unpinned. (I dropped the draft's claim that pulp is already emitting deprecation warnings: it traces to nothing in the repo, and picking an upper bound from a guessed major is the exact mistake your own `api/requirements.txt` warns about.)
3. Pin **one** Python version and make all three agree: no version is pinned anywhere today, so "the tested interpreter" is undefined. The Dockerfile's 3.12 is not wrong — `CLAUDE.md`'s "3.11+" is a floor it satisfies. Set `.python-version`, the Dockerfile tag, and `setup-python` to the same value; fix the doc, not production.
4. **Fix the feeder pin at `HARDWARE_BUILD_GUIDE.md:248` only.** The guide has three D6 references and only that one is wrong — the other two correctly place the *belt* on D6. A blanket D6→D5 pass would put two motors on one pin, which is worse than the bug. Add a single pin table (D5 feeder / D6 belt / D9 gate / D10 escapement) sourced from the firmware, so three documents stop restating pins independently. Note a builder who followed Phase 3c as written already has a live pin collision.

**Record (1 session):** `HARDWARE_STATE.md` — which phases are physically built, which sketch revision is flashed, the actual tuned angle constants (`[Mike]` fills these; they exist only on the flashed board); a "current state" header on CLAUDE.md pointing at `docs/ROADMAP.md` as the live plan; fix README's "M1–M4" and "to be built"; flip the two dead status markers and say whether Path B is paused or superseded; resolve M4's ambiguity; `.env.example` drift (`APP_TOKEN` missing, `REBRICKABLE_API_KEY` unused); tag milestones for rollback.

---

## 4. Rollout

**Order:** gates → chain conventions → CLAUDE.md regeneration → rituals. Start with LEGO's gate session.

**`[Mike]` items** (each minutes, except where noted): branch-protection rulesets; Render's auto-deploy mode and deploy hook; Vercel's Production Branch and `VERCEL_TOKEN`; the QA account for Waypoint's regression secrets; committing Waypoint's missing pivot inputs; LEGO's tuned hardware constants; and the six decisions above.

**The check:** in 30 days, re-run the reader prompts that produced this document and diff — are the new initiatives' folders present, did any status header go stale, did any gate get bypassed? Schedule it as a trigger, not a memory item. The uplevel is working if the mechanisms, not your memory, caught what drifted.

---

## 5. What the adversarial review changed

Recorded because the audit trail is the point.

- **Killed a false narrative.** The draft claimed the doc→PR chain "worked through July, broke in August." The exemplary chain is itself from August 18 — the same day as one of the initiatives it was contrasted against. The real pattern is document-started vs chat-started work.
- **Caught four recommendations that would have broken production:** the one-line `workflow_dispatch` fix (would silently disable the `main` publish path), the Vercel Ignored Build Step (races CI, fails to a silently stale API), the blanket LEGO pin fix (two motors on one pin), and the repo rename (breaks the airlock's legacy-user migration path).
- **Corrected a causal claim:** the #327/#328 outages went through fresh dependency resolution at Vercel build time, not untested code — their own postmortem says "nothing in CI could have caught it." `test_requirements_pins.py` closed that hole.
- **Fixed a misattributed quotation** (LEGO's roadmap, not Waypoint's) in the very mechanism about recording approvals in artifacts.
- **Restored a dropped source clause** — "everything leaving the desk gets a second read" — and named the auto-ship carve-out as a deviation rather than compliance.
- **Gave the chain rules a threshold and a mechanism**, after the critic pointed out the draft prescribed prose conventions to cure a prose-convention failure, on a developer who merged 15 PRs in one day.
- Corrected counts and claims throughout: 11 root binaries not ~30, ~65 dead-Witchel PRs not 34, 16 dead `BA_*` references not four, three R-series and six restart-at-1 numberings, `tsc` already in CI, and dropped two figures (the pulp deprecation warning, the 8.7-second suite timing) that traced to nothing.

**Still unverified:** branch-protection state for `Broken-Arrow-Training` and `Waypoint` was not readable from this session, and two `[Mike]` items assume it is absent — check before acting. Witchel absence in PR *descriptions* is confirmed only for the squash-merged range (#317–#363); earlier merge commits do not carry PR bodies.

---

## Appendix A — What's already strong

- **Postmortem → permanent machine guard** (attune): the pin tests, the sync-parity test, `keep_files` after the blank-page P0. This is the house pattern; M4 only asks you to apply it before the incident.
- **Fixture honesty** (attune): keyless tests proving each eval fixture's claimed scenario actually appears in the built prompt — evals that cannot drift into testing nothing.
- **Budget-safe evals** (attune): `-m "not eval"` by default; live calls opt-in by label, never accidental. Decision 5 protects this.
- **Living plan-of-record with supersession** (Waypoint `ROADMAP.md`): version header, locked-decisions table, dated status log — the model for every repo's registry.
- **Executable spec with honest as-built annotations** (LEGO): "M8 done (simulated): 115.8 ppm… real-hardware figure awaits the physical feeder build" — exactly the evidence discipline `/recap` asks for.
- **Deploy provenance** (attune): SHA stamped through gh-pages commit → `version.json` → bundle → API. §3.1.4 just closes the loop automatically.

## Appendix B — Sources

- **Artifact-chain notes** (supplied 2026-08-29): commit-chain as audit trail; intent before analysis; standing instructions as versioned files; quantifiable verification targets; advisory vs deterministic controls with named-human sign-off; separation of duties, producer never approves, everything leaving the desk gets a second read.
- **Anthropic "How to Claude like Anthropic" newsletter** (screenshots supplied 2026-08-29): the `/recap` skill, described by Richard Zhuang, Engineer at Anthropic; the adversarial pre-review subagent, described by Dickson Tsai, who works on Claude Code at Anthropic.
- **Repo evidence:** eight structured reader reports and three adversarial critic reports over the four repos, 2026-08-29. The fact-checker verified 68 discrete claims, of which 48 held verbatim; the corrections are folded in above and summarized in §5.
