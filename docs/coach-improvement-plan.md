# Coach Improvement Plan — R1–R8 (brief + science/personalization deepening)

> **Status: AS-BUILT (shipped).** This is the implementation plan that was executed.
> Original input brief: [`./coach-improvement-brief.md`](./coach-improvement-brief.md).
> The work merged as: #197 (R4 model bump), #198 (R1 eval harness), #200 (R2
> readiness directive), #201 (R3 output validator), #202 (R5 safety floor),
> #203 (R7 athlete profile), #204 (R6 knowledge modules), #206 (R8 engine
> tuning), #208 (R6 verified citations). A separate deploy hotfix (#207)
> followed — see below.
>
> **Corrections discovered during implementation** (the plan below predates them):
> - **File:line numbers are stale.** The plan was drafted against the
>   `feat/plan-builder-engine` branch; the PRs targeted `main`, where everything
>   sits at different lines. Re-anchor against the merged code, not these numbers.
> - **`Triggered by:` IS a real output contract** on the daily surface
>   (`insight.py` `SURFACE_INSTRUCTIONS`) — R1 asserts it. (The plan's R1 said to
>   drop it.)
> - **`ping.py` does not exist** on `main` — the R3/R6 items referencing it were N/A.
> - **R6 shipped citation-free first, then verified** — the science modules
>   landed as principles (#204), and the 9 domain citations were verified against
>   primary sources and baked in as a follow-up (#208). No fabricated citations.
> - **Deploy hotfix (#207, not in the original plan):** the morning-briefing
>   feature's hourly Vercel cron + a 13th serverless function broke deploys on
>   the Hobby plan. Fixed by moving the cron to a GitHub Actions hourly trigger,
>   folding `scheduled_push.py` into `push.py`, and `.vercelignore`-ing the eval
>   test files (which Vercel was counting as functions).

## Context
Two inputs drive this plan:
1. `coach-improvement-brief.md` — a gap analysis vs. a 7-company AI-coaching study, proposing 5
   additive hardenings (R1–R5) on the daily-insight surface, centered on *binding the
   deterministic engine to the LLM narration* and adding the first automated test of the coach's
   *output*.
2. The user's added goal: the coach must be **deeply grounded in running/training science** and
   **adapted to each individual (age, ability, injury, goals)**. This adds R6–R8.

Every claim was verified against the code by Explore + Plan agents; **the brief's concepts are
accurate but its line numbers are stale** — this plan uses corrected numbers. Corrections worth
knowing: `Triggered by:` is **not** a real output contract (drop that R1 assertion); readiness has
**4** statuses (PEAK/GREEN/YELLOW/RED); R5 needs **no** frontend change in v1 (trigger on
`trainingState == "D"`); `ping.py` is a **third** prompt surface the brief missed.

**Scope decisions (from the user):**
- **Deepen the current setup** — do NOT build multi-athlete onboarding/per-user generalization;
  the app stays effectively single-athlete with a hardcoded plan. Make personalization structured,
  bound, and engine-adaptive for the current app.
- **Directive + engine now** — both bind a coaching directive the LLM adapts within AND retune the
  deterministic readiness/ACWR/progression math by age/experience.
- **Ship as one PR per item** (8 PRs total).

**Outcome:** a coach that is safer and more consistent (won't bless hard work on a low day, won't
claim a PR that didn't happen, defers on injury), measurably grounded in verified science, and
tailored to the individual — all locked in by the first eval of the LLM's behavior.

## Branch base & delivery
- Every PR branches off **`claude/broken-arrow-training-app-P4N1p`** (repo main), per the brief —
  NOT the current `feat/plan-builder-engine`.
- Each PR body carries the inline Witchel 3-rule check and is opened automatically (per `CLAUDE.md`).
  Tests green before "done." "PR N" below = execution order; "RX" = the source label.

## Sequence (dependency-honoring)
**R4 → R1 → R2 → R3 → R5 → R7 → R6 → R8.**
Why this order: R4 (1-liner) puts the stronger model under every later prompt rule. R1 lands the
eval net first so each later PR extends it. R2/R3/R5 are the brief's guardrails. **R7** adds the
structured profile (and lights up R6's profile-gated knowledge). **R6** deepens science and reuses
**R3's** output-validator for citation-grounding (so R3 precedes it). **R8** retunes validated math
last, depending on **R6** (the science basis) and **R7** (the profile fields it reads).

## Behavior-change summary (what users notice)
| PR | Changes the chat / app? | Effect |
|---|---|---|
| R4 | Subtle | Newer Sonnet voice on escalated turns |
| R1 | No | Dev/CI only (~$0.10/live run) |
| R2 | **Yes — largest of brief** | Won't greenlight hard work on low-readiness days; holds the line; more rigid |
| R3 | **Yes** | Fewer false PR claims (clause stripped / 1 regen); PR-day prose reverts to Haiku |
| R5 | Yes | More conservative on injury / State-D days; gentle defer-to-pro note |
| R7 | Yes (after profile filled) | Advice adapts to age/experience/injury; conservative lean for masters/beginner/injured |
| R6 | Yes (quality) | Deeper, better-cited, topic-relevant science; pings cheaper; tailored knowledge per athlete |
| R8 | **Yes — changes the readiness *numbers*** | Masters/beginners hit YELLOW/RED & deload sooner. Gated behind profile data → **no change until filled in** |

---

## R4 — Sonnet model bump  *(XS)*
- **Code:** `_core.py:27` default `"claude-sonnet-4-5"` ⇒ `"claude-sonnet-4-6"`. `COST_TABLE`
  (`_core.py:30-33`) auto-tracks via the `SONNET_MODEL` var.
- **Out-of-repo (USER):** set `ANTHROPIC_SONNET_MODEL=claude-sonnet-4-6` in **Vercel** env (Prod +
  Preview) — runtime env lives there, not the repo.
- **Acceptance:** an escalated turn logs `model=claude-sonnet-4-6` (`log_llm_call` `_core.py:1677`).

## R1 — Behavioral eval harness  *(M, highest leverage)*
First automated test of what the coach *says*. **Net-new** (no Python test infra today).
- **Bootstrap:** `api/coach/tests/eval/` (`conftest.py`, `harness.py`, `assertions.py`,
  `test_coach_report_card.py`, `fixtures/*.json`); `pytest.ini` at root with `addopts = -m "not eval"`
  so a stray `pytest` spends nothing; `api/requirements-dev.txt` (`pytest>=8.0`); empty
  `api/__init__.py` + `api/coach/__init__.py` (smoke-test one Vercel endpoint after; `_core.py` has
  zero import-time side effects). Fallback: `sys.path` shim in conftest (no `api/` change).
- **Harness** mirrors the real `daily` surface (`insight.py:117-181`): `build_system_prompt`
  (`_core.py:782`, `lite_knowledge=True`) + `build_context_block` (`_core.py:918`) +
  `SURFACE_INSTRUCTIONS["daily"]` (`insight.py:30`) + the model picker (`insight.py:150-164`) +
  `call_anthropic` (`max_tokens=400`, `temperature=0.0`, `athlete_id=None`).
- **12 fixtures + 1 negative control**, each a frozen `CoachSnapshot` (`types/index.ts:710-778`) +
  an `_expect` block; scenarios produced by *real* fields (e.g. injury text in `recentSoreness`,
  which renders at `_core.py:1312`, not `actual.notes` which doesn't): `red_overtrained, green_taper,
  pr_status_no, pr_status_yes, injury_note, add_hard_session, no_baseline, five_consecutive_red,
  persona_funny, persona_data_nerd, missing_data_empty, evening_wrapup`, + `neg_control_red_gohard`.
- **Assertions** (deterministic, behavioral, tolerant): no PR language when `PR_STATUS != YES`
  (mirror the banner list `_core.py:1216`); defer-to-pro on injury; no "go hard" on RED/State-D;
  length bound; ≤1 `proposal` block; persona non-flat; `assert_context_has_pr_status` honesty guard.
  **Omit `Triggered by:`** (not a real contract). **Stub the `readiness_directive` assertion** until
  R2 defines it.
- **Negative control** proves the rubric bites two ways: a cheap unit test asserting
  `assert_no_go_hard("…go hard…🔥")` *raises* (no API), plus a live RED+demanding fixture.
- **Scripts/CI:** `package.json` → `"test:coach-eval": "pytest -m eval api/coach/tests/eval"`; new
  **opt-in** `coach-eval` job in `deploy.yml` (trigger: `workflow_dispatch` or `run-coach-eval`
  label; Python 3.12; `ANTHROPIC_API_KEY` secret; `continue-on-error: true`; **not** in
  `build-and-deploy`'s `needs`). Optional `pytest-recording` cassettes: CI runs live (the real
  signal), local/PR replays free; refresh when `INSIGHT_PROMPT_VERSION` (`_core.py:126`) bumps.
- Phase-2 LLM-as-judge (SHARP Helpfulness/Relevance/**Accuracy**/**Personalization**) sketched only.

## R2 — Binding readiness directive  *(S–M, biggest brief safety lever)*
Make the readiness call the *sole authority* on intensity, like PR_STATUS is for PRs.
- **Derive `MAX_INTENSITY` in Python** (snapshot already carries `status`+`trainingState`):
  RED/State-D → `easy`; YELLOW → `easy` if State C else `moderate`; GREEN → `moderate` if State B
  else `hard`; PEAK → `hard`; unknown → `moderate`. Mirrors `suggestDailyAdjustment`
  (`readiness.ts:777-842`).
- **Render + hoist** a `READINESS_DIRECTIVE:` line (status + `MAX_INTENSITY` + guidance, falling back
  to `message` on rest days) just under the PR_STATUS banner (`_core.py:1209-1220`, before
  `return` `:1415`). **Hard-rule block** in `COACH_ROLE` after the PR rules (`_core.py:254-261`),
  same "sole authority / MUST obey / hold the line" shape; explicitly **does not suppress a
  legitimate PEAK/GREEN hard day** (ceiling, not floor); overrides persona.
- Propagates to all 3 surfaces (shared builders). **Activate R1's stubbed directive assertion** +
  add RED/PEAK expectations.
- **Acceptance:** RED fixture never recommends above `easy`; GREEN/PEAK proceed; two-turn "I feel
  fine, let me do the intervals" doesn't cave.

## R3 — Output validator + retire the PR Sonnet-bump  *(S–M)*
Guard the *output*; this is the reusable validation module R6 also extends.
- **Pure `validate_pr_claims(text, context_block) -> (clean, violated)`** in `_core.py`: parse the
  `PR_STATUS` verdict (`YES|NO RACE BASELINE|NO BASELINE|NO|TIE|UNKNOWN`); when not YES, strip any
  sentence hitting claim patterns — comparative `faster`/`quicker` (never bare `fast`),
  case-sensitive `\bPR\b`, `personal record/best`, `shaved/knocked off`, `crushed/beat … previous`;
  when YES, only strip a delta ≠ the one mandated (minutes; engine rounds to whole min). Sentence-
  scoped; empty-result guard returns original.
- **Wire into `call_anthropic`** (`_core.py:1529`) via optional `validate_context=None,
  validate_regenerate=True` (default off ⇒ summarization/inference unaffected). Factor the raw
  `messages.create` into `_invoke` so a regen doesn't recurse: on violation, one strengthened regen
  on the **same Haiku model**, re-validate, else strip; log `log_interaction(kind="pr_validation")`.
- Pass `validate_context=context_block` from `insight.py` (~166-180) and `ping.py` (~110-120).
- **Drop the bump:** delete `insight.py:158-164` (`if "PR_STATUS:" in context_block: model_to_use =
  SONNET_MODEL`). Reverts PR-day routing to persona-driven everywhere.
- **Scope:** non-streaming surfaces; streaming `chat.py` validation is a noted follow-up.
  Readiness-intensity validation is an extension hook **after R2**.
- **Acceptance:** Haiku-pinned `PR_STATUS:NO` fixture never emits a PR claim (R1 unit-tests the pure
  fn); telemetry shows fewer Sonnet calls on PR days.

## R5 — Enforced injury / overtraining floor  *(S)*
Prompt-level (works on streaming chat; **no text-strip**, so no overlap with R3).
- In `build_context_block` add optional `user_msg=None`; compute `SAFE_DISPOSITION`: overtraining
  (all surfaces) when `trainingState == "D"` (already in snapshot — State D *is* ≥5 consecutive RED);
  injury (chat only) when `INJURY_RE.search(user_msg)` ⇒ suppression + a *one-sentence, conditional*
  defer note (higher bar for the firm note because `INJURY_RE` is broad). Hoist into the banner
  region. Pass `user_msg=last_user_msg` from `chat.py` only (`:243`, retry `:319`).
- **Hard rule** in `COACH_ROLE`: a `SAFE_DISPOSITION:` line forbids any load-increasing/added
  `proposal` (load-reducing OK), include the defer note once, overrides persona.
- **Acceptance:** injury + State-D fixtures always carry the disposition + no load-increasing
  proposal; casual "legs a bit sore but great" does NOT trigger the firm referral.

---

## R7 — Structured athlete profile + binding ATHLETE_PROFILE directive + UI  *(M)*
Give the coach structured individual data and a directive to adapt within.
- **Schema** (`src/types/index.ts:231`, all optional so `mikePlan` stays valid): `birthDate?` (ISO —
  compute age on read; stored age goes stale), `sex?: 'male'|'female'|'other'`, `weightKg?`,
  `experienceLevel?` (reuse onboarding union `first_timer|beginner|intermediate|advanced|elite`),
  `trainingAgeYears?`, `injuryHistory?: {region; status: 'active'|'chronic'|'resolved'; note?}[]`,
  `goals?: {text; priority?}[]` (race facts stay in `RaceInfo`).
- **Persist the discarded `experienceLevel`:** collected in `Onboarding.tsx` → `useOnboarding`
  (localStorage `ba_onboarding_*`) → consumed only by the plan generator today. Wire into both
  profile sources: static `src/data/mike-18k-plan.ts:4-9` (literal) and generated
  `src/utils/planGenerator.ts:199-206`, merged in `App.tsx:140-143`.
- **Collection UI:** new `useAthleteProfile` hook (localStorage `ba_athlete_profile_*`) +
  `AthleteProfileEditor.tsx`, a collapsible section in `Settings.tsx` Coach block (after `AboutMe`
  `:196`); injury/goal rows mirror the `MIMTable` edit-row idiom. Client-only, consistent with the
  existing maxHR/zone overrides.
- **Snapshot + BINDING directive:** `athleteProfile` flows through `coachSnapshot.ts` unchanged
  (grows with the type). In `build_system_prompt` after the athlete-lines (`_core.py:816`), derive
  age + active/chronic injuries and hoist `ATHLETE_PROFILE_DIRECTIVE:`. Add a `COACH_ROLE` hard-rule
  parallel to PR_STATUS: masters → more recovery / conservative intensity; beginner → cautious
  progression (~8%); active/chronic injury region → avoid aggravating load, weave caution unprompted;
  hold the line; **missing data ⇒ no age/experience claim**; include the R7↔R8 coupling note ("the
  engine also adapts; your words and the numbers should agree").
- **Eval (R1):** fixtures — masters-55 borderline day, beginner volume-ramp request, chronic-knee +
  downhill repeats, missing-profile fallback (SHARP Personalization).

## R6 — Deepen the training-science grounding  *(M)*
Add depth/breadth and make it relevance-targeted; reuses R3's validator for citation grounding.
- **Structure = topic-modular conditional injection (chosen over monolith / a MEDIUM tier).**
  Replace the single `APP_KNOWLEDGE` selection (`_core.py:800`) with
  `select_knowledge(lite, profile, snapshot, user_msg)`: always-on **core** (`CORE_FULL`/`CORE_LITE`
  = today's APP_KNOWLEDGE / _LITE) + **gated modules** appended, then `RESEARCH_CITATIONS` last.
  Gates: profile (age≥40 → `masters`; `sex='female'` → `sex_female`; `injuryHistory` or
  beginner → `return_to_run`), context (hot → `heat`), and chat-only message keywords (`vo2max`,
  `strength_periodization`, `fueling`, `sleep`, `heat`). Add optional `snapshot=None, user_msg=""`
  to `build_system_prompt`; pass from all 3 callers. **Cache-safe** (gated set is stable within a
  session) and **token-smart** (≈halves chat first-turn knowledge tokens; cuts insight/ping ~5–10×).
- **Fix the third surface:** `ping.py:89` currently sends FULL knowledge for a 200-token nudge →
  switch to `lite_knowledge=True`.
- **New modules** (drafted in APP_KNOWLEDGE voice; priority = the order R8/R7 need them):
  `KB_MASTERS` (age & recovery, connective-tissue lag, keep strength/power), `KB_SEX_FEMALE`
  (cycle effects are small/variable — don't over-prescribe; RED-S/iron), `KB_RETURN_TO_RUN`
  (tissue lags fitness, one-variable progression, pain rule, descents last), `KB_VO2MAX`,
  `KB_STRENGTH_PERIODIZATION`, `KB_FUELING`, `KB_SLEEP`, `KB_HEAT`.
- **⚠️ Citations MUST be human-verified before merge.** The design drafts *candidate* references
  (e.g. Tanaka & Seals on masters decline; McNulty et al. 2020 on cycle-phase variability; Mountjoy
  et al. IOC RED-S; Nielsen et al. on running-progression injury risk; Rønnestad & Mujika on
  concurrent strength; Buchheit & Laursen on HIIT; Jeukendrup on carb intake; Périard on heat) — but
  this codebase treats an invented citation/effect-size as a hard failure (`_core.py:252,364`).
  Verify author/year/journal/number against the actual paper; ship direction-without-number if a
  figure can't be sourced.
- **Evidence guardrail:** add a tight evidence-hierarchy note to the citation protocol
  (`_core.py:367`) speaking the existing `src/engines/evidence.ts` **T1–T4** ladder so prompt and
  engine share one vocabulary.
- **Generalize 4 spots** so principles travel (eccentric `:449`, altitude `:458`, taper `:468`,
  nutrition `:551`) while keeping Broken Arrow as the example.
- **Eval (R1 Accuracy):** (A) deterministic citation-grounding check — `extract_citations(text)`,
  assert each is in the allow-list auto-derived from `RESEARCH_CITATIONS` + module blocks, OR in the
  turn's `web_search` results; novel author/year = FAIL. **Implement as another rule in R3's
  validator module, not a fork.** (B) LLM-judge accuracy/grounding rater (phase-2). Plus a pure
  `select_knowledge` unit test (first Python unit test): masters profile → masters block present,
  `sex_female` absent; default → neither; `lite=True` → `CORE_LITE`.

## R8 — Age/experience-aware engine retuning  *(M, validated-math changes)*
Make the deterministic readiness/load math adapt — gated entirely behind profile data.
- **What adapts (small, evidence-based; R6 supplies the science):**
  - Masters ≥40: ACWR danger ceiling 1.5→1.4. ≥50: →1.3, plus `STATE_D_CONSECUTIVE_RED` 5→4 and
    max-consecutive-hard 2→1.
  - Beginner/first_timer: ACWR caution 1.3→1.2, danger →1.4; advisory `weeklyIncreaseCapPct` 10→8.
  - **No weekly-ramp cap exists in the engine today** (`generateWeeklyRecommendations`
    `performance.ts:219-296` only reacts) → the beginner cap is enforced via the tighter ACWR
    ceiling + the R7 coach directive, NOT by rewriting the static plan.
- **Implementation:** new `src/utils/engineConfig.ts` — `ageFromBirthDate()`,
  `getReadinessConfig(profile)`, `getLoadConfig(profile)` returning the **current constants as
  defaults when data is absent** (byte-identical fallback). Parameterize `readiness.ts` via an
  **optional trailing config arg** on `scoreLoad` (`:210`), `applyGuardrails` (`:418,463`),
  `classifyTrainingState` (`:324`), `calculateReadiness` (`:282`) — trailing position preserves
  every positional test call. Wire once in `useReadiness.ts` (`:291,296,303`) via a memoized
  `getReadinessConfig(athleteProfile)`. Leave the ACWR ratio/EWMA math untouched.
- **Testing (mandatory):** new `engineConfig.test.ts` — `getReadinessConfig({})` deep-equals
  defaults (the byte-identical guarantee), masters/beginner tiers, boundary ages 39/40/49/50;
  append cases to `readiness.test.ts`. **The full existing readiness/performance test suite must
  pass unchanged** — that proves the default path is untouched.
- **Interactions:** composes with R2 (reads post-guardrail status — verify `useReadiness` applies
  guardrails before the snapshot) and R5 (shares `STATE_D_CONSECUTIVE_RED`; lowering to 4 for ≥50
  engages R5 a day sooner — intended; verify R5 reads the config-driven constant).
- **Acceptance:** with no profile data, readiness output is identical to today; with a masters/beginner
  profile, ACWR caution/danger and deload trigger sooner (unit-tested + R1 fixtures).

---

## Cross-cutting notes
1. **Bump `INSIGHT_PROMPT_VERSION`** (`_core.py:126`) once per prompt-changing PR (R2, R5, R6, R7) so
   cached insights don't go stale (keyed at `_core.py:129-130`). Not for R4/R8.
2. **Banner order** at the top of the context block: PR_STATUS → SAFE_DISPOSITION (R5) →
   READINESS_DIRECTIVE (R2); ATHLETE_PROFILE_DIRECTIVE (R7) renders in the system prompt's athlete
   section. Verify via `log_sample_event` (last-50 system+context capture, `_core.py:1730`).
3. **One validation module:** R3 creates `validate_*`; R6 adds the citation-grounding rule to it; R5
   stays prompt-level. No forks, no double-processing — run the validator (may regen) before any
   cosmetic step.
4. **Conditional knowledge ↔ profile:** R6's `sex_female`/injury gates evaluate falsy until R7 adds
   those fields, then light up with no coach-side change. Sequencing R7 before R6 means all gates are
   live on R6 merge; either order is safe.
5. **Citations are a human gate**, not a code step — see R6. The allow-list is auto-derived from the
   modules, so an unverified citation that's never pasted can never pass the eval.

## Verification (end-to-end)
- **Automated, per PR:** extend + run `npm run test:coach-eval` (R1 is the rubric; each later PR adds
  its assertions). `validate_pr_claims`, `_max_intensity`, `select_knowledge`, and `engineConfig`
  are pure → unit-testable without API calls. `npm test` (Vitest) stays green throughout; the
  `coach-eval` CI job is opt-in and never blocks deploy.
- **R4:** Vercel env set, redeploy, confirm telemetry logs `claude-sonnet-4-6`.
- **R2/R5/R7 manual:** dump the assembled system+context (`log_sample_event`) for a RED day, a PEAK
  day, a State-D athlete, and a masters/injured profile; confirm directives render and the two-turn
  "hold the line" holds.
- **R3 manual:** POST `/api/coach/insight` `surface=daily` with a slower-than-baseline effort
  (`PR_STATUS: NO`); confirm no "faster"/"PR" survives and the call logs Haiku.
- **R6 manual:** ask "why taper?" (expect Bosquet/Mujika), "I'm 52, how should recovery differ?"
  (expect the masters block injected + a verified/honest answer), and an off-list question (expect
  `web_search`, not a fabricated citation).
- **R8 manual:** with an empty profile, confirm readiness output is byte-identical to today; add
  `birthDate` (age 52) + `beginner` and confirm ACWR caution/danger and deload trigger earlier.

## Critical files
- `api/coach/_core.py` — R4 default (27); R2 `_max_intensity`+directive+rule; R3 `validate_pr_claims`
  + `call_anthropic` kwargs (1529); R5 `SAFE_DISPOSITION`+`user_msg`; R6 `select_knowledge` +
  knowledge modules + evidence note (421-651, 800, 367) + R7 `ATHLETE_PROFILE_DIRECTIVE` (816);
  `INSIGHT_PROMPT_VERSION` (126).
- `api/coach/insight.py` (R3 delete bump 158-164, `validate_context`; R6 pass snapshot/lite),
  `api/coach/ping.py` (R3 `validate_context`; R6 switch to LITE 89),
  `api/coach/chat.py` (R5 `user_msg` 243/319; R6 reorder `last_user_msg`, pass snapshot/user_msg 214).
- `api/coach/tests/eval/*` + `pytest.ini` + `api/requirements-dev.txt` + `api/__init__.py`,
  `api/coach/__init__.py` (R1 all-new); `package.json` (R1 script); `.github/workflows/deploy.yml`
  (R1 opt-in job).
- `src/types/index.ts` (R7 schema 231; R1 fixture shape 710-778), `src/utils/coachSnapshot.ts`
  (R7 passthrough), `src/data/mike-18k-plan.ts` + `src/utils/planGenerator.ts` + `src/App.tsx`
  (R7 persist experienceLevel + merge), `src/components/Settings.tsx` + new `AthleteProfileEditor.tsx`
  + `useAthleteProfile.ts` (R7 UI).
- `src/utils/readiness.ts` + new `src/utils/engineConfig.ts` + `src/hooks/useReadiness.ts`
  (R8 parameterize + wire), `src/utils/performance.ts` (R8 load config), `src/engines/evidence.ts`
  (R6 T1–T4 vocabulary), `src/__tests__/readiness.test.ts` + new `engineConfig.test.ts` (R8 tests).
- `vercel.json` — reference only (R4 env lives in the Vercel dashboard).
