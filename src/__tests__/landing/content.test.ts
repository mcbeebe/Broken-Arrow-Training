/**
 * Initiative 003: docs/initiatives/003-landing-page/copy.md is the source of
 * truth for every word on the landing page, and src/landing/content.ts is the
 * only place page text lives. This fixture is copy.md, string by string: if a
 * line is reworded in one place and not the other, this fails.
 */
import { describe, it, expect } from 'vitest'
import * as content from '../../landing/content'

/** Every string leaf in the content module, however deeply nested. */
function leaves(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach(v => leaves(v, out))
  else if (value && typeof value === 'object') Object.values(value).forEach(v => leaves(v, out))
  return out
}

const ALL = leaves(content)
/** Short fixtures (labels, numbers) must be a whole string, or 'ms' would match anything. */
const has = (s: string) => ALL.some(leaf => (s.length < 25 ? leaf === s : leaf.includes(s)))

// copy.md, in document order. Templated lines are split at their {slots}.
const COPY_MD = [
  // Header
  'Attune', 'How it works', 'Who it’s for', 'The coach', 'Free tools', 'Sign in', 'Request an invite',
  // Hero
  'Training that actually adapts to you.',
  'A coach in your pocket.',
  'Racing a marathon, training for HYROX, or just getting fitter: Attune reads your recovery every morning and adjusts today’s workout to match.',
  'Your email', 'you@example.com', 'Sending…',
  'What are you training for?', '(optional)',
  'A spring half, my first HYROX, just getting fit...',
  'Free during the beta. Already in?',
  // Form states
  'Enter an email address like name@example.com.',
  'Requests are paused for a moment. Try again in a few minutes.',
  'You’ve sent a few requests already. Try again later.',
  'Couldn’t send your request. Check your connection and try again.',
  'Request sent.',
  'Mike will review your request and email ',
  ' the moment you’re approved. Until then, try one of the ',
  'free tools',
  // This morning card (PR 4b: four mornings, one of each outcome)
  'Four athletes, four different mornings',
  'Running', 'Trail', 'HYROX', 'Fitness',
  'This morning',
  'HRV', 'ms', 'Resting HR', 'bpm', 'Sleep',
  'Planned', 'Adjusted for today', 'Today',
  'Based on HRV, resting heart rate, sleep and your last 7 days of training',
  // Running: eases off
  '41', '18% below normal', '56', '+5 over normal', '5:40', 'Short night', 'Readiness: take it easy',
  'Training for a spring half marathon', 'Tempo run, 8 × 800 m', 'Easy run, 45 min in zone 2',
  'Your body hasn’t caught up from Saturday’s long run. The tempo session moves to Thursday, so the week’s work stays the same.',
  'The tempo run moves to Thursday, so week 9 still does its job.',
  // Trail: pivots
  '49', 'Normal for you', '52', '6:20', 'Hotel night', 'Readiness: good to go',
  'Training for a 50K trail race', 'Hill repeats, 8 × 2 min',
  'Room cardio: bodyweight intervals, 20 to 30 min, then 10 min mobility',
  'You’re away for work with only a hotel room. The hill repeats become intervals you can do next to the bed, so the aerobic habit keeps going. Nothing to make up: the plan bends forward.',
  'Hill repeats become room cardio while you’re away, and the plan bends forward.',
  // HYROX: positive
  '63', '14% above normal', '47', '3 under normal', '8:10', 'Solid night', 'Readiness: ready to push',
  'Training for HYROX, Open division', 'Race simulation: 4 × (1 km run + station)',
  'Race simulation: 4 × (1 km run + station), full intensity',
  'Every number is above your normal and your load is steady. This is the day for your hardest session, so go at full race pace.',
  'The race simulation stays, at full intensity, so week 9 lands as planned.',
  // Fitness: neutral
  '50', '7:25', 'Normal night',
  'No race. Goal: build endurance', 'Bike intervals, 6 × 3 min hard',
  'All clear: your numbers are right on your normal, so nothing changes. Wednesday’s strength session stays too.',
  'Nothing moves, and the block stays on track.',
  // How a morning works
  'How a morning works',
  'Your watch syncs overnight',
  'HRV, resting heart rate, sleep and yesterday’s training come in from Garmin, Strava or Apple Health.',
  'Attune scores your readiness',
  'It compares this morning with your own normal, not a population average, and checks how fast your training load is climbing.',
  'Today’s workout adjusts',
  'Ready to go, it stays. Run down, it eases off and moves the hard session to a day you can handle it.',
  'Ask the coach why',
  'Every change comes with a reason in plain language, and you can push back.',
  // Whatever you’re training for
  'Whatever you’re training for',
  'Each path has its own plan builder, so a HYROX athlete doesn’t get a marathon plan with burpees bolted on. Racing more than once? Put a half marathon and a HYROX in the same season.',
  'Road races', '5K to marathon',
  'Proven coaching methods like Daniels, 80/20 and Higdon, matched to your race',
  'Paces set from a recent 5K or 10K', 'Rides and hikes count toward your load',
  'Trail and ultra', 'Trail races and ultras',
  'Methods built for the long stuff, like Koop and Roche SWAP',
  'Counts climbing and descending, not just miles', 'Eases off after big descents',
  'Open and Pro divisions',
  'Running and all 8 stations in one plan', 'Station work set for your division', 'Extra work on your weakest station',
  'General fitness', 'No race needed',
  'Pick a goal: stay healthy, lose fat, build muscle or build endurance',
  'Cardio your way: run, bike, row, swim, or a mix',
  'Strength work built into every plan',
  // Your plan, week by week
  'Your plan, week by week', 'Racing', 'No race',
  'Racing? Attune builds from base to peak, then tapers so you arrive fresh, with easier weeks wherever your method calls for them.',
  'No race? Attune plans in blocks of up to 16 weeks: three building weeks, then an easier one so the work sinks in.',
  'Base, weeks 1 to 5', 'Build, weeks 6 to 10', 'Peak, 11 to 13', 'Taper to race day',
  'Weeks 1 to 4', '5 to 8', '9 to 12', '13 to 16',
  'Today, week 9', 'Dashed outline: what was planned.', 'Example plan.',
  // A coach in your pocket
  'It knows your plan, your watch data and your training history, and it answers in plain language. Type or talk. When it suggests a change, you see exactly what moves, and nothing changes until you approve it.',
  'Ask why today’s workout looks the way it does',
  'Rework the week around travel, work or a bad night',
  'Approved changes go straight to your Garmin watch',
  'Your coach. ',
  'Make it yours',
  'Name your coach and pick how it talks to you. The reply changes as you do.',
  'Coach name', 'Mira', 'Your coach', 'Personality', 'A few of the 17 personalities',
  'Warm', 'Direct', 'Funny', 'Data Nerd', 'Old School',
  'Ask something else', 'Reset', 'That’s the demo. ', 'Request an invite', ' to keep talking to ',
  // Question 1
  'Work trip Wednesday to Friday, and I’m already sleeping badly. What should this week look like?',
  'Travel weeks are tough, and a short night on top of one is a lot. Let’s do your hard session Tuesday, before you leave, and keep the trip short and easy: 30 minutes in the hotel gym or outside. You won’t lose anything that matters.',
  'Hard session moves to Tuesday, before you fly. Wednesday to Friday: 30 minutes easy, hotel gym or outside. Sleep matters more than volume this week.',
  'Airports are great for steps and terrible for intervals. So the hard session moves to Tuesday, before you go, and the trip gets 30 easy minutes a day. Your fitness will be waiting when you land.',
  'Your HRV is 18% under your baseline and sleep is short, so hard work on travel days is poor value. The hard session moves to Tuesday, and Wednesday to Friday drop to 30 easy minutes. One lighter week won’t dent your fitness.',
  'Do the work before you go. Hard session Tuesday. On the road, 30 minutes easy every day, gym or out the door. Fitness takes months to build, and three easy days won’t take it away.',
  'Proposed change to your plan',
  'Tue', 'Easy 40 min', 'Hard session, moved from Thu',
  'Wed to Fri', 'Full sessions', '30 min easy, hotel-friendly',
  // Question 2
  'Why is today an easy day? I feel fine.',
  'Glad you’re feeling good. Today is easy on purpose: it sets you up for Thursday’s tempo run. Keep it relaxed, enjoy it, and bring that energy to Thursday.',
  'Because Thursday is hard. Easy days let the hard days be hard. Keep it conversational for 45 minutes and save your legs.',
  'Feeling fine is the point. Today is the opening act and Thursday’s tempo run is the headliner. Don’t steal your own show.',
  'Easy days add aerobic volume at a cost your body clears by tomorrow. Stay in zone 2 today and Thursday’s tempo run gets your freshest legs.',
  'Easy days make the hard days work. Run slow enough to talk. If it feels too slow, it’s working.',
  // Question 3
  'Can I move Saturday’s long run to Sunday?',
  'Of course. Let’s rest Saturday and do the long run Sunday. The rest of the week stays just as it is.',
  'Yes. Saturday becomes rest, Sunday gets the long run. Nothing else changes.',
  'Big Saturday plans? Respect. The long run slides to Sunday, Saturday becomes a rest day, and the week won’t even notice.',
  'Yes. Swapping the two days keeps the week’s total load the same, and you get one extra day of rest before the long run.',
  'Rest Saturday, run long Sunday. Same work, different day.',
  'Sat', 'Long run, 90 min', 'Rest day', 'Sun',
  'Approve', 'Keep my plan',
  'Plan updated. The new week is on your watch.',
  'Ask ', ' anything', 'Message your coach', 'Talk to your coach',
  // See it in the app
  'See it in the app',
  'Real screens from a real training block.',
  'Every day explains itself, easy days included.',
  'The Today screen: week 4 of 12, today’s easy run, and why it’s easy',
  'The coach reads your recovery before it answers.',
  'A coach reply that starts from this morning’s readiness, HRV and sleep',
  'Fitness, fatigue and recovery on one chart, so you can see whether you’re building or digging a hole.',
  'The fitness, fatigue and recovery chart for the last month',
  'Every session in detail: heart rate and time in each zone.',
  'A strength session’s heart rate over time and time in each zone',
  'When your load climbs too fast, Attune tells you to back off.',
  'An injury risk alert: the load ratio rose from 1.26 to 1.84 in three days',
  'Your training story, in your words.',
  'The training journal, with a note about a session skipped on purpose',
  // Gear
  'Works with the gear you already wear',
  'Garmin', 'Pulls HRV, sleep and activities, and sends each week’s workouts to your watch.',
  'Strava', 'Brings in your runs, rides and hikes so cross-training counts toward your load.',
  'Apple Health', 'Syncs HRV, resting heart rate, sleep and workouts from your iPhone.',
  // Tools
  'Try it before you’re in',
  'Three free calculators built on the same engine. No sign-up, and nothing you enter leaves your browser.',
  'Fueling planner', 'Carbs, fluid and sodium per hour for a long effort.', 'Open the fueling planner', '/tools/fueling.html',
  'Race time predictor', 'Realistic finish times from a recent result.', 'Open the race predictor', '/tools/predictor.html',
  'Heat planner', 'How to adjust pace and fluids when it’s hot.', 'Open the heat planner', '/tools/heat.html',
  // Founder note
  '“I built Attune for my own training: mountain trail races, HYROX, and the stretches in between. I wanted a plan that noticed when I’d slept badly, was exhausted from kids, work travel or simply overdoing it, and changed my plan intelligently instead of pretending nothing happened and getting injured.”',
  'Mike Beebe', ', founder, Oakland',
  // Questions
  'Questions',
  'Is it only for runners?',
  'No. Attune builds plans for road races, trail and ultra, HYROX, and general fitness with no race at all. A season can even mix races, like a half marathon and a HYROX.',
  'How do I get in?',
  'Request an invite with your email. Mike reviews every request and emails you when you’re approved. You sign in with your Google account.',
  'Does it cost anything?', 'Attune is free during the beta.',
  'Is the coach a person?',
  'No. It’s an AI coach that works from your plan and your data, and it can’t change your training without your approval.',
  'Which devices work?',
  'Garmin, Strava and Apple Health. Attune runs in your phone’s browser and installs to your home screen like an app.',
  'Do I need a wearable?',
  'It helps. Without one you can still log workouts and how they felt, and the plan adapts to that.',
  // Footer
  'Start training that adapts to you.',
  'Attune is in an invite-only beta and free while it lasts.',
  'Privacy', '/privacy.html', 'Terms', '/terms.html', '© 2026 Attune',
] as const

