# 003 — Landing page copy (source of truth)

Approved design: "A v2: adapts to every athlete", 2026-10-05. Implement this
copy verbatim in `src/landing/content.ts`; that module is the only place page
text lives. Where a line makes a factual claim, the **Backed by** column names
the code that makes it true. `src/__tests__/landing/claims.test.ts` (PR 3)
enforces the ones a test can check.

Typography rules: sentence case everywhere, curly apostrophes (’) in rendered
text, no exclamation marks, numbers as digits.

## Meta

| Field | Text |
|---|---|
| `<title>` | Attune: training that adapts to you |
| meta description | An AI coach that reads your recovery every morning and adjusts today’s workout. Road races, trail and ultra, HYROX, and general fitness. Free during the beta. |
| og:title | Training that actually adapts to you |
| og:description | Same as meta description |
| og:image alt | The Attune “This morning” card: HRV, resting heart rate and sleep, with today’s workout adjusted |

## Header

- Wordmark: **Attune** (with the mark from design-spec.md)
- Nav: How it works (`#how`) · Who it’s for (`#you`) · The coach (`#coach`) · Free tools (`#tools`) · Sign in (`/app/`) · **Request an invite** (`#join`, button)
- At ≤640px only **Sign in** and **Request an invite** stay visible.
- Light/dark switch (icon button, right of the wordmark and before the nav; on the wordmark’s row when the nav wraps; visible at every width). Its accessible name says what it does: Switch to dark mode · Switch to light mode. *(Added 2026-10-11: the page follows the device’s light or dark setting; the switch overrides it.)*

## Hero

- H1: **Training that actually adapts to you.**
- Subhead (bold): A coach in your pocket.
- Lead: Racing a marathon, training for HYROX, or just getting fitter: Attune reads your recovery every morning and adjusts today’s workout to match.
- Form label: Your email · placeholder `you@example.com`
- Button: **Request an invite** · while sending: **Sending…**
- Optional field label: What are you training for? (optional) · placeholder `A spring half, my first HYROX, just getting fit...`
- Fine print: Free during the beta. Already in? Sign in *(link → `/app/`)* *(PR 4b: “Mike reviews every request.” removed from this line only, at the owner’s request, 2026-10-07; the success body and the FAQ keep it)*

### Form states

| State | Text |
|---|---|
| Empty or malformed email (client check) | Enter an email address like name@example.com. |
| Server 400 | Show the server’s `error` string as is (today: “Please enter a valid email address.”) |
| Server 503 or other 5xx | Requests are paused for a moment. Try again in a few minutes. |
| Server 429 (PR 2) | You’ve sent a few requests already. Try again later. |
| Network failure | Couldn’t send your request. Check your connection and try again. |
| Success heading | Request sent. |
| Success body | Mike will review your request and email {email} the moment you’re approved. Until then, try one of the free tools (link text “free tools” → `#tools`). |

### “This morning” card — approved 2026-10-07 (PR 4b)

PR 4b replaces “Same morning, four different athletes”: the owner asked for one
of each outcome (2026-10-07), so each tab now has its own morning.

- Group label: Four athletes, four different mornings
- Tabs: Running · Trail · HYROX · Fitness (default: Running)
- Card heading: This morning
- Labels: when the workout changes, Planned (struck through) → Adjusted for today (orange); when it stands, Planned → Today (teal, not struck through)
- Ring footnote (every tab): Based on HRV, resting heart rate, sleep and your last 7 days of training

| Tab | Outcome | HRV | Resting HR | Sleep | Ring | Readiness line |
|---|---|---|---|---|---|---|
| Running | Eases off | **41** ms, 18% below normal (orange) | **56** bpm, +5 over normal (orange) | **5:40**, Short night | **38** | Readiness: take it easy |
| Trail | Pivots | **49** ms, Normal for you | **52** bpm, Normal for you | **6:20**, Hotel night | **60** | Readiness: good to go |
| HYROX | Positive | **63** ms, 14% above normal (teal) | **47** bpm, 3 under normal (teal) | **8:10**, Solid night | **86** | Readiness: ready to push |
| Fitness | Neutral | **52** ms, Normal for you | **50** bpm, Normal for you | **7:25**, Normal night | **66** | Readiness: good to go |

