# HYROX Methodology — Expert-Review Packet

**Date:** 2026-08-17 · **Status:** awaiting reviewer
**Companions:** [`hyrox-evidence-audit.md`](./hyrox-evidence-audit.md) (the six-source benchmark matrix this packet grew out of) · [`hyrox-expert-review-exhibits.md`](./hyrox-expert-review-exhibits.md) (three full generated plans to mark up)

## What this is

Broken Arrow Training generates HYROX plans from an explicit, tiered constant registry (`src/engines/hyrox/heuristics.ts`). The verifiable race spec (station distances, division loads) lives separately and is checked against the rulebook; everything in the registry below is a **coaching judgment call** — benchmarked against six published sources (STRIDE Fitness guide, PureGym plans, the HYROX 8-Week Formula, the GORUCK×HYROX plan, the official HYROX Manual 10/2020, and a 12-week program), but never validated by a practicing HYROX coach.

That's the ask: **a coach who has prepared athletes for HYROX events reviews the ten constants and the three exhibit plans, and either endorses each value or tells us what to change it to and why.** Every constant is a single number (or small set) in one file — an accepted change ships the same day and propagates to every generated plan and its tests.

### Reviewer we're looking for

- Has coached ≥10 athletes through HYROX races (any division), or is L1/L2 certified with race-day coaching experience
- Comfortable reading a weekly plan table; no code reading required
- Time ask: ~2 hours (10 constants + skim 3 plans)

### How to respond

Copy the response template at the bottom, one block per constant. "Agree" with no notes is a fully useful answer — it upgrades the constant's evidence tier with your name as the citation.

---

## Part 1 — The constants under review

Priority order: the first three are where our value either sits at the edge of the benchmarked range or deliberately goes beyond all sources.

### 1. STATION_RAMP — station-volume progression ⚠️ priority

| | |
| --- | --- |
| **Current value** | open at **50%** of race volume per station, ramp to **100%** by the final build week; recovery weeks at **0.6×** the ramp (floor 30%) |
| **Why flagged** | The benchmarked spread is wide: the independent v2 rebuild opened ~40–75% per station; the 12-week program puts *some* stations at full race distance from week 1 (row 1000 m) while holding sleds back to 50 m until mid-plan. Our uniform 50% opening is the conservative edge. |
| **Questions** | (a) Should the opening fraction differ **per station** (e.g. row/ski at full distance early, sleds/lunges ramped) rather than uniform? (b) Should it differ **per experience level**? (c) Is 100%-by-final-build-week the right endpoint, given the spec day and simulations already guarantee full-distance exposure? |

### 2. MASTERS_RECOVERY — age-adjusted recovery cadence ⚠️ priority

| | |
| --- | --- |
| **Current value** | athletes **≥58** get a recovery week every **3** weeks (default: every 4) |
| **Why flagged** | None of the six benchmarked sources age-adjust at all — this is our own extension, so both numbers are pure judgment. Exhibit B (61M beginner) shows it in situ. |
| **Questions** | (a) Is 58 the right threshold, and should it be a band (e.g. 55+ = 3:1, 65+ = 2:1)? (b) Every-3rd-week vs reducing weekly volume instead? (c) Should masters also get reduced interval density, not just cadence? |

### 3. FULL_SIM_DAYS_OUT — full 8+8 race simulation timing ⚠️ priority

| | |
| --- | --- |
| **Current value** | one full-effort simulation, **10–17 days** out (validator window; generator targets ~14) |
| **Why flagged** | Sources diverge on *frequency* more than timing: the 12-week program runs weekly FULL race practice at 75–80% effort through its final block; we run one full-effort sim plus a half sim (18–27 d out) plus weekly compromised sessions. Our single-sim choice is the conservative end. |
| **Questions** | (a) One full-effort sim: right, or should submax full-distance practice appear weekly in the peak block? (b) Is 14 days out the right anchor for the last hard full-distance day? (c) Does the answer change for first-timers vs experienced racers? |