describe('content.ts carries copy.md verbatim', () => {
  it.each(COPY_MD)('has %j', s => {
    expect(has(s)).toBe(true)
  })
})

describe('copy.md typography rules hold in content.ts', () => {
  // Hrefs, ids and other non-prose leaves are exempt from prose rules.
  const prose = ALL.filter(s => !/^[#/]/.test(s) && !/^[a-z0-9_-]+$/.test(s))

  it('uses curly apostrophes, never straight ones', () => {
    expect(prose.filter(s => s.includes("'"))).toEqual([])
  })

  it('has no exclamation marks', () => {
    expect(prose.filter(s => s.includes('!'))).toEqual([])
  })
})

describe('links go where copy.md says', () => {
  it('signs in at /app/ and requests an invite at #join', () => {
    expect(content.NAV.signIn.href).toBe('/app/')
    expect(content.NAV.cta.href).toBe('#join')
    expect(content.INVITE.signInHref).toBe('/app/')
    expect(content.FOOTER.cta.href).toBe('#join')
  })

  it('nav links point at section ids', () => {
    expect(content.NAV.links.map(l => l.href)).toEqual(['#how', '#you', '#coach', '#tools'])
  })

  it('the footer links match copy.md', () => {
    expect(content.FOOTER.links.map(l => [l.label, l.href])).toEqual([
      ['Sign in', '/app/'],
      ['Free tools', '#tools'],
      ['Privacy', '/privacy.html'],
      ['Terms', '/terms.html'],
    ])
  })
})
