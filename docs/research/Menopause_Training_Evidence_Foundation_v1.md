# Menopause Training — Evidence Foundation v1

> Markdown research deliverable grounding the **menopause training context**. Renders natively in VS Code (⇧⌘V for preview) and on GitHub. Pairs with the product spec `docs/MENOPAUSE_TRAINING_CONTEXT_DESIGN.md`.

**Status:** Research synthesis — decision-grade foundation for the menopause training context.
**Date:** 2026-06-12
**Author:** Claude (Cowork)
**Scope:** Exercise/training across the menopause transition (perimenopause / menopause / postmenopause) for a general-fitness app — resistance training, impact/bone loading, interval cardio, protein, recovery, and pelvic-floor safety. **NOT** medical, HRT, or symptom-management guidance.
**Method:** Two-stage. (1) A deep-research harness — 5-angle fan-out → 24 sources fetched → 113 claims extracted → **3-vote adversarial verification** (19/25 confirmed, 6 killed) — produced the bone / strength / interval core (§§2–5). (2) Four **targeted single-pass** literature passes filled gaps the harness surfaced with zero surviving evidence: protein, recovery, pelvic-floor safety, and the contested cortisol claim (§§5–8). **Confidence differs by stage** — §§2–4 are adversarially verified; the follow-up topics are single-pass and graded more conservatively.
**Grades:** Strong / Moderate / Limited / Contested. Read every "improves/increases" as the study's *measured* effect — **almost every outcome here is a surrogate** (BMD, body composition, muscle-protein synthesis), **not** a fracture or mortality endpoint.

---

## 1. Executive summary — the reframe

The convergent evidence supports a decisive shift away from the advice midlife women are usually given — *lighter weights, more cardio, eat less* — toward five moves:

1. **Lift heavy** — strongly for **bone**; for muscle **mass**, total volume + effort matter more than chasing maximal load.
2. **Add impact loading** — osteogenic, but with a real **peri-vs-post caveat** (jumping alone works best *before* menopause; *after*, it must be paired with heavy load).
3. **Keep high-intensity intervals** — they help body composition and fitness and show **no harm**; the popular "limit them because cortisol" rule is unsupported.
4. **Eat more protein per meal** — ~1.2–1.6 g/kg/day, ~0.4 g/kg per meal, to counter postmenopausal anabolic resistance.
5. **Individualize recovery around sleep and symptoms** — not a blanket "rest more because estrogen is low."

**Two myths fall.** (a) *Midlife women must restrict load* — refuted by the LIFTMOR RCT, where heavy 5×5 lifting was both effective for bone and safe. (b) *High-intensity cardio must be limited because of cortisol* — unsubstantiated in peer-reviewed sources, and **partly mis-attributed** (see §5).

**Three honesty notes carried throughout:**
- "Lift heavy" is **Strong for bone**, but only **marginal for muscle mass** vs. lighter loads — don't over-state it.
- The **exact optimal resistance-training intensity for BMD is genuinely unsettled** — in verification, *both* "moderate beats high" *and* "high beats moderate" claims were refuted.
- §§6–8 (protein, recovery, pelvic floor, cortisol) rest on **single-pass** research, not the adversarial harness — treated as lower-confidence.

---

## 2. Resistance training — load, reps, and the bone-vs-mass split

The headline trial is **LIFTMOR** (Watson SL, Weeks BK, Weis LJ, Harding AT, Horan SA, Beck BR. *J Bone Miner Res* 2018;33(2):211–220): 101 postmenopausal women (65±5 yr, T-score <−1.0) randomized to 8 months of twice-weekly, 30-min supervised **HiRIT** — deadlift / squat / overhead press at **>85% 1RM, 5×5**, plus impact — vs. a home program.

