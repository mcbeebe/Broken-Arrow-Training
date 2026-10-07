# 003 — Landing page design and build spec

What to build, section by section, and how it behaves. Copy lives in
[copy.md](copy.md); colors, type and spacing in [tokens.json](tokens.json).
The approved visual target is in [reference/](reference/): a static render of
the default state ([A2-Signal.html](reference/A2-Signal.html), opens in any
browser), screenshots of each state, and the design source plus its 19
behavior tests. See [reference/README.md](reference/README.md).

The reference HTML is a design artifact, not code to copy: it uses inline
styles and a throwaway renderer. Rebuild it as typed React components with
Tailwind, matching it visually.

## Files

```
index.html                     landing page shell (was the app shell)
app/index.html                 app shell, moved here unchanged except paths
privacy.html, terms.html       static legal pages (PR 5; owner supplies text)
src/landing/
  main.tsx                     entry: imports only legacyEntry + referral, runs the guard,
                               then import('./LandingPage') dynamically
  legacyEntry.ts               pure guard function (no DOM access inside)
  content.ts                   all copy and example data (from copy.md), plus SECTION_IDS
  tokens.ts                    Signal palette as typed constants (from tokens.json)
  api.ts                       requestInvite() — the only network call
  referral.ts                  read/write ba_referral_source_v1
  LandingPage.tsx              composes the sections, owns shared state
  components/
    SiteHeader.tsx  Hero.tsx  InviteForm.tsx  MorningCard.tsx  SegmentedControl.tsx
    HowItWorks.tsx  PathCards.tsx  PlanChart.tsx  CoachDemo.tsx  MakeItYours.tsx
    GearGrid.tsx  ToolsPanel.tsx  FounderNote.tsx  Faq.tsx  SiteFooter.tsx  AttuneMark.tsx
public/attune-mark.svg         landing logo + landing favicon link (never replaces /favicon.svg)
tailwind.landing.config.js     landing-only Tailwind config (content: index.html + src/landing/**)
src/__tests__/landing/          unit and component tests (vitest + Testing Library)
scripts/deploy/check-site-layout.mjs        post-build layout + budget check (PR 1, budget PR 3)
scripts/deploy/vite-plugin-module-map.ts    writes dist/.vite/module-map.json for that check (PR 3)
```

The landing CSS loads its own Tailwind config (`@config`), so it ships only the
utilities the landing page uses, not the app’s.

Landing code must not import app code (`src/App.tsx`, `src/components/`,
`src/engines/`, `src/hooks/`, `src/utils/`, `src/data/`), `recharts` or `cesium`.
Enforce with an eslint `no-restricted-imports` override for `src/landing/**`
whose patterns match at any depth (PR 3), and with the build-manifest check in
`check-site-layout.mjs`. Tests may import app modules (the claims test must).

## Page structure and layout

Container `max-width: 1180px`, side gutter 24px, centered. Content is
left-aligned throughout. Layout is fluid: flex rows with `flex-wrap: wrap` and
flex-basis values from the reference, and auto-fit grids. The single media
query hides the secondary nav links at ≤640px.

| # | Section (id) | Background | Layout |
|---|---|---|---|
| 1 | Header | ground | wordmark left, nav right; wraps |
| 2 | Hero (`top`, form `join`) | ground | two columns ≥ ~1000px: text + form (flex 1 1 460px), MorningCard (flex 1 1 420px, max 520px); stacks below |
| 3 | How a morning works (`how`) | card (white) | H2, then 4-step ordered list, auto-fit min 230px |
| 4 | Whatever you’re training for (`you`) | deep | H2 + intro row; 4 path cards auto-fit min 240px; then “Your plan, week by week” with toggle and chart |
| 5 | A coach in your pocket (`coach`) | ground | text column + CoachDemo card (max 500px) |
| 6 | Make it yours | card (white) | text column + persona panel (soft background) |
| 7 | Gear | ground | H2 + 3 cards auto-fit min 250px |
| 8 | Try it before you’re in (`tools`) | ground, inner deep panel radius 28px | text + 3 tool links |
| 9 | Founder note + Questions | ground | two columns: blockquote, FAQ (`<details>`) |
| 10 | Footer | deep | line + CTA; link row |

