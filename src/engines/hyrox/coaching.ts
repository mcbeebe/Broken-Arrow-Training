// Workout coaching narratives for Hyrox training days.
//
// The trail-race coaching in utils/coaching.ts is hardcoded to mountain
// racing (poles, climbs, named Broken Arrow landmarks) and the General
// Fitness module is race-free — neither explains WHY a Hyrox plan looks
// the way it does. This module is the Hyrox analog: narratives keyed on
// PlannedDay.type + workout-name sniffs matching what the Hyrox generator
// (utils/planGenerator.ts) and the layered season prep emit.
//
// Pure: (day, weekNum, raceName?) → narrative. The recurring theme the
// copy hammers: Hyrox is a RUNNING race with interruptions — 8×1km is
// half the event, and the aerobic engine that recovers while you work is
// what training builds. No mountains, no poles, no aid stations.

import type { PlannedDay } from '../../types'
import type { CoachingNarrative } from '../../utils/coaching'

function longRunCoaching(day: PlannedDay, raceLabel: string): CoachingNarrative {
  const w = day.workout.toLowerCase()

  if (w.includes('simulation')) {
    return {
      title: 'Full Hyrox Simulation',
      purpose:
        `A full dress rehearsal for ${raceLabel}: 8×1km of running with stations at race effort between. Today answers every race-day question — pacing, transitions, grip, fueling — while there's still time to adjust the plan.`,
      execution: [
        'Treat it like race morning: practiced breakfast 2-3 hours out, race shoes, race fuel.',
        'Run the stations in race order where your gym allows — the sequence is part of the rehearsal.',
        'Runs 1-4 deliberately controlled. Note your 1km splits — they ARE your race-pace calibration.',
        'Walk the transitions with purpose, exactly as you will in the roxzone. Never stand still.',
        'Log which station spiked your heart rate most and where your grip went — that\'s next block\'s priority.',
        'Cool down 10 min easy and write down three things you\'d change on race day.',
      ],
      mindset:
        'Nothing about race day should be new. Every question you answer today — pacing, breaks, fueling — is one less unknown when it counts.',
      nutrition:
        'Fuel exactly as you plan to race: practiced breakfast 2-3 hours before, a gel before the start or at halfway if the session runs past 75 minutes.',
      recovery:
        'This is the biggest session in the plan. Refuel within 30 min, and keep the next 2 days easy — the adaptation lands in the recovery.',
    }
  }

  const finisher = w.includes('finisher')
  return {
    title: 'Long Run — Your Hyrox Engine',
    purpose:
      'Hyrox is a running race with interruptions: 8×1km is half the event, and you hit every station with the heart rate you carried in from the run. The long run builds the aerobic engine that recovers WHILE you work. The best predictor of a strong Hyrox isn\'t a bigger sled push — it\'s how well you run on compromised legs, and that gets built here.',
    execution: [
      'Keep it conversational — stay in the prescribed zone even when it feels too easy. Easy is the point.',
      'If your heart rate drifts up in the back half without an effort change, slow down.',
      finisher
        ? 'THE FINISHER: go straight from the run into the station circuit with NO break. Arriving at stations with running fatigue in your legs is the entire point — that\'s every station on race day.'
        : 'Hold your form when fatigue shows up late: tall posture, quick feet. Running well tired is the race skill.',
      'Practice race fueling on any session past 75 minutes — nothing new on race day.',
      'Cool down with an easy 5-10 min walk and refuel within 30 min.',
    ],
    mindset:
      'Skipping long runs to do more station work is the classic Hyrox mistake. Every week of aerobic base makes runs 5-8 feel less like survival — on race day you pass people BETWEEN the stations, not at them.',
    nutrition:
      'Sessions past ~75 min: 100-150 cal every 30-40 min, and practice with what you\'ll use on race day. Shorter: just be hydrated.',
    recovery:
      'Refuel within 30 min and keep tomorrow easy. The long run only makes you fitter if you absorb it.',
  }
}

/** Compromised running (run→station→run) — the session that IS the race.
 *  Matched by workout NAME, not day.type: the generator emits the base
 *  intro as `type: 'cross'` and the build/peak version as `type:
 *  'quality'`, so a type-keyed lookup handed this session Station Circuit
 *  copy in one phase and 1km Repeats copy in the other. Neither describes
 *  the transition, which is the entire point of the session. */