| Claim | Finding | Grade | Verify |
|---|---|---|---|
| Heavy HiRIT builds bone | Lumbar spine BMD **+2.9% vs −1.2%** control (p<0.001); femoral neck **+0.3% vs −1.9%** (p=0.004) | **Strong** | 3-0 |
| Heavy lifting is safe (supervised) | One minor adverse event (back spasm); 92% compliance; safety follow-up (Watson/Harding et al., *Osteoporos Int* 2019) found **no** ↑ vertebral fracture and improved kyphosis ~6.7° | **Strong** (supervised) | 3-0 |
| RT/exercise raises BMD broadly | 3 independent meta-analyses converge: Zhao et al. 2025 (*J Orthop Surg Res*, 17 RCTs, 690 women: LS SMD 0.88, FN 0.89); Wang et al. 2023 (*Front Physiol*, 19 RCTs, 919); Mohebbi/Kemmler et al. 2023 (*Osteoporos Int*, **80 studies, 5,581**: LS/FN/hip SMD 0.27–0.41, all p<0.001) | **Moderate** | 3-0 |
| For muscle **mass**, load matters less than volume | Csapo & Alegre 2016 (*Scand J Med Sci Sports*, MA 15 studies, 448 elderly): heavy vs light strength edge only marginal (µ=0.43, **p=0.060**), hypertrophy difference trivial. Nunes et al. 2024 (*Arch Gerontol Geriatr*, 14 RCTs, postmenopausal/older): higher-**volume** RT → ~1.3 kg lean vs ~0.9 kg | **Strong** | 3-0 |

**Caveats.** LIFTMOR's control was a home low-intensity program (not literally light-weight/high-rep RT); the femoral-neck gain is near-null in absolute terms (significant only vs. a *declining* control); enrollment was selective (~600 screened → 101) — **strong internal, limited external validity**. BMD meta-analyses show high heterogeneity (I² often 85–91%), so the *recommendation* is Moderate even where individual numbers are exact.

> **Unsettled:** claims that moderate intensity *outranks* high (and that ≥70% 1RM is *definitively superior*) were **both refuted** in verification (votes 1-2 and 0-3). Honest position: **progressive loading works, and heavy loading is safe and at least as effective** — there is no evidence base for a single "optimal" intensity.

**Reframe for the app:** prescribe **heavy, progressive loading for bone and strength**, and ensure **adequate weekly volume + effort for muscle mass**. "Lift heavy" is necessary for bone; it is *not sufficient*, and not the main lever for hypertrophy.

---

## 3. Impact / plyometric loading for bone — the key peri-vs-post difference

| Claim | Finding | Grade | Verify |
|---|---|---|---|
| Jumping builds **hip** bone — **before** menopause | Bassey et al. 1998 (*JBMR*): 50 vertical jumps/day, 6 d/wk → femoral BMD **+2.8%** in **pre**menopausal women (5 mo, p<0.001) — but the **same protocol gave no significant benefit postmenopause** | **Moderate** (premenopausal hip) | 3-0 |
| Jumping does **not** help the spine | Zhao/Zhao/Zhang 2014 (*Sports Med*, 6 studies): FN +0.017 g/cm² (p<0.001), trochanter +0.021 (p<0.001), **lumbar spine NS** (p=0.181); corroborated by Babatunde et al. 2012 (FN SMD 0.64; spine SMD 0.04 NS) | **Moderate** | 3-0 |
| Post-menopause, impact must pair with **heavy load** | The only solid postmenopausal impact evidence comes *via* HiRIT (LIFTMOR §2), where impact is combined with >85% 1RM lifting | **Moderate** | — |

**This is the single clearest peri-vs-post difference in the evidence.** Perimenopausal/premenopausal bone still responds to impact *alone* at the hip; postmenopausal bone response to impact-alone is **blunted**, so the better-supported postmenopausal strategy is **heavy resistance + impact together (HiRIT)**. BMD is a surrogate throughout — no gathered study reports fracture reduction.

---

## 4. Interval cardio (SIT / HIIT) — body composition, fitness, metabolic

