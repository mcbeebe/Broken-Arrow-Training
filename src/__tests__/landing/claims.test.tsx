/**
 * Initiative 003: every factual claim on the landing page is backed by code,
 * and this test reads the code, not a copy of it. Change a method's ratings,
 * the HYROX divisions, the coach traits, the cardio options or the fitness
 * block numbers, and this fails until copy.md and content.ts are updated.
 *
 * (Tests may import app modules; the landing page itself may not.)
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { render } from '@testing-library/react'
import { LandingPage } from '../../landing/LandingPage'
import * as C from '../../landing/content'
import { RECOMMENDABLE_METHODS, getMethodById } from '../../data/methods'
import { HYROX_DIVISIONS, stationSpecs } from '../../engines/hyrox/spec'
import { MAX_BLOCK_WEEKS, DELOAD_EVERY } from '../../engines/generalFitness'
import { CARDIO_MODALITIES } from '../../hooks/useOnboarding'
import { COACH_TRAITS, COACH_TRAIT_EXCLUSIVE_GROUPS, DEFAULT_COACH_NAME } from '../../types'
import personaEditorSource from '../../components/CoachPersonaEditor.tsx?raw'

/** Every string in content.ts: the states one default render never shows (other tabs, form errors, success). */
function contentStrings(value: unknown = C, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach(v => contentStrings(v, out))
  else if (value && typeof value === 'object') Object.values(value).forEach(v => contentStrings(v, out))
  return out
}

/** Everything a visitor can read or hear: text, plus labels and placeholders. */
let pageText = ''

beforeAll(() => {
  const { container, unmount } = render(<LandingPage />)
  const attrs = [...container.querySelectorAll('[aria-label], [placeholder], [alt], [title]')].flatMap(el =>
    ['aria-label', 'placeholder', 'alt', 'title'].map(a => el.getAttribute(a) ?? ''),
  )
  pageText = [container.textContent ?? '', ...attrs].join('\n')
  unmount()
})

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

