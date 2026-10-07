/**
 * Every word on the landing page, verbatim from
 * docs/initiatives/003-landing-page/copy.md (the source of truth), plus the
 * example data the page draws. Nothing else in src/landing holds page text.
 *
 * Where a line makes a factual claim, the structured data next to it (method
 * ids, divisions, trait ids, modalities, block numbers) is what
 * src/__tests__/landing/claims.test.tsx checks against the app's code. Change
 * the code and that test fails until this file and copy.md catch up.
 */

export { SECTION_IDS, type SectionId } from './sections'

export const SKIP_LINK = 'Skip to content'
export const BRAND = 'Attune'

export const NAV = {
  label: 'Main',
  links: [
    { label: 'How it works', href: '#how' },
    { label: 'Who it’s for', href: '#you' },
    { label: 'The coach', href: '#coach' },
    { label: 'Free tools', href: '#tools' },
  ],
  signIn: { label: 'Sign in', href: '/app/' },
  cta: { label: 'Request an invite', href: '#join' },
} as const

export const HERO = {
  title: 'Training that actually adapts to you.',
  subhead: 'A coach in your pocket.',
  lead: 'Racing a marathon, training for HYROX, or just getting fitter: Attune reads your recovery every morning and adjusts today’s workout to match.',
} as const

export const INVITE = {
  emailLabel: 'Your email',
  emailPlaceholder: 'you@example.com',
  submit: 'Request an invite',
  sending: 'Sending…',
  goalLabel: 'What are you training for?',
  goalOptional: '(optional)',
  goalPlaceholder: 'A spring half, my first HYROX, just getting fit...',
  /** MAX_REQUEST_NOTE_LEN in api/auth/_helpers.py. */
  goalMaxLength: 200,
  fineprint: 'Free during the beta. Already in?',
  signIn: 'Sign in',
  signInHref: '/app/',
  errors: {
    invalidEmail: 'Enter an email address like name@example.com.',
    unavailable: 'Requests are paused for a moment. Try again in a few minutes.',
    throttled: 'You’ve sent a few requests already. Try again later.',
    network: 'Couldn’t send your request. Check your connection and try again.',
  },
  success: {
    heading: 'Request sent.',
    bodyBefore: 'Mike will review your request and email ',
    bodyAfter: ' the moment you’re approved. Until then, try one of the ',
    linkText: 'free tools',
    linkHref: '#tools',
    bodyEnd: '.',
  },
} as const

export type Sport = 'run' | 'trail' | 'hyrox' | 'fit'

/**
 * What the morning did to today's session. `ease` and `pivot` change it;
 * `peak` and `steady` leave it as planned (the app never adds work on a good
 * morning, so neither does this page).
 */
export type Outcome = 'ease' | 'pivot' | 'peak' | 'steady'

/**
 * Whether a reading is worse or better than the athlete's normal (drawn orange
 * or teal), not whether the number is lower or higher: a resting heart rate
 * over normal is worse, under normal is better.
 */
export type Tone = 'worse' | 'better' | 'normal'