| Claim | Finding | Grade | Verify |
|---|---|---|---|
| SIT improves body composition | Boutcher et al. 2019 (*Med Sci Sports Exerc*, n=40 overweight postmenopausal): 8-wk SIT (8-s sprint/12-s recovery, 20 min, 3×/wk) → lean **+0.7 kg** (p=0.001), fat ↓, fitness ↑ after only ~8 h total exercise | **Moderate** | 3-0 |
| Exercise improves body composition broadly | Khalafi et al. 2023 (*Front Endocrinol*, **101 RCTs, 5,697** postmenopausal women): fat-free mass **+0.66 kg**, fat mass **−1.27 kg**, regardless of age/duration | **Strong** (modest effects) | 3-0 |
| Acute HIIT improves glycemia | *J Appl Physiol* 2025 (n=13 postmenopausal w/ T2D): single HIIT bouts ↑ β-cell glucose sensitivity (p=0.002) — but **n=13, acute, surrogate**, insulin-sensitivity indices unchanged | **Limited** | 2-1 |

**Caveat:** SIT/HIIT effects rest on small samples (n=13–40) with absolute effects near measurement precision; the body-composition *direction* is robust (Khalafi), the metabolic specifics are preliminary.

---

## 5. The contested cortisol claim — graded explicitly

**Claim under test:** *"High-intensity cardio raises cortisol, so limit it when estrogen is low (menopause)."*

| Component | Finding | Grade |
|---|---|---|
| Acute high-intensity exercise transiently raises cortisol | Real and intensity-dependent above ~60% VO₂max (Hill et al. 2008, *J Endocrinol Invest*, n=12) — but **normal, transient HPA activation**, the basis of adaptation, not a harm marker (study was in men) | **Strong** (but benign) |
| Low-estrogen women mount an *exaggerated* response warranting limits | The most on-point study (Patacchioli et al. 2015, *Climacteric*, n=30 postmenopausal, HRT vs. not) found the **cortisol response to exercise did not differ by estrogen status**; menstrual-cycle data are mixed (Hamidovic et al. 2020, *Front Endocrinol*: cortisol mildly higher in the low-estrogen follicular phase, at rest) | **Limited / Unsubstantiated** |
| This translates to **harm** (overtraining, worse composition) | Opposite: Dupuit et al. 2020 (*Exp Physiol*, meta, **38 studies, 959 women**) — HIIT reduces fat and raises VO₂max in peri/postmenopausal women, **no adverse effects**; harm narratives come from chronic low-energy-availability in young athletes, not menopause | **Unsubstantiated** |
| Attribution | The claim is **partly mis-attributed**: Stacy Sims *promotes* HIIT/SIT for midlife women and states *"it's chronically elevated cortisol over time that does the damage, not the acute peak and dip from working out"* — her cortisol concern targets **chronic steady-state cardio**, not intensity | — |

> **Verdict: CONTESTED → treat as a soft nudge, never a rule.** Do not gate or cap high-intensity work on cortisol grounds. At most, surface a total-load/recovery nudge ("make hard days count, recover between them"). **Keep this claim out of engine logic and out of customer copy.**

---

## 6. Protein & nutrition *(single-pass research — lower confidence)*

| Claim | Finding | Grade |
|---|---|---|
| The 0.8 g/kg RDA is too low; target **~1.2–1.6 g/kg/day** | ISSN position stand (Jäger et al. 2017, *J Int Soc Sports Nutr*: 1.4–2.0 g/kg for exercisers); PROT-AGE (Bauer et al. 2013, *JAMDA*: ≥1.2 for active older adults); Traylor, Gorissen & Phillips 2018 (*Adv Nutr*: RDA "may be inadequate") | **Strong** (general older adults; **extrapolated** to menopause) |
| **Per-meal dose** matters: ~0.4 g/kg/meal × 3–4 meals | Moore et al. 2015 (*J Gerontol A*): MPS saturates at **~0.40 g/kg/meal in older vs ~0.24 in young** adults; Schoenfeld & Aragon 2018 (*J Int Soc Sports Nutr*): 0.4 g/kg/meal × ≥4 | **Moderate** (mostly older men) |
| Benefit **plateaus ~1.6 g/kg/day** for muscle gain | Morton et al. 2018 (*Br J Sports Med*, 49 RCTs, n=1,863): no added fat-free-mass benefit above **~1.62 g/kg** | **Strong** |
| Postmenopausal muscle shows **anabolic resistance** | McKenna et al. 2024 (*J Appl Physiol*): blunted myofibrillar MPS to a small dose + RT; Dam et al. 2021 (*Front Physiol*, RCT n=31): estrogen therapy **~doubled** RT-induced muscle gains — estrogen loss is mechanistically implicated | **Moderate** |