### 4. HALF_SIM_DAYS_OUT — half simulation (4 runs + 4 stations)

**Current:** 18–27 days out (one runway step before the full sim). **Question:** right rehearsal structure and spacing?

### 5. SPEC_DAY_DAYS_OUT — all-stations-at-race-spec technique day

**Current:** 24–42 days out — meet full race loads/volumes with generous rest *before* they appear under fatigue. **Question:** is a dedicated fresh-legs spec day worth a session slot, and is the window right?

### 6. COMPROMISED_DOSE — run→station→run brick sessions

**Current:** 3 rounds/session, every 2nd week alternating with the station circuit, introduced from the base phase at 2 rounds, conversational effort. This is the best-corroborated element (all six sources interleave running with stations). **Question:** rounds and cadence right? Should frequency rise to weekly in the peak block?

### 7. INTERVAL_REST — race-pace km-repeat recovery

**Current:** 120 s early-plan → 90 s past 60% of the build (raised from 60 s in the 2026-08 benchmark — every source floors km-repeat rest at 90 s). **Question:** endorse the 120→90 progression? Where do you set rest for 1 km repeats at race pace, early vs late plan?

### 8. TEMPO_MINUTES — threshold block duration

**Current:** 18 → 30 min across the build. **Question:** right ramp for HYROX, where ~50% of race time is running and the race averages ~90 min?

### 9. LAYERED_RAMP — Hyrox prep inside another race's build

**Current:** when a HYROX race is layered into (e.g.) a trail-race build, station work stays at 35→75% of spec, ≤2 doses/week — the anchor race owns the plan. **Question:** are those caps right for keeping the anchor build intact while arriving station-ready?

### 10. TAPER_WEEK — final full week before race week

**Current:** 65% volume, 50% interval reps, 50% station volume — volume drops, intensity stays (Hickson 1985). **Question:** endorse the multipliers? Anything HYROX-specific about tapering stations vs running?

---

## Part 2 — Race-spec verification asks

Not heuristics — checkable facts we want a second pair of eyes on against the current rulebook (`src/engines/hyrox/spec.ts`):

1. **Women's division loads** (Open and Pro rows) — flagged in our spec for re-verification against the current season's rulebook.
2. Wall-ball target heights per division/sex.
3. Any 2026-season rule changes we should fold in (Roxzone changes, station order, weight adjustments).

## Part 3 — The exhibits

[`hyrox-expert-review-exhibits.md`](./hyrox-expert-review-exhibits.md) contains three complete generated plans, chosen to exercise the flagged constants:

- **Exhibit A** — 41F intermediate, 5 d/wk, Open, 10K anchor, 12 weeks (the canonical case)
- **Exhibit B** — 61M beginner, 3 d/wk, Open, no anchor, 12 weeks (masters cadence + benchmark day)
- **Exhibit C** — 29M advanced, 6 d/wk, **Pro**, HM anchor, 8 weeks (compressed runway, Pro loads)

Mark up anything: progression shape, session ordering within the week, load choices, taper feel, what's missing.

## Response template

```text
CONSTANT: <name, e.g. STATION_RAMP>
VERDICT: agree | adjust | needs discussion
ADJUST TO: <values, if adjusting>
RATIONALE: <1-3 sentences>
SOURCE: <your coaching practice / a citable program / rulebook section>
```

And for the exhibits:

```text
EXHIBIT: A | B | C
WEEK/DAY: <e.g. Week 8, Fri>
NOTE: <what you'd change and why>
```

## What happens with the review

Each verdict is recorded as a citation on the constant in `heuristics.ts` (tier upgrade T4 → T3 with a named practitioner source), adjusted values ship behind the existing test suite (the 40-plan persona sweep must stay green), and disagreements between reviewers get logged in `hyrox-evidence-audit.md` as open questions rather than silently picking a side.
