# Menopause Training Context — Design v1 (DRAFT)

**Status:** Draft for Mike's review — do not start coding until approved.
**Date:** 2026-06-12
**Author:** Claude (Cowork)
**Grounded in:** `docs/research/Menopause_Training_Evidence_Foundation_v1.md` (evidence-graded synthesis; deep-research fan-out → source fetch → adversarial verification). Every dosing claim in §6 carries a grade from that doc.
**Complements:** `docs/GENERAL_FITNESS_ENGINE_DESIGN.md` (the shared 4-pillar engine this overlays) and the existing `injury` / `race` context patterns in `src/hooks/useOnboarding.ts`.

---

## 1. Goal & the core decision

Add a **menopause training context**: an optional, athlete-disclosed signal (perimenopause / menopause / postmenopause) that makes the app's training **and** coaching reflect the physiology of the menopause transition — when standard advice ("lighter weights, more cardio, eat less") actively works against the athlete.

**Central architecture decision — menopause is an _overlay modifier_, not a goal and not a constraint:**

- **NOT a 5th goal preset.** It is orthogonal to Stay Healthy / Lose Fat / Build Muscle / Build Endurance — a midlife woman can still want any of them. Adding `menopause` to `GeneralGoal` would force a false choice.
- **NOT an injury-style capacity constraint.** Injury *caps* the plan (`injuryPolicyFor()` lowers max days, mileage, and forces easy weeks). Menopause *reshapes dosing* — heavier strength, add impact, protect recovery — without lowering the ceiling.
- **It IS an overlay** applied on top of whichever goal preset the athlete already chose, plus coach-snapshot personalization. This mirrors exactly how `injury` and `race` are sibling contexts that feed the same engine + coach without a shared abstraction.

> **Why this matters (market):** women ~45+ are a large, underserved, paying segment whose felt friction is precise — *"the workouts that always worked just stopped working."* Full Witchel check in §8.

---

## 2. Scope

**In scope (v1, phased):** capture menopause stage → make the coach acknowledge it (P0) → re-dial the engine (P1) → add bone/impact, pelvic-floor, and protein content (P2).

**Out of scope (v1):** HRT or any medical advice; menstrual-cycle-phase syncing for pre-menopausal athletes; andropause / male equivalent; full nutrition planning; longitudinal symptom tracking.

**Boundary:** the app gives *training* guidance, not *medical* guidance. Anything clinical (symptom management, HRT, bone-density diagnosis) → "talk to your clinician." See §7.

---

## 3. Architecture & data flow

Menopause threads through the same three layers injury already uses — capture → snapshot → engine:

```
OnboardingConfig.menopauseStatus  (+ symptoms, note)        [P0 capture]
        │
        ├──▶ menopauseSummaryLine(config) ──▶ CoachSnapshot.menopauseContext
        │            │                                 │
        │            ▼                                 ▼
        │     CoachLetter.tsx fallback          api/coach (welcome_letter,    [P0 coach]
        │                                        _core.py context block)
        │
        └──▶ generateGeneralFitnessPlan(config)
                     │
                     ▼
              applyMenopauseOverlay(preset, ctx, status)  ──▶ re-dialed week  [P1 engine]
                     │
                     ▼
              impact / pelvic-floor / protein content      ──▶ session detail [P2 content]
```

The overlay sits at "2. Apply goal preset" in the General Fitness pipeline (`GENERAL_FITNESS_ENGINE_DESIGN.md` §2) — *after* the preset resolves, *before* the week is laid out — so it composes with all four goals.

---

## 4. Personalization inputs (data model) — P0

Add to `OnboardingConfig` (`src/hooks/useOnboarding.ts`), mirroring the injury follow-up fields (lines 97–103):

```ts
export type MenopauseStatus =
  | 'perimenopause' | 'menopause' | 'postmenopause'
  | 'not_applicable' | 'prefer_not_to_say'

// in OnboardingConfig:
menopauseStatus?: MenopauseStatus
// Optional follow-ups — only collected when status is peri/meno/post.
// Absence just means a less specific coach message (same rule as injury).
menopauseSymptoms?: string[]   // multi-select: 'hot_flashes' | 'sleep_disruption' | 'joint_pain' | 'low_energy' | 'brain_fog'
menopauseNote?: string         // free text
```

No separate biological-sex field is added — the question self-identifies and is age-gated (§5). Persist on `OnboardingConfig` in P0; mirror onto `AthleteProfile` (`src/types/index.ts`) in P1 (open decision §11).

---

## 5. Onboarding capture — P0

- **New conditional step** in `src/components/Onboarding.tsx`, mirroring the injury block at `STEP_BASELINE` (lines 614–674).
- **Age-gated visibility:** shown only when `config.age >= 45`, via the existing index-based `visibleSteps` filter (lines 214–222). New steps insert without renumbering. *(Open decision §11: 45 vs 40 — rec 45, with "not applicable" so 40–44 self-selects.)*
- **Structure:** primary self-select card (Perimenopause / Menopause / Postmenopause / Not applicable / Prefer not to say) → optional symptom multi-select → optional free text. Mirrors injury's "collapsed amber detail box" for the follow-ups.
- **Skippable:** all fields optional; `canContinue` returns `true` regardless (the step can be advanced without an answer).
- **Framing (customer language, §8):** "This helps your coach tailor your training for midlife. Totally optional — skip if it doesn't apply." No clinical language.
- Written into the completion payload (lines ~316–349) and editable later in Settings/Profile (story A2).