> **Influencer flag:** Stacy Sims recommends **~2.0–2.3 g/kg (≈1 g/lb)** — *above* the ISSN range and the Morton ~1.6 g/kg plateau. The *direction* (more than RDA, 30–40 g/meal) is well-supported; the *specific 2+ number* is **Limited/Contested** extrapolation.

**Bottom line:** coach **~1.2–1.6 g/kg/day**, **~0.4 g/kg (≈30–40 g) leucine-rich protein per meal across 3–4 meals**; frame 1.6 g/kg as the evidence ceiling, not 2+.

---

## 7. Recovery & training-load tolerance *(single-pass research — lower confidence)*

The popular "you need more recovery when estrogen is low" framing is **mechanistically plausible but not directly demonstrated** in menopausal women.

| Claim | Finding | Grade |
|---|---|---|
| Menopausal women take measurably *longer* to recover from hard sessions | **Not demonstrated.** Romero-Parra et al. 2021 (*Sports Health*, 13 post- vs 19 eumenorrheic trained women): post-exercise CK, myoglobin, and soreness were **statistically the same** ("EIMD was similar") | **Limited / Contested** (against) |
| Estrogen aids muscle repair (mechanism) | Real in animal/cell models + HRT strength data (Enns & Tiidus 2010, *Sports Med*, review) — but this is mechanism/mass, **not** a measured recovery-timing outcome | **Moderate** (mechanism) / **Limited** (applied) |
| Autonomic (HRV) recovery is blunted — but from **aging, not estrogen** | Harvey et al. 2016 (*Menopause*): attenuated post-exercise HRV recovery; 4 wk estradiol **did not restore it** — "aging rather than estrogen deficiency per se" | **Moderate** |
| **Sleep disruption from vasomotor symptoms** degrades recovery | SWAN + actigraphy/PSG (Baker et al. 2018, *Sleep Med Clin*): objective hot flashes track nocturnal awakenings; moderate-severe VMS triples odds of frequent waking | **Strong** (sleep–VMS link) |

The adjacent menstrual-cycle literature is itself weak (Colenso-Semple et al. 2023, *Front Sports Act Living*; menstrual phase shows no meaningful strength effect with poor methodology).

> **Bottom line:** individualize recovery around **sleep quality and symptom load**, not a blanket extra rest day keyed to menopausal status. The defensible app move is symptom-responsive, not status-gated.

---

## 8. Pelvic-floor safety of high-impact / heavy training *(single-pass research)*

The old "avoid impact/heavy lifting to protect the pelvic floor" caution is **not supported by recent RCT and large-survey evidence**.

| Claim | Finding | Grade |
|---|---|---|
| Heavy + impact training does **not** worsen pelvic-floor QoL | **MEDEX-OP RCT** (Kistler-Fischbacher, Weeks & Beck 2025, *Int Urogynecol J* 36(10):2099–2104): 115 postmenopausal women, 8 mo HiRIT (>80% 1RM 5×5 + jumps) vs. low-intensity Pilates — **no between-group difference** on PFDI-20 (p=0.92) or PFIQ-7 (p=0.27); both trended toward *improved* pelvic-floor QoL | **Moderate** (QoL secondary outcome) |
| Possible protection in women with prior prolapse | Same trial, exploratory subgroup: PFDI-20 improved within-group (−11.9, p=0.03), between-group NS (p=0.15) — "preliminary evidence HiRIT *may* protect" | **Limited** (hypothesis-generating) |
| Heavy lifters don't report more prolapse | Forner et al. 2020 (*Int Urogynecol J*, n=3,934 survey): women lifting >50 kg reported **fewer** POP symptoms than ≤15 kg lifters (15.2% vs 59.7%) | **Limited→Moderate** (cross-sectional) |

