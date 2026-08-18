# Running Methodology — Expert-Review Packet

**Date:** 2026-08-18 · **Status:** awaiting reviewer
**Companions:** [`running-evidence-audit.md`](./running-evidence-audit.md) (the tiered constant registry this packet grew out of) · [`running-expert-review-exhibits.md`](./running-expert-review-exhibits.md) (three full generated plans to mark up)

## What this is

Broken Arrow Training generates road/trail running plans from nine published coaching systems (Daniels, Higdon, Pfitzinger, Hansons, 80/20, Galloway, Roche, Koop, TrainingPeaks-style ultra), personalized by an explicit, tiered constant registry (`src/engines/running/heuristics.ts` + the volume-model constants). The methods' own authored rules (long-run caps, hard-day spacing, quality share) are machine-enforced; everything below is **our judgment layered on top** — benchmarked against the published plan tables, but never validated by a practicing running coach.

That's the ask: **a coach reviews the nine constants and the three exhibit plans, and either endorses each value or tells us what to change it to and why.** Every constant is a single number (or small set) in one file — an accepted change ships the same day and propagates to every generated plan and its CI gates.

### Reviewer we're looking for

- Has coached recreational-to-competitive road runners across ages (masters experience strongly preferred), or holds a recognized endurance-coaching certification (RRCA L2 / USATF L2 / equivalent) with active athletes
- Comfortable reading a weekly plan table; no code reading required
- Time ask: ~2 hours (9 constants + skim 3 plans)

### How to respond

Copy the response template at the bottom, one block per constant. "Agree" with no notes is a fully useful answer — it upgrades the constant's evidence tier with your name as the citation.

---

## Part 1 — The constants under review

Priority order: the first three are our own inventions with no direct published analog.

### 1. MASTERS_AGE_TIERS + SENIOR_INTENSITY — age-adjusted training ⚠️ priority

| | |
| --- | --- |
| **Current value** | masters at **58+**: ramp capped 8%/wk, recovery week every 3rd; senior at **70+**: max **1 quality session/week**, VO2/rep slots substituted with threshold-flavored work, long-run time cap ×0.85 |
| **Why flagged** | The published plans we benchmark don't age-adjust at all. The substitution logic leans on Tanaka & Seals 2008 (stimulus intensity, not modality, drives retention) but the thresholds are stepped bands we chose. Exhibit A (79M) shows the whole policy in situ. |
| **Questions** | (a) Are 58/70 the right steps, or should adjustments grade continuously? (b) Is threshold the right substitute for VO2 work at 70+, or would you keep short reps with longer recoveries? (c) One quality/week at 70+ — right, or athlete-dependent? |

### 2. DISTANCE_PEAK_GAIN_MI — how much one block may build ⚠️ priority

| | |
| --- | --- |
| **Current value** | peak ≤ stated current base + **15** (5K) / **18** (10K) / **20** (half) / **25** (marathon) / **28–34** (ultras) weekly miles |
| **Why flagged** | Our own bound on the multiplier model (a 60 mi/wk athlete × 2.3 produced absurd targets). No published source frames growth as an absolute per-block gain. |
| **Questions** | (a) Is an absolute gain cap the right shape, or should it scale with the base (e.g. +40% of current)? (b) Are the per-distance numbers right for a 12–18 week block? |

### 3. Recover/bridge return timing (R3) ⚠️ priority

| | |
| --- | --- |
| **Current value** | post-race: 1 rest day per 10 mi raced (+1 at 58+, +2 at 70+), then reverse-taper jogs scaled to the athlete's prior volume (0.6–1.6× of a 25 mi/wk baseline); next build resumes at previous block's achieved peak ×**0.85**; first strides/threshold touch deferred one bridge week at 58+ |
| **Questions** | (a) Rest-day-per-10-miles — endorse for 5K–marathon? (b) Is ×0.85 the right resumption level after ~1–2 weeks of taper+race+recovery? (c) Masters intensity deferral — one week enough? |

### 4. MASTERS_RAMP_CAP — 8%/week at 58+

**Current:** 8% vs the general ~10% guideline. **Question:** right number, right threshold?

### 5. DAYS_VOLUME_FACTOR — volume follows frequency

**Current:** 3d 0.75× · 4d 0.9× · 5d 1.0× · 6d 1.1× · 7d 1.15× (7-day requests schedule 6 + rest). **Question:** are these multipliers consistent with how you'd scale the same plan across 3–6 day athletes?

### 6. TAPER_WEEKS_CAP — short-race tapers

**Current:** 5K/10K at most 2 weeks including race week; half 3. **Question:** endorse?

### 7. Volume envelopes + ADAPTATION_TOLERANCE

**Current:** generated peaks must land inside the method's published band ±20% (`running-evidence-audit.md` table). **Ask:** spot-check the bands against the editions you know — every page-verified band upgrades to T3. Is ±20% the right leash?

### 8. Intensity-forward 5K/10K structure (R4)

**Current:** Daniels 5K/10K weeks lead with R-pace repetitions (Phase II) and sharpen with cruise intervals + rep touches (Phase IV); Higdon 5K/10K peak weeks run interval repeats + race-pace. Exhibit C shows a full build. **Question:** does the sequencing match how you'd sharpen a 5K athlete, and is the volume right for the quality carried?

### 9. Method invariant transcriptions

**Current:** the machine-enforced per-method rules (`methodInvariants.ts`): Daniels long ≤30%/quality ≤35%/2-day spacing; Hansons 16-mi long cap with deliberate stacking; Galloway long ≤55%; 80/20 quality ≤25%; etc. **Ask:** confirm we transcribed each method's own rules faithfully.

---

## Part 2 — The exhibits

Three complete generated plans in [`running-expert-review-exhibits.md`](./running-expert-review-exhibits.md):

- **Exhibit A** — 79M beginner, 6 days, Daniels 5K, 16 weeks (the masters policy end-to-end)
- **Exhibit B** — 41F intermediate, 5 days, Pfitzinger half, 16 weeks, 10K anchor (the canonical anchored case)
- **Exhibit C** — 24F intermediate, 5 days, Daniels 5K, 13 weeks, 22 mi/wk base (the intensity-forward short-race build)

Mark up anything: a session you'd never assign, a week you'd reorder, a number you'd change.

---

## Response template

```
Constant: <name>
Verdict: AGREE / CHANGE / NEEDS-CONTEXT
Change to (if CHANGE): <value>
Why: <1-3 sentences; a citation if you have one>
```

Reviewer name/credentials: ____________