## Shared state (LandingPage owns it)

```ts
type Sport = 'run' | 'trail' | 'hyrox' | 'fit'
type PlanKind = 'race' | 'fit'
interface LandingState {
  sport: Sport            // default 'run'
  plan: PlanKind          // default 'race'
  coachName: string       // default DEFAULT_COACH_NAME ('Mira'), max 30 like the app
  personality: PersonalityId // PR 4b: one at a time, default 'warm'
  question: number        // PR 4b: index into COACH.questions, default 0
  approved: boolean
  tries: number           // PR 4b: personality + question changes this visit
}
```

Sync rules (the reference implements these; tests in PR 4 lock them):

- Picking the **Fitness** tab sets `plan = 'fit'`; picking any other tab sets `plan = 'race'`.
- Picking **No race** sets `sport = 'fit'`.
- Picking **Racing** while `sport === 'fit'` sets `sport = 'run'`; otherwise `sport` is unchanged.
- The chart caption always uses the current `sport`’s caption from content.ts.
- Coach name trimmed; empty shows “Your coach”, initial “Y”. Max 30 chars (`CoachPersonaEditor.tsx` uses 30).
- The header’s status line is “Your coach. {personality}.” (PR 4b; it listed several traits before).
- *(PR 4b)* A new personality or a new question costs one try; typing a name is free. At `COACH.tryLimit` (3) the personality buttons and “Ask something else” stay focusable but do nothing (`aria-disabled`), and the demo offers an invite naming the coach as it was at that moment (a live region shouldn’t re-announce per keystroke). **Reset** returns to Mira, Warm, question 1, not approved, and gives no tries back; a reload does.
- *(PR 4b)* “Ask something else” cycles the questions and clears Approve; a question without a proposal has no Approve.

Persona and demo state are page-local. Nothing is persisted, and nothing is sent anywhere.

## Components

### SegmentedControl
Used for the athlete tabs (4 options, on the white card) and the chart toggle
(2 options, on deep). A `role="group"` with an accessible name, containing
`<button type="button" aria-pressed>` items. Min height 44px. Selected: card
background, ink text, `shadow.segmentOn`; unselected: transparent, muted text.
On deep: selected `onDeep` background with `deep` text; unselected `onDeepMuted`.
Arrow-key roving focus is optional; Tab-to-each-button is required.

### MorningCard
- *(PR 4b)* Each tab has its own morning (copy.md): three readings, a ring and
  a readiness line, one tab per outcome (eases off, pivots, peak, steady).
  Values use `white-space: nowrap`; a reading’s note is orange when it is
  worse than normal, teal when better (a resting HR under normal is better),
  muted when normal.
- Readiness ring: 64px circle, `conic-gradient(color 0 N%, line N% 100%)`,
  inner 48px circle with N; `signal` when the morning eases off, `action`
  otherwise. Decorative; the text beside it carries the meaning.
- Everything below the tabs is `aria-live="polite"`. When the session changes,
  Planned is struck through and the label reads “Adjusted for today”
  (signal); when it stands, nothing is struck and the label reads “Today”
  (action). The plan block has a min-height of 196px.

### PlanChart
16 weekly bars in a flex row, plot height 236px (bars use ≤ 200px so the
“Today” label fits), gap 6px, baseline `2px solid deepLine`. Bar radius 6px top.

```ts
const RACE = [38,44,50,34, 54,60,66,46, 70,76,82,58, 88,72,52,30] // base→build→peak→taper
const FIT  = [40,46,52,34, 44,50,56,36, 48,54,60,38, 50,56,62,40] // easier week every 4th
const MAX = 88, PLOT = 200, TODAY = 8 // index of week 9
height(v) = round(v / MAX * PLOT)
today bar: when today changed (PR 4b: ease off or pivot), a dashed 2px
           outline at planned height (signalOnDeep) and a solid fill at
           round(planned * 0.72); when it stands, a full bar and no outline
           (chartToday either way),
           “Today” label 8px above the planned height (13px, 800, signalOnDeep)
other bars: chartBar
```

Phase labels: a grid under the bars. Racing `5fr 5fr 3fr 3fr`, No race
`repeat(4, 1fr)`; last label right-aligned. The chart container has `role="img"`
and an `aria-label` describing the shape plus whether week 9 is cut back
(strings in content.ts); the caption’s “Dashed outline” sentence shows only
when there is one. Do not use
recharts here (bundle size).

