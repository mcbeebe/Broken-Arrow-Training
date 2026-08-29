# 002 — eslint to zero, then make it a required gate

**Date:** 2026-08-29 · **Status:** Open
**Artifacts:** intent.md (this) → one or more PRs → the gate lands in the PR
that reaches zero

## Problem

`npm run lint` is defined in `package.json` and configured in
`eslint.config.js`, but no workflow has ever run it. As of 2026-08-29 it
reports **43 errors and 11 warnings**. So linting is not merely ungated — it
has silently drifted for the life of the project.

Wiring it into `deploy.yml`'s `test` job today would make a required check red
on arrival, which is why initiative 001 deliberately left it out and left a
note at the call site instead.

Errors by rule:

| Rule | Count | Character |
|---|---|---|
| `react-hooks/exhaustive-deps` | 9 | Mechanical, but each needs a judgment call about intent |
| `@typescript-eslint/no-unused-vars` | 8 | Mostly `_`-prefixed args; a config `argsIgnorePattern` legitimately clears several |
| `@typescript-eslint/no-explicit-any` | 8 | Real typing debt |
| `@typescript-eslint/no-unused-expressions` | 6 | All in `src/utils/trimp.ts:301–306`; looks like a deliberate pattern, needs reading before touching |
| `react-hooks/set-state-in-effect` | 5 | Render-loop risk |
| `react-refresh/only-export-components` | 4 | Dev-experience only |
| `prefer-const` | 3 | Trivially safe |
| **`react-hooks/rules-of-hooks`** | **2** | **Genuine bug risk — a hook called conditionally or out of order** |
| `react-hooks/preserve-manual-memoization` | 2 | |
| `no-empty` | 2 | Trivially safe |

## Proposed outcome

`npm run lint` exits zero, and the `test` job in `deploy.yml` runs it as a
blocking step — added in the same PR that reaches zero, never before.

## Affected parties / surfaces

Touches core engine files (`src/utils/trimp.ts` is the TRIMP/MIM engine) and
React components. The 212-file vitest suite is the safety net, but it does not
cover every render path, so hook-ordering fixes deserve a manual check in the
running app.

## Constraints

- **Behavior-preserving only.** No fix here may change plan output. The golden
  snapshots and property-invariant laws must stay green without being updated.
- Do not suppress with blanket `eslint-disable` to reach zero. A legitimate
  config change (such as `argsIgnorePattern: '^_'` for deliberately unused
  args) is fine and is a real fix; a file-level disable is not.
- The two `rules-of-hooks` errors are read first, not batched with the
  mechanical ones — they may be real bugs rather than lint noise.

## Open questions

- Do the six `no-unused-expressions` in `trimp.ts` encode something
  intentional (assertion-style expressions?) or are they dead lines?
- Should this be one PR or three (trivial / typing / hooks)? Three is safer
  and matches the threshold in the registry; one is faster.
- Should `tsconfig` strictness be raised in the same initiative? Out of scope
  as written — flag if the typing work makes it cheap.