/** The “This morning” card: four athletes, four mornings, one of each outcome. Illustrative examples. */
export const SPORTS = [
  {
    id: 'run',
    tab: 'Running',
    outcome: 'ease',
    who: 'Training for a spring half marathon',
    metrics: [
      { value: '41', note: '18% below normal', tone: 'worse' },
      { value: '56', note: '+5 over normal', tone: 'worse' },
      { value: '5:40', note: 'Short night', tone: 'normal' },
    ],
    readiness: { value: 38, title: 'Readiness: take it easy' },
    planned: 'Tempo run, 8 × 800 m',
    today: 'Easy run, 45 min in zone 2',
    why: 'Your body hasn’t caught up from Saturday’s long run. The tempo session moves to Thursday, so the week’s work stays the same.',
    chartCaption: 'The tempo run moves to Thursday, so week 9 still does its job.',
  },
  {
    id: 'trail',
    tab: 'Trail',
    outcome: 'pivot',
    who: 'Training for a 50K trail race',
    metrics: [
      { value: '49', note: 'Normal for you', tone: 'normal' },
      { value: '52', note: 'Normal for you', tone: 'normal' },
      { value: '6:20', note: 'Hotel night', tone: 'normal' },
    ],
    readiness: { value: 60, title: 'Readiness: good to go' },
    planned: 'Hill repeats, 8 × 2 min',
    today: 'Room cardio: bodyweight intervals, 20 to 30 min, then 10 min mobility',
    why: 'You’re away for work with only a hotel room. The hill repeats become intervals you can do next to the bed, so the aerobic habit keeps going. Nothing to make up: the plan bends forward.',
    chartCaption: 'Hill repeats become room cardio while you’re away, and the plan bends forward.',
  },
  {
    id: 'hyrox',
    tab: 'HYROX',
    outcome: 'peak',
    who: 'Training for HYROX, Open division',
    metrics: [
      { value: '63', note: '14% above normal', tone: 'better' },
      { value: '47', note: '3 under normal', tone: 'better' },
      { value: '8:10', note: 'Solid night', tone: 'normal' },
    ],
    readiness: { value: 86, title: 'Readiness: ready to push' },
    planned: 'Race simulation: 4 × (1 km run + station)',
    today: 'Race simulation: 4 × (1 km run + station), full intensity',
    why: 'Your HRV and resting heart rate are both better than normal, and your load is steady. This is the day for your hardest session, so get after it.',
    chartCaption: 'The race simulation stays, at full intensity, so week 9 lands as planned.',
  },
  {
    id: 'fit',
    tab: 'Fitness',
    outcome: 'steady',
    who: 'No race. Goal: build endurance',
    metrics: [
      { value: '52', note: 'Normal for you', tone: 'normal' },
      { value: '50', note: 'Normal for you', tone: 'normal' },
      { value: '7:25', note: 'Normal night', tone: 'normal' },
    ],
    readiness: { value: 66, title: 'Readiness: good to go' },
    planned: 'Bike intervals, 6 × 3 min hard',
    today: 'Bike intervals, 6 × 3 min hard',
    why: 'All clear: your numbers are right on your normal, so nothing changes. Wednesday’s strength session stays too.',
    chartCaption: 'Nothing moves, and the block stays on track.',
  },
] as const satisfies readonly (Record<string, unknown> & {
  id: Sport
  outcome: Outcome
  metrics: readonly { value: string; note: string; tone: Tone }[]
  readiness: { value: number; title: string }
})[]

/** Whether this morning changed today's session (and so whether the card and chart show what was planned). */
export function changesToday(outcome: Outcome): boolean {
  return outcome === 'ease' || outcome === 'pivot'
}

export const MORNING = {
  groupLabel: 'Four athletes, four different mornings',
  heading: 'This morning',
  /** Labels and units for each sport's three `metrics`, in order. */
  metrics: [
    { label: 'HRV', unit: 'ms' },
    { label: 'Resting HR', unit: 'bpm' },
    { label: 'Sleep', unit: '' },
  ],
  basis: 'Based on HRV, resting heart rate, sleep and your last 7 days of training',
  plannedLabel: 'Planned',
  adjustedLabel: 'Adjusted for today',
  todayLabel: 'Today',
} as const

export const HOW = {
  title: 'How a morning works',
  steps: [
    {
      title: 'Your watch syncs overnight',
      body: 'HRV, resting heart rate, sleep and yesterday’s training come in from Garmin, Strava or Apple Health.',
    },
    {
      title: 'Attune scores your readiness',
      body: 'It compares this morning with your own normal, not a population average, and checks how fast your training load is climbing.',
    },
    {
      title: 'Today’s workout adjusts',
      body: 'Ready to go, it stays. Run down, it eases off and moves the hard session to a day you can handle it.',
    },
    {
      title: 'Ask the coach why',
      body: 'Every change comes with a reason in plain language, and you can push back.',
    },
  ],
} as const

/** Methods the Road races card names, by id in src/data/methods. */
export const ROAD_METHODS = [
  { id: 'daniels', label: 'Daniels' },
  { id: 'fitzgerald_8020', label: '80/20' },
  { id: 'higdon', label: 'Higdon' },
] as const

/** Methods the Trail and ultra card names, by id in src/data/methods. */
export const TRAIL_METHODS = [
  { id: 'koop', label: 'Koop' },
  { id: 'roche_swap', label: 'Roche SWAP' },
] as const

/** Divisions the HYROX card names; must equal HYROX_DIVISIONS. */
export const HYROX_DIVISIONS_SHOWN = [
  { id: 'open', label: 'Open' },
  { id: 'pro', label: 'Pro' },
] as const

/** “All 8 stations”; must equal stationSpecs().length. */
export const HYROX_STATION_COUNT = 8

/** Cardio options the General fitness card names; must map to CARDIO_MODALITIES. */
export const CARDIO_OPTIONS = [
  { modality: 'running', label: 'run' },
  { modality: 'cycling', label: 'bike' },
  { modality: 'rowing', label: 'row' },
  { modality: 'swimming', label: 'swim' },
  { modality: 'mixed', label: 'a mix' },
] as const