describe('words and claims that must never appear (copy.md)', () => {
  const BANNED: [string, RegExp][] = [
    ['App Store', /app store/i],
    ['TestFlight', /testflight/i],
    ['Apple Watch', /apple watch/i],
    ['widget', /widget/i],
    ['official Garmin', /official garmin/i],
    ['Garmin partner', /garmin partner/i],
    ['certified', /certified/i],
    ['a currency amount', /[$€£]\s*\d/],
    ['per month', /per month/i],
    ['/mo', /\/mo\b/i],
    ['users', /\busers\b/i],
    ['athletes trust', /athletes trust/i],
    ['#1', /#1\b/],
    ['best', /\bbest\b/i],
  ]

  it('rendered at all', () => {
    expect(pageText).toContain(C.HERO.title)
  })

  it.each(BANNED)('never says %s on the rendered page', (_name, pattern) => {
    expect(pageText).not.toMatch(pattern)
  })

  it.each(BANNED)('never says %s anywhere in content.ts', (_name, pattern) => {
    expect(contentStrings().filter(s => pattern.test(s))).toEqual([])
  })
})

describe('Road races card: the methods it names', () => {
  const card = C.PATHS.cards.find(c => c.id === 'road')!
  const ROAD_DISTANCES = ['5k', '10k', 'half_marathon', 'marathon'] as const
  const SUITED = new Set(['BEST', 'GOOD', 'OK'])

  it.each(C.ROAD_METHODS)('$label ($id) is offered in onboarding', ({ id }) => {
    expect(RECOMMENDABLE_METHODS.map(m => m.id)).toContain(id)
  })

  it.each(C.ROAD_METHODS)('$label ($id) is rated at least OK at 5K, 10K, half and marathon', ({ id }) => {
    const byDistance = getMethodById(id)!.applicability.byDistance as Record<string, string>
    for (const d of ROAD_DISTANCES) expect(SUITED.has(byDistance[d]), `${id} at ${d}: ${byDistance[d]}`).toBe(true)
  })

  it('names exactly those methods on the card', () => {
    const text = card.points.join(' ')
    for (const { label } of C.ROAD_METHODS) expect(text).toContain(label)
    // A recommendable method the card doesn't claim must not be named on it.
    const claimed = new Set<string>(C.ROAD_METHODS.map(m => m.id))
    for (const m of RECOMMENDABLE_METHODS.filter(m => !claimed.has(m.id))) {
      const names = m.coach.replace(/\(.*?\)/g, '').split(/[\s,&]+/).filter(Boolean)
      for (const word of names.filter(w => /^[A-Z][a-z]{3,}$/.test(w))) {
        expect(text, `${m.id} (${word}) is named but not claimed`).not.toContain(word)
      }
    }
  })

  it('never says how many methods there are', () => {
    expect(card.points.join(' ')).not.toMatch(/\b(8|eight|9|nine)\b/i)
  })
})

describe('Trail and ultra card: the methods it names', () => {
  const card = C.PATHS.cards.find(c => c.id === 'trail')!

  it.each(C.TRAIL_METHODS)('$label ($id) exists', ({ id }) => {
    expect(getMethodById(id)).toBeDefined()
  })

  it('names each one', () => {
    for (const { label } of C.TRAIL_METHODS) expect(card.points.join(' ')).toContain(label)
  })
})

describe('HYROX card', () => {
  const card = C.PATHS.cards.find(c => c.id === 'hyrox')!

  it('names exactly the divisions the engine plans for', () => {
    expect(C.HYROX_DIVISIONS_SHOWN.map(d => d.id)).toEqual([...HYROX_DIVISIONS])
    for (const { label } of C.HYROX_DIVISIONS_SHOWN) expect(card.subtitle).toContain(label)
  })

  it('“all 8 stations” matches the engine', () => {
    expect(stationSpecs()).toHaveLength(C.HYROX_STATION_COUNT)
    expect(card.points.join(' ')).toContain(`all ${C.HYROX_STATION_COUNT} stations`)
  })
})

describe('General fitness card and the No race chart', () => {
  const card = C.PATHS.cards.find(c => c.id === 'fit')!

  it('the cardio options map one-to-one to the onboarding modalities', () => {
    expect(C.CARDIO_OPTIONS.map(o => o.modality)).toEqual([...CARDIO_MODALITIES])
    const line = card.points.find(p => p.startsWith('Cardio your way'))!
    for (const { label } of C.CARDIO_OPTIONS) expect(line).toContain(label)
  })

  it('“up to 16 weeks” matches MAX_BLOCK_WEEKS', () => {
    expect(C.PLAN.intro.fit).toContain(`up to ${MAX_BLOCK_WEEKS} weeks`)
    expect(C.PLAN.bars.fit).toHaveLength(MAX_BLOCK_WEEKS)
  })

  it('“three building weeks, then an easier one” matches DELOAD_EVERY', () => {
    expect(C.PLAN.intro.fit).toContain(`${NUMBER_WORDS[DELOAD_EVERY - 1]} building weeks, then an easier one`)
  })

  it('the No race chart eases off every DELOAD_EVERY-th week and nowhere else', () => {
    const bars = C.PLAN.bars.fit
    bars.forEach((v, i) => {
      const deload = (i + 1) % DELOAD_EVERY === 0
      if (deload) expect(v, `week ${i + 1}`).toBeLessThan(bars[i - 1])
      else if (i > 0 && (i % DELOAD_EVERY) !== 0) expect(v, `week ${i + 1}`).toBeGreaterThan(bars[i - 1])
    })
  })
})

describe('Make it yours: the coach traits', () => {
  const real = new Map<string, string>(COACH_TRAITS.map(t => [t.id, t.label]))

  it.each(C.MAKE.traits)('$label is the app’s exact label for $id', ({ id, label }) => {
    expect(real.get(id)).toBe(label)
  })

  it('shows no two traits from the same exclusive group', () => {
    const shown = new Set<string>(C.MAKE.traits.map(t => t.id))
    for (const group of COACH_TRAIT_EXCLUSIVE_GROUPS) {
      expect(group.filter(id => shown.has(id)).length, group.join('/')).toBeLessThanOrEqual(1)
    }
  })

  it('“17 personalities” is COACH_TRAITS.length', () => {
    expect(C.MAKE.hint).toContain(`${COACH_TRAITS.length} personalities`)
  })

  it('the default name is the app’s', () => {
    expect(C.MAKE.defaultName).toBe(DEFAULT_COACH_NAME)
  })

  it('the default traits are shown traits', () => {
    const shown = new Set(C.MAKE.traits.map(t => t.id))
    for (const id of C.MAKE.defaultTraits) expect(shown.has(id)).toBe(true)
  })

  it('the name input’s maxLength matches the app’s persona editor', () => {
    const limits = [...personaEditorSource.matchAll(/maxLength=\{(\d+)\}/g)].map(m => Number(m[1]))
    expect(limits, 'CoachPersonaEditor.tsx has one maxLength, the name’s').toHaveLength(1)
    const { container, unmount } = render(<LandingPage />)
    expect(container.querySelector<HTMLInputElement>('#coach-name')!.maxLength).toBe(limits[0])
    expect(C.MAKE.nameMaxLength).toBe(limits[0])
    unmount()
  })
})
