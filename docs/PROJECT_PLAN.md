# Broken Arrow Training App — IT Project Plan v1.0

> ## ⚠️ SUPERSEDED — historical record only
>
> Marked 2026-08-29. This plan was last updated 2026-04-21 and describes a
> 13-sprint schedule to 2026-10-25 that the project stopped following after
> `[PR-13]` (2026-05-03). Do not plan from it.
>
> **Specifically not true:** its Definition of Done requires Conventional
> Commits, per-sprint `v0.N.0` release tags and a maintained `CHANGELOG.md`.
> The repo has **zero git tags**, has never had a `CHANGELOG.md`, and uses
> narrative changelog-style commit subjects. `CLAUDE.md` records the
> conventions actually in force.
>
> It also cites four `BA_*` HTML strategy documents (three `_v3`, one
> `_v2`) at ~14 places below. **None was ever committed to this repo** —
> those links do not resolve and never did.
>
> **For current work:** `docs/initiatives/` (registry and per-initiative
> intent/plan) is the plan of record; `docs/PLAN_GENERATOR_ALGORITHM.md` is
> the as-built engine reference.

**Document version:** 1.0
**Created:** 2026-04-20
**Author:** Mike (product), drafted with Claude
**Planning horizon:** 6 months (26 calendar weeks / 13 × 2-week sprints)
**Target start:** 2026-04-27 · **Target end:** 2026-10-25
**Scope:** Build out the four remaining *gap engines* on top of the existing Broken Arrow Training App codebase — **Terrain completion, MIM (novel IP), Descent-Load, Altitude** — plus cross-cutting Foundation and Integration work.
**Companion sprint tracker:** [`BA_IT_Project_Plan_v1.xlsx`](./BA_IT_Project_Plan_v1.xlsx)

---

## 1. Executive Summary

The Broken Arrow Training App (BA) is a React/TypeScript + Python-serverless + iOS/HealthKit coaching platform for trail-runners. The **Readiness Engine** is LIVE (`src/utils/readiness.ts`) and basic TRIMP + a static **MIM matrix** are already shipping (`src/utils/trimp.ts`). The strategic docs (`BA_Executive_Summary_v3.html`, `BA_Vector1_Science_v3.html`, `BA_Strategic_Plan_v3.html`, `BA_DataFlow_v2.html`) identify four *gap engines* between today's shipping product and the defensible IP moat — and this plan is the execution wrapper for closing those gaps.

The plan is organised so that **every sprint is directly actionable by Claude Code** on the existing repo: each sprint lists file paths, user stories in INVEST form, acceptance criteria in Gherkin (`Given / When / Then`), a QA/QC checklist, a test matrix (unit / integration / regression), risk register, Definition of Done, and peer-reviewed citations (PMID / DOI) for every scientific claim being implemented.

### 1.1 Key outcomes by end of plan
- Terrain Engine at parity with UTMB Index (vertical, technicality, altitude modifiers) and explainable to the athlete.
- MIM upgraded from static lookup to **Bayesian partial-pooled per-user model** with population priors, first-principles tiers, and a transparent evidence-tier UI.
- Descent-Load Engine quantifies eccentric muscle damage and carries forward a repeated-bout memory.
- Altitude Engine tracks hypoxic dose, acclimatization state, and dampens prescribed intensity in real time.
- Ensemble **Adaptive Plan Engine** blends all four engines with the existing Readiness score and grounds the LLM coach with a structured `CoachSnapshot`.
- Production-ready: ≥85% unit-test coverage on new engine code, integration tests across every engine ↔ engine seam, automated regression suite on GitHub Actions, and a full QA checklist signed off per sprint.

### 1.2 Cadence & ceremonies
- **2-week sprints** (Mon start, Fri-2-weeks-later end).
- **Planning** Monday week 1 · **Mid-sprint demo** Friday week 1 · **Review + retro** Friday week 2.
- Every sprint ends with: green CI on `main`, a signed QA checklist, a release tag (`v0.{sprint#}.0`), and an updated `CHANGELOG.md`.

---

## 2. Scope & Out of Scope

### 2.1 In scope
- All four gap engines (Terrain completion, MIM, Descent-Load, Altitude).
- Shared foundation (feature store, DEM ingestion, telemetry, evidence-tier framework).
- Ensemble Adaptive Plan Engine that composes the five engines into a daily prescription.
- LLM coach grounding upgrades (`CoachSnapshot` extensions).
- Unit, integration, and regression test coverage + QA sign-off.
- Documentation: engine ADRs, developer guide, athlete-facing copy.