### CoachDemo
*(PR 4b)* Three written questions, each answered in the chosen personality’s
voice (copy.md; never live AI). The reply is `aria-live="polite"`.
**Ask something else** and **Reset** sit under the chat; at the try limit a
`role="status"` line offers “Request an invite” (→ `#join`). Questions with a
proposal show the proposal card. **Approve** swaps the two buttons
for the confirmation line (`role="status"`, named, focused). **Keep my plan** does nothing in
the demo. The text input and mic button are decorative: render them
`disabled` with `aria-disabled="true"` and a visually-hidden label, so nobody
types into a fake chat expecting an answer.

### MakeItYours
*(PR 4b)* A panel inside the coach section, not its own section: an H3, the
name input, and 5 personality buttons (`aria-pressed`, exactly one pressed)
in a `role="group"` labelled “Personality”, with the hint “A few of the 17
personalities”. The 5 shown are real `COACH_TRAITS` labels (see copy.md).
Picking one rewrites CoachDemo’s header and reply live.

### AppScreens (PR 4b)
“See it in the app”: 6 cropped real screens from `public/landing/app/*.webp`
(720 px wide, each ≤ 80 KB and ≤ 240 KB together, enforced by `check-site-layout.mjs`), with
`loading="lazy"`, fixed `width`/`height`, alt text and a caption. A
snap-scrolling row that bleeds to the screen edges on phones (portrait
screens get a narrower card; the row is focusable so a keyboard can scroll
it), CSS columns from 640px up.

### InviteForm
- `<form noValidate>` with labelled email (`type="email"`, `autocomplete="email"`)
  and optional goal (`maxLength={200}`, matching `MAX_REQUEST_NOTE_LEN`).
- Hidden honeypot field: `<input name="hp_contact_ref" tabIndex={-1} autoComplete="off">`
  inside a visually hidden wrapper with `aria-hidden="true"`. The name is chosen so
  browsers don’t autofill it (they do autofill `company`). Send its value; the server
  silently drops posts where it is filled (PR 2).
- Client validation regex mirrors the server: `^[^@\s]+@[^@\s]+\.[^@\s]+$`.
- Submit: disable the button and show “Sending…”, call `requestInvite()`,
  map the result to the states in copy.md. Focus moves to the success
  message or the error on completion.
- On success, replace the form with the success panel (`role="status"`).

### api.ts — `requestInvite()`
```ts
/** POST an invite request to the existing access queue. */
export async function requestInvite(input: {
  email: string; note: string; source: string | null; hp_contact_ref: string
}): Promise<
  | { ok: true }
  | { ok: false; kind: 'invalid' | 'throttled' | 'unavailable' | 'network'; message?: string }
>
```
- URL: `${API_BASE}/api/auth/athletes`, where `API_BASE` resolves exactly as
  `src/utils/coachApi.ts:26-30` does (`VITE_COACH_API_URL || VITE_GARMIN_API_URL`).
  Import nothing from the app; duplicate the two-line lookup and test it.
- Body: `{ action: 'request_access', email, note, source, hp_contact_ref }`.
  The server ignores unknown keys today, so this is safe before PR 2 lands.
- 10s timeout via `AbortController`. 200 → ok; 400 → invalid with the server
  message; 429 → throttled; 503 or 5xx → unavailable; a thrown fetch or timeout → network.

### referral.ts
- Use the same key and format the app already writes (`src/main.tsx:13-18`):
  `localStorage['ba_referral_source_v1'] = JSON.stringify({ from, at: Date.now() })`,
  **first touch wins, never overwrite**. On load, if `?from=` is present and the
  key is empty, write it.
- `source` sent with the invite = the stored `from` if any, else `'landing'`.
- Wrap every storage access in try/catch (attribution is best-effort, as in `main.tsx`).
- Extract the read/write into `referral.ts` and have `src/main.tsx` call the
  same function, so the two can't drift.

## Legacy entry guard