| Tab | Who (top right) | Planned | Today | Why | Chart caption |
|---|---|---|---|---|---|
| Running | Training for a spring half marathon | Tempo run, 20 min at threshold | Easy run, 45 min in zone 2 | Your body hasn’t caught up from Saturday’s long run. The tempo session moves to Thursday, so the week’s work stays the same. | The tempo run moves to Thursday, so week 9 still does its job. |
| Trail | Training for a 50K trail race | Hill repeats, 8 × 2 min | Room cardio: bodyweight intervals, 20 to 30 min, then 10 min mobility | You’re away for work with only a hotel room. The hill repeats become intervals you can do next to the bed, so the aerobic habit keeps going. Nothing to make up: the plan bends forward. | Hill repeats become room cardio while you’re away, and the plan bends forward. |
| HYROX | Training for HYROX, Open division | Race simulation: 4 × (1 km run + station) | Race simulation: 4 × (1 km run + station), full intensity | Your HRV and resting heart rate are both better than normal, and your load is steady. This is the day for your hardest session, so get after it. *(PR 4b review: was “Every number is above your normal”, which the card’s own resting HR and sleep contradicted; the owner approved this wording 2026-10-07, ending with a period because this file bans exclamation marks)* | The race simulation stays, at full intensity, so week 9 lands as planned. |
| Fitness | No race. Goal: build endurance | Bike intervals, 6 × 3 min hard | Bike intervals, 6 × 3 min hard | All clear: your numbers are right on your normal, so nothing changes. Wednesday’s strength session stays too. | Nothing moves, and the block stays on track. |

All four are illustrative examples (the “Example plan” note sits in the chart
caption). Backed by:

- **Eases off:** the morning autopilot moves a hard session on a low-readiness stretch (`src/engines/adaptive/morningOutlook.ts`).
- **Pivots:** travel mode with only a hotel room turns a run into “Room cardio (travel)”: bodyweight intervals 20–30 min and mobility 10 min, “the plan bends forward” (`src/engines/planGenerator/travelMode.ts` `travelSwap`, kit `bodyweight`).
- **Positive:** a PEAK morning (display score ≥ 81, `src/utils/readiness.ts`) keeps the hard session and says to go at full intensity (“Peak form — execute planned workout at full intensity”). The app never adds work on a good morning, so the copy never says it does.
- **Neutral:** a GREEN morning stands as planned (“All clear — go as planned.”, `src/utils/verdict.ts`).

## How a morning works (`#how`)

H2: How a morning works

| # | Title | Body | Backed by |
|---|---|---|---|
| 1 | Your watch syncs overnight | HRV, resting heart rate, sleep and yesterday’s training come in from Garmin, Strava or Apple Health. | `api/garmin/`, `worker/strava-token-exchange.ts`, `api/apple/health.py` |
| 2 | Attune scores your readiness | It compares this morning with your own normal, not a population average, and checks how fast your training load is climbing. | `src/utils/readiness.ts` (z-scores vs personal baselines; ACWR guardrail) |
| 3 | Today’s workout adjusts | Ready to go, it stays. Run down, it eases off and moves the hard session to a day you can handle it. | readiness → plan adjustment |
| 4 | Ask the coach why | Every change comes with a reason in plain language, and you can push back. | `api/coach/` |

## Whatever you’re training for (`#you`)

- H2: Whatever you’re training for
- Intro: Each path has its own plan builder, so a HYROX athlete doesn’t get a marathon plan with burpees bolted on. Racing more than once? Put a half marathon and a HYROX in the same season.

| Card | Subtitle | Points | Backed by |
|---|---|---|---|
| Road races | 5K to marathon | Proven coaching methods like Daniels, 80/20 and Higdon, matched to your race · Paces set from a recent 5K or 10K · Rides and hikes count toward your load | `src/data/methods/*.json`: the three named are rated GOOD or BEST at 5K, 10K, half and marathon (Hansons is `NOT_SUITED` for 5K and Koop for 5K–half, so neither is named here, and never say “8” on this card); onboarding recommends the 3 best-suited; `Onboarding.tsx` `race_5k`/`race_10k`; cross-training load |
| Trail and ultra | Trail races and ultras | Methods built for the long stuff, like Koop and Roche SWAP · Counts climbing and descending, not just miles · Eases off after big descents | `koop.json`, `roche_swap.json`; `src/engines/terrain/`, `src/engines/descent/` |
| HYROX | Open and Pro divisions | Running and all 8 stations in one plan · Station work set for your division · Extra work on your weakest station | `src/engines/hyrox/spec.ts` (`HyroxDivision = 'open' \| 'pro'`, `stationSpecs`); `weakStation` in onboarding |
| General fitness | No race needed | Pick a goal: stay healthy, lose fat, build muscle or build endurance · Cardio your way: run, bike, row, swim, or a mix · Strength work built into every plan | goals `Onboarding.tsx:1322-1325`; modalities `Onboarding.tsx:1331-1335` (no gym option); strength in every preset template `generalFitness/presets.ts` (build_endurance has 1 strength day at 3–5 days/week, so never say “twice”; an athlete can reshape a week in `weekShape.ts`, so say “plan”, not “every week”) |