### 2.2 Out of scope (explicitly deferred)
- Readiness Engine refactor (already LIVE, functioning per `src/utils/readiness.ts`).
- Terra API multi-wearable fan-out (strategic plan's Phase 3).
- Subscription / billing / auth hardening (tracked separately in `docs/MULTI_USER_TODO.md`).
- Native iOS feature work beyond the HealthKit delta already in flight (`ios/BrokenArrowHealth/`).
- Coaches-marketplace, B2B, or team features.
- Non-running sports (cycling / swim) beyond their load contribution to the MIM matrix.

### 2.3 Assumptions
- Two-engineer team (Mike + Claude Code pair-programmer) or solo owner with Claude Code doing the bulk; capacity planned at **35 effective hours/sprint** per engineer.
- Existing CI (`.github/workflows/deploy.yml`) stays green as the baseline gate.
- Vitest remains the single test runner; no test-framework swap.
- Strava, Garmin, and Apple HealthKit ingestion paths remain stable during the plan horizon.

---

## 3. Source Inputs & Citations

Every science claim, threshold, or algorithm in this plan traces to one of:

| Tier | Definition | Examples in this plan |
|------|------------|------------------------|
| **T1** | Peer-reviewed RCT / meta-analysis | Banister 1991 TRIMP, Levine & Stray-Gundersen 1997 LHTL |
| **T2** | Peer-reviewed observational / field study | Giovanelli 2016 VK crossover, Vernillo 2017 eccentric descent |
| **T3** | First-principles biomechanics / physics | Minetti 2002 cost-of-locomotion, West 2013 altitude physiology |
| **T4** | Heuristic / coaching wisdom, flagged as such | Default DOMS decay constants, initial Bayesian priors |

Primary source documents (read before drafting this plan):

- `docs/BA_Executive_Summary_v3.html` — 4-panel visual one-pager, 5-engine status badges.
- `docs/BA_Vector1_Science_v3.html` — §1 load, §2 state, §3 terrain, §4 altitude, §5 MIM, §6 integration, §7 defensibility, §8 references.
- `docs/BA_Strategic_Plan_v3.html` — §Roadmap estimates (~136 engineering-weeks), §Product engine map, §MOAT stack.
- `docs/BA_DataFlow_v2.html` — data pipeline: Sources → Ingestion → Feature Store → Engine Layer → Integration + LLM → Outputs.

Full reference list is consolidated in §17 below and mirrored verbatim in `BA_Vector1_Science_v3.html §8`.

---

## 4. Architecture Snapshot (as of 2026-04-20)

### 4.1 Stack
- **Frontend:** React 19.2.4 + TypeScript 6.0.2 (strict) + Vite 8.0.4 + Tailwind 3.4.19 + recharts 3.8.1.
- **Testing:** Vitest 4.1.4 + @testing-library/react + jsdom.
- **Backend:** Python serverless on Vercel (`api/coach/`, `api/garmin/`, `api/apple/`, `api/auth/`) + Cloudflare Worker (`worker/strava-token-exchange.ts`).
- **iOS:** SwiftUI companion app (`ios/BrokenArrowHealth/`) with HealthKit, AuthManager, KeychainStore.
- **Deploy:** GitHub Actions → GitHub Pages (`.github/workflows/deploy.yml`).

### 4.2 Key existing modules (not to be re-built)
- `src/utils/readiness.ts` — ATE composite (HRV 40 / RHR 20 / Sleep 20 / Load 20), PEAK/GREEN/YELLOW/RED bins, Plews 2013 CV guardrail, Meeusen 2013 NFOR detection.
- `src/utils/trimp.ts` — Banister TRIMP, static **MIM_MATRIX**, **DOMS_CARRY** (strength_lower = [0.40, 0.20]), `MIN_LOAD_FLOOR`, `classifyStrength`, `classifyHiking`, `applyDOMSCarryForward`.
- `src/utils/garmin.ts` — athlete-scoped localStorage (`ba_garmin_*`), tz-aware fetch.
- `src/types/index.ts` — 732 lines defining `WorkoutType`, `StravaActivity`, `GarminHealthData`, `ReadinessScore`, `TRIMPRecord`, `CoachSnapshot`, `CoachMemory`, `CoachPersona`, 23-item `SportType` union.
- `src/__tests__/` — 12 test files (trimp, readiness, zones, targets, compliance, matching, performance, plan-data, raceProjection, coachAnalyticsSnapshot, coachInsightCache, coachPingTriggers).

### 4.3 Build status by engine (per `BA_Executive_Summary_v3.html`)

| Engine | Status (pre-plan) | End-of-plan target |
|--------|-------------------|---------------------|
| Readiness | LIVE | Unchanged (monitor only) |
| Terrain | PARTIAL | LIVE, UTMB-Index parity |
| MIM (Musculoskeletal Impact Modifier) | LIVE (static matrix) | LIVE (Bayesian partial-pooled, per-user learning) |
| Descent-Load | PARTIAL (DOMS_CARRY only) | LIVE, eccentric-TRIMP + repeated-bout memory |
| Altitude | PHASE 3 | LIVE, dose + acclimatization + dampening |

### 4.4 Preservation Matrix (shipped code ↔ plan decisions)

**Purpose.** Every row below is a concrete surface area in the currently-shipped app. Each row states the decision the plan takes with that surface (Preserve / Extend / Re-parent / Streamline / Deprecate) and names the sprint that touches it. This is the single source of truth the mockups, the sprint sections below, and the xlsx tracker all agree with. **No shipped feature may be silently dropped** — if a row says "deprecate" it is justified in the final column.

**Legend.**
- ✅ **Preserve** — component ships unchanged; plan wires new data into it without modifying source
- 🔄 **Extend** — component kept, new props / sub-sections added
- 📦 **Re-parent** — component kept, moved under a new screen or route
- ✂ **Streamline** — component kept but content consolidated with new sibling
- ❌ **Deprecate** — replaced, justified in Notes
- 🆕 **Add** — net-new component (listed for completeness where a shipped sibling is implicated)

#### 4.4.1 Summary tab

| Shipped surface | Decision | Sprint that touches | Notes |
|---|---|---|---|
| `TodayBriefing.tsx` (Today narrative + "Why") | 🔄 Extend | S12 (Ensemble) | Riley hero card wraps it; "Why" collapsible gains MIM + Altitude bullets |
| `VitalsGrid.tsx` (HRV / RHR / Sleep / Body Battery + sparklines) | ✅ Preserve | — | No change; data already hits it |
| `InjuryRiskAlerts.tsx` (amber alert strip) | 🔄 Extend | S8 (Descent-A), S11 (Altitude-B) | Adds descent-load red-flag channel + AMS red-flag channel |
| `PerformanceSnapshot.tsx` (CTL / ATL / TSB / ACWR scale bars) | ✅ Preserve | — | Reads existing `CoachSnapshot`; untouched |
| `TRIMPBreakdown.tsx` (7-day bar chart, sport-type colors) | 🔄 Extend | S8 (Descent-A) | New `eccentricDose` series stacked onto existing bars |
| `WhatChangedCard.tsx` (week narrative) | 🔄 Extend | S12 (Ensemble) | Narrative source switches to Adaptive Plan Engine output |
| `WeekAtAGlance.tsx` (7 readiness dots) | ✅ Preserve | — | Unchanged |
| **Riley hero card** | 🆕 Add | S1 (Foundation) stub, S12 (real) | Persona + synthesis + "What's driving this" — wraps `TodayBriefing` |

#### 4.4.2 Plan tab

| Shipped surface | Decision | Sprint that touches | Notes |
|---|---|---|---|
| `PlanView.tsx` (main list) | ✂ Streamline | S12 (Ensemble) | "This week, per Riley" narration card prepended above existing list |
| `WeekStrip.tsx` (M-T-W-T-F-S-S pill strip) | ✅ Preserve | — | Unchanged |
| `WorkoutCard.tsx` (per-day card) | 🔄 Extend | S2–S4 (Terrain), S5–S7 (MIM), S11 (Altitude) | Tier chips for Terrain / MIM / Altitude get chip slots; existing layout preserved |
| `PlanCompliance.tsx` (% complete) | ✅ Preserve | — | Unchanged |
| `NextWorkoutSummary.tsx` | ✅ Preserve | — | Unchanged |
| **"Per Riley" narration card** | 🆕 Add | S12 | New card above Plan list |

#### 4.4.3 Stats tab

| Shipped surface | Decision | Sprint that touches | Notes |
|---|---|---|---|
| `CompliancePanel.tsx` | 📦 Re-parent | S1 (Foundation) | Becomes Compliance sub-tab; no code changes |
| `ReadinessPanel.tsx` | 📦 Re-parent | S1 | Becomes Readiness sub-tab |
| `PerformancePanel.tsx` | 📦 Re-parent | S1 | Becomes Performance sub-tab |
| `PerformanceChart.tsx` (recharts line) | 🔄 Extend | S4 (Terrain-C), S12 | Metric pills + race-day reference band + ACWR corridor added as optional props |
| `TimeWindowToggle.tsx` (7d/30d/90d/All) | ✅ Preserve | — | Unchanged |
| `PerformanceGlossary.tsx` (collapsible defs) | 🔄 Extend | S7 (MIM-C) | Add MIM + Altitude + Eccentric glossary rows |
| `StatCards.tsx` (4-card grid) | ✅ Preserve | — | Unchanged |

#### 4.4.4 Coach tab

| Shipped surface | Decision | Sprint that touches | Notes |
|---|---|---|---|
| `CoachChat.tsx` (chat surface, pending inferences) | ✅ Preserve | — | Chat shell untouched |
| `CoachInsightCard.tsx` | 🔄 Extend | S7 (MIM-C), S11 (Altitude-B) | Adds citation chips + AMS advisory variant |
| `CoachHistory.tsx` | ✅ Preserve | — | History + minimize controls unchanged |
| `CoachPersonaSelector.tsx` | ✅ Preserve | — | Shared with Settings; unchanged |
| **Riley avatar coin in header** | 🆕 Add | S12 | Visual-only; no new data |

#### 4.4.5 Settings tab

| Shipped surface | Decision | Sprint that touches | Notes |
|---|---|---|---|
| `ProfileCard.tsx` | ✅ Preserve | — | Unchanged |
| `CoachPersonaSelector.tsx` | ✅ Preserve | — | 4-button grid stays as shipped |
| `AboutMeEditor.tsx` | ✅ Preserve | — | Free-text field consumed by every Riley reply |
| `HRZoneEditor.tsx` | ✅ Preserve | — | Max HR + 5 zone bands + Garmin LTHR sync |
| `IntegrationsRow.tsx` (Strava / Garmin / Zwift) | 🔄 Extend | S10 (Altitude-A) | Zwift upgraded from "optional" to "recommended" for altitude prep |
| `CacheDiagnostics.tsx` | ✅ Preserve | — | Unchanged |
| `PrivacyRow.tsx` (export / delete) | ✅ Preserve | — | Unchanged |
| **Trips section + altitude wizard trigger** | 🆕 Add | S11 (Altitude-B) | New `TripsSection.tsx` + `AltitudeWizard.tsx` |
| **Methodology link → Screen 12** | 🆕 Add | S13 (Release) | New `MethodologyView.tsx` |

#### 4.4.6 Shared primitives & utils

| Shipped surface | Decision | Sprint that touches | Notes |
|---|---|---|---|
| `ReadinessBadge.tsx`, `TierChip.tsx`, `SparklineMini.tsx`, `MetricCard.tsx`, `ScaleBar.tsx`, `Navbar.tsx` | ✅ Preserve | — | All primitives ship unchanged |
| `src/utils/readiness.ts` (ATE + Plews + Meeusen) | ✅ Preserve | — | Untouched (already T1/T2 sourced) |
| `src/utils/trimp.ts` (Banister TRIMP + static MIM_MATRIX + DOMS_CARRY) | 🔄 Extend | S5 (MIM-A), S8 (Descent-A) | MIM_MATRIX becomes Bayesian posterior; DOMS_CARRY extended by eccentric-TRIMP; **static matrix kept as fallback** for new-user cold start |
| `src/utils/garmin.ts` (athlete-scoped storage, tz fetch) | ✅ Preserve | — | Unchanged |
| `src/types/index.ts` (732 LOC) | 🔄 Extend | every sprint | Only additive: new engine types appended; **no existing types renamed or removed** |
| `src/__tests__/` (12 test files) | ✅ Preserve | every sprint | **Guardrail:** all 12 files must stay green at every sprint's Definition-of-Done; new tests added alongside, not in place of, old tests |

#### 4.4.7 Backend & infra

| Shipped surface | Decision | Sprint that touches | Notes |
|---|---|---|---|
| `api/coach/` (Python serverless) | 🔄 Extend | S12 | Adds engine-state payload to prompt; prompt template stays backward-compatible |
| `api/garmin/`, `api/apple/`, `api/auth/` | ✅ Preserve | — | Unchanged |
| `worker/strava-token-exchange.ts` (Cloudflare Worker) | ✅ Preserve | — | Unchanged |
| `ios/BrokenArrowHealth/` (SwiftUI + HealthKit) | ✅ Preserve | — | No iOS work in this plan |
| `.github/workflows/deploy.yml` | 🔄 Extend | S1 | Coverage gate raised (80/80/80/80); no other job changes |

#### 4.4.8 Summary

- **0 deprecations.** No shipped component is being replaced. Extensions are additive (new optional props, new sub-sections, new sibling cards).
- **5 net additions,** all with explicit sprint homes: Riley hero card (S1 stub, S12 real), Per-Riley Plan narration (S12), Riley avatar coin in Coach header (S12), Trips section + Altitude Wizard (S11), Methodology view (S13).
- **12 existing test files** must stay green at every Definition-of-Done. This is the non-negotiable regression guardrail.

---

## 5. Engine Gap Analysis

### 5.1 Terrain Engine
**What exists:** Basic trail vs road `SportType` distinction; recharts rendering of elevation profiles.
**Gap:**
1. **GAP (Grade-Adjusted Pace)** via Minetti 2002 cost-of-locomotion polynomial.
2. **DEM correction** — barometric/device elevation is noisy; need to snap to USGS 3DEP (1 m in US) / SRTM / ASTER GDEM / Open-Elevation with cached tiles.
3. **Vertical efficiency (VE)** = vertical-meters-per-minute at aerobic threshold, with Giovanelli 2016 crossover angles (15.8°–22°) deciding when "running" becomes "power-hiking."
4. **UTMB Index** and **ITRA Performance Index** pluggable providers (strategic plan §Roadmap).

### 5.2 MIM Engine (novel IP)
**What exists:** Static `MIM_MATRIX: Record<SportType, number>` (e.g., `strength_lower: 2.0`) and `DOMS_CARRY` second-day decay.
**Gap:** Replace the static lookup with:
1. **Bayesian partial pooling** (Gelman BDA3, Efron & Morris 1977) — every athlete pulls toward a population mean but retains personalised posterior.
2. **Population priors** fit from the fleet (per-sport mean + variance, evidence-tier aware).
3. **Per-user learning loop** — posterior updates when reported soreness or next-day readiness diverges from predicted.
4. **Evidence-tier UI** — each coefficient shows T1–T4 source badge and CI width.
5. **OpenSim (Delp 2007) → GRADE (Guyatt 2008)** methodology doc in `docs/mim-methodology.md`.

### 5.3 Descent-Load Engine
**What exists:** `applyDOMSCarryForward` mutates day+1 / day+2 dailyTrimp.
**Gap:**
1. **Eccentric-TRIMP** — compute descent-eccentric dose using grade × pace × time bucketed by descent steepness (Vernillo 2017; Peake 2017).
2. **Repeated-bout effect memory** — after a downhill race, next 7–14 days of same-stimulus work is discounted (Hyldahl 2017 meta-analysis).
3. **Integration back into readiness** — eccentric dose raises RED-flag probability for next 48 h.

### 5.4 Altitude Engine
**What exists:** Nothing. Altitude is a tag in the `StravaActivity` object.
**Gap:**
1. **Hypoxic dose accumulator** — km·hours at altitude, weighted by altitude above ~1,500 m (Chapman 2014).
2. **Acclimatization sigmoid** — Levine & Stray-Gundersen 1997 LHTL curve, user reaches `acclimatized = true` asymptotically.
3. **Intensity dampening** — prescribed paces / power dampened per West 2013 VO₂max-loss curve (~1% per 100 m above 1,500 m, non-linear above 3,000 m).
4. **Bailey 2021 AMS consensus** red-flag when ascent-rate × altitude exceeds safe envelope.

### 5.5 Ensemble & UX
**Gap:** Today each engine writes to its own slice of `CoachSnapshot`. Needed:
1. **Adaptive Plan Engine** — ensemble layer that composes Readiness + Terrain + MIM + Descent + Altitude into a single `DailyPrescription` (workout type, duration, intensity, intensity-ceiling, caveats).
2. **LLM grounding** — `CoachSnapshot.engines` extended so the coach persona reasons from structured inputs, never hallucinates engine output.
3. **Explainability card** — per-day "why" panel showing which engine moved the needle.

---

## 6. Phase & Sprint Overview

| Phase | Sprints | Engine(s) | Sprint numbers | Calendar window |
|-------|---------|-----------|----------------|-----------------|
| 0. Foundation | 1 | Cross-cutting | S1 | 2026-04-27 → 2026-05-10 |
| 1. Terrain | 3 | Terrain | S2, S3, S4 | 2026-05-11 → 2026-06-21 |
| 2. MIM (novel IP) | 3 | MIM | S5, S6, S7 | 2026-06-22 → 2026-08-02 |
| 3. Descent-Load | 2 | Descent-Load | S8, S9 | 2026-08-03 → 2026-08-30 |
| 4. Altitude | 2 | Altitude | S10, S11 | 2026-08-31 → 2026-09-27 |
| 5. Integration & Release | 2 | Ensemble + release | S12, S13 | 2026-09-28 → 2026-10-25 |

### 6.1 Sprint date index (2-week cadence)

| # | Start | End | Name |
|---|-------|-----|------|
| 1 | 2026-04-27 | 2026-05-10 | Foundation |
| 2 | 2026-05-11 | 2026-05-24 | Terrain-A (GAP / Minetti) |
| 3 | 2026-05-25 | 2026-06-07 | Terrain-B (DEM correction) |
| 4 | 2026-06-08 | 2026-06-21 | Terrain-C (VE + UTMB Index) |
| 5 | 2026-06-22 | 2026-07-05 | MIM-A (priors + Bayesian scaffold) |
| 6 | 2026-07-06 | 2026-07-19 | MIM-B (personalisation loop) |
| 7 | 2026-07-20 | 2026-08-02 | MIM-C (evidence-tier UI + methodology) |
| 8 | 2026-08-03 | 2026-08-16 | Descent-A (eccentric-TRIMP) |
| 9 | 2026-08-17 | 2026-08-30 | Descent-B (repeated-bout memory) |
| 10 | 2026-08-31 | 2026-09-13 | Altitude-A (dose + sigmoid) |
| 11 | 2026-09-14 | 2026-09-27 | Altitude-B (intensity dampening + AMS) |
| 12 | 2026-09-28 | 2026-10-11 | Ensemble (Adaptive Plan Engine) |
| 13 | 2026-10-12 | 2026-10-25 | Release hardening |

---

## 7. Phase 0 — Foundation · Sprint 1

**Window:** 2026-04-27 → 2026-05-10
**Goal:** De-risk every downstream sprint by putting the scaffolding in place — feature-store module, DEM ingestion skeleton, observability hooks, engine ADR template, coverage gate.

**Touches existing** (per §4.4):
- Re-exports from `src/utils/readiness.ts` and `src/utils/trimp.ts` into `src/engines/` — no behaviour change.
- `.github/workflows/deploy.yml` coverage gate raised to 80/80/80/80.
- Stats tab sub-tabs introduced (`CompliancePanel`, `ReadinessPanel`, `PerformancePanel` re-parented, source unchanged).
- **No UI primitives or tests modified.** All 12 shipped test files must stay green at DoD.

### 7.1 User stories

**US-S1-01** — *As a developer, I want a single `src/engines/` module boundary so engine code stays separable from UI.*
- **AC1.** `Given` the repo state at start of sprint, `When` I open `src/engines/index.ts`, `Then` it re-exports `readiness`, `mim`, `terrain`, `descent`, `altitude` namespaces (stubs OK).
- **AC2.** `Given` `src/engines/readiness/`, `When` I compare to the existing `src/utils/readiness.ts`, `Then` existing symbols are re-exported with no behaviour change (verified by `trimp.test.ts`, `readiness.test.ts` still green).

**US-S1-02** — *As a developer, I want a typed `FeatureStore` interface so every engine consumes a consistent shape.*
- **AC1.** Types defined in `src/engines/featureStore.ts` cover: `daily`, `activity`, `athlete`, `elevationTile`, `hypoxicExposure`, `eccentricBucket`.
- **AC2.** A `InMemoryFeatureStore` implementation passes round-trip tests (`src/__tests__/featureStore.test.ts`).

**US-S1-03** — *As a developer, I want a DEM adapter interface so DEM sources can be swapped without touching engines.*
- **AC1.** `DEMAdapter.lookup(lat, lon): Promise<ElevationSample>` defined with a mock adapter under test.
- **AC2.** Real adapter stubs exist for `Open-Elevation`, `USGS 3DEP`, `SRTM`, `ASTER GDEM` (only `Open-Elevation` wired for now; others throw `NotImplementedError`).

**US-S1-04** — *As a developer, I want an evidence-tier system in code so every engine coefficient can be tagged T1–T4.*
- **AC1.** `type EvidenceTier = 'T1' | 'T2' | 'T3' | 'T4'` exported from `src/engines/evidence.ts`.
- **AC2.** `interface TieredValue<T> { value: T; tier: EvidenceTier; citation: string }` used by at least one MIM matrix entry as a smoke-test.

**US-S1-05** — *As a developer, I want coverage gating enforced in CI.*
- **AC1.** `vitest.config.ts` `coverage.thresholds` set to **80 / 80 / 80 / 80** (statements / branches / functions / lines).
- **AC2.** `.github/workflows/deploy.yml` fails the job if coverage drops below threshold.

### 7.2 Engineering tasks

1. Create `src/engines/` subfolders: `readiness/`, `mim/`, `terrain/`, `descent/`, `altitude/`, plus `engines/featureStore.ts`, `engines/evidence.ts`, `engines/adapters/`.
2. Move (not re-write) existing readiness + trimp logic behind the new module boundary; update imports.
3. Add `src/engines/adapters/demAdapter.ts` + `openElevation.ts`.
4. Extend `vitest.config.ts` with coverage thresholds; wire `npm run test:coverage`.
5. Add `docs/adr/0001-engine-module-layout.md` (ADR template provided in §7.5).
6. Add `docs/adr/0002-evidence-tiers.md`.
7. Update `README.md` with a Quickstart for the new engine module.
8. Add `.github/PULL_REQUEST_TEMPLATE.md` referencing the QA checklist in §13.
9. Add structured logging via `debug` package (prefix `ba:engine:*`).

### 7.3 QA/QC checklist (Sprint 1)
- [ ] `npm ci && npm run lint && npm test` all green locally and on CI.
- [ ] Coverage ≥ 80% on new `src/engines/` code.
- [ ] All existing 12 test files still pass unchanged.
- [ ] ADRs 0001, 0002 reviewed.
- [ ] No change to user-facing behaviour (manual smoke: open app, readiness still renders).
- [ ] `git tag v0.1.0` created on merge to `main`.

### 7.4 Test matrix (Sprint 1)
| Layer | File(s) | Asserts |
|-------|---------|---------|
| Unit | `featureStore.test.ts` | round-trip, overwrite, time-range query |
| Unit | `evidence.test.ts` | tier ordering, citation string invariant |
| Unit | `demAdapter.openElevation.test.ts` | HTTP mock, 200/404/timeout paths |
| Regression | existing 12 test files | all still green after refactor |

### 7.5 Risks (Sprint 1)
| ID | Risk | Probability | Impact | Mitigation |
|----|------|-------------|--------|------------|
| R-S1-1 | Refactor breaks hidden imports | M | H | Add coverage gate first, refactor second |
| R-S1-2 | Open-Elevation rate-limits dev | L | M | Mock adapter used in tests; cache real calls |
| R-S1-3 | Coverage gate blocks other PRs | M | M | Ramp-in: warn in S1, fail in S2+ |

**Definition of Done:** all 5 user stories AC pass · coverage gate merged · tag `v0.1.0` · ADRs 0001–0002 merged.

---

## 8. Phase 1 — Terrain Engine · Sprints 2–4

### 8.1 Sprint 2 — Terrain-A (GAP / Minetti)

**Window:** 2026-05-11 → 2026-05-24
**Goal:** Implement Grade-Adjusted Pace using the Minetti 2002 cost-of-locomotion polynomial for incline -45% to +45%.

**Touches existing** (per §4.4):
- `ActivityCard.tsx` gains a GAP field next to raw pace; layout preserved, no renames.
- `CoachSnapshot` type gets an additive `engines.terrain.gap` field.
- `WorkoutCard.tsx` gains an optional Terrain tier-chip slot (empty unless GAP present).
- All existing `trimp.test.ts`, `readiness.test.ts`, `plan-data.test.ts` must stay green.

**User stories:**

**US-S2-01** — *As an athlete, I want my trail pace normalised to flat-equivalent GAP so I can compare today's easy run on a 600 m-gain route to yesterday's flat run.*
- **AC1.** `Given` an activity with `altitudeStreamMeters[]` and `timeStreamSeconds[]`, `When` `computeGAP(activity)` is called, `Then` it returns a number ≥ activity.pace for net-uphill routes, ≤ activity.pace for net-downhill routes, with tolerance ±2% against a hand-computed fixture.
- **AC2.** `Given` a flat activity (|grade| < 1%), `When` `computeGAP` runs, `Then` GAP ≈ actual pace (±0.5%).
- **AC3.** Minetti 2002 polynomial coefficients (T2, PMID 12235031) used and cited in `src/engines/terrain/minetti.ts` header comment.

**US-S2-02** — *As an athlete, I want GAP shown next to my raw pace in the activity view.*
- **AC1.** Activity detail card shows `pace` and `gap` side by side when GAP is computable.
- **AC2.** If elevation stream is missing, GAP field shows "—" (not 0, not NaN).

**Engineering tasks:**
1. `src/engines/terrain/minetti.ts` — pure function `costOfLocomotion(grade: number): number`.
2. `src/engines/terrain/gap.ts` — `computeGAP(activity: StravaActivity): number | null`.
3. Unit tests with 6 fixtures: flat / 5% up / 10% up / 5% down / rolling / bad-data.
4. Extend `ActivityCard.tsx` to render GAP.
5. Add GAP to `CoachSnapshot.engines.terrain.gap` so the LLM coach can cite it.

**QA/QC:**
- [ ] Minetti polynomial implemented with published coefficients (not re-derived).
- [ ] Fixtures include one real-world activity (e.g., Broken Arrow 26K elevation stream).
- [ ] UI copy: "GAP (grade-adjusted pace)" with a tooltip citing Minetti 2002.
- [ ] No negative GAP, no NaN, no Infinity; guardrails with runtime assertions.
- [ ] Performance: GAP computation on a 2-hour activity (7,200 samples) < 50 ms.

**Test matrix:**
| Layer | Test | Notes |
|-------|------|-------|
| Unit | `minetti.test.ts` | 10 grade points vs published table |
| Unit | `gap.test.ts` | 6 fixtures covering edge cases |
| Unit | `gap.perf.test.ts` | 7,200-sample activity < 50 ms |
| Integration | `terrain.integration.test.ts` | GAP populated into `CoachSnapshot` |
| E2E | Playwright smoke | activity card renders GAP label |

**Risks:**
| ID | Risk | P | I | Mitigation |
|----|------|---|---|------------|
| R-S2-1 | Elevation stream has drift/spikes | H | M | Smoothing window (rolling 5-sample median) before GAP |
| R-S2-2 | Minetti invalid beyond ±45% | M | L | Clamp grade, log warning, fall back to raw pace |

**DoD:** AC pass · coverage ≥ 85% on new files · tag `v0.2.0`.

---

### 8.2 Sprint 3 — Terrain-B (DEM correction)

**Window:** 2026-05-25 → 2026-06-07
**Goal:** Replace device-reported elevation with DEM-snapped elevation. Correct cumulative gain/loss with cached tiles; fall back gracefully.

**Touches existing** (per §4.4):
- Activity-ingest pipeline augmented; elevation display reads corrected gain from same shape.
- `VitalsGrid.tsx`, `TRIMPBreakdown.tsx`, `WorkoutCard.tsx` **untouched** — they consume the corrected numbers transparently.
- Existing elevation stream remains available as `rawAltitudeStream` for fallback / comparison.
- All 12 shipped test files must stay green at DoD.

**User stories:**

**US-S3-01** — *As an athlete, I want my elevation gain to match reality (±3%), not the barometer's drift.*
- **AC1.** `Given` an activity with lat/lon stream and DEM coverage, `When` `correctElevation(activity)` runs, `Then` returned gain is within 3% of a known-good reference (e.g., Strava Summit-verified gain).
- **AC2.** `Given` no DEM coverage (outside US + no SRTM), `When` correction is attempted, `Then` original stream returned unchanged with `correctionApplied: false`.

**US-S3-02** — *As a developer, I want DEM tile caching so we don't re-fetch tiles for hot routes.*
- **AC1.** Tile cache (in-memory LRU with optional `localStorage` overflow) with configurable TTL.
- **AC2.** Cache hit-rate observable via `debug` logs.

**Engineering tasks:**
1. `src/engines/terrain/dem.ts` — `correctElevation(activity)` orchestrating adapter calls.
2. `src/engines/adapters/usgs3DEP.ts` + `srtm.ts` + `asterGDEM.ts` (region-dispatch logic in `dem.ts`).
3. Tile cache (`src/engines/terrain/tileCache.ts`).
4. Retry / circuit-breaker on adapter failure (max 3 retries, exponential backoff).
5. Update `computeGAP` to prefer DEM-corrected stream.

**QA/QC:**
- [ ] Adapter interface unit-tested with mock HTTP server.
- [ ] Cache eviction policy verified with a test that fills past capacity.
- [ ] Region-dispatch logic: US → 3DEP, 60°S–60°N non-US → SRTM, polar → ASTER, fallback → Open-Elevation.
- [ ] Observability: every correction emits `{ activityId, gainBefore, gainAfter, pctDelta, source }` log.
- [ ] Network-failure paths tested with injected 500s / timeouts / malformed payloads.

**Test matrix:**
| Layer | Test | Notes |
|-------|------|-------|
| Unit | `tileCache.test.ts` | LRU eviction, TTL expiry |
| Unit | `dem.region.test.ts` | dispatch table |
| Unit | `usgs3DEP.test.ts` | mock HTTP |
| Unit | `srtm.test.ts` | mock HTTP |
| Integration | `demCorrection.integration.test.ts` | real Broken Arrow 26K fixture, gain within 3% of published |
| Regression | `gap.test.ts` | GAP still correct when DEM correction runs |

**Risks:**
| ID | Risk | P | I | Mitigation |
|----|------|---|---|------------|
| R-S3-1 | DEM tile bandwidth costs | M | M | Cache aggressively; batch lookups |
| R-S3-2 | Elevation cliff at tile boundaries | M | M | Bilinear interpolation across neighbouring cells |
| R-S3-3 | CORS blocks browser-side DEM calls | H | H | Proxy via Cloudflare Worker (`worker/dem-proxy.ts`) |

**DoD:** AC pass · Broken Arrow 26K fixture passes integration · tag `v0.3.0`.

---

### 8.3 Sprint 4 — Terrain-C (Vertical Efficiency + UTMB Index)

**Window:** 2026-06-08 → 2026-06-21
**Goal:** Compute Vertical Efficiency (VE) and expose a pluggable UTMB Index / ITRA Performance Index provider.

**Touches existing** (per §4.4):
- `PerformanceChart.tsx` extended with an optional VE metric pill (existing metric pills preserved).
- `PerformanceGlossary.tsx` gains VE + UTMB-Index + ITRA-PI glossary rows.
- `WorkoutCard.tsx` Terrain tier chip now renders when VE / UTMB-Index is known.
- All existing Stats tab tests (`compliance.test.ts`, `performance.test.ts`, `raceProjection.test.ts`) must stay green.

**User stories:**

**US-S4-01** — *As an athlete, I want my Vertical Efficiency tracked so I know whether my power-hiking has improved.*
- **AC1.** `computeVE(activity, athlete): { vamMPerHour: number; crossoverGrade: number; runRatio: number }`.
- **AC2.** Crossover grade per Giovanelli 2016 (PMID 27116915) — between 15.8° and 22°, modulated by athlete fitness proxy (VO₂max estimate).
- **AC3.** `runRatio` = fraction of vertical time spent above crossover (i.e., running rather than hiking).

**US-S4-02** — *As an athlete, I want a UTMB Index estimate based on my recent races so the coach can set realistic race goals.*
- **AC1.** `src/engines/terrain/utmbIndex.ts` exposes `estimateUTMBIndex(athlete, races): UTMBIndexResult`.
- **AC2.** Falls back to ITRA-Performance-Index formula when UTMB data unavailable.
- **AC3.** Result includes `{ value, confidence, method, citations }`.

**Engineering tasks:**
1. `src/engines/terrain/ve.ts` + `giovanelli.ts` crossover table.
2. `src/engines/terrain/utmbIndex.ts` + `itraIndex.ts`.
3. Extend `CoachSnapshot.engines.terrain` with `{ gap, ve, utmbIndex }`.
4. UI: Terrain card in `DashboardView` showing VE trend + latest UTMB index.
5. Add README section "Race-ready metrics".

**QA/QC:**
- [ ] Giovanelli crossover values cited in source comment (PMID 27116915).
- [ ] UTMB/ITRA formulas validated against 3 published athlete profiles.
- [ ] VE trend chart uses a 4-week rolling window.
- [ ] Coach persona prompt extended so `{{engines.terrain.ve}}` is available for the LLM to cite.
- [ ] No PII about other athletes leaks into ITRA fallback path.

**Test matrix:**
| Layer | Test | Notes |
|-------|------|-------|
| Unit | `ve.test.ts` | crossover at 15.8°, 22°, edge grades |
| Unit | `utmbIndex.test.ts` | 3 known-athlete fixtures |
| Unit | `itraIndex.test.ts` | fallback path |
| Integration | `terrain.full.integration.test.ts` | GAP + DEM + VE + UTMB all populated |
| Snapshot | `DashboardView.test.tsx` | terrain card renders |

**Risks:**
| ID | Risk | P | I | Mitigation |
|----|------|---|---|------------|
| R-S4-1 | ITRA index formula not publicly documented | H | M | Approximate from published race equivalencies, tag T3 |
| R-S4-2 | Giovanelli crossover varies inter-athlete | M | L | Expose as tunable per-athlete parameter |

**DoD:** Terrain engine marked LIVE in status badge · phase 1 retrospective filed · tag `v0.4.0`.

**Phase 1 exit criteria:** GAP, DEM-corrected gain, VE, UTMB Index all feeding `CoachSnapshot`; dashboard shows all four; coverage ≥85% on `src/engines/terrain/`.

---

## 9. Phase 2 — MIM (Novel IP) · Sprints 5–7

**Context:** MIM today is a static `Record<SportType, number>`. The moat play in `BA_Vector1_Science_v3.html §5` is to upgrade to a **Bayesian partial-pooled model** where each athlete has a personalised posterior that shrinks toward a fleet-wide prior, with per-sport evidence tiers and a fully transparent "why" UI.

### 9.1 Sprint 5 — MIM-A (Priors + Bayesian scaffold)

**Window:** 2026-06-22 → 2026-07-05
**Goal:** Fit population priors from historical fleet data; stand up the Bayesian computation path; run it shadow-mode alongside the static matrix.

**Touches existing** (per §4.4):
- `src/utils/trimp.ts` — Bayesian posterior computed *alongside* the static `MIM_MATRIX`. **Static matrix output remains the default** for end users until Sprint 6 cohort flip.
- `CoachSnapshot` type gains `engines.mim.posterior` (additive).
- No UI changes. No existing component touched.
- `trimp.test.ts` must stay green; new `mim.bayes.test.ts` added alongside.

**User stories:**

**US-S5-01** — *As a data-aware developer, I want population priors fit from fleet data so personalisation has a sensible starting point.*
- **AC1.** Offline notebook `docs/notebooks/mim-priors.ipynb` computes per-sport μ and σ with ≥30 athletes × 12 weeks of data.
- **AC2.** Output: `src/engines/mim/priors.json` with `{ sport, mu, sigma, tier, citation, sampleSize }` per sport.
- **AC3.** Priors for low-N sports (< 10 athletes) tagged `tier: 'T4'` and visually flagged.

**US-S5-02** — *As a developer, I want a Bayesian partial-pooling computation that returns posterior MIM per athlete.*
- **AC1.** `computeMIMPosterior(athlete, observations, priors): { sport → { mean, sd, tier } }` in `src/engines/mim/bayes.ts`.
- **AC2.** Implementation follows Efron-Morris (1977) / Gelman BDA3 Ch 5 shrinkage.
- **AC3.** When athlete has zero observations for a sport, posterior == prior.
- **AC4.** When athlete has many (>30) observations, posterior mean within 10% of raw athlete mean.

**US-S5-03** — *As a PM, I want MIM shadow-mode: compute new-MIM alongside legacy static MIM, log deltas, do not change prescription yet.*
- **AC1.** Behind feature flag `ENGINES_MIM_BAYES=shadow`.
- **AC2.** Delta (new − legacy) logged per day per athlete.
- **AC3.** No change to UI or prescriptions.

**Engineering tasks:**
1. `src/engines/mim/priors.json` (generated) + generation script `scripts/fit-mim-priors.ts`.
2. `src/engines/mim/bayes.ts` — pure posterior computation.
3. `src/engines/mim/index.ts` — `computeMIM(athlete, day)` dispatches legacy vs Bayes based on flag.
4. Shadow-mode logging.
5. Notebook-style doc in `docs/notebooks/mim-priors.md` (we can't ship `.ipynb`, so Markdown + code blocks).

**QA/QC:**
- [ ] Priors fit is reproducible — notebook includes seed and sample sizes.
- [ ] Shrinkage tested with synthetic data (high-N athlete should dominate, low-N should hug prior).
- [ ] Flag defaults to OFF in production.
- [ ] Privacy: priors computation uses hashed athlete IDs, no PII.

**Test matrix:**
| Layer | Test | Notes |
|-------|------|-------|
| Unit | `bayes.test.ts` | 6 synthetic fleets, shrinkage monotonicity |
| Unit | `priors.schema.test.ts` | JSON schema valid |
| Integration | `mim.shadow.integration.test.ts` | Both paths produce sensible values on a fixture day |
| Regression | existing `trimp.test.ts` | behaviour unchanged with flag OFF |

**Risks:**
| ID | Risk | P | I | Mitigation |
|----|------|---|---|------------|
| R-S5-1 | Fleet data too small for meaningful priors | H | H | Mark low-N sports T4, flag to user |
| R-S5-2 | Shadow logs blow up analytics cost | M | M | Sample 10% of days, not all |

**DoD:** shadow-mode live on staging · 14-day drift report filed · tag `v0.5.0`.

---

### 9.2 Sprint 6 — MIM-B (Personalisation loop)

**Window:** 2026-07-06 → 2026-07-19
**Goal:** Close the learning loop — ingest soreness / readiness signals, update posteriors nightly, switch cohort of opt-in users to the new MIM.

**Touches existing** (per §4.4):
- `CoachInsightCard.tsx` extended with a soreness-feedback prompt variant (existing variants preserved).
- `src/utils/trimp.ts` — opt-in cohort reads from Bayesian posterior; **static `MIM_MATRIX` retained as cold-start fallback** for new users with <14 days of data.
- `CoachMemory` type gains `sorenessLog[]` (additive).
- `trimp.test.ts`, `coachAnalyticsSnapshot.test.ts`, `coachInsightCache.test.ts` must stay green.

**User stories:**

**US-S6-01** — *As an athlete, I want a "how sore are your legs?" prompt after strength and downhill days so MIM can learn my response.*
- **AC1.** 1–10 soreness prompt shown the morning after any `strength_lower`, `strength_full`, or descent-heavy activity.
- **AC2.** Response stored to feature store, keyed by athlete + date + sport bucket.
- **AC3.** Prompt is skippable; skipped state is distinct from 0.

**US-S6-02** — *As an athlete, I want the MIM personalised to me after ~20 strength sessions (per sport bucket).*
- **AC1.** Nightly job (Vercel cron or manual trigger) re-runs posterior using observations up to yesterday.
- **AC2.** Posterior stored to feature store; `computeMIM` reads from posterior store when `ENGINES_MIM_BAYES=active`.
- **AC3.** When sample size ≥ 20, MIM posterior tier upgrades from T3 to T2 in the UI.

**US-S6-03** — *As a developer, I want a cohort rollout so we flip a small group first.*
- **AC1.** `FeatureFlagService.variant('mim-bayes', athleteId)` returns `'shadow' | 'active' | 'legacy'`.
- **AC2.** Cohort definition in `config/cohorts.json`.

**Engineering tasks:**
1. `src/components/SorenessPrompt.tsx` + hook.
2. `api/mim/update-posteriors.py` (Vercel serverless cron).
3. `src/engines/mim/learner.ts` — observation → posterior update.
4. `src/services/featureFlags.ts` cohort support.
5. Migrate 5 opt-in test athletes to `active`.

**QA/QC:**
- [ ] Prompt UX tested on mobile + desktop.
- [ ] Cron job idempotent (re-runs produce identical output).
- [ ] Soreness observations timezone-safe (align with athlete tz, not server).
- [ ] Manual dry-run of posterior update before live cohort flip.
- [ ] Rollback path: set flag to `shadow` returns behaviour to S5 state.

**Test matrix:**
| Layer | Test | Notes |
|-------|------|-------|
| Unit | `learner.test.ts` | observation update monotonicity |
| Component | `SorenessPrompt.test.tsx` | render, submit, skip |
| Integration | `mim.learner.integration.test.ts` | 25 synthetic observations shrinks posterior sd |
| API | `update-posteriors.test.py` | pytest against fixture DB |
| Regression | full test suite | must stay green |

**Risks:**
| ID | Risk | P | I | Mitigation |
|----|------|---|---|------------|
| R-S6-1 | Soreness-prompt fatigue | M | M | Cap to ≤3 prompts/week; smart skip after high compliance |
| R-S6-2 | Cron job timeout (Vercel 10 s limit) | M | H | Batch athletes in chunks of 50; or move to Cloudflare Worker |
| R-S6-3 | Posterior overfits noisy athletes | M | M | Cap shrinkage at prior σ × 0.3 |

**DoD:** 5 cohort users on `active` for 14 days · no readiness regression · tag `v0.6.0`.

---

### 9.3 Sprint 7 — MIM-C (Evidence-tier UI + methodology doc)

**Window:** 2026-07-20 → 2026-08-02
**Goal:** Ship the explainability layer and publish the methodology doc — the moat is only defensible if we can *show* the science.

**Touches existing** (per §4.4):
- `CoachInsightCard.tsx` gains citation-chip slot (T1–T4 badges with PMID links); existing card body layout preserved.
- `PerformanceGlossary.tsx` gains MIM rows (Bayesian posterior, per-user CI, static fallback).
- `TierChip.tsx` shared primitive unchanged; re-used in new contexts.
- Publishes `docs/mim-methodology.md` (new file).
- All existing test files must stay green.

**User stories:**

**US-S7-01** — *As an athlete, I want each MIM coefficient to show its evidence tier and source so I trust the numbers.*
- **AC1.** Hover / tap on any sport's MIM in the UI surfaces `{ tier, citation, sampleSize, posteriorSD }`.
- **AC2.** T1 badge = green, T2 = blue, T3 = amber, T4 = grey.
- **AC3.** Tooltip cites the exact paper (author + year + PMID/DOI).

**US-S7-02** — *As a developer, I want a `docs/mim-methodology.md` explaining OpenSim → GRADE → partial-pooling so future contributors can extend the model.*
- **AC1.** Document covers: model purpose, inputs, priors, shrinkage, per-user learning, tier assignment rules, known limitations.
- **AC2.** All cited papers listed with PMID/DOI.
- **AC3.** At least one worked example with numbers.

**US-S7-03** — *As a PM, I want all cohorts flipped to `active` after the evidence-tier UI ships.*
- **AC1.** Full rollout behind a 48-hour canary.
- **AC2.** Rollback runbook added to `docs/runbooks/mim-rollback.md`.

**Engineering tasks:**
1. `src/components/MIMEvidenceBadge.tsx`.
2. Extend `MIMPosterior` type with `tier`, `citation`, `sampleSize`, `posteriorSD`.
3. Write `docs/mim-methodology.md` (~2,000 words).
4. Canary rollout (10% → 50% → 100%) via flag service.
5. Update `BA_Vector1_Science_v3.html §5` with link to methodology doc.

**QA/QC:**
- [ ] Tooltip content accurate vs source papers (human cross-check by Mike).
- [ ] Accessibility: tooltips keyboard-reachable, colour-blind-safe badges (shape + colour).
- [ ] Methodology doc peer-reviewed by at least one external physiologist (tracked as risk if not).
- [ ] Runbook tested by performing a rollback in staging.

**Test matrix:**
| Layer | Test | Notes |
|-------|------|-------|
| Component | `MIMEvidenceBadge.test.tsx` | all 4 tier variants render |
| Visual | Storybook snapshot | 4 badges |
| Integration | `mim.full.integration.test.ts` | badge renders with real posterior |
| Doc | `lint-citations.test.ts` | every PMID in methodology doc resolves |

**Risks:**
| ID | Risk | P | I | Mitigation |
|----|------|---|---|------------|
| R-S7-1 | External physiologist review slips | M | M | Ship with T4 flag on unreviewed sections |
| R-S7-2 | Canary detects a regression | M | H | Runbook rollback tested in staging |

**DoD:** MIM engine LIVE with novel IP characteristics · methodology doc published · tag `v0.7.0`.

**Phase 2 exit criteria:** Bayesian posterior computed nightly · evidence-tier UI live · methodology doc merged · legacy static matrix kept as fallback only.

---

## 10. Phase 3 — Descent-Load · Sprints 8–9

### 10.1 Sprint 8 — Descent-A (Eccentric-TRIMP)

**Window:** 2026-08-03 → 2026-08-16
**Goal:** Compute eccentric dose per activity using descent steepness × speed × time, per Vernillo 2017 and Peake 2017.

**Touches existing** (per §4.4):
- `src/utils/trimp.ts` — eccentric dose computed *alongside* existing TRIMP; `DOMS_CARRY` coefficients kept as baseline and extended with descent-specific decay.
- `TRIMPBreakdown.tsx` gains a new `eccentricDose` series stacked onto existing sport-type bars (existing bars preserved).
- `InjuryRiskAlerts.tsx` gains a descent-load red-flag channel.
- `trimp.test.ts` must stay green; new `eccentric.test.ts`, `descent.integration.test.ts` added.

**User stories:**

**US-S8-01** — *As an athlete, I want eccentric load quantified per activity so a 2,000 m descent day doesn't look like a flat easy day in my load balance.*
- **AC1.** `computeEccentricTRIMP(activity): { eccTRIMP, buckets: { mild, moderate, severe } }` in `src/engines/descent/eccentric.ts`.
- **AC2.** Buckets per Vernillo 2017 (PMID 28497285): mild −3…−8%, moderate −8…−15%, severe <−15%.
- **AC3.** Aggregation: `eccTRIMP = Σ bucket_weight × duration × pace_penalty`.

**US-S8-02** — *As an athlete, I want eccentric load added to my daily TRIMP total but tagged separately so CTL/ATL/TSB can be downhill-aware.*
- **AC1.** `TRIMPRecord` gains `eccentricTRIMP` and `eccentricBuckets` fields.
- **AC2.** Legacy code-paths default these to 0 (non-breaking).
- **AC3.** CTL/ATL/TSB calculation optionally upweights eccentric TRIMP (config-driven, default 1.0).

**Engineering tasks:**
1. `src/engines/descent/eccentric.ts` with pure computation.
2. Extend `src/types/index.ts` `TRIMPRecord`.
3. Update `src/utils/trimp.ts` CTL/ATL/TSB loop to include eccentric contribution.
4. Dashboard: new "Eccentric load" strip on the Load tab.
5. Coach snapshot extension: `engines.descent.eccentricTRIMP`.

**QA/QC:**
- [ ] Bucket boundaries match Vernillo 2017 exactly (copy from paper, cite in comment).
- [ ] Pace-penalty function monotonically increasing with |grade|.
- [ ] Regression: `trimp.test.ts` unchanged for flat activities (eccentric = 0).
- [ ] Fixture: Broken Arrow 26K descent segment → eccentric > 0; flat 10K → eccentric = 0.
- [ ] Unit consistency: TRIMP arbitrary units but printed with same precision as Banister TRIMP.

**Test matrix:**
| Layer | Test | Notes |
|-------|------|-------|
| Unit | `eccentric.test.ts` | 3 bucket boundaries + 2 real activity fixtures |
| Regression | `trimp.test.ts` | flat-only unchanged |
| Integration | `descent.integration.test.ts` | CTL/ATL/TSB still numerically stable |

**Risks:**
| ID | Risk | P | I | Mitigation |
|----|------|---|---|------------|
| R-S8-1 | Pace-penalty coefficient is a choice, not a measurement | H | M | Flag as T4; expose as tunable; revisit in S11 |
| R-S8-2 | Back-compat break with stored TRIMPRecord | M | H | Migration: default 0; schema versioning |

**DoD:** AC pass · fixture test passes · tag `v0.8.0`.

---

### 10.2 Sprint 9 — Descent-B (Repeated-bout memory)

**Window:** 2026-08-17 → 2026-08-30
**Goal:** Model the repeated-bout effect — after a downhill bout, the next same-stimulus bout within 7–14 days incurs less damage (Hyldahl 2017 PMID 28457071 meta).

**Touches existing** (per §4.4):
- `src/utils/trimp.ts` `applyDOMSCarryForward` extended with 7–14-day repeated-bout decay (existing 2-day decay preserved as baseline).
- `CoachSnapshot.engines.descent.repeatedBoutProtection` field added (additive).
- No UI component touched.
- `trimp.test.ts` must stay green; new `repeatedBout.test.ts` added.

**User stories:**

**US-S9-01** — *As an athlete, I want my second downhill workout in a week to be counted as less damaging than the first.*
- **AC1.** `bout_n_dose = dose × decay(n, days_since_prior)` with half-life ~10 days.
- **AC2.** Applies only within matching bucket (severe descent protects against severe, not mild).
- **AC3.** Decay curve parameters exposed as `T3` evidence; can be personalised in later phases.

**US-S9-02** — *As a coach (LLM), I want `engines.descent.boutMemory` in `CoachSnapshot` so prescriptions account for prior damage.*
- **AC1.** `CoachSnapshot.engines.descent.boutMemory` exposes `{ lastSevereDate, lastModerateDate, protectionFactor }`.

**US-S9-03** — *As an athlete, I want the readiness engine to raise a RED-flag earlier if I'm doing back-to-back eccentric days.*
- **AC1.** Readiness integration: if `eccTRIMP` last 48 h > athlete p75 baseline, RED threshold tightens by 0.1 points.
- **AC2.** Change is observable (logged) and reversible via feature flag.

**Engineering tasks:**
1. `src/engines/descent/boutMemory.ts`.
2. `src/engines/descent/index.ts` composes eccentric + boutMemory + integration wiring.
3. Update `src/engines/readiness/` to accept `EccentricSignal` (without refactoring readiness core).
4. Add `descent.full.integration.test.ts`.
5. Document in `docs/adr/0003-descent-engine.md`.

**QA/QC:**
- [ ] Half-life tunable; default 10 days per Hyldahl 2017.
- [ ] Readiness change gated behind flag until cohort-verified.
- [ ] No cross-bucket protection (severity-matched only).
- [ ] Load balance KPIs (CTL/ATL/TSB) remain numerically stable after change.

**Test matrix:**
| Layer | Test | Notes |
|-------|------|-------|
| Unit | `boutMemory.test.ts` | decay correctness |
| Integration | `descent.full.integration.test.ts` | eccentric + bout + readiness nudge |
| Regression | `readiness.test.ts` | unchanged when flag OFF |

**Risks:**
| ID | Risk | P | I | Mitigation |
|----|------|---|---|------------|
| R-S9-1 | Readiness nudge hurts compliance (athlete sees unexpected RED) | M | M | Explain in UI: "Eccentric load carry-over" chip |
| R-S9-2 | Bout memory overwrites user judgment | M | L | Never auto-skip a workout, only tighten recommendation |

**DoD:** Descent engine marked LIVE · ADR 0003 merged · phase 3 retro filed · tag `v0.9.0`.

**Phase 3 exit criteria:** eccentric-TRIMP + bout memory production-flagged for all users · readiness integration shadow-mode validated · ADR merged.

---

## 11. Phase 4 — Altitude Engine · Sprints 10–11

### 11.1 Sprint 10 — Altitude-A (Dose + Acclimatization sigmoid)

**Window:** 2026-08-31 → 2026-09-13
**Goal:** Build the hypoxic-dose accumulator and the Levine & Stray-Gundersen LHTL acclimatization curve.

**Touches existing** (per §4.4):
- `IntegrationsRow.tsx` — Zwift row label upgraded from "optional" to "recommended for altitude prep" (single string change; connection logic preserved).
- `CoachSnapshot.engines.altitude.{dose,acclimatization}` added (additive).
- `src/engines/altitude/` is new code; no shipped util modified.
- All existing test files must stay green.

**User stories:**

**US-S10-01** — *As an altitude-travelling athlete, I want the app to track how much time I've spent at altitude so it understands my acclimatization state.*
- **AC1.** `computeHypoxicDose(exposures): { kmHoursAbove1500m, kmHoursAbove2500m }`.
- **AC2.** Exposures ingested from activity altitude + sleep-altitude (if reported) + manual "trip to altitude" entry.

**US-S10-02** — *As an athlete, I want my acclimatization state shown on a 0–100 scale.*
- **AC1.** `acclimatizationIndex(exposures, athlete): number` with sigmoid per Levine 1997 (PMID 9216968) / Chapman 2014 (PMID 24264287).
- **AC2.** Hits 50 after ~2 weeks at 2,000–2,500 m given sufficient dose.
- **AC3.** Decays back down over ~2–3 weeks at sea level.

**Engineering tasks:**
1. `src/engines/altitude/dose.ts` + `acclimatization.ts`.
2. Manual "altitude trip" entry form (`src/components/AltitudeTripForm.tsx`).
3. HealthKit integration: pull altitude samples if present (`ios/BrokenArrowHealth/AltitudeExporter.swift` stub; ship stub only this sprint).
4. Dashboard strip showing current acclimatization index.

**QA/QC:**
- [ ] Sigmoid parameters cited from Levine 1997 and Chapman 2014.
- [ ] Sea-level decay curve tested.
- [ ] Edge cases: athlete lives at altitude — baseline index starts high.
- [ ] Time-zone safety on exposure timestamps.

**Test matrix:**
| Layer | Test | Notes |
|-------|------|-------|
| Unit | `dose.test.ts` | flat sea-level = 0 |
| Unit | `acclimatization.test.ts` | sigmoid monotonicity, decay rate |
| Component | `AltitudeTripForm.test.tsx` | submit + validation |
| Integration | `altitude.integration.test.ts` | dose → index → snapshot |

**Risks:**
| ID | Risk | P | I | Mitigation |
|----|------|---|---|------------|
| R-S10-1 | No altitude stream in HealthKit for many athletes | H | M | Manual trip entry as first-class UX |
| R-S10-2 | Sigmoid is whole-population, not personal | M | M | Mark T2; revisit in post-plan phase |

**DoD:** AC pass · manual trip entry shipping · tag `v0.10.0`.

---

### 11.2 Sprint 11 — Altitude-B (Intensity dampening + AMS)

**Window:** 2026-09-14 → 2026-09-27
**Goal:** Use the altitude index to dampen prescribed paces / HRs and raise an AMS safety flag if ascent-rate × altitude is aggressive.

**Touches existing** (per §4.4):
- **Adds** `TripsSection.tsx` and `AltitudeWizard.tsx` — mounted in `SettingsView.tsx` above Integrations (Settings shell preserved).
- `WorkoutCard.tsx` gains optional "altitude dampening applied" caveat text (existing layout preserved).
- `InjuryRiskAlerts.tsx` gains an AMS red-flag channel (Bailey 2021 consensus).
- `CoachInsightCard.tsx` gains AMS advisory variant.
- All existing test files must stay green; new `altitudeDampening.test.ts`, `ams.test.ts` added.

**User stories:**

**US-S11-01** — *As an athlete training in Boulder, I want my prescribed paces slowed to match the altitude penalty.*
- **AC1.** `dampenPrescription(prescription, altitudeMeters, acclimatizationIndex)` returns updated paces.
- **AC2.** Loss-per-100 m above 1,500 m per West 2013 (Ch 11): ~1% VO₂max per 100 m, non-linear >3,000 m.
- **AC3.** Partial recovery as `acclimatizationIndex` rises.

**US-S11-02** — *As an athlete ascending rapidly (e.g., flight to a 3,500 m race), I want an AMS advisory.*
- **AC1.** Advisory triggered per Bailey 2021 (PMID 34001987) consensus: `ascentRate > 500 m/day AND currentAltitude > 3,000 m`.
- **AC2.** Advisory surfaces in UI + LLM coach copy with link to Bailey 2021 summary.
- **AC3.** Never blocks app usage; informational only.

**US-S11-03** — *As a developer, I want altitude signals fully plugged into `CoachSnapshot`.*
- **AC1.** `engines.altitude = { currentAltM, acclimatizationIndex, intensityDampening, amsAdvisory }`.

**Engineering tasks:**
1. `src/engines/altitude/dampening.ts` — VO₂max loss curve, back-solved to pace.
2. `src/engines/altitude/ams.ts` — consensus check.
3. Integrate dampening into Adaptive Plan Engine (scaffold for S12).
4. UI strip + LLM prompt extension.
5. Update `BA_Vector1_Science_v3.html §4` with implementation pointers.

**QA/QC:**
- [ ] VO₂max loss curve plotted in a test against published data.
- [ ] Dampening never makes pace faster (one-way transformation).
- [ ] AMS advisory copy reviewed for medical-liability language ("advisory, not medical advice").
- [ ] No auto-cancellation of workouts.

**Test matrix:**
| Layer | Test | Notes |
|-------|------|-------|
| Unit | `dampening.test.ts` | curve at 1500/2500/3500 m |
| Unit | `ams.test.ts` | threshold crossings |
| Integration | `altitude.full.integration.test.ts` | end-to-end dose → advisory |
| Regression | `readiness.test.ts` | unaffected at sea level |

**Risks:**
| ID | Risk | P | I | Mitigation |
|----|------|---|---|------------|
| R-S11-1 | Medical-liability language in AMS advisory | M | H | Legal copy review; informational framing |
| R-S11-2 | Dampening overshoots for altitude-native athletes | M | M | Shrink dampening by `acclimatizationIndex / 100` |

**DoD:** Altitude engine marked LIVE · AMS advisory copy legally reviewed · tag `v0.11.0`.

**Phase 4 exit criteria:** altitude engine produces dose, index, dampening, and AMS signals; all feeding `CoachSnapshot`; dashboard shows altitude strip.

---

## 12. Phase 5 — Integration & Release · Sprints 12–13

### 12.1 Sprint 12 — Ensemble (Adaptive Plan Engine)

**Window:** 2026-09-28 → 2026-10-11
**Goal:** Compose all five engines into a single `DailyPrescription`. Ground the LLM coach on structured engine outputs so it never hallucinates engine values.

**Touches existing** (per §4.4) — this is the highest-touch sprint, but every change is additive or a wrapper:
- `TodayBriefing.tsx` — **preserved**; new `RileyHeroCard.tsx` wraps it on the Summary tab (existing component rendered as a child).
- `WhatChangedCard.tsx` — narrative source switched to `DailyPrescription.narrative`; component body untouched.
- `PlanView.tsx` — **"This week, per Riley"** narration card *prepended* above the existing list (list preserved).
- `CoachChat.tsx` header gains Riley avatar coin (visual-only).
- `api/coach/` Python prompt template extended to include `engines` payload; prompt stays backward-compatible when field absent.
- **All 12 shipped test files must stay green.** New `ensemble.test.ts`, `adaptivePlan.test.ts`, `riley-hero.test.tsx` added alongside.

**User stories:**

**US-S12-01** — *As an athlete, I want one clear daily prescription that respects readiness, MIM, terrain, eccentric load, and altitude.*
- **AC1.** `adaptivePlan(athlete, date): DailyPrescription` in `src/engines/adaptive/index.ts`.
- **AC2.** Prescription contains `{ sessionType, duration, intensityZones, intensityCeiling, caveats, explanations }`.
- **AC3.** `explanations[]` is keyed by engine (`readiness`, `mim`, `terrain`, `descent`, `altitude`).

**US-S12-02** — *As an athlete, I want a "why" card for each prescription.*
- **AC1.** Dashboard "Why this workout?" renders one line per engine with its contribution.
- **AC2.** Line shows evidence-tier badge.

**US-S12-03** — *As a developer, I want the LLM coach grounded strictly on `CoachSnapshot.engines`.*
- **AC1.** Coach prompt rewrite: explicit instruction "cite engine values only from the snapshot; do not invent."
- **AC2.** Golden prompt tests ensure the model cites correct values for 10 fixture days.

**Engineering tasks:**
1. `src/engines/adaptive/index.ts` — ensemble composition rules documented per engine.
2. Rules of priority (documented in ADR 0004):
   - Safety veto: AMS advisory → downgrade intensity to Z2 max.
   - Readiness RED → down-shift session.
   - Eccentric bout memory > 0.5 → cap descent work.
   - MIM high-impact day yesterday → recovery bias today.
   - Terrain/altitude dampening applied to pace zones.
3. LLM prompt + golden tests (`src/__tests__/coachGolden.test.ts`).
4. Dashboard "Why this workout?" card.
5. ADR 0004 — adaptive-plan priority rules.

**QA/QC:**
- [ ] Rule precedence explicit (never ambiguous).
- [ ] No rule can up-prescribe beyond readiness ceiling.
- [ ] Golden tests cover 10 fixture scenarios (hard day after green readiness, rest day after red, altitude travel day, post-descent day, etc).
- [ ] LLM evaluation: blind review of 10 coach outputs by Mike → pass rate ≥ 9/10.

**Test matrix:**
| Layer | Test | Notes |
|-------|------|-------|
| Unit | `adaptive.rules.test.ts` | rule precedence table |
| Golden | `coachGolden.test.ts` | 10 fixture days, snapshot-compared |
| Integration | `adaptive.full.integration.test.ts` | all 5 engines → prescription |
| Regression | full suite | no prior test breaks |

**Risks:**
| ID | Risk | P | I | Mitigation |
|----|------|---|---|------------|
| R-S12-1 | Rule precedence feels rigid / athlete disagrees | M | M | Allow athlete override; log; feed back to learner |
| R-S12-2 | LLM hallucinates numbers | M | H | Golden tests + strict prompt + post-hoc validator |

**DoD:** 10/10 golden coach tests pass · ADR 0004 merged · tag `v0.12.0`.

---

### 12.2 Sprint 13 — Release hardening

**Window:** 2026-10-12 → 2026-10-25
**Goal:** Performance, resilience, accessibility, docs, release train.

**Touches existing** (per §4.4):
- **Adds** `MethodologyView.tsx` (Screen 12 "How the 5 engines work") + Settings "Methodology" link row.
- Performance + a11y polish touches every shipped component; **no behaviour changes** beyond axe-core / lighthouse score targets.
- `CacheDiagnostics.tsx`, `PrivacyRow.tsx` validated but unchanged.
- Smoke tests exercise every tab's mounted state.
- All 12 shipped test files plus all new sprint test files must stay green.

**User stories:**

**US-S13-01** — *As a user, I want the app to load fast even with long history.*
- **AC1.** Daily compute time < 250 ms p95 for a 2-year-history athlete.
- **AC2.** Feature store queries profiled; any > 100 ms has an index or memoisation.

**US-S13-02** — *As a user with poor connectivity, I want the app to degrade gracefully.*
- **AC1.** Offline-first: last `CoachSnapshot` cached to localStorage; banner signals stale data > 24 h.
- **AC2.** DEM, Open-Elevation, Strava API failures do not blank the UI.

**US-S13-03** — *As a user relying on screen readers / colour-blind modes, I want every engine badge and tier to be accessible.*
- **AC1.** axe-core run with zero critical violations.
- **AC2.** All badges have aria-labels and non-colour signifiers (icon + text).

**US-S13-04** — *As a developer, I want a full release checklist and signed QA for v1.0.*
- **AC1.** `docs/runbooks/release-v1.md` with pre-launch QA, smoke tests, rollback.
- **AC2.** `CHANGELOG.md` synthesises S1–S13.
- **AC3.** Final tag `v1.0.0`.

**Engineering tasks:**
1. Performance pass: profile engine hot paths with `tinybench`; add memoisation where warranted.
2. Offline-first: service worker strategy review; cache `CoachSnapshot`.
3. a11y: axe-core CI job; fix violations.
4. Docs sweep: every ADR current; README current; `CHANGELOG.md` synthesised.
5. Release checklist `docs/runbooks/release-v1.md`.

**QA/QC:**
- [ ] Full regression suite green across Chrome / Safari / Firefox.
- [ ] Lighthouse ≥ 90 on performance, accessibility, best-practices, SEO.
- [ ] Load test: 500 concurrent athletes compute adaptive plan in < 2 s total.
- [ ] Privacy review: no PII leaks in logs; evidence-tier T4 items all reviewed.
- [ ] Version bump to 1.0.0 in `package.json`; git tag `v1.0.0`.

**Test matrix:**
| Layer | Test | Notes |
|-------|------|-------|
| Performance | `tinybench` suite | under budgets |
| a11y | axe-core CI job | 0 critical |
| Smoke (E2E) | Playwright | login → dashboard → activity → plan |
| Regression | full suite | 0 failures |

**Risks:**
| ID | Risk | P | I | Mitigation |
|----|------|---|---|------------|
| R-S13-1 | Perf regression from engines stack | M | H | Perf budgets enforced in CI from S12 |
| R-S13-2 | a11y backlog exceeds sprint capacity | M | M | Defer non-critical to v1.1 backlog |

**DoD:** `v1.0.0` tag, release checklist signed, CHANGELOG updated, all five engines LIVE in status badges.

**Phase 5 exit criteria:** Adaptive Plan Engine live, LLM grounded, perf + a11y budgets met, release checklist complete, v1.0.0 tagged.

---

## 13. Cross-Cutting QA/QC Standards

Every sprint inherits this checklist in addition to its sprint-specific items.

### 13.1 Code
- [ ] TypeScript strict mode, no `any` introduced.
- [ ] `npm run lint` clean.
- [ ] All async functions have try/catch + structured logging.
- [ ] JSDoc on every exported function.
- [ ] Public APIs additive (no breaking rename without a deprecation alias).

### 13.2 Testing
- [ ] Unit coverage ≥ 85% on new engine files, ≥ 80% repo-wide.
- [ ] Every user-story AC maps to at least one test.
- [ ] Flaky tests tracked in `docs/flaky-tests.md` and fixed within one sprint.
- [ ] Regression suite runs on every PR to `main`.
- [ ] Integration tests use realistic fixtures (Broken Arrow 26K / strength day / altitude trip / red-readiness day).

### 13.3 Science integrity
- [ ] Every coefficient has an evidence tier (T1–T4) and citation in-code.
- [ ] T4 heuristics explicitly flagged in both code and UI.
- [ ] When a coefficient is updated, the source comment is updated.
- [ ] Methodology docs re-referenced from `BA_Vector1_Science_v3.html`.

### 13.4 Privacy / safety
- [ ] No new PII in logs.
- [ ] Cross-athlete aggregates use hashed IDs.
- [ ] AMS / injury language framed as advisory, not medical.
- [ ] Rollback path documented for any flagged rollout.

### 13.5 Release
- [ ] Git commit messages follow Conventional Commits.
- [ ] Every sprint ends with `vX.Y.0` tag and `CHANGELOG.md` update.
- [ ] Deploy workflow green before tag.
- [ ] One-page demo note in `docs/demos/sprint-N.md`.

---

## 14. Test Matrix (plan-level)

| Engine | Unit | Integration | Regression | E2E / Golden |
|--------|------|-------------|------------|--------------|
| Foundation | `featureStore.test.ts`, `evidence.test.ts`, `demAdapter.test.ts` | — | all existing 12 test files | — |
| Terrain | `minetti`, `gap`, `tileCache`, `dem.*`, `ve`, `utmbIndex`, `itraIndex` | `terrain.integration.test.ts`, `demCorrection.integration.test.ts`, `terrain.full.integration.test.ts` | `trimp`, `readiness`, `zones` | Playwright activity card |
| MIM | `bayes`, `priors.schema`, `learner`, `MIMEvidenceBadge` | `mim.shadow.integration`, `mim.learner.integration`, `mim.full.integration` | `trimp` | Cohort canary |
| Descent | `eccentric`, `boutMemory` | `descent.integration`, `descent.full.integration` | `trimp`, `readiness` | — |
| Altitude | `dose`, `acclimatization`, `dampening`, `ams`, `AltitudeTripForm` | `altitude.integration`, `altitude.full.integration` | `readiness` | — |
| Ensemble | `adaptive.rules` | `adaptive.full.integration` | full suite | `coachGolden.test.ts` (10 fixtures) |
| Release | `tinybench`, `axe-core` | — | full suite | Playwright smoke |

---

## 15. Risk Register (plan-level)

| ID | Risk | Phase | Prob | Impact | Owner | Mitigation |
|----|------|-------|------|--------|-------|------------|
| R-P-01 | Insufficient fleet data for MIM priors | 2 | H | H | Mike | Tag low-N priors T4; ship with legacy fallback |
| R-P-02 | DEM bandwidth costs | 1 | M | M | Mike | Tile cache + Cloudflare Worker proxy |
| R-P-03 | Coach LLM hallucinates engine values | 5 | M | H | Mike | Golden tests + explicit prompt + post-hoc validator |
| R-P-04 | Soreness-prompt fatigue hurts compliance | 2 | M | M | Mike | Cap 3/week + smart skip |
| R-P-05 | Medical-liability language in AMS advisory | 4 | M | H | Mike | Legal copy review; informational framing |
| R-P-06 | Scope creep into Readiness / Terra / billing | plan | H | M | Mike | Explicit out-of-scope list; backlog anything new |
| R-P-07 | CI flakiness masks real regressions | plan | M | M | Claude | `docs/flaky-tests.md` + 1-sprint fix SLA |
| R-P-08 | Privacy leak via cross-athlete analytics | 2 | L | H | Mike | Hashed IDs + privacy review per sprint |
| R-P-09 | Perf regression from engine stack | 5 | M | H | Claude | Perf budgets enforced from S12 |
| R-P-10 | a11y backlog at release | 5 | M | M | Mike | axe-core in CI from S1; sweep in S13 |
| R-P-11 | iOS HealthKit altitude path unreliable | 4 | H | M | Mike | Manual altitude-trip form as first-class UX |
| R-P-12 | Dependency drift during 6-month plan | plan | M | M | Claude | Renovate / Dependabot monthly |

---

## 16. Glossary

- **ACWR** — Acute:Chronic Workload Ratio (Gabbett 2016).
- **AMS** — Acute Mountain Sickness (Bailey 2021).
- **ATE** — Readiness composite score used in `src/utils/readiness.ts`.
- **ATL** — Acute Training Load (~7-day EMA).
- **Banister TRIMP** — Heart-rate-based training impulse (Banister 1991).
- **Bayesian partial pooling** — Hierarchical model where athlete estimate shrinks toward population mean proportional to athlete sample size (Efron-Morris 1977 / Gelman BDA3).
- **CTL** — Chronic Training Load (~42-day EMA).
- **DEM** — Digital Elevation Model (USGS 3DEP / SRTM / ASTER GDEM / Open-Elevation).
- **Descent-Load** — Eccentric muscle damage dose from downhill running (Vernillo 2017 / Peake 2017).
- **DoD** — Definition of Done.
- **DOMS** — Delayed-Onset Muscle Soreness (carry-forward array in `trimp.ts`).
- **Evidence Tier (T1–T4)** — Provenance tag: T1 RCT/meta, T2 observational, T3 first-principles, T4 heuristic.
- **GAP** — Grade-Adjusted Pace (Minetti 2002).
- **GRADE** — evidence-quality framework (Guyatt 2008).
- **ITRA** — International Trail Running Association Performance Index.
- **LHTL** — Live High Train Low (Levine & Stray-Gundersen 1997).
- **MIM** — Musculoskeletal Impact Modifier (Broken Arrow's novel IP).
- **NFOR** — Non-Functional Overreaching (Meeusen 2013).
- **OpenSim** — musculoskeletal modeling framework (Delp 2007).
- **Repeated-Bout Effect** — muscle damage reduced on subsequent same-stimulus bouts (Hyldahl 2017).
- **TSB** — Training Stress Balance (CTL − ATL).
- **UTMB Index** — Ultra-Trail Mont-Blanc race performance index.
- **VAM** — Velocità Ascensionale Media (m/hour of ascent).
- **VE** — Vertical Efficiency (Giovanelli 2016 crossover).

---

## 17. References (cited in this plan)

- **Banister EW.** *Modeling elite athletic performance.* In: MacDougall JD, ed. Physiological Testing of the High Performance Athlete. 2nd ed. Champaign: Human Kinetics; 1991:403–424. *(T1 — TRIMP)*
- **Bailey DM et al.** *Altitude training and the Acute Mountain Sickness consensus.* High Alt Med Biol. 2021. PMID 34001987. *(T1 — AMS)*
- **Chapman RF et al.** *Defining the “dose” of altitude training.* J Appl Physiol. 2014;116(6):595–603. PMID 24264287. *(T2 — altitude dose)*
- **Delp SL et al.** *OpenSim: open-source software to create and analyze dynamic simulations of movement.* IEEE Trans Biomed Eng. 2007;54(11):1940–1950. PMID 18018689. *(T3 — musculoskeletal model)*
- **Efron B, Morris C.** *Stein's Paradox in Statistics.* Sci Am. 1977;236(5):119–127. *(T3 — shrinkage)*
- **Gabbett TJ.** *The training-injury prevention paradox.* Br J Sports Med. 2016;50(5):273–280. PMID 26758673. *(T1 — ACWR)*
- **Gelman A et al.** *Bayesian Data Analysis, 3rd Ed.* CRC Press; 2013. *(T3 — partial pooling)*
- **Giovanelli N et al.** *Energetics of vertical kilometer foot races.* Eur J Appl Physiol. 2016. PMID 27116915. *(T2 — VE crossover)*
- **Guyatt GH et al.** *GRADE: an emerging consensus on rating quality of evidence.* BMJ. 2008;336(7650):924–926. PMID 18436948. *(T1 — evidence framework)*
- **Hyldahl RD et al.** *Mechanisms underlying the repeated bout effect.* Exerc Sport Sci Rev. 2017. PMID 28457071. *(T1 meta — repeated bout)*
- **Levine BD, Stray-Gundersen J.** *"Living high—training low": effect of moderate-altitude acclimatization with low-altitude training on performance.* J Appl Physiol. 1997;83(1):102–112. PMID 9216968. *(T1 — LHTL)*
- **Meeusen R et al.** *Prevention, diagnosis and treatment of the overtraining syndrome: ECSS / ACSM joint consensus.* Med Sci Sports Exerc. 2013. PMID 23247672. *(T1 — NFOR)*
- **Minetti AE et al.** *Energy cost of walking and running at extreme uphill and downhill slopes.* J Appl Physiol. 2002;93(3):1039–1046. PMID 12235031. *(T2 — cost-of-locomotion)*
- **Morton RH et al.** *Modeling human performance in running.* J Appl Physiol. 1990;69(3):1171–1177. *(T1 — CTL/ATL/TSB)*
- **Peake JM et al.** *Muscle damage and inflammation during recovery from exercise.* J Appl Physiol. 2017. PMID 28153916. *(T1 — descent damage)*
- **Plews DJ, Laursen PB.** *Heart-rate variability in elite athletes: the good, the bad, and the ugly.* Int J Sports Physiol Perform. 2013. PMID 23921488. *(T1 — HRV CV guardrail)*
- **Vernillo G et al.** *The biomechanics of uphill and downhill running.* Sports Med. 2017;47:615–629. PMID 28497285. *(T2 — eccentric descent)*
- **West JB.** *High Altitude Medicine and Physiology, 5th Ed.* CRC Press; 2013. *(T3 — altitude physiology)*

All citations are also mirrored verbatim in `BA_Vector1_Science_v3.html §8`.

---

## 18. Document log

| Version | Date | Author | Summary |
|---------|------|--------|---------|
| 1.0 | 2026-04-20 | Mike + Claude | Initial 6-month, 13-sprint plan covering Foundation + 4 gap engines + integration/release. |
