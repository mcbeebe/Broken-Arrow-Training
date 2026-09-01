# Coach Feature — Improvement Brief (Daily Insight Focus)

**App:** Broken-Arrow-Training (attune.coach) · **Branch base:** `claude/broken-arrow-training-app-P4N1p`
**Author:** prepared from a code review of `api/coach/*` + `src/` against the 7-company AI-coaching competitive analysis
**Status:** recommendations only — not yet implemented · **Version:** 1.0
**Intended home:** `docs/coach-improvement-brief.md` (apply via Claude Code)

---

## 0. Context & scope

This brief maps the best practices from the competitive analysis (Strava, WHOOP, Oura, Google/Fitbit,
Peloton, Garmin, Runna) onto the **existing** Coach implementation. The priority surface is the
**proactive daily insight** (`api/coach/insight.py`, surface `daily`). It is a *gap analysis*, not a rebuild —
the system is already strong.

Each recommendation is written so it can be executed directly: research basis → current state (with
file refs) → proposed change → acceptance criteria → Witchel 3-rule check → effort.

---

## 1. What the code already does well (do NOT redo)

| Best practice (from analysis) | Where it already lives |
|---|---|
| **Derive metrics before prompting** (never feed raw streams) | `build_context_block` (`_core.py:1277`); friendly names Fitness/Fatigue/Recovery Balance/Load Ratio |
| **Math in code, not the LLM** (for PRs) | `PR_STATUS` precomputed `_core.py` ~1604–1704; "sole authority" rules `_core.py:409–415` |
| **Hard anti-hallucination floor** | "If unsure, say nothing… untraceable numbers are a hard failure" `_core.py:407` |
| **Cost/latency model routing** | Haiku→Sonnet on playful persona / PR days / debrief (`insight.py`; `pick_model` `_core.py:2030`) |
| **Caching + explainability + memory** | KV cache w/ force-regen (`insight.py`); "Triggered by:" chip; learning-ack loop |
| **Evidence attribution** | `why` surface requires real citation or `web_search`, never invented (`insight.py`; `_core.py:574–621`) |

**Implication:** the work below is additive hardening, concentrated on *evaluation* and *binding the
deterministic engine to the narration* — the two areas the analysis flagged as the durable moat.

---

## 2. Recommendations (prioritized)

### R1 — Behavioral eval harness for the coach's OUTPUT  *(highest value)*

- **Research basis:** "Evaluation is the moat." Google's SHARP rubric (Safety, Helpfulness, Accuracy,
  Relevance, Personalization) with large-scale graded cases is the hardest thing for competitors to copy.
- **Current state:** `src/__tests__/` is thorough but covers the **engine** (`readiness.test.ts`,
  `trimp.test.ts`, descent/terrain engines) and **cache mechanics** (`coachInsightCache.test.ts`).
  Nothing asserts the **LLM reply** behaves. A prompt edit can silently regress safety with no failing test.
- **Proposed change:** add a SHARP-lite golden-case suite.
  - ~12 frozen snapshot fixtures: RED-overtrained, GREEN-taper, `PR_STATUS:NO`, `PR_STATUS:YES`,
    injury note in journal, "can I add a hard session", NO-BASELINE, 5+ consecutive RED, persona=Funny,
    persona=Data-Nerd, missing-data/empty snapshot, evening wrap-up.
  - For each: build the real `system` + `context_block`, call the model once, assert on the output.
  - **Assertions (the rubric):** never contradicts the readiness directive (see R2); never asserts a
    PR/"faster"/delta when `PR_STATUS:NO|NO BASELINE|TIE`; always defers to a professional when injury
    language is present; emits exactly one valid `Triggered by:` line < 60 chars; stays within length;
    respects persona (non-flat voice).
  - Phase-1 assertions are deterministic (regex/string). Add an **LLM-as-judge** autorater later for
    Helpfulness/Relevance scoring (Peloton blends human + LLM scoring).
  - Gate in CI as a separate, opt-in job (needs an API key + small budget); keep it out of the fast unit path.
- **Acceptance criteria:** suite runs green on current prompt; flipping a snapshot to RED and asserting a
  "go hard" reply makes it fail; documented `npm run test:coach-eval`.
- **Witchel check:** Massive market ✅ (protects every athlete on the most-seen surface) · Visceral solve ✅
  (kills "it said I PR'd when I didn't / go hard on a red day") · Customer language ✅ (assertions encode
  athlete-facing failures). **Passes.**
- **Effort:** M (fixtures + harness + CI wiring). Highest leverage per hour.

### R2 — Make the readiness decision a BINDING directive (like PR_STATUS)

- **Research basis:** human-authored safety floor the AI adapts *within* (Runna/Garmin); enforce in code,
  don't ask the model nicely.
