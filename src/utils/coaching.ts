import type { PlannedDay } from '../types'

interface CoachingNarrative {
  title: string
  purpose: string
  execution: string[]
  mindset: string
  nutrition: string
  recovery: string
}

export function getCoaching(day: PlannedDay, weekNum: number): CoachingNarrative {
  const phase = getPhase(weekNum)
  const base = getTypeCoaching(day, phase)

  return {
    ...base,
    nutrition: getNutritionTip(day, weekNum),
    recovery: getRecoveryTip(day, phase),
  }
}

type Phase = 'base' | 'build' | 'peak' | 'taper' | 'race'

function getPhase(weekNum: number): Phase {
  if (weekNum <= 3) return 'base'
  if (weekNum <= 6) return 'build'
  if (weekNum <= 8) return 'peak'
  if (weekNum <= 9) return 'taper'
  return 'race'
}

function getTypeCoaching(day: PlannedDay, phase: Phase): Omit<CoachingNarrative, 'nutrition' | 'recovery'> {
  switch (day.type) {
    case 'strength':
      return {
        title: 'Strength Session',
        purpose: phase === 'base'
          ? 'Building the muscular foundation for mountain running. Strength work now prevents injury later and builds the power you\'ll need for 3,800 ft of climbing on race day.'
          : phase === 'taper'
          ? 'Maintenance-only strength. You\'re preserving neuromuscular connections without creating fatigue. Keep it light — the hard work is done.'
          : 'Building eccentric strength for steep descents and concentric power for sustained climbs. This directly translates to race-day performance on Broken Arrow\'s technical terrain.',
        execution: [
          'Warm up 5-10 min with dynamic movement before lifting.',
          'Focus on controlled tempo — especially the lowering (eccentric) phase.',
          'Rest 60-90 seconds between sets. This is strength, not cardio.',
          phase === 'build' || phase === 'peak'
            ? 'Eccentric work is key: slow the negative on squats and step-downs. Your quads will thank you on the Shirley Canyon descent.'
            : 'Full range of motion on every rep. Quality over quantity.',
        ],
        mindset: phase === 'base'
          ? 'You\'re building the engine. Trust the process — this gym work pays dividends in weeks 6-8.'
          : 'Strength is your insurance policy for race day. Every rep makes you more durable on the mountain.',
      }

    case 'run':
      return {
        title: 'Easy Aerobic Run',
        purpose: 'Easy runs build your aerobic base — the foundation of all endurance. At this effort, your body is burning fat efficiently, building capillary density, and strengthening connective tissue without accumulating fatigue.',
        execution: [
          'Start slower than you think. The first mile should feel almost too easy.',
          'Breathe through your nose if possible — if you can\'t, you\'re going too hard.',
          'Keep your HR in the target zone. If it drifts up on hills, walk — that\'s not failure, that\'s smart training.',
          day.route !== '—' ? `Enjoy the route at ${day.route}. Look around. Easy days should feel good.` : 'Find a route you enjoy. Easy days should feel good.',
        ],
        mindset: 'The #1 mistake in trail running is going too hard on easy days. Protect this effort level fiercely. Fast runners are made on easy days, not hard ones.',
      }

    case 'quality':
      return {
        title: 'Quality / Interval Session',
        purpose: day.workout.toLowerCase().includes('hill')
          ? 'Hill repeats build race-specific power. Broken Arrow is a climbing race — every hill repeat wires your neuromuscular system for sustained uphill effort at altitude.'
          : day.workout.toLowerCase().includes('tempo')
          ? 'Tempo work raises your lactate threshold — the pace you can sustain before things get uncomfortable. This translates directly to maintaining effort on long Broken Arrow climbs.'
          : day.workout.toLowerCase().includes('race-pace')
          ? 'Race-pace intervals teach your body what race day will feel like. You\'re calibrating effort, practicing fueling, and building confidence for the real thing.'
          : 'This session builds speed and power above your aerobic base. The hard efforts create training stimulus; the recovery intervals let you repeat them with good form.',
        execution: [
          'Warm up 10-15 min easy before any hard effort.',
          'Hit the target zone on the hard efforts, but don\'t exceed it. Controlled intensity beats all-out chaos.',
          'Recovery intervals are RECOVERY. Walk if needed. The magic happens in the hard portions.',
          day.workout.includes('POLES') ? 'Practice your pole plant rhythm. Smooth and consistent beats powerful and erratic.' : 'Focus on quick cadence and upright posture on the climbs.',
          'Cool down 10 min easy. Don\'t skip this — it starts your recovery.',
        ],
        mindset: 'Quality sessions are where fitness jumps happen. Embrace the discomfort, but respect the recovery intervals. You\'re training, not racing.',
      }

    case 'long':
      return {
        title: 'Long Run',
        purpose: 'The long run is your most important weekly session. It builds endurance, teaches your body to burn fat, and — critically — lets you practice everything for race day: pacing, nutrition, gear, and mental toughness on tired legs.',
        execution: [
          'Start conservatively. The first third should feel easy. The work comes in the final third.',
          'Practice race nutrition: eat early and often (100-150 cal every 30 min). Don\'t wait until you\'re hungry.',
          'Walk the steep uphills — this is exactly what you\'ll do on race day. Power hiking is a skill.',
          day.workout.includes('POLES') ? 'Poles on all climbs. Practice plant timing until it\'s automatic.' : 'If terrain is technical, slow down and focus on foot placement.',
          'Carry enough water. Dehydration ruins long runs and the training effect.',
        ],
        mindset: phase === 'peak'
          ? 'This is your biggest effort before race day. Treat it like a dress rehearsal — race kit, race nutrition, race mentality. After this, you taper and trust your fitness.'
          : 'Long runs build the confidence to finish. Every mile you cover in training is a mile that won\'t scare you on race day.',
      }

    case 'cross':
      return {
        title: 'Cross-Training',
        purpose: 'Cross-training maintains your aerobic fitness while giving your running muscles a break. Cycling, rowing, and hiking build complementary strength without the impact stress of running.',
        execution: [
          'Keep the effort easy to moderate — this is active recovery with fitness benefits.',
          'If hiking, practice power hiking posture: slight forward lean, hands on thighs or poles on steep bits.',
          'If on the erg/bike, keep cadence up and resistance moderate.',
          'Include the mobility/stretching work — hip flexors and calves need attention.',
        ],
        mindset: 'Cross-training days aren\'t throwaway days. They\'re how you train more without breaking down. Show up and move well.',
      }

    case 'rest':
      return {
        title: 'Rest Day',
        purpose: 'Rest is when adaptation happens. Your muscles repair, your glycogen restores, and your nervous system recovers. Skipping rest days doesn\'t make you fitter — it makes you tired.',
        execution: [
          'Stay off your feet as much as reasonable.',
          'Light stretching or foam rolling is fine if it feels good.',
          'Hydrate well. Sleep 7-9 hours.',
          'Gentle walking is okay. A hard hike is not rest.',
        ],
        mindset: 'The best athletes rest hard. Doing nothing is a skill. Trust that your body is getting stronger right now.',
      }

    case 'limited':
      return {
        title: 'Limited Activity Day',
        purpose: 'Today has schedule constraints, so we keep it minimal. A short walk or easy jog maintains the routine without overloading a compressed training week.',
        execution: [
          'If you can get out for 20-30 min, great. If not, that\'s fine too.',
          'Keep effort very easy — Z1 only.',
          'A walk counts. Movement is the goal, not mileage.',
        ],
        mindset: 'Consistency over intensity. Something small is better than nothing, but nothing is better than forcing a hard workout into a bad day.',
      }

    case 'travel':
      return {
        title: 'Travel Day',
        purpose: 'Travel disrupts routine, dehydrates you, and compresses your body into a seat. The priority today is damage control: hydrate, move when possible, and arrive ready to train tomorrow.',
        execution: [
          'Drink water aggressively — aim for 8+ oz per hour of travel.',
          'Get up and move every hour on planes. Walk the aisle, do calf raises.',
          'Stretch hip flexors and hamstrings when you arrive.',
          'If you can fit in a 15-min shakeout jog at your destination, great. If not, don\'t stress.',
        ],
        mindset: 'Travel is part of the adventure. Protect your hydration and sleep, and tomorrow\'s workout will go fine.',
      }

    case 'race':
      return {
        title: 'RACE DAY',
        purpose: day.workout.includes('5K')
          ? 'This 5K is a fitness benchmark and a chance to practice race-day nerves. Don\'t overthink it — warm up well, run hard, and see where you are.'
          : 'This is it. 10 weeks of training for this moment. You\'ve done the work — the hay is in the barn. Today is about executing the plan and enjoying the mountain.',
        execution: day.workout.includes('5K')
          ? [
            'Warm up 10 min easy jog + dynamic stretches.',
            'Start controlled — don\'t go out too fast in the first 400m.',
            'Settle into rhythm by mile 1. Push the last mile.',
            'Cool down 10 min easy.',
          ]
          : [
            'Eat breakfast 3 hours before start (practiced foods only).',
            'Start fueling at mile 1 — don\'t wait. 100-150 cal every 30 min.',
            'Hike the climbs with poles. Run the flats and downhills.',
            'Refuel fully at Siberia Aid Station (mi 4.9).',
            'Protect your quads on the Shirley Canyon descent — short steps, slight forward lean.',
            'The last 3 miles are all downhill. Empty the tank. RING DAS BELL! 🔔',
          ],
        mindset: day.workout.includes('5K')
          ? 'Race hard, learn something, and have fun. This is practice for June.'
          : 'You trained for this. You hiked the hills, ran the miles, dialed the nutrition. Trust your body. When it hurts at mile 7, remember: you\'ve done harder things in training. Finish strong.',
      }
  }
}

