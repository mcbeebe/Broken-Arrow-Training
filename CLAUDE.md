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

## Coach chat formatting

**Bold and bullet lists are the house style** for coach replies — they're what the athlete
finds readable, and they are the default for advice, options, comparisons and multi-point
answers. Anything richer is an exception layered on top, never a replacement:

- **Callouts** (`> [!KEY]` / `[!TIP]` / `[!WARNING]` / `[!ACTION]`) — for the one sentence
  that matters most. Cap at two per reply; warnings only for real risk. A screen where
  everything is highlighted is the same as one where nothing is.
- **Tables** — rare. Only when every option is scored on the same 2–3 named dimensions and
  the grid carries meaning a list cannot. A comparison whose points differ per option is a
  bullet list.

The guidance lives in `api/coach/_core.py` (the chat system prompt); the renderer is
`src/utils/markdown.tsx`. Keep the two in step — the renderer supporting a syntax the
prompt never teaches is dead code, and the reverse prints raw markdown at the athlete.