- **Current state:** engine computes `ReadinessResult.status` + `suggestDailyAdjustment(...)`
  (`src/types/index.ts:446,461–465`; `src/utils/readiness.ts`) and `readiness` rides in the snapshot
  (`useCoachInsight.ts:80–89`; read at `build_context_block`). But unlike `PR_STATUS` there is **no
  hard "this is the sole authority on today's workout disposition; never prescribe harder than this" rule** —
  so the narration can drift from the deterministic call.
- **Proposed change:** render a `READINESS_DIRECTIVE:` line in `build_context_block`, derived straight from
  the engine (status + the `suggestDailyAdjustment` string + e.g. `MAX_INTENSITY: easy|moderate|hard`),
  and add a hard-rule block parallel to `PR_STATUS` (`_core.py:409–415`): the coach explains the directive,
  never contradicts it, and if the athlete asks to exceed it, holds the line.
- **Acceptance criteria:** an R1 RED fixture asserts the reply never recommends a session above the
  directive's max intensity; YELLOW reduces; GREEN proceeds.
- **Witchel check:** Massive market ✅ · Visceral solve ✅ (prevents the most dangerous failure mode) ·
  Customer language ✅. **Passes.**
- **Effort:** S–M.

### R3 — Deterministic output validator (retire the costly PR Sonnet-bump)

- **Research basis:** guard the *output*, not just the prompt; LLMs are unreliable at arithmetic.
- **Current state:** PR days force Haiku→Sonnet (`insight.py`, the `"PR_STATUS:" in context_block` branch)
  because Haiku ignores the directive — a real per-call cost.
- **Proposed change:** post-generation validator that scans the reply for PR/"faster"/delta claims
  inconsistent with the `PR_STATUS` line (and, once R2 lands, intensity claims above the readiness
  directive). On violation: strip the offending clause or regenerate once. Then drop the unconditional
  Sonnet bump and let routing be persona-driven again → keeps Haiku cheap *and* closes the hole regardless
  of model.
- **Acceptance criteria:** with model pinned to Haiku, the `PR_STATUS:NO` fixture never emits a PR claim
  (validated/regenerated); cost telemetry shows fewer Sonnet calls on PR days.
- **Witchel check:** Massive market ✅ · Visceral solve ✅ · Customer language ✅. **Passes.**
- **Effort:** S–M. (Sequence AFTER R1 so the harness proves it.)

### R4 — Model bump (one line)

- **Current state:** `_core.py:27` `SONNET_MODEL = ...,"claude-sonnet-4-5"`. Haiku `claude-haiku-4-5` is current.
- **Proposed change:** set `ANTHROPIC_SONNET_MODEL=claude-sonnet-4-6` (env, no code change) — better literal
  instruction-following on exactly the PR/debrief surfaces you bump Sonnet for. Verify via R1 before/after.
- **Effort:** XS. Quick win; do behind the R1 harness so you can measure it.

### R5 — Promote the injury / overtraining floor from advisory to enforced

- **Research basis:** the analysis's exercise-prescription caution + human-authored floor — the riskiest
  rules shouldn't depend on the model complying.
- **Current state:** `INJURY_RE` (`_core.py:1995`, used in `pick_model` `:2051`) and the
  "5+ consecutive RED → deload + medical flag" concept (`_core.py:709`) exist but are prompt/advisory.
- **Proposed change:** when `INJURY_RE` matches the athlete's note OR status has been RED ≥5 days, set a
  code-level disposition that (a) suppresses any "add/harden" proposal and (b) surfaces a
  defer-to-professional note — independent of the LLM's text.
- **Acceptance criteria:** injury-note and 5-RED fixtures (R1) always carry the safe disposition.
- **Witchel check:** Massive market ⚠️ (rarer events) · Visceral solve ✅ · Customer language ✅.
  **Borderline on rule 1 — ship as a guardrail, keep it lightweight.**
- **Effort:** S.

---

## 3. Suggested sequence

1. **R4** (1 line, measurable once R1 exists)
2. **R2** (binding readiness — biggest safety lever)
3. **R1** (eval harness — locks in everything after)
4. **R3** (validator — proven by R1, cuts cost)
5. **R5** (enforced floor)

> Pragmatic alternative: do **R1 first** if you want the safety net in place before touching prompts/models,
> then R2→R4→R3→R5. Either order is defensible; R1 + R2 are the two that matter most.

---

## 4. Delivery (when greenlit)

On approval, each item ships as: a feature branch off
`claude/broken-arrow-training-app-P4N1p`, a patch, and a PR description that includes the inline Witchel
3-rule check (per `CLAUDE.md`) and opens the PR automatically (per `CLAUDE.md` workflow rule). Tests green
before "done."

---

*Cross-reference: companion competitive analysis (Word report + Excel matrix) for the underlying evidence
on derive-then-prompt, math-in-code, SHARP-style evaluation, and human-authored safety floors.*