Season claim backed by `src/engines/season/` and the onboarding “What kinds of races?” step.

### Your plan, week by week

- H3: Your plan, week by week
- Toggle: Racing · No race
- Racing intro: Racing? Attune builds from base to peak, then tapers so you arrive fresh, with easier weeks wherever your method calls for them.
- No-race intro: No race? Attune plans in blocks of up to 16 weeks: three building weeks, then an easier one so the work sinks in. *(Backed by `generalFitness/index.ts` `DELOAD_EVERY = 4`, `MAX_BLOCK_WEEKS = 16`.)*
- Racing phase labels: Base, weeks 1 to 5 · Build, weeks 6 to 10 · Peak, 11 to 13 · Taper to race day
- No-race phase labels: Weeks 1 to 4 · 5 to 8 · 9 to 12 · 13 to 16
- Bar label above week 9: Today
- Caption: **Today, week 9** {chart caption from the tab table}. Dashed outline: what was planned. Example plan. *(PR 4b: the “Dashed outline” sentence shows only when the morning changed today; the chart’s aria-label then ends “Week 9 is lower than planned because today was adjusted.”, otherwise “Week 9 is on plan.”)*

## A coach in your pocket (`#coach`) — approved 2026-10-07 (PR 4b)

PR 4b folds “Make it yours” into this section (owner, 2026-10-07): the
personality picker sits with the chat, and picking one rewrites the coach’s
reply in that style. Every reply is written here, not generated live.

- H2: A coach in your pocket
- Body: It knows your plan, your watch data and your training history, and it answers in plain language. Type or talk. When it suggests a change, you see exactly what moves, and nothing changes until you approve it.
- Bullets: Ask why today’s workout looks the way it does · Rework the week around travel, work or a bad night · Approved changes go straight to your Garmin watch
- H3: Make it yours
- Body: Name your coach and pick how it talks to you. The reply changes as you do.
- Field: Coach name (default **Mira**, max 30 characters like the app; blank shows “Your coach”)
- Group label: Personality · hint: A few of the 17 personalities
- Personalities shown, pick one (exact app labels, in this order): Warm · Direct · Funny · Data Nerd · Old School (default: Warm)
- Demo chat header: {coach name} · “Your coach. {personality}.”
- Buttons under the chat: **Ask something else** · Reset
- Try limit: 3 changes per visit (a new personality or a new question counts as one; typing a name doesn’t; Reset doesn’t give tries back; a reload does). After the third: “That’s the demo. Request an invite to keep talking to {coach name}.” (link text “Request an invite” → `#join`)
- Proposal heading: Proposed change to your plan · buttons **Approve** · Keep my plan · after Approve: Plan updated. The new week is on your watch.
- Input placeholder: Ask {coach name} anything · input label (visually hidden): Message your coach · mic button label (aria): Talk to your coach. Both stay disabled.

### Question 1 (shown first)

- Athlete: Work trip Wednesday to Friday, and I’m already sleeping badly. What should this week look like?
- Proposal: **Tue** ~~Easy 40 min~~ Hard session, moved from Thu · **Wed to Fri** ~~Full sessions~~ 30 min easy, hotel-friendly

| Personality | Coach |
|---|---|
| Warm | Travel weeks are tough, and a short night on top of one is a lot. Let’s do your hard session Tuesday, before you leave, and keep the trip short and easy: 30 minutes in the hotel gym or outside. You won’t lose anything that matters. |
| Direct | Hard session moves to Tuesday, before you fly. Wednesday to Friday: 30 minutes easy, hotel gym or outside. Sleep matters more than volume this week. |
| Funny | Airports are great for steps and terrible for intervals. So the hard session moves to Tuesday, before you go, and the trip gets 30 easy minutes a day. Your fitness will be waiting when you land. |
| Data Nerd | Your HRV is 18% under your baseline and sleep is short, so hard work on travel days is poor value. The hard session moves to Tuesday, and Wednesday to Friday drop to 30 easy minutes. One lighter week won’t dent your fitness. |
| Old School | Do the work before you go. Hard session Tuesday. On the road, 30 minutes easy every day, gym or out the door. Fitness takes months to build, and three easy days won’t take it away. |