function getNutritionTip(day: PlannedDay, weekNum: number): string {
  switch (day.type) {
    case 'long':
      return weekNum >= 6
        ? 'Full race nutrition practice: 100-150 cal every 30 min from the start. Use only foods you\'ll eat on race day. Carry 16+ oz water.'
        : 'Start practicing race nutrition. Try gels or chews every 30 min. Figure out what your stomach likes NOW, not on race day.'
    case 'quality':
      return 'Eat a light snack 60-90 min before (banana, toast, etc). Hydrate well. You don\'t need fuel during — just water.'
    case 'strength':
      return 'Protein within 30 min after (shake, yogurt, eggs). Your muscles need building blocks to repair.'
    case 'race':
      return day.workout.includes('5K')
        ? 'Light breakfast 2 hours before. Nothing new on race day.'
        : 'Breakfast 3 hours before start: oatmeal, banana, coffee — whatever you\'ve practiced. Race belt loaded with tested gels/chews. 200-300 cal/hr on course.'
    case 'rest':
      return 'Eat well today — whole foods, protein, vegetables. Rest days are when your body rebuilds.'
    default:
      return 'Stay hydrated throughout the day. Eat a balanced meal 2-3 hours before activity.'
  }
}

function getRecoveryTip(day: PlannedDay, phase: Phase): string {
  switch (day.type) {
    case 'long':
      return 'Recovery starts immediately: eat within 30 min, hydrate aggressively, elevate legs 10 min. Tomorrow should be easy or off.'
    case 'quality':
      return 'Cool down thoroughly. Foam roll quads and calves tonight. Sleep is your best recovery tool — aim for 8 hours.'
    case 'strength':
      return 'Light movement later today helps clear soreness. Foam roll or stretch before bed. Expect DOMS in 24-48 hours.'
    case 'race':
      return phase === 'race'
        ? 'Post-race: eat, hydrate, celebrate! Take 3-5 days completely off before any running. You earned it.'
        : 'Easy day tomorrow. Let your body absorb the race effort.'
    default:
      return phase === 'taper'
        ? 'Extra sleep is the best taper strategy. Your body is consolidating 9 weeks of training.'
        : 'Listen to your body. Persistent fatigue, elevated resting HR, or poor sleep are signs to back off.'
  }
}