function compromisedRunningCoaching(day: PlannedDay, raceLabel: string): CoachingNarrative {
  const intro = /\(intro\)/i.test(day.workout)

  if (intro) {
    return {
      title: 'Compromised Running — Intro',
      purpose:
        `This is your first rehearsal of the only thing ${raceLabel} actually asks: run, work, run again, with nothing in between. Today is deliberately conversational — you are learning what your legs do in the first 200 m off a station, not testing how hard you can push. That handover is a skill, and skills are learned slowly before they are loaded.`,
      execution: [
        'Run the easy leg at a pace you could talk through. If you cannot, you are already racing it.',
        'Go straight from the run into the station — no pause, no water, no reset. The seam is the session.',
        'Expect the first 100-200 m after each station to feel clumsy and heavy. That is the sensation you came to meet.',
        'Keep the station work smooth and submaximal — technique under mild fatigue, not a hard effort.',
        'Walk between rounds, then start the next run before you feel fully recovered.',
        'Note which transition felt worst. That single observation is worth more than the whole session\u2019s fitness.',
      ],
      mindset:
        'Everyone can run, and everyone can lift. The race is decided in the ten seconds where one becomes the other — and that is all you are practising today.',
      nutrition:
        'A light carb snack 60-90 min before is plenty. Drink to thirst — this session is short and easy on purpose.',
      recovery:
        'This should finish well inside your limits. If it left you flattened, the effort crept up — dial the run leg back next time.',
    }
  }

  return {
    title: 'Compromised Running — Race Simulation',
    purpose:
      `Run→station→run at race effort is the highest-fidelity training ${raceLabel} has, short of a full simulation. Every km here starts on legs the previous station already taxed, which is the only kind of running the race contains. Fitness built in fresh-legs intervals does not transfer to this; fitness built here is the race itself.`,
    execution: [
      'Run each km at honest race pace — the pace you could repeat eight times, not the one you can hit once.',
      'No break between the run and the station. Walking in to catch your breath trains the wrong race.',
      'Jog the transitions. The roxzone is race time, and it is where places are actually won and lost.',
      'Hold your run pace on the rounds AFTER the heaviest stations — that is the specific quality this session builds.',
      'Watch your grip across the whole session: sled pull, carries, and wall balls all draw on the same forearms.',
      'If your km splits fall apart mid-session, stop the session rather than finish it slow — you have learned your current ceiling, which was the point.',
      'Cool down 10 min very easy.',
    ],
    mindset:
      'You are not training to run fast, and you are not training to lift heavy. You are training to still be yourself thirty seconds after a sled — and nobody who skips this session ever is.',
    nutrition:
      'Carbs 2-3 hours before, and treat anything past 75 min as a fuelling rehearsal — use what you plan to race with.',
    recovery:
      'This lands like a hard interval session plus a lifting session, because it is both. Refuel within 30 min and keep tomorrow genuinely easy.',
  }
}

function stationCircuitCoaching(day: PlannedDay, raceLabel: string): CoachingNarrative {
  const light = /light station/i.test(day.workout)
  if (light) {
    return {
      title: 'Light Station Practice',
      purpose:
        'Recovery-week station work is about movement quality, not fitness. Half effort, full attention: groove the positions — low sled drive, hinge on the erg, full-depth wall balls — so race effort has clean technique to lean on.',
      execution: [
        'Pick 3 stations and keep every set at about half effort.',
        'Slow the movement down and feel the positions — this is practice, not training.',
        'Stop while it still feels easy. The fitness comes from absorbing the previous block.',
      ],
      mindset: 'Sharpening the axe still counts. Easy weeks are what make the hard weeks work.',
      nutrition: 'Nothing special — eat normally and stay hydrated.',
      recovery: 'This should leave you fresher than you started. If it didn\'t, it was too hard.',
    }
  }
  return {
    title: 'Station Circuit',
    purpose:
      `Station work at race effort teaches ${raceLabel}'s exact pattern: work hard, move, repeat. Each movement below is one station from the race. Your weakest station gets extra volume on purpose — Hyrox is decided by your worst station, not your best one.`,
    execution: [
      'Warm up 3-5 min on an erg, building to station effort.',
      'Hit each station at honest race effort — the pace you could hold mid-race, not a fresh-legs PR.',
      'Treat the rests like the roxzone: keep moving, walk briskly, breathe down. Never sit.',
      'Note which station forces you to slow down or break — tell your coach; it drives next block.',
      'Manage your grip across the whole circuit — sled pull, carries, and wall balls all tax the same forearms.',
      'Cool down 5 min easy and stretch what\'s pumped.',
    ],
    mindset:
      'Race effort with controlled rests is the whole sport in miniature. Learn what each station costs you now, so nothing surprises you on race day.',
    nutrition:
      'A light carb snack 60-90 min before. Hydrate — indoor circuits sweat more than they feel like they do.',
    recovery:
      'Expect systemic fatigue more than soreness. Easy movement tomorrow clears it; protect tonight\'s sleep.',
  }
}

