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
  fineprint: 'Free during the beta. Mike reviews every request. Already in?',
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

/** The “This morning” card: one morning, four athletes. Illustrative examples. */
export const SPORTS = [
  {
    id: 'run',
    tab: 'Running',
    who: 'Training for a spring half marathon',
    planned: 'Tempo run, 8 × 800 m',
    adjusted: 'Easy run, 45 min in zone 2',
    why: 'Your body hasn’t caught up from Saturday’s long run. The tempo session moves to Thursday, so the week’s work stays the same.',
    chartCaption: 'The tempo run moves to Thursday, so week 9 still does its job.',
  },
  {
    id: 'trail',
    tab: 'Trail',
    who: 'Training for a 50K trail race',
    planned: 'Hill repeats, 8 × 2 min',
    adjusted: 'Flat easy run, 50 min',
    why: 'Saturday’s long descent leaves soreness that peaks a day or two later. The hills move to Friday, when your legs are ready.',
    chartCaption: 'Hill repeats move to Friday, so week 9 still does its job.',
  },
  {
    id: 'hyrox',
    tab: 'HYROX',
    who: 'Training for HYROX, Open division',
    planned: 'Race simulation: 4 × (1 km run + station)',
    adjusted: 'Easy 30 min row, then light station technique',
    why: 'Race-pace work on a day like this mostly adds fatigue. The simulation moves to Thursday, and the extra work on your weakest station stays in the week.',
    chartCaption: 'The race simulation moves to Thursday, so week 9 still does its job.',
  },
  {
    id: 'fit',
    tab: 'Fitness',
    who: 'No race. Goal: build endurance',
    planned: 'Bike intervals, 6 × 3 min hard',
    adjusted: 'Zone 2 ride, 40 min, plus mobility',
    why: 'The intervals move to Friday. Wednesday’s strength session stays, so the week still covers cardio, intervals and strength.',
    chartCaption: 'Bike intervals move to Friday, and the block stays on track.',
  },
] as const satisfies readonly (Record<string, unknown> & { id: Sport })[]

export const MORNING = {
  groupLabel: 'Same morning, four different athletes',
  heading: 'This morning',
  metrics: [
    { label: 'HRV', value: '41', unit: 'ms', note: '18% below normal', flagged: true },
    { label: 'Resting HR', value: '56', unit: 'bpm', note: '+5 over normal', flagged: true },
    { label: 'Sleep', value: '5:40', unit: '', note: 'Short night', flagged: false },
  ],
  readiness: {
    value: 38,
    title: 'Readiness: take it easy',
    basis: 'Based on HRV, resting heart rate, sleep and your last 7 days of training',
  },
  plannedLabel: 'Planned',
  adjustedLabel: 'Adjusted for today',
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
    race: 'Bar chart of weekly training load over 16 weeks, building through base and build to a peak, then tapering to race day. Week 9 is lower than planned because today was adjusted.',
    fit: 'Bar chart of weekly training load over 16 weeks in four blocks, each ending with an easier week. Week 9 is lower than planned because today was adjusted.',
  },
  todayLabel: 'Today',
  captionLead: 'Today, week 9',
  captionTail: 'Dashed outline: what was planned. Example plan.',
  bars: {
    race: [38, 44, 50, 34, 54, 60, 66, 46, 70, 76, 82, 58, 88, 72, 52, 30],
    fit: [40, 46, 52, 34, 44, 50, 56, 36, 48, 54, 60, 38, 50, 56, 62, 40],
  },
  /** Largest bar value; bars scale to `plot` px against it. */
  max: 88,
  plot: 200,
  /** Week 9. */
  todayIndex: 8,
  /** Today's bar is filled to this share of its planned height. */
  todayShare: 0.72,
} as const

export const COACH = {
  title: 'A coach in your pocket',
  body: 'It knows your plan, your watch data and your training history, and it answers in plain language. Type or talk. When it suggests a change, you see exactly what moves, and nothing changes until you approve it.',
  bullets: [
    'Ask why today’s workout looks the way it does',
    'Rework the week around travel, work or a bad night',
    'Approved changes go straight to your Garmin watch',
  ],
  headerPrefix: 'Your coach. ',
  noTraits: 'Pick a personality below.',
  fallbackName: 'Your coach',
  athleteMessage: 'Work trip Wednesday to Friday, and I’m already sleeping badly. What should this week look like?',
  coachMessage: 'Let’s do your hard session Tuesday, before you leave, and make the travel days short and easy: 30 minutes you can do in a hotel gym or outside. You won’t lose anything that matters.',
  proposal: {
    heading: 'Proposed change to your plan',
    rows: [
      { day: 'Tue', from: 'Easy 40 min', to: 'Hard session, moved from Thu' },
      { day: 'Wed to Fri', from: 'Full sessions', to: '30 min easy, hotel-friendly' },
    ],
  },
  approve: 'Approve',
  keep: 'Keep my plan',
  approved: 'Plan updated. The new week is on your watch.',
  inputLabel: 'Message your coach',
  inputPlaceholderBefore: 'Ask ',
  inputPlaceholderAfter: ' anything',
  micLabel: 'Talk to your coach',
} as const

export type TraitId = 'funny' | 'strict' | 'motivational' | 'warm' | 'direct' | 'nerdy' | 'old-school' | 'chill'

export const MAKE = {
  title: 'Make it yours',
  body: 'Name your coach and choose how it talks to you. It can be the friend who keeps it light or the one who holds you to the plan. Try it: the chat above changes as you do.',
  nameLabel: 'Coach name',
  /** DEFAULT_COACH_NAME in src/types/index.ts. */
  defaultName: 'Mira',
  /** CoachPersonaEditor.tsx's limit. */
  nameMaxLength: 30,
  groupLabel: 'Personality',
  hint: 'A few of the 17 personalities',
  /** Exact COACH_TRAITS labels, in this order. */
  traits: [
    { id: 'funny', label: 'Funny' },
    { id: 'strict', label: 'Strict' },
    { id: 'motivational', label: 'Motivational' },
    { id: 'warm', label: 'Warm' },
    { id: 'direct', label: 'Direct' },
    { id: 'nerdy', label: 'Data Nerd' },
    { id: 'old-school', label: 'Old School' },
    { id: 'chill', label: 'Chill' },
  ],
  defaultTraits: ['warm', 'direct'],
} as const satisfies Record<string, unknown> & {
  traits: readonly (Record<string, unknown> & { id: TraitId })[]
  defaultTraits: readonly TraitId[]
}

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

/** DRAFT: needs Mike’s sign-off before PR 5 ships (copy.md). */
export const FOUNDER = {
  quote: '“I built Attune for my own training: trail races, then HYROX, and the stretches in between. I wanted a plan that noticed when I’d slept badly or overdone it, and changed instead of pretending nothing happened.”',
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
