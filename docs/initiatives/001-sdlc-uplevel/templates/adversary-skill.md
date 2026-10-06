# Drop-in file: `.claude/skills/adversary/SKILL.md`

Copy this file to `.claude/skills/adversary/SKILL.md` in each repo. It encodes
the separation-of-duties rule: **the session that produced a change never
vouches for it** — a fresh-context subagent attacks it first, and its report
tells the human reviewer where to focus instead of reading the whole diff cold.

---

```markdown
---
name: adversary
description: Adversarial pre-review of a change before a human looks at it. Spawns a fresh-context subagent to attack the diff for correctness and simplicity, then produces a review memo naming the assumptions, design decisions, and the riskiest spots to focus on. Use before requesting review on any non-trivial PR, or when the user says "attack this", "pre-review", or "adversary".
---

# /adversary — attack the change before the human sees it

The point of this skill is that the reviewer must NOT share the producing
session's blind spots. Therefore:

## Step 1 — Spawn a fresh subagent that has NOT seen this conversation

Launch a subagent (Agent tool) whose prompt contains only:
- the diff (or PR number/branch to fetch it from), and
- this instruction, roughly: *"Adversarially review this change for
  correctness and simplicity. You are trying to find what's wrong with it,
  not to summarize it. For every suspicion, chase it to ground in the actual
  code — report only findings you verified, each with file:line and a
  concrete failure scenario. Then, separately, list the assumptions and
  design decisions the change embodies and why a reasonable person might
  choose differently. Do not soften findings."*

Do NOT paste your own reasoning, your plan, or your justifications into the
subagent's prompt. It gets the artifact, not the story. That independence is
the entire value.

## Step 2 — Write the review memo

Combine the subagent's verified findings with a plain statement (written by
you, the producing session) of the assumptions and design decisions you made
and why. The memo has four sections:

1. **What this change does** — two sentences, in product terms.
2. **Where to focus** — the 2–4 riskiest spots, each with file:line and why
   it's the risk (this is what saves the human from reading the diff cold).
3. **Adversarial findings** — what the attacker found, verified, with your
   response: fixed / disputed-because / accepted-risk-because. Fix what
   should be fixed *before* requesting human review.
4. **Assumptions & design decisions** — what you chose, what you rejected,
   and what new information would change the decision.

## Step 3 — Put the memo where the reviewer will look

Paste the memo into the PR description (or first comment) of the PR under
review. For changes without a PR, publish it as an artifact or commit it
under `docs/reviews/`. The memo is part of the change's audit trail: it
should be findable from the PR forever, not live only in chat scrollback.

## Rules

- Findings the attacker raises are fixed or answered — never silently
  dropped. "Fixed in <commit>" or a stated reason, per finding.
- If the attacker finds nothing, say so plainly; do not invent findings.
- The producing session never marks its own change "reviewed", and never
  approves it. This skill prepares review; **a human approves.** Approval is
  not delegable to an agent — including to this one, and including to the CI
  the producing session wrote.
- Where a project deliberately auto-ships some class of change without this
  memo (a velocity trade), that carve-out is named in its CLAUDE.md with an
  explicit boundary — user-facing behavior, money, schema, and anything
  leaving the desk stay on this path.
```