function kmRepeatsCoaching(): CoachingNarrative {
  return {
    title: '1km Repeats — Race Legs',
    purpose:
      'These repeats calibrate the exact pace of your 8 race legs. The rests are deliberately short — they leave fatigue in your legs so each rep feels like running off a station, which is the only kind of running Hyrox has.',
    execution: [
      'Warm up 10 min easy plus a few 20-sec pickups before rep one.',
      'Run EVEN splits: rep one should match the last rep. If rep one is your fastest, you started too hot — exactly the race-day mistake this session trains out.',
      'Keep the rests honest — the incomplete recovery is the stimulus, not an obstacle.',
      'Hold form late in each rep: tall posture, quick cadence, relaxed shoulders.',
      'Cool down 10 min very easy.',
    ],
    mindset:
      'Memorize what race pace feels like on tired legs. On race day your watch matters less than this feeling.',
    nutrition:
      'Light carb snack 60-90 min before; water is enough during. Refuel normally after.',
    recovery:
      'Quality work lands with sleep — make tonight a good one and keep tomorrow easy.',
  }
}

function runCoaching(day: PlannedDay): CoachingNarrative {
  if (/tempo/i.test(day.workout)) {
    return {
      title: 'Tempo Run',
      purpose:
        'Tempo raises your lactate threshold — the effort you can hold without blowing up. In Hyrox terms: it\'s what lets you keep running your race pace on legs the sleds have already taxed, instead of jog-surviving runs 5-8.',
      execution: [
        'Warm up 10 min easy before the tempo block.',
        'The tempo effort is "comfortably hard" — you could say a few words, not sentences.',
        'Hold one steady effort; don\'t surge. Smooth is the skill.',
        'Cool down 5-10 min very easy.',
      ],
      mindset: 'Threshold is the difference between racing the back half and enduring it.',
      nutrition: 'Light snack 60-90 min before; hydrate well.',
      recovery: 'Moderate cost — normal sleep and an easy day tomorrow absorb it.',
    }
  }
  return {
    title: 'Easy Run',
    purpose:
      'Easy aerobic running is the quiet engine behind your whole Hyrox: the aerobic system is what recovers FOR you inside every station and between every run. It only grows at easy efforts — this run is not filler, it\'s the foundation.',
    execution: [
      'Conversational pace, start to finish. If in doubt, slower.',
      'Stay in the prescribed zone even if it feels too easy — that\'s the adaptation zone.',
      'Strides at the end (when prescribed): relaxed and quick, not sprints.',
    ],
    mindset:
      'The athletes who fade at station 6 skipped these runs. Easy days make race day fast.',
    nutrition: 'Nothing special under 75 min — just be hydrated.',
    recovery: 'This should cost almost nothing. Finish feeling like you could do more.',
  }
}

function strengthCoaching(day: PlannedDay, raceLabel: string): CoachingNarrative {
  return {
    title: day.workout.toLowerCase().includes('foundation') ? 'Strength — Foundation' : 'Strength — Hyrox Engine Room',
    purpose:
      `Hyrox strength is strength-ENDURANCE: legs, grip, and trunk that still produce force on rep eighty. Every movement here maps to a station in ${raceLabel} — squats and lunges are your sleds and sandbag lunges, carries and rows are your grip insurance, and the trunk work holds your positions when everything else is screaming.`,
    execution: [
      'WARM-UP (5-7 min): easy erg or jog, then bodyweight squats, lunges, and arm circles.',
      'Work through the exercises in order — tap any exercise below for a full form guide and swaps.',
      'Moderate loads, controlled reps, short rests — endurance of force, not one-rep maxes.',
      'Grip work is race work: don\'t use straps; your forearms need the practice more than your ego needs the reps.',
      'Stop each set with 2 clean reps left in the tank. Quality compounds; grinding doesn\'t.',
      'COOL-DOWN (5 min): easy movement plus stretch quads, glutes, and forearms.',
    ],
    mindset:
      'The race doesn\'t care how much you can lift once — it cares what you can still do a minute into a station. Train the version of strong that repeats.',
    nutrition:
      'Protein within an hour after (shake, eggs, yogurt). Your legs are rebuilding for the next run day.',
    recovery:
      'Expect soreness 24-48 h out, especially early in the block. Light movement clears it faster than the couch.',
  }
}

