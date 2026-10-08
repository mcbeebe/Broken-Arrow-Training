# 003 — Kickoff prompts for Claude Code

Paste one prompt per session, in order. Each session does one PR and stops.
Start each in a fresh Claude Code session on this repo, from the publishing
branch (`claude/broken-arrow-training-app-P4N1p`) after the previous PR has merged.

---

## Session 1 — PR 1: move the app to /app/

```
Initiative 003: public landing page at attune.coach, app moves to /app/.

Read, in this order, before touching anything:
1. CLAUDE.md
2. docs/initiatives/003-landing-page/intent.md
3. docs/initiatives/003-landing-page/analysis.md
4. docs/initiatives/003-landing-page/plan.md (Decisions, then PR 1)
5. docs/initiatives/003-landing-page/design-spec.md § Legacy entry guard

Build PR 1 exactly as plan.md describes, nothing from later PRs. PR 1 is
frontend-only: do not touch api/ (push URLs and app_url() are PR 2, which
waits until PR 1 is live). Line numbers in analysis.md are from commit
ee48584; re-grep before editing.

Before writing code, list every file you will change and anything in the plan
that no longer matches the code, and stop for my OK if anything doesn't match.

Rules:
- Tests first for legacyEntry.ts (table-driven, every case in plan.md), then the code.
- JSDoc on every exported function. TypeScript, no `any`.
- All gates green locally: npm run lint, npm test, TZ=Pacific/Kiritimati npm test,
  npm run build, node scripts/deploy/check-site-layout.mjs,
  pytest -m "not eval" api/coach/tests scripts/deploy/tests.
- Verify in `npm run build && npx vite preview`: / forwards to /app/;
  /?view=coach#mike lands on /app/?view=coach#mike; /tools/heat.html works.
  Paste the results in the PR.
- Airlock: TARGET stays the bare origin (it is the postMessage origin check);
  add APP_PATH for the navigation URLs.
- Update CLAUDE.md in the same PR (layout, deploy topology, the two stale lines
  analysis.md names).
- Open the PR, run /adversary, put its memo in the PR description.
- In the PR description, list the owner action: run smoke steps 1–7 in
  plan.md after deploy, and only then merge PR 2.
```

## Session 2 — PR 2: backend (start only after PR 1 is live and smoke steps 1–7 passed)

```
Initiative 003, PR 2. First confirm with me that PR 1 is live and smoke steps
1–7 passed; if not, stop. Then read CLAUDE.md, docs/initiatives/003-landing-page/
intent.md, analysis.md § The request-access endpoint, and plan.md § PR 2.

Build PR 2 exactly as described: fix the queue-wipe bug first, then the error
contract (KV network errors → 503, not 500), honeypot hp_contact_ref,
the atomic per-IP throttle, the admin-email cap, source, the /app/ push and
app_url changes, and the airlock's move to /app/ (plan.md D12: TARGET stays the
bare origin; add APP_PATH for the navigation URLs). Keep 400 for a bad email and 200 for an already-approved one.
Write api/coach/tests/test_access_request.py first (every case in plan.md;
mock KV and email), then the code. Never store a raw IP.

Gates: pytest -m "not eval" api/coach/tests scripts/deploy/tests, plus the
frontend gates (only scripts/airlock/ changes on the frontend). Open the PR, run /adversary,
include its memo. In the PR description, tell the owner to set
ACCESS_REQUEST_SALT on Vercel, and to change APP_URL to https://attune.coach/app
if it is set there.
```

## Session 3 — PR 3: the landing page (static), behind the switch

```
Initiative 003, PR 3. Read CLAUDE.md, then everything in
docs/initiatives/003-landing-page/: intent, plan (Decisions and PR 3),
design-spec, copy, tokens.json, and reference/README.md. Open
reference/A2-Signal-desktop.jpg and reference/A2-phone.jpg and look at them.

Build PR 3 exactly as described: every section rendered in its default state,
the invite form fully wired, interactions left for PR 4. Copy comes only from
copy.md, through src/landing/content.ts. Colors only from tokens.json, through
src/landing/tokens.ts and a `landing-*` Tailwind namespace. Do not import app
code, recharts or cesium into src/landing (add the eslint rule and the
build-manifest budget). Never edit public/favicon.svg; the landing mark is
public/attune-mark.svg.

Write claims.test.ts so the page's methods (by id), HYROX divisions, coach
traits (exact labels, count 17, default name, max length 30), cardio options and
fitness block numbers are checked against the code, not hard-coded. Export the
small constants plan.md names if they aren't exported yet.

Gates as in PR 1, plus the 90 KB budget. Run VITE_LANDING_ENABLED=true npm run
dev, screenshot at 390 and 1280 px, compare with the reference images, fix
differences, and attach the screenshots to the PR. Production must not change
(the switch is off). /adversary memo in the PR.
```

## Session 4 — PR 4: interactions

```
Initiative 003, PR 4. Read CLAUDE.md, then docs/initiatives/003-landing-page/
plan.md § PR 4, design-spec.md § Shared state and § Components, and
reference/README.md.

Port reference/interaction_tests.cjs to vitest + Testing Library first (15 of
its 19 cases apply; plan.md says which don't), add the extra cases plan.md lists, then implement until they
pass. Keyboard-check every control. Screenshots of each tab and both chart
modes in the PR. /adversary memo in the PR.
```

## Session 5 — PR 5: go live

```
Initiative 003, PR 5. Read CLAUDE.md, then docs/initiatives/003-landing-page/
plan.md § PR 5 and § Smoke checklist, and design-spec.md § SEO and sharing.

(As run, 2026-10-07: the founder quote shipped in PR 4b, and the owner chose
to go live before the legal text, so PR 5 shipped without it and PR 5b adds
privacy.html and terms.html. For PR 5b, ask me for the privacy policy text and
the terms text. Do not write policy text yourself.)

Build PR 5. After it merges, walk me through setting
vars.ATTUNE_LANDING_ENABLED='true' and dispatching deploy.yml on the
publishing branch, then the smoke checklist one line at a time. Record the Lighthouse mobile scores in the PR.
Finish the close-out: registry row 003 → Shipped with PR numbers, plan.md stamped.
```