export const PATHS = {
  title: 'Whatever you’re training for',
  intro: 'Each path has its own plan builder, so a HYROX athlete doesn’t get a marathon plan with burpees bolted on. Racing more than once? Put a half marathon and a HYROX in the same season.',
  cards: [
    {
      id: 'road',
      title: 'Road races',
      subtitle: '5K to marathon',
      points: [
        'Proven coaching methods like Daniels, 80/20 and Higdon, matched to your race',
        'Paces set from a recent 5K or 10K',
        'Rides and hikes count toward your load',
      ],
    },
    {
      id: 'trail',
      title: 'Trail and ultra',
      subtitle: 'Trail races and ultras',
      points: [
        'Methods built for the long stuff, like Koop and Roche SWAP',
        'Counts climbing and descending, not just miles',
        'Eases off after big descents',
      ],
    },
    {
      id: 'hyrox',
      title: 'HYROX',
      subtitle: 'Open and Pro divisions',
      points: [
        'Running and all 8 stations in one plan',
        'Station work set for your division',
        'Extra work on your weakest station',
      ],
    },
    {
      id: 'fit',
      title: 'General fitness',
      subtitle: 'No race needed',
      points: [
        'Pick a goal: stay healthy, lose fat, build muscle or build endurance',
        'Cardio your way: run, bike, row, swim, or a mix',
        'Strength work built into every plan',
      ],
    },
  ],
} as const

export type PlanKind = 'race' | 'fit'

/** “Your plan, week by week”. Bars and scale from design-spec.md § PlanChart. */
export const PLAN = {
  title: 'Your plan, week by week',
  toggleLabel: 'Show plan type',
  toggle: { race: 'Racing', fit: 'No race' },
  intro: {
    race: 'Racing? Attune builds from base to peak, then tapers so you arrive fresh, with easier weeks wherever your method calls for them.',
    fit: 'No race? Attune plans in blocks of up to 16 weeks: three building weeks, then an easier one so the work sinks in.',
  },
  phases: {
    race: ['Base, weeks 1 to 5', 'Build, weeks 6 to 10', 'Peak, 11 to 13', 'Taper to race day'],
    fit: ['Weeks 1 to 4', '5 to 8', '9 to 12', '13 to 16'],
  },
  chartLabel: {
    race: 'Bar chart of weekly training load over 16 weeks, building through base and build to a peak, then tapering to race day.',
    fit: 'Bar chart of weekly training load over 16 weeks in four blocks, each ending with an easier week.',
  },
  /** Appended to the chart label: whether today's bar is cut back. */
  week9: {
    changed: 'Week 9 is lower than planned because today was adjusted.',
    same: 'Week 9 is on plan.',
  },
  todayLabel: 'Today',
  captionLead: 'Today, week 9',
  /** Shown only when today changed, because only then is there an outline. */
  captionOutline: 'Dashed outline: what was planned.',
  captionExample: 'Example plan.',
  bars: {
    race: [38, 44, 50, 34, 54, 60, 66, 46, 70, 76, 82, 58, 88, 72, 52, 30],
    fit: [40, 46, 52, 34, 44, 50, 56, 36, 48, 54, 60, 38, 50, 56, 62, 40],
  },
  /** Largest bar value; bars scale to `plot` px against it. */
  max: 88,
  plot: 200,
  /** Week 9. */
  todayIndex: 8,
  /** When today changed, its bar is filled to this share of its planned height. */
  todayShare: 0.72,
} as const

export type PersonalityId = 'warm' | 'direct' | 'funny' | 'nerdy' | 'old-school'

/** Every reply, once per personality. */
type Replies = Readonly<Record<PersonalityId, string>>

export interface CoachQuestion {
  athlete: string
  replies: Replies
  /** Rows of the proposal card; a question without one has no Approve. */
  proposal?: readonly { day: string; from: string; to: string }[]
}