**Where caution still applies:** evidence is from **supervised, technique-coached** programs in cohorts **not enriched for severe symptomatic prolapse/incontinence**; women with existing significant POP or stress UI should be individually screened and may benefit from concurrent pelvic-floor muscle training (not included in these protocols). Note the **exercise-vs-occupational** distinction — occupational heavy lifting *is* associated with POP; recreational training is not.

> **Bottom line:** don't auto-exclude impact/heavy lifting for pelvic-floor reasons. Coach technique, progress load gradually, and flag existing significant POP/UI for individual screening + optional pelvic-floor work.

---

## 9. Peri- vs. postmenopause — how the prescription differs

| Dimension | Perimenopause | Postmenopause |
|---|---|---|
| **Bone — impact** | Jumping/impact **alone** still osteogenic at the hip (Bassey 1998) | Impact-alone **blunted**; pair impact with **heavy load (HiRIT)** |
| **Strength** | Build the base; heavy progressive loading | Heavy progressive loading for **preservation** of bone + muscle |
| **Intervals** | Keep SIT/HIIT | Keep SIT/HIIT (benefit smaller but real; no harm) |
| **Recovery** | Symptom-aware (sleep, VMS) | Symptom-aware; autonomic recovery slower with age |
| **Protein** | ~1.2–1.6 g/kg, 0.4 g/kg/meal | Same, with more attention to anabolic resistance |

> **Don't over-claim the divide.** One meta-analysis found menopausal status did **not** significantly moderate the BMD response to exercise (Mohebbi/Kemmler 2023) — and a claim asserting a sharp peri/post difference for RT-BMD was **refuted** (1-2). The robust peri/post difference is specifically about **impact-alone bone loading**, not resistance training in general.

---

## 10. Evidence gaps & open questions

- **Optimal RT intensity for BMD is unsettled** — no single evidence-based "best" intensity; progressive + heavy + safe is the defensible stance.
- **§§6–8 are single-pass**, not adversarially verified — lower confidence than §§2–5; revisit before any strong customer-facing claim.
- **No hard endpoints** — every result here is a surrogate (BMD, body composition, MPS, QoL); none report fracture or mortality reduction.
- **Recovery in menopause is genuinely under-researched** — the "more recovery needed" claim lacks direct support; treat as symptom-individualized.
- **Cortisol topic** would benefit from a dedicated acute exercise-endocrinology pass before any definitive public claim — current grade rests on absence-of-support + opposing benefit data.
- **Pelvic-floor outcomes** were secondary/QoL, not exam-confirmed primary endpoints.

---

## 11. Translation to the app

Grades map directly to the product spec's phased dials (`docs/MENOPAUSE_TRAINING_CONTEXT_DESIGN.md` §6):

- **Strong → safe to default on:** heavy progressive strength for bone; protein direction; "keep your intervals."
- **Moderate → gentle, opt-in dials:** impact loading (peri-vs-post aware); SIT expression; pelvic-floor reassurance.
- **Limited / Contested → nudge only, never engine logic or hard rules:** the cortisol/"limit cardio" claim; blanket extra-recovery-by-status; protein above ~1.6 g/kg.

Customer-language discipline: "lift heavy / protect your bones / keep your hard days / fuel with protein / recover around your sleep" — never "estrogen-mediated anabolic resistance" or "HPA-axis cortisol flux."

---

## Appendix — source ledger