### Question 2

- Athlete: Why is today an easy day? I feel fine.
- No proposal.

| Personality | Coach |
|---|---|
| Warm | Glad you’re feeling good. Today is easy on purpose: it sets you up for Thursday’s tempo run. Keep it relaxed, enjoy it, and bring that energy to Thursday. |
| Direct | Because Thursday is hard. Easy days let the hard days be hard. Keep it conversational for 45 minutes and save your legs. |
| Funny | Feeling fine is the point. Today is the opening act and Thursday’s tempo run is the headliner. Don’t steal your own show. |
| Data Nerd | Easy days add aerobic volume at a cost your body clears by tomorrow. Stay in zone 2 today and Thursday’s tempo run gets your freshest legs. |
| Old School | Easy days make the hard days work. Run slow enough to talk. If it feels too slow, it’s working. |

### Question 3

- Athlete: Can I move Saturday’s long run to Sunday?
- Proposal: **Sat** ~~Long run, 90 min~~ Rest day · **Sun** ~~Rest day~~ Long run, 90 min

| Personality | Coach |
|---|---|
| Warm | Of course. Let’s rest Saturday and do the long run Sunday. The rest of the week stays just as it is. |
| Direct | Yes. Saturday becomes rest, Sunday gets the long run. Nothing else changes. |
| Funny | Big Saturday plans? Respect. The long run slides to Sunday, Saturday becomes a rest day, and the week won’t even notice. |
| Data Nerd | Yes. Swapping the two days keeps the week’s total load the same, and you get one extra day of rest before the long run. |
| Old School | Rest Saturday, run long Sunday. Same work, different day. |

“Ask something else” cycles 1 → 2 → 3 → 1. Reset returns to question 1,
Warm, Mira, not approved.

Backed by: voice in/out (`api/coach/chat.py`, `src/utils/voiceInput.ts`), proposals with approval (`src/components/ProposalCard.tsx`), Garmin re-push (`src/utils/garminRepush.ts`), coach memory; personalities `COACH_TRAITS` (17 entries) and `DEFAULT_COACH_NAME` in `src/types/index.ts`; name limit `CoachPersonaEditor.tsx`. “If it feels too slow, it’s working” echoes the app’s own easy-day card.

## See it in the app — approved 2026-10-07 (PR 4b)

Real screens from the founder’s own training, cropped so nothing personal
shows (owner, 2026-10-07): no name, race or notes, though the readings,
heart rate and dates are real. Rounded screens in a swipe row on phones,
columns on wider screens. Placed after the coach section.

- H2: See it in the app
- Intro: Real screens from a real training block.

| Screen | Caption | Alt text |
|---|---|---|
| Today | Every day explains itself, easy days included. | The Today screen: week 4 of 12, today’s easy run, and why it’s easy |
| Coach | The coach reads your recovery before it answers. | A coach reply that starts from this morning’s readiness, HRV and sleep |
| Progress | Fitness, fatigue and recovery on one chart, so you can see whether you’re building or digging a hole. | The fitness, fatigue and recovery chart for the last month |
| Workout | Every session in detail: heart rate and time in each zone. | A strength session’s heart rate over time and time in each zone |
| Load alert | When your load climbs too fast, Attune tells you to back off. | An injury risk alert: the load ratio rose from 1.26 to 1.84 in three days |
| Journal | Your training story, in your words. | The training journal, with a note about a session skipped on purpose |

## Works with the gear you already wear

| Name | Body |
|---|---|
| Garmin | Pulls HRV, sleep and activities, and sends each week’s workouts to your watch. |
| Strava | Brings in your runs, rides and hikes so cross-training counts toward your load. |
| Apple Health | Syncs HRV, resting heart rate, sleep and workouts from your iPhone. |

Do not use Garmin, Strava or Apple logos (trademark guidelines); names as text only.

## Try it before you’re in (`#tools`)

- H2: Try it before you’re in
- Body: Four free calculators built on the same engine. No sign-up, and nothing you enter leaves your browser. *(PR 4c: was “Three”)*