export const COACH = {
  title: 'A coach in your pocket',
  body: 'It knows your plan, your watch data and your training history, and it answers in plain language. Type or talk. When it suggests a change, you see exactly what moves, and nothing changes until you approve it.',
  bullets: [
    'Ask why today’s workout looks the way it does',
    'Rework the week around travel, work or a bad night',
    'Approved changes go straight to your Garmin watch',
  ],
  headerPrefix: 'Your coach. ',
  fallbackName: 'Your coach',
  /** Written replies, not live AI: “Ask something else” cycles through these in order. */
  questions: [
    {
      athlete: 'Work trip Wednesday to Friday, and I’m already sleeping badly. What should this week look like?',
      replies: {
        warm: 'Travel weeks are tough, and a short night on top of one is a lot. Let’s do your hard session Tuesday, before you leave, and keep the trip short and easy: 30 minutes in the hotel gym or outside. You won’t lose anything that matters.',
        direct: 'Hard session moves to Tuesday, before you fly. Wednesday to Friday: 30 minutes easy, hotel gym or outside. Sleep matters more than volume this week.',
        funny: 'Airports are great for steps and terrible for intervals. So the hard session moves to Tuesday, before you go, and the trip gets 30 easy minutes a day. Your fitness will be waiting when you land.',
        nerdy: 'Your HRV is 18% under your baseline and sleep is short, so hard work on travel days is poor value. The hard session moves to Tuesday, and Wednesday to Friday drop to 30 easy minutes. One lighter week won’t dent your fitness.',
        'old-school': 'Do the work before you go. Hard session Tuesday. On the road, 30 minutes easy every day, gym or out the door. Fitness takes months to build, and three easy days won’t take it away.',
      },
      proposal: [
        { day: 'Tue', from: 'Easy 40 min', to: 'Hard session, moved from Thu' },
        { day: 'Wed to Fri', from: 'Full sessions', to: '30 min easy, hotel-friendly' },
      ],
    },
    {
      athlete: 'Why is today an easy day? I feel fine.',
      replies: {
        warm: 'Glad you’re feeling good. Today is easy on purpose: it sets you up for Thursday’s tempo run. Keep it relaxed, enjoy it, and bring that energy to Thursday.',
        direct: 'Because Thursday is hard. Easy days let the hard days be hard. Keep it conversational for 45 minutes and save your legs.',
        funny: 'Feeling fine is the point. Today is the opening act and Thursday’s tempo run is the headliner. Don’t steal your own show.',
        nerdy: 'Easy days add aerobic volume at a cost your body clears by tomorrow. Stay in zone 2 today and Thursday’s tempo run gets your freshest legs.',
        'old-school': 'Easy days make the hard days work. Run slow enough to talk. If it feels too slow, it’s working.',
      },
    },
    {
      athlete: 'Can I move Saturday’s long run to Sunday?',
      replies: {
        warm: 'Of course. Let’s rest Saturday and do the long run Sunday. The rest of the week stays just as it is.',
        direct: 'Yes. Saturday becomes rest, Sunday gets the long run. Nothing else changes.',
        funny: 'Big Saturday plans? Respect. The long run slides to Sunday, Saturday becomes a rest day, and the week won’t even notice.',
        nerdy: 'Yes. Swapping the two days keeps the week’s total load the same, and you get one extra day of rest before the long run.',
        'old-school': 'Rest Saturday, run long Sunday. Same work, different day.',
      },
      proposal: [
        { day: 'Sat', from: 'Long run, 90 min', to: 'Rest day' },
        { day: 'Sun', from: 'Rest day', to: 'Long run, 90 min' },
      ],
    },
  ] as const satisfies readonly CoachQuestion[],
  proposalHeading: 'Proposed change to your plan',
  approve: 'Approve',
  keep: 'Keep my plan',
  approved: 'Plan updated. The new week is on your watch.',
  askAnother: 'Ask something else',
  reset: 'Reset',
  /** Changes per visit (a personality or a question); typing a name is free, and only a reload gives tries back. */
  tryLimit: 3,
  limitBefore: 'That’s the demo. ',
  limitLink: 'Request an invite',
  limitHref: '#join',
  limitTail: ' to keep talking to ',
  limitEnd: '.',
  inputLabel: 'Message your coach',
  inputPlaceholderBefore: 'Ask ',
  inputPlaceholderAfter: ' anything',
  micLabel: 'Talk to your coach',
} as const

export const MAKE = {
  title: 'Make it yours',
  body: 'Name your coach and pick how it talks to you. The reply changes as you do.',
  nameLabel: 'Coach name',
  /** DEFAULT_COACH_NAME in src/types/index.ts. */
  defaultName: 'Mira',
  /** CoachPersonaEditor.tsx's limit. */
  nameMaxLength: 30,
  groupLabel: 'Personality',
  hint: 'A few of the 17 personalities',
  /** Exact COACH_TRAITS labels, in this order; pick one. */
  traits: [
    { id: 'warm', label: 'Warm' },
    { id: 'direct', label: 'Direct' },
    { id: 'funny', label: 'Funny' },
    { id: 'nerdy', label: 'Data Nerd' },
    { id: 'old-school', label: 'Old School' },
  ],
  defaultPersonality: 'warm',
} as const satisfies Record<string, unknown> & {
  traits: readonly (Record<string, unknown> & { id: PersonalityId })[]
  defaultPersonality: PersonalityId
}

