# Project preferences

## Workflow

- **Always open a pull request** after pushing a feature branch. Don't wait for the user to explicitly ask — opening the PR is part of "done" for any task that produces commits. This overrides the default "don't open a PR unless asked" behavior.

## Product / UX decisions

Apply the **Witchel 3-rule check** to any non-trivial product, UX, or framing decision — new features, refactors, narrative wording, prioritization, design proposals. Default to using this filter when answering "what should we do?" or "is this worth shipping?" questions.

The three rules (used in PRs #79–#84):

1. **Massive market** — does this matter to a meaningful share of paying users?
2. **Visceral solve** — does it remove a real-world friction the user feels today?
3. **Customer language** — does the surfacing use the words customers actually use (not engineering jargon)?

When proposing options, run them through the filter and show the check inline. If a proposal can't pass all three, simplify or cut it. Include the check explicitly in PR descriptions for any user-facing change.
