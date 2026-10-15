/**
 * Which parts of src/landing/content.ts the root page's static text restates,
 * in the order LandingPage.tsx shows them. landingStatic.test.tsx renders the
 * real page and fails if this list and its headings drift apart.
 */
import { BRAND, COACH, FAQ, GEAR, HERO, HOW, PATHS, SCREENS, TOOLS } from '../../src/landing/content'
import type { LandingStaticContent } from './landing-static'

const free = FAQ.items.find(item => item.q === 'Does it cost anything?')
if (!free) throw new Error('content.ts FAQ lost its "Does it cost anything?" answer, which the JSON-LD offer restates')

export const LANDING_STATIC: LandingStaticContent = {
  hero: { title: HERO.title, subhead: HERO.subhead, lead: HERO.lead },
  sections: [
    { title: HOW.title },
    { title: PATHS.title, intro: PATHS.intro },
    { title: COACH.title, intro: COACH.body },
    { title: SCREENS.title, intro: SCREENS.intro },
    { title: GEAR.title },
    { title: TOOLS.title, intro: TOOLS.body },
    { title: FAQ.title },
  ],
  brand: BRAND,
  freeAnswer: free.a,
}