---

## 6. The overlay — menopause-adjusted dosing

The engine layer (P1) and content layer (P2). Baseline = whatever the chosen goal preset sets today; the overlay nudges it. **Grades are pulled from `docs/research/Menopause_Training_Evidence_Foundation_v1.md` and reconciled against that doc.**

| Pillar / dial | Baseline (goal preset) | Menopause overlay | Tier | Evidence grade |
|---|---|---|---|---|
| **Strength load** | `strengthRepTarget` 6–10, generic loading cue | Heavier progressive load for **bone/strength**; **also keep adequate volume + effort for muscle** (load alone doesn't drive mass) | P1 | Strong (bone); for mass, volume ≥ load |
| **Bone / impact** | none today | Add impact loading (jumps, hops, landings) folded into a strength day. **Peri:** impact alone is osteogenic at the hip. **Post:** pair impact with heavy load (HiRIT) — impact-alone is blunted | P2 | Moderate (peri hip; post via HiRIT) |
| **VO₂max / SIT** | 1×/wk intervals (`vo2max` pillar) | Express one hard session as short sprint intervals (SIT, 10–30 s efforts) | P1 | Moderate |
| **Recovery** | fixed `DELOAD_EVERY = 4` | **Symptom-responsive** recovery keyed to sleep/VMS — *not* a blanket extra rest day by status. Surface recovery nudges; keep deload parameterizable | P1 | Limited (individualize, don't status-gate) |
| **Protein** | minimal prose | Surface ~**1.2–1.6 g/kg/day**, ~**0.4 g/kg/meal** (3–4 meals) guidance in coaching; cap claims at 1.6 g/kg | P2 | Moderate–Strong (direction) |
| **Pelvic floor** | none | Optional pelvic-floor track + reassurance that impact/heavy work is generally safe (per the MEDEX-OP RCT) | P2 | Moderate |
| **Cardio / cortisol** | n/a | **Soft nudge only — do NOT hard-cap HIIT.** Claim is unsubstantiated and **partly mis-attributed** (Sims promotes HIIT; her concern is chronic steady-state cardio). Never engine logic | nudge | **Contested** |

**Implementation:** `applyMenopauseOverlay(preset, ctx, status)` in `src/engines/generalFitness/index.ts`, called after preset resolution in `generateGeneralFitnessPlan()` (line ~229–234), composing with all four goals — never a new preset.

**Peri vs. post:** perimenopause can still build bone with impact *alone* (osteogenic at the hip) plus symptom-aware recovery; postmenopause emphasizes bone + muscle *preservation* via **heavy load + impact together (HiRIT)** — impact-alone is blunted post-menopause. The overlay reads `status` to set emphasis. (Caveat: status does **not** clearly moderate the *resistance-training* BMD response — the firm peri/post split is specifically about impact-alone loading.)

---

## 7. Coach personalization — P0

- `menopauseSummaryLine(config)` util mirroring `injurySummaryLine()` (`src/utils/injuryRamp.ts:85`) → one-line human string, e.g. *"in perimenopause · managing sleep disruption + hot flashes."*
- `menopauseContext?: string` on `CoachSnapshot` (`src/types/index.ts`), parallel to `injuryContext`.
- Wired through `buildCoachSnapshot()` (`src/utils/coachSnapshot.ts`) and the `CoachLetter.tsx` fallback (lines 40–80).
- **Backend:** extend the `welcome_letter` instruction (`api/coach/insight.py:140–159`) and add a context block in `api/coach/_core.py` parallel to `injuryContext`, so every coach surface — not just the welcome letter — is menopause-aware.

**Tone contract:** one warm paragraph; acknowledge that "the rules changed" and the plan adapts; **no medicalization, no diagnosis**; defer clinical questions to a clinician. Example fallback line:

> *"I see you're navigating perimenopause — the old playbook of 'more cardio, lighter weights' actually works against you here, so we'll lean into strength, protect your recovery, and adjust as you tell me how you're feeling."*

---

## 8. Witchel 3-rule check

| Rule | Verdict | Notes |
|---|---|---|
| **Massive market** | ✅ | Women ~45+ are a large, fast-growing, underserved paying segment of fitness apps. |
| **Visceral solve** | ✅ | Removes a friction felt *today*: "the workouts that always worked stopped working." |
| **Customer language** | ✅ | Surface as "menopause / perimenopause / midlife," "lift heavy," "protect your bones," "the rules changed" — never "estrogen-mediated anabolic resistance." Keep the contested cardio/cortisol claim **out of customer copy**. |

Passes all three. The one thing held back from defaults is the contested cardio claim (§6) — nudge, not rule.

---

## 9. User stories & acceptance criteria

**Epic A — Capture menopause stage (P0)**

| # | Story | Acceptance criteria |
|---|---|---|
| A1 | As a midlife athlete, I'm *optionally* asked in onboarding whether I'm in peri/meno/postmenopause, so training can be tailored. | Step appears only when `age >= 45`; can be advanced with no selection; selection persists to `OnboardingConfig.menopauseStatus`. |
| A2 | As any athlete, I can add/edit/clear my menopause status later in Settings/Profile. | Settings exposes the same field; edits round-trip to storage + sync; clearing removes coach personalization. |
| A3 | As a privacy-conscious user, I see "prefer not to say / not applicable" + non-clinical framing. | Both options present; copy contains no diagnostic/medical language; skipping leaves status unset. |
| A4 | As an athlete, I can optionally note symptoms + free text. | Symptom multi-select + free-text only shown when status ∈ {peri, meno, post}; both optional; persist to `menopauseSymptoms` / `menopauseNote`. |

**Epic B — Coach acknowledges midlife (P0)**

| # | Story | Acceptance criteria |
|---|---|---|
| B1 | As a perimenopausal athlete, my welcome letter acknowledges "the rules changed" and reassures me the plan adapts. | When status is set, the letter includes one warm, non-medical menopause paragraph; absent when unset. |
| B2 | As an athlete, the coach stays menopause-aware across surfaces, not just the welcome letter. | `CoachSnapshot.menopauseContext` populated; `_core.py` renders it on every coach call. |
| B3 | As an athlete who logged symptoms, coach nudges reflect them. | Logged symptoms appear in the summary line and are available to the coach prompt. |

**Epic C — Training adapts: engine overlay (P1)**

| # | Story | Acceptance criteria |
|---|---|---|
| C1 | As a menopausal athlete on *any* goal, my strength uses heavier progressive load for bone **and** keeps adequate volume/effort for muscle. | Overlay adjusts loading cue / rep target **and preserves weekly volume** for all four goals without overriding goal intent; verified by snapshot test per goal. |
| C2 | As a menopausal athlete, recovery adapts to my **sleep/symptoms**, not just my menopausal status. | Recovery nudges key off symptom/sleep input (not status alone); deload stays parameterizable; rationale surfaced in the week focus. |
| C3 | As a menopausal athlete, some hard cardio is expressed as short sprint intervals. | At least one `vo2max` session renders as SIT when overlay active. |
| C4 | As a menopausal athlete, plan notes explain *why* changes were made. | Each overlaid change carries a one-line "why" in the plan/coaching prose. |

**Epic D — Bone, impact & pelvic floor: net-new content (P2)**

| # | Story | Acceptance criteria |
|---|---|---|
| D1 | As a postmenopausal athlete, my week includes impact/plyometric loading. | Impact block appears on a strength day; new exercises exist in `src/utils/exercises.ts` with form cues. |
| D2 | As an athlete with pelvic-floor concerns, I get an optional pelvic-floor track + safety reassurance. | Optional track selectable; copy cites the "impact is generally safe" RCT finding; no forced intensity cap. |
| D3 | As a menopausal athlete, protein-forward guidance is surfaced. | Protein g/kg guidance appears in coaching prose when overlay active. |

**Epic E — Evidence integrity & safety (cross-cutting)**

| # | Story | Acceptance criteria |
|---|---|---|
| E1 | As product owner, every training claim traces to a cited, graded source; contested claims ship as soft nudges. | Each §6 row maps to a research-doc citation + grade; the cardio/cortisol claim is never engine logic. |
| E2 | As a user, I see appropriate "check with your clinician" framing; no medical/HRT advice. | Medical-boundary line present wherever clinical topics could arise; coach tone contract enforced (§7). |

---

## 10. Phased rollout

- **P0 — Capture + coach awareness.** Data model (§4), onboarding step (§5), coach personalization (§7). No plan-math change. Low risk, high empathy, shippable alone.
- **P1 — Engine overlay.** `applyMenopauseOverlay()` (§6): strength load bias, SIT expression, recovery cadence. Needs per-goal snapshot tests.
- **P2 — Net-new content.** Impact/plyo + pelvic-floor exercises in `src/utils/exercises.ts`, optional pelvic-floor track, protein guidance.

---

## 11. Open decisions (with recommendations)

- **Profile mirror + Settings editor timing** — *rec:* `OnboardingConfig` field + Settings edit in P0; `AthleteProfile` mirror in P1.
- **Age gate 45 vs 40** — *rec:* 45, with "not applicable" so 40–44 self-selects in.
- **Overlay aggressiveness** — pin each dial's magnitude to its research-doc grade; Strong → default, Moderate → gentle, Contested → nudge only.
- **Impact as new `PillarRole` vs folded into strength day** — *rec:* fold into a strength day for v1 to avoid `TEMPLATES` combinatorial growth (`presets.ts`).

---

## 12. Risks

- **Sensitivity / privacy** of the question → mitigated by optional, skippable, age-gated, non-clinical framing.
- **Over-reaching the evidence** on contested claims → mitigated by grades + "nudge, not rule" discipline (§6, E1).
- **Net-new content cost** (plyo / pelvic floor) → its own exercise-library + form-cue review; isolated to P2.