`legacyEntryTarget(input): string | null` in `src/landing/legacyEntry.ts`.
`src/landing/main.tsx` statically imports only this module and `referral.ts`
(ES imports are hoisted, so anything imported statically downloads before the
guard runs). When the guard returns a URL, call `location.replace(url)` and
stop; otherwise `import('./LandingPage')` and render. Home-screen launches and
notification taps then pay a few KB, not the landing bundle.

```ts
interface LegacyEntryInput {
  search: string          // location.search, e.g. '?view=coach'
  hash: string            // location.hash, e.g. '#mike'
  standalone: boolean     // matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  hasSession: boolean     // localStorage has 'ba_auth_session'
}
const APP = '/app/'
// Derived, never hand-listed: '' + '#main' (skip-link target) + '#' + each id in
// content.ts SECTION_IDS (top, join, how, you, coach, tools). A test asserts every
// in-page link target the page renders is in this set.
const LANDING_ANCHORS: ReadonlySet<string>
const APP_PARAMS = ['view', 'code', 'scope', 'state', 'error', '__migrate']
```

Forward to `APP + search + hash` when **any** of:

1. `search` has a key in `APP_PARAMS` (deep links, Strava OAuth callback
   incl. cancel, airlock hand-off);
2. `hash` starts with `#__attune_migrate`, or is non-empty and not in
   `LANDING_ANCHORS` (the app keeps the athlete ID in the hash);
3. `standalone` is true (installed home-screen apps saved `/?view=today`;
   iOS never updates that URL, so this rule is permanent);
4. `hasSession` is true **and** `new URLSearchParams(search).get('home') !== '1'`.
   (`hasSession` checks only that the key exists. An expired session still
   forwards, and the app shows its own sign-in, which is right for a member.)

Otherwise return `null`. `?from=` alone never forwards (tool visitors belong
on the landing page). Keep search and hash byte-for-byte; do not re-encode.

## Accessibility

- One `<h1>`; sections use `<h2>`, cards `<h3>`. Landmarks: `<header>`, `<nav aria-label="Main">`, `<main>`, `<footer>`.
- “Skip to content” link as the first focusable element.
- Every input has a `<label>`. Icon-only buttons have `aria-label`.
- Visible focus: `outline: 3px solid focusRing; outline-offset: 2px` on `:focus-visible`.
- Touch targets ≥ 44px.
- Contrast: all text pairs ≥ 4.5:1 and chart marks ≥ 3:1 (verified for Signal in tokens.json). Don’t introduce new color pairs without checking.
- No auto-playing motion. If any transition is added, wrap it in `prefers-reduced-motion: no-preference`.
- `lang="en"`.

## Performance budget

- Guard entry (static import closure of `src/landing/main.tsx`) ≤ 10 KB gzipped.
- Whole landing page (entry + dynamic `LandingPage` chunk + everything they import, **including the shared React chunk**) ≤ 90 KB gzipped. `check-site-layout.mjs` computes both from `dist/.vite/manifest.json` and fails the build above either.
- Fonts: self-hosted Schibsted Grotesk woff2 (400/500/600/700/800 or a variable file), `font-display: swap`, preload the 800 weight used by the H1.
- No images above the fold; the mark is inline SVG. OG image is a static PNG in `public/` (1200×630).
- Lighthouse (mobile) targets on the deployed page: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95. Record the scores in the PR 5 description.

## SEO and sharing (PR 5)

- `<title>`, meta description, canonical `https://attune.coach/`, Open Graph and Twitter card tags (copy.md § Meta).
- `public/robots.txt`: allow `/`, `/tools/`, `/privacy.html`, `/terms.html`; disallow `/app/`.
- `public/sitemap.xml`: `/`, the three tools, privacy, terms.
- `app/index.html` gets `<meta name="robots" content="noindex">`.
- Favicon: the landing page links `/attune-mark.svg`. Never edit `/favicon.svg`: it is also the app’s favicon, manifest icon, apple-touch-icon and push icon/badge.

## AttuneMark (interim logo)

Inline SVG, 30×30 viewBox: a circle `r=13` stroked `action` (3px) and a
polyline `M8 17 L12.5 12 L16 15.5 L22 9` stroked `signal` (2.6px, round caps
and joins). `aria-hidden` next to the “Attune” wordmark (22px, 800,
letter-spacing −0.02em). A real logo is out of scope.