| # | Source | Topic | Grade |
|---|---|---|---|
| 1 | Watson et al. 2018, *J Bone Miner Res* (LIFTMOR RCT) | Heavy HiRIT → bone; safety | Strong |
| 2 | Watson/Harding et al. 2019, *Osteoporos Int* (LIFTMOR safety) | HiRIT safety, fracture/kyphosis | Strong |
| 3 | Zhao et al. 2025, *J Orthop Surg Res* (17 RCTs) | RT → BMD | Moderate |
| 4 | Wang et al. 2023, *Front Physiol* (network MA, 19 RCTs) | RT intensity → BMD | Moderate |
| 5 | Mohebbi/Kemmler et al. 2023, *Osteoporos Int* (80 studies, 5,581) | Exercise → BMD | Moderate |
| 6 | Csapo & Alegre 2016, *Scand J Med Sci Sports* (MA, 448) | Load vs mass/strength | Strong |
| 7 | Nunes et al. 2024, *Arch Gerontol Geriatr* (14 RCTs) | Volume → lean mass | Strong |
| 8 | Bassey et al. 1998, *JBMR* | Jumping → hip BMD (peri vs post) | Moderate |
| 9 | Zhao/Zhao/Zhang 2014, *Sports Med* (6 studies) | Jumping → FN not spine | Moderate |
| 10 | Babatunde et al. 2012 | Impact → FN BMD | Moderate |
| 11 | Boutcher et al. 2019, *Med Sci Sports Exerc* (n=40) | SIT → body composition | Moderate |
| 12 | Khalafi et al. 2023, *Front Endocrinol* (101 RCTs, 5,697) | Exercise → body composition | Strong |
| 13 | *J Appl Physiol* 2025 (n=13) | Acute HIIT → glycemia | Limited |
| 14 | Hill et al. 2008, *J Endocrinol Invest* (n=12) | Exercise cortisol dose-response | Strong (benign) |
| 15 | Patacchioli et al. 2015, *Climacteric* (n=30) | Estrogen status × exercise cortisol | Limited |
| 16 | Hamidovic et al. 2020, *Front Endocrinol* (MA) | Estrogen × cortisol | Limited |
| 17 | Dupuit et al. 2020, *Exp Physiol* (38 studies, 959) | HIIT in menopause — benefit/no harm | Moderate |
| 18 | Jäger et al. 2017, *J Int Soc Sports Nutr* (ISSN stand) | Protein 1.4–2.0 g/kg | Strong |
| 19 | Bauer et al. 2013, *JAMDA* (PROT-AGE) | Protein ≥1.2 g/kg older | Strong |
| 20 | Traylor et al. 2018, *Adv Nutr* | RDA inadequate | Strong |
| 21 | Moore et al. 2015, *J Gerontol A* | Per-meal MPS threshold | Moderate |
| 22 | Schoenfeld & Aragon 2018, *J Int Soc Sports Nutr* | Per-meal dose/distribution | Moderate |
| 23 | Morton et al. 2018, *Br J Sports Med* (49 RCTs, 1,863) | Protein plateau ~1.6 g/kg | Strong |
| 24 | McKenna et al. 2024, *J Appl Physiol* | Postmenopausal anabolic resistance | Moderate |
| 25 | Dam et al. 2021, *Front Physiol* (RCT n=31) | Estrogen × RT muscle gain | Moderate |
| 26 | Romero-Parra et al. 2021, *Sports Health* | EIMD post- vs premenopause | Limited |
| 27 | Enns & Tiidus 2010, *Sports Med* (review) | Estrogen → muscle repair | Moderate (mechanism) |
| 28 | Harvey et al. 2016, *Menopause* | HRV recovery (aging vs estrogen) | Moderate |
| 29 | Baker et al. 2018, *Sleep Med Clin* | VMS → sleep disruption | Strong |
| 30 | Kistler-Fischbacher, Weeks & Beck 2025, *Int Urogynecol J* (MEDEX-OP RCT) | HiRIT × pelvic floor | Moderate |
| 31 | Forner et al. 2020, *Int Urogynecol J* (n=3,934) | Heavy lifting × prolapse | Limited→Moderate |

*Grades reflect source quality + (for §§2–5) adversarial-verification vote margins. §§6–8 sources are single-pass and graded conservatively.*
