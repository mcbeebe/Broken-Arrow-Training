# Drop-in file: `docs/initiatives/<ID>-<slug>/intent.md`

Write this BEFORE any analysis, plan, or code. **One page, five sections** —
if it runs longer, the thinking belongs in `analysis.md`, not here. Its job is
to stop the analysis from drifting away from the actual question, and to let
any future session (or any reviewer) check the final work against what was
originally asked. Commit it as the first artifact of the initiative; every
later artifact in the folder links back to it.

Required only when the work is expected to span **≥3 PRs or ≥2 sessions,
touches a deploy surface, or changes a locked decision.** Below that bar, the
PR description is the record and no folder is needed.

`<ID>` comes from the initiative registry (`docs/initiatives/README.md`) —
one global sequence per repo, so numbering never collides again.

---

```markdown
# <ID> — <short name>

**Date:** YYYY-MM-DD · **Status:** Open | Shipped (PRs #a–#b) | Superseded by <ID>
**Artifacts:** intent.md (this) → [analysis.md] → [plan.md] → [PRs #a–#b] → [close-out]

## Problem
What is actually wrong or missing, in one or two sentences. The observed
symptom, not the presumed solution. If a field incident triggered this, name
it.

## Proposed outcome
What will be true when this is done — stated so that someone could check it.
"Users at altitude get dampened intensity targets" is checkable;
"improve altitude handling" is not.

## Affected parties / surfaces
Who and what this touches: which users, which engines/modules, which deploy
surfaces (app, API, worker, docs), which other initiatives.

## Constraints
The boundaries the solution must respect: budget caps, plan limits (e.g.
Vercel Hobby's 12-function cap), locked prior decisions (link the ADR),
timelines, don't-break contracts.

## Open questions
What is genuinely undecided going in — each phrased as a question. When one
gets answered during the work, record the answer here (or in an ADR if it's
an architectural decision) rather than only in chat.
```

---

## Close-out rule

When the last PR of the initiative merges:

1. Flip **Status** to `Shipped (PRs #a–#b)` here and in the registry row.
2. Append one line per shipped item to the plan: `Shipped: PR #NNN (date)`.
3. If the work invalidated any standing doc, either update it or stamp it
   `SUPERSEDED — see <successor>` at the top and move it to `docs/archive/`.

**Do not rely on remembering.** A weekly scheduled workflow should open an
issue whenever a registry row is still `Open` while every PR it names has been
merged for more than a week — "close it out in the same session" is not
survivable on a fifteen-PR day, which is why this loop kept dying before.
