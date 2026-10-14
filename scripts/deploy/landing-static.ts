/**
 * The root page's crawlable text and structured data (initiative 006), built
 * from src/landing/content.ts so the landing page's words stay in one place.
 * Pure (no Node imports) so the app's tests can import it; the Vite plugin
 * that applies it only when the landing page is launched is
 * scripts/deploy/vite-plugin-landing-static.ts.
 */

/** The slice of content.ts this needs. */
export interface LandingStaticContent {
  hero: { title: string; subhead: string; lead: string }
  /** Sections after the hero, in page order: a heading and, where the page has one, its intro. */
  sections: readonly { title: string; intro?: string }[]
  brand: string
  /** The page's answer to "does it cost anything?", which the Offer restates. */
  freeAnswer: string
}

/** The `id` of the static block; it is replaced when React mounts into #root. */
export const STATIC_ID = 'seo-static'

/**
 * Visually hidden, not display:none, and with no stylesheet: the landing CSS
 * arrives only with the page's chunk, so text styled by it would first paint
 * as unstyled browser-default text, then jump when React replaces it.
 */
const HIDDEN =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0'

/** Escape text for an HTML element body. */
function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * The static markup that goes inside `<div id="root">`: the hero's h1, subhead
 * and lead, then each section's h2 and intro, in the order the page shows them.
 *
 * @param c The landing page's words.
 * @returns Plain semantic HTML: no images, no scripts, no links.
 */
export function landingStaticHtml(c: LandingStaticContent): string {
  const sections = c.sections
    .map(s => `<section><h2>${esc(s.title)}</h2>${s.intro ? `<p>${esc(s.intro)}</p>` : ''}</section>`)
    .join('')
  return (
    `<div id="${STATIC_ID}" style="${HIDDEN}">` +
    `<header><h1>${esc(c.hero.title)}</h1><p>${esc(c.hero.subhead)}</p><p>${esc(c.hero.lead)}</p></header>` +
    `<main>${sections}</main></div>`
  )
}

/**
 * The root page's JSON-LD: the Organization and the app. Everything in it is
 * restated from the page: the name, the logo the page already uses, the meta
 * description, and "free during the beta" as the offer's description.
 *
 * @param c The landing page's words.
 * @param description The page's meta description (copy.md § Meta).
 * @returns JSON for one `<script type="application/ld+json">`.
 */
export function landingJsonLd(c: LandingStaticContent, description: string): string {
  const origin = 'https://attune.coach'
  return JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': `${origin}/#organization`,
          name: c.brand,
          url: `${origin}/`,
          logo: `${origin}/attune-mark.svg`,
        },
        {
          '@type': 'WebApplication',
          name: c.brand,
          url: `${origin}/`,
          description,
          applicationCategory: 'HealthApplication',
          operatingSystem: 'Web',
          publisher: { '@id': `${origin}/#organization` },
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: c.freeAnswer },
        },
      ],
    },
    null,
    2,
  )
}

/**
 * Put the static text and JSON-LD into the root page's HTML.
 *
 * @param html The root index.html.
 * @param c The landing page's words.
 * @returns The page with both added; throws if `<div id="root"></div>` or `</head>` isn't there exactly once.
 */
export function injectLandingStatic(html: string, c: LandingStaticContent): string {
  const root = '<div id="root"></div>'
  if (html.split(root).length !== 2 || html.split('</head>').length !== 2) {
    throw new Error(`index.html must hold ${root} and </head> exactly once for the landing static content`)
  }
  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1]
  if (!description) throw new Error('index.html has no meta description to restate in its JSON-LD')
  const ld = landingJsonLd(c, description.replace(/&amp;/g, '&')).replace(/</g, '\\u003c')
  return html
    .replace('</head>', () => `  <script type="application/ld+json">\n${ld}\n    </script>\n  </head>`)
    .replace(root, () => `<div id="root">${landingStaticHtml(c)}</div>`)
}