| Tool | Body | Link text | URL |
|---|---|---|---|
| Fueling planner | Carbs, fluid and sodium per hour for a long effort. | Open the fueling planner | `/tools/fueling.html` |
| Race time predictor | Realistic finish times from a recent result. | Open the race predictor | `/tools/predictor.html` |
| Heat planner | How to adjust pace and fluids when it’s hot. | Open the heat planner | `/tools/heat.html` |
| Weekly mileage planner | How many miles a week to build to, and how fast, for your next race. | Open the mileage planner | `/tools/mileage.html` |

### Weekly mileage planner page (`/tools/mileage.html`, PR 4c, approved 2026-10-07)

- Title: Weekly mileage planner · tagline: How many miles a week to build to, and how fast, for your next race.
- Fields: Race (5K · 10K · Half marathon · Marathon) · Miles you run a week now · Weeks until your race
- Results: Start at {x} mi a week · Peak at {y} mi in week {n} · Longest run {z} mi
- Chart caption: Each bar is one week. Lighter bars are easier weeks.
- Table (collapsed): Every week · columns Week · Miles · Long run; an easier week’s miles read “{miles} (easier)”.
- Footnote: Built on the Daniels method’s ramp: each building week is at most about 10% above the last full week, and every fourth week before the peak is easier. This is Attune’s plan for an intermediate runner on 5 days a week with no recent race time; your plan in the app also uses your paces and schedule.
- When the plan peaks below what you run now: Without a recent race time to set your paces, this plan tops out at {y} mi a week, below what you run now.
- Invalid input: Enter 5 to 200 miles a week and 4 to 24 weeks.
- Meta description: How many miles a week to build to, and how fast, for your next 5K, 10K, half or marathon, from Attune’s own plan engine. Free, runs in your browser.

*Review history (PR 4c):* the owner approved “about 10% more a week at most”, then “…every fourth week of the build is easier”. The pre-review showed both overclaim (the week after an easier week rises well past 10% from it; at some plan lengths the fourth week falls on the peak and isn’t easier), so the footnote says “before the peak”, and the assumptions sentence, the ceiling line and the table are new. All pending the owner’s look.

Backed by `mileagePlan` in `src/tools/mileageMath.ts`: it runs the app’s `generatePlanFromMethod` with the Daniels method for the athlete in `mileageAthlete` (intermediate, 35, 5 days, healthy, no race time, race on the Saturday ending week N) and reads each week’s `targetMi` and long-run card. `mileageMath.test.ts` checks it equals the generator across 4 distances × 6 mileages × 10 runways, and holds the footnote, the “easier” bars and Daniels’ 30% long-run rule to the generator’s output.

## Founder note — owner’s wording, 2026-10-07

> “I built Attune for my own training: mountain trail races, HYROX, and the stretches in between. I wanted a plan that noticed when I’d slept badly, was exhausted from kids, work travel or simply overdoing it, and changed my plan intelligently instead of pretending nothing happened and getting injured.”
>
> **Mike Beebe**, founder, Oakland

## Questions

| Q | A |
|---|---|
| Is it only for runners? | No. Attune builds plans for road races, trail and ultra, HYROX, and general fitness with no race at all. A season can even mix races, like a half marathon and a HYROX. |
| How do I get in? | Request an invite with your email. Mike reviews every request and emails you when you’re approved. You sign in with your Google account. |
| Does it cost anything? | Attune is free during the beta. |
| Is the coach a person? | No. It’s an AI coach that works from your plan and your data, and it can’t change your training without your approval. |
| Which devices work? | Garmin, Strava and Apple Health. Attune runs in your phone’s browser and installs to your home screen like an app. |
| Do I need a wearable? | It helps. Without one you can still log workouts and how they felt, and the plan adapts to that. |

## Footer

- Line: **Start training that adapts to you.**
- Sub: Attune is in an invite-only beta and free while it lasts.
- Button: **Request an invite** (`#join`)
- Links: Sign in (`/app/`) · Free tools (`#tools`) · © 2026 Attune. *(PR 5 launches without Privacy (`/privacy.html`) and Terms (`/terms.html`); they return with their pages in PR 5b, once the owner’s text is in. Owner’s call, 2026-10-07.)*

## Words and claims that must never appear

Enforced by `claims.test.ts` (case-insensitive) against the rendered landing page:
`App Store`, `TestFlight`, `Apple Watch`, `widget`, `official Garmin`,
`Garmin partner`, `certified`, any currency amount (`$`, `€`, `£` followed by a
digit), `per month`, `/mo`, `users`, `athletes trust`, `#1`, `best`.