function raceDayCoaching(raceLabel: string): CoachingNarrative {
  return {
    title: 'RACE DAY — HYROX',
    purpose:
      `${raceLabel} is roughly 60-100 minutes of sustained work: 8×1km of running with 8 stations between. The race rewards the athlete who runs the first half controlled — even pacing, clean transitions, and an aerobic engine that keeps every station honest. You've trained exactly that.`,
    execution: [
      'Practiced breakfast 2-3 hours before the start — nothing new today.',
      'Warm up 10-15 min: easy jog, a few erg pulls, one short pickup. Arrive at the start warm, not tired.',
      'Runs 1-4: deliberately controlled. The race starts at the Row — everything before it is positioning.',
      'SkiErg and Row: long, patient pulls at a pace you could double. Free speed is lost here by rushing.',
      'Sleds: get low, short fast steps, constant pressure. Your legs will feel wooden on the next run — normal, it fades within 200-300 m.',
      'Roxzone: walk with PURPOSE, never stand still. Transitions are free time — most people donate it.',
      'Wall balls are the last station for a reason: break them into planned sets (20-15-15…) from rep one, before your legs decide for you. Then empty the tank on nothing — you\'re done after this.',
    ],
    mindset:
      'Race the plan, not the athletes around you — the field that sprints run 1 comes back to you at the wall balls. Compromised running is your trained superpower now. Trust it and finish strong.',
    nutrition:
      'Light practiced meal 2-3 hours out. For a ~90-minute effort, one gel 15 min before the gun (or at the halfway roxzone) is plenty. Sip water at every chance.',
    recovery:
      'Refuel within 30 min, then celebrate. Take 3-5 easy days — expect your grip and quads to complain louder than your lungs.',
  }
}

function restCoaching(): CoachingNarrative {
  return {
    title: 'Rest Day',
    purpose:
      'Rest is when the adaptation lands: muscles repair, glycogen refills, and your nervous system resets. A Hyrox block stacks running, strength, and station work — the rest day is what lets all three stick.',
    execution: [
      'Stay off hard training. A gentle walk or light stretching is fine.',
      'Hydrate well and aim for 7-9 hours of sleep.',
      'Give your grip and forearms a day off too — no bonus dead hangs.',
    ],
    mindset: 'Doing less today is the plan working, not you slacking. Rest hard.',
    nutrition: 'Eat well — protein and whole foods. Rest days are rebuilding days.',
    recovery: 'This IS the recovery. Sleep is the most powerful tool you have.',
  }
}

/**
 * Hyrox-aware coaching for a planned day. Mirrors the CoachingNarrative
 * shape WorkoutModal renders (PURPOSE / HOW TO EXECUTE / MINDSET /
 * NUTRITION / RECOVERY). `raceName` personalizes the copy when known
 * ("Hyrox Anaheim"); absent, copy says "Hyrox".
 */
export function getHyroxCoaching(day: PlannedDay, _weekNum: number, raceName?: string): CoachingNarrative {
  const raceLabel = raceName?.trim() || 'Hyrox'
  // Name-matched sessions come FIRST: the generator splits compromised
  // running across two day.types (cross in base, quality in build/peak),
  // so the type switch below can never route it correctly.
  if (/compromised running/i.test(day.workout)) {
    return compromisedRunningCoaching(day, raceLabel)
  }
  switch (day.type) {
    case 'race':
      return raceDayCoaching(raceLabel)
    case 'long':
      return longRunCoaching(day, raceLabel)
    case 'quality':
      return kmRepeatsCoaching()
    case 'cross':
      return stationCircuitCoaching(day, raceLabel)
    case 'strength':
      return strengthCoaching(day, raceLabel)
    case 'run':
      return runCoaching(day)
    case 'rest':
      return restCoaching()
    default:
      return {
        title: 'Hyrox Training Session',
        purpose:
          'A session in your Hyrox build. Everything in this plan serves one of two engines: the running that is half the race, or the strength-endurance that keeps the stations honest.',
        execution: [
          'Follow the day\'s prescription at the stated effort.',
          'Keep transitions and rests disciplined — they\'re training too.',
        ],
        mindset: 'Consistency wins Hyrox. Show up, do the work, recover well.',
        nutrition: 'Hydrate and eat a balanced meal 2-3 hours beforehand.',
        recovery: 'Persistent fatigue or wrecked grip are signs to back off a notch.',
      }
  }
}
