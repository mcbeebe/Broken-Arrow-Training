---
name: adversary
description: Adversarial pre-review of a change before a human looks at it. Spawns a fresh-context subagent to attack the diff for correctness and simplicity, then produces a review memo naming the assumptions, design decisions, and the riskiest spots to focus on. Use before requesting review on any non-trivial PR, or when the user says "attack this", "pre-review", or "adversary".
---

# /adversary — attack the change before the human sees it

The point of this skill is that the reviewer must NOT share the producing
session's blind spots.

## Step 1 — Spawn a fresh subagent that has NOT seen this conversation

Launch a subagent whose prompt contains only:

- the diff (or the PR number / branch to fetch it from), and
- roughly this instruction: *"Adversarially review this change for correctness
  and simplicity. You are trying to find what's wrong with it, not to
  summarize it. For every suspicion, chase it to ground in the actual code —
  report only findings you verified, each with file:line and a concrete
  failure scenario. Then, separately, list the assumptions and design
  decisions the change embodies, and why a reasonable person might choose
  differently. Do not soften findings."*

Do NOT paste your own reasoning, plan, or justifications into the subagent's
prompt. It gets the artifact, not the story. That independence is the whole
value.

For anything touching the areas below, say so in the prompt and ask the
reviewer to check them specifically — each has drawn real production
incidents here:

- **`api/requirements.txt`** — Vercel installs fresh on every build, so the
  pins *are* the deployment. Both directions have broken production: an
  unpinned floor let a new major ship itself, and a guessed upper bound
  silently downgraded a package.
- **Anything spanning `src/` and `api/`** — the sync allowlist drifted apart
  once and failed silently for weeks.
- **The publish conditionals in `.github/workflows/deploy.yml`** — a change
  here fails as a *skipped step inside a green workflow*, which no test
  catches.
- **The coach system prompt and `src/utils/markdown.tsx`** — the prompt must
  only teach syntax the renderer parses.

## Step 2 — Write the review memo

Combine the subagent's verified findings with a plain statement — written by
you, the producing session — of the assumptions and design decisions you made
and why. Four sections:

1. **What this change does** — two sentences, in product terms.
2. **Where to focus** — the 2–4 riskiest spots, each with file:line and why.
   This is what saves the human from reading the diff cold.
3. **Adversarial findings** — verified findings, each with your response:
   fixed / disputed-because / accepted-risk-because. Fix what should be fixed
   *before* requesting human review.
4. **Assumptions & design decisions** — what you chose, what you rejected, and
   what new information would change the decision.

## Step 3 — Put the memo where the reviewer will look

Paste it into the PR description or first comment. It is part of the change's
audit trail: findable from the PR forever, not living only in chat scrollback.

## Rules

- Findings are fixed or answered, never silently dropped — "Fixed in
  `<commit>`" or a stated reason, per finding.
- If the attacker finds nothing, say so plainly; do not invent findings.
- The producing session never marks its own change reviewed, and never
  approves it. This skill prepares review; **a human approves.** Approval is
  not delegable to an agent — including to this one, and including to the CI
  the producing session wrote.