/** “See it in the app”: real screens, cropped so nothing personal shows. Files in public/landing/app/. */
export const SCREENS = {
  title: 'See it in the app',
  intro: 'Real screens from a real training block.',
  items: [
    { id: 'today', src: '/landing/app/today.webp', width: 720, height: 694, caption: 'Every day explains itself, easy days included.', alt: 'The Today screen: week 4 of 12, today’s easy run, and why it’s easy' },
    { id: 'coach', src: '/landing/app/coach.webp', width: 720, height: 475, caption: 'The coach reads your recovery before it answers.', alt: 'A coach reply that starts from this morning’s readiness, HRV and sleep' },
    { id: 'progress', src: '/landing/app/progress.webp', width: 720, height: 1402, caption: 'Fitness, fatigue and recovery on one chart, so you can see whether you’re building or digging a hole.', alt: 'The fitness, fatigue and recovery chart for the last month' },
    { id: 'workout', src: '/landing/app/workout.webp', width: 720, height: 697, caption: 'Every session in detail: heart rate and time in each zone.', alt: 'A strength session’s heart rate over time and time in each zone' },
    { id: 'load-alert', src: '/landing/app/load-alert.webp', width: 720, height: 222, caption: 'When your load climbs too fast, Attune tells you to back off.', alt: 'An injury risk alert: the load ratio rose from 1.26 to 1.84 in three days' },
    { id: 'journal', src: '/landing/app/journal.webp', width: 720, height: 304, caption: 'Your training story, in your words.', alt: 'The training journal, with a note about a session skipped on purpose' },
  ],
} as const

export const GEAR = {
  title: 'Works with the gear you already wear',
  items: [
    { name: 'Garmin', body: 'Pulls HRV, sleep and activities, and sends each week’s workouts to your watch.' },
    { name: 'Strava', body: 'Brings in your runs, rides and hikes so cross-training counts toward your load.' },
    { name: 'Apple Health', body: 'Syncs HRV, resting heart rate, sleep and workouts from your iPhone.' },
  ],
} as const

export const TOOLS = {
  title: 'Try it before you’re in',
  body: 'Three free calculators built on the same engine. No sign-up, and nothing you enter leaves your browser.',
  items: [
    { name: 'Fueling planner', body: 'Carbs, fluid and sodium per hour for a long effort.', link: 'Open the fueling planner', href: '/tools/fueling.html' },
    { name: 'Race time predictor', body: 'Realistic finish times from a recent result.', link: 'Open the race predictor', href: '/tools/predictor.html' },
    { name: 'Heat planner', body: 'How to adjust pace and fluids when it’s hot.', link: 'Open the heat planner', href: '/tools/heat.html' },
  ],
} as const

/** The owner’s wording, 2026-10-07 (copy.md). */
export const FOUNDER = {
  quote: '“I built Attune for my own training: mountain trail races, HYROX, and the stretches in between. I wanted a plan that noticed when I’d slept badly, was exhausted from kids, work travel or simply overdoing it, and changed my plan intelligently instead of pretending nothing happened and getting injured.”',
  name: 'Mike Beebe',
  role: ', founder, Oakland',
} as const

export const FAQ = {
  title: 'Questions',
  items: [
    {
      q: 'Is it only for runners?',
      a: 'No. Attune builds plans for road races, trail and ultra, HYROX, and general fitness with no race at all. A season can even mix races, like a half marathon and a HYROX.',
    },
    {
      q: 'How do I get in?',
      a: 'Request an invite with your email. Mike reviews every request and emails you when you’re approved. You sign in with your Google account.',
    },
    { q: 'Does it cost anything?', a: 'Attune is free during the beta.' },
    {
      q: 'Is the coach a person?',
      a: 'No. It’s an AI coach that works from your plan and your data, and it can’t change your training without your approval.',
    },
    {
      q: 'Which devices work?',
      a: 'Garmin, Strava and Apple Health. Attune runs in your phone’s browser and installs to your home screen like an app.',
    },
    {
      q: 'Do I need a wearable?',
      a: 'It helps. Without one you can still log workouts and how they felt, and the plan adapts to that.',
    },
  ],
} as const

export const FOOTER = {
  line: 'Start training that adapts to you.',
  sub: 'Attune is in an invite-only beta and free while it lasts.',
  cta: { label: 'Request an invite', href: '#join' },
  links: [
    { label: 'Sign in', href: '/app/' },
    { label: 'Free tools', href: '#tools' },
    { label: 'Privacy', href: '/privacy.html' },
    { label: 'Terms', href: '/terms.html' },
  ],
  copyright: '© 2026 Attune',
} as const
