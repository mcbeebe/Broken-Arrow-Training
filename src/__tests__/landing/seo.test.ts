/**
 * Initiative 003 PR 5 (go live): what search engines and link previews read.
 * The root page's title, description and share tags are copy.md's § Meta,
 * verbatim; the app stays out of search; the sitemap lists exactly the
 * public pages the build makes. check-site-layout.mjs checks the built
 * files (sitemap URLs exist, the share image is a whole PNG of the size the
 * tags state).
 */
import { describe, it, expect } from 'vitest'
import rootHtml from '../../../index.html?raw'
import appHtml from '../../../app/index.html?raw'
import robots from '../../../public/robots.txt?raw'
import sitemap from '../../../public/sitemap.xml?raw'
import copyMd from '../../../docs/initiatives/003-landing-page/copy.md?raw'
import viteConfigSource from '../../../vite.config.ts?raw'
import fuelingHtml from '../../../tools/fueling.html?raw'
import heatHtml from '../../../tools/heat.html?raw'
import mileageHtml from '../../../tools/mileage.html?raw'
import predictorHtml from '../../../tools/predictor.html?raw'

const root = new DOMParser().parseFromString(rootHtml, 'text/html')
const app = new DOMParser().parseFromString(appHtml, 'text/html')

/** The content of the one meta tag with this property or name. */
function meta(doc: Document, key: string): string | null {
  const tags = doc.querySelectorAll(`meta[property="${key}"], meta[name="${key}"]`)
  expect(tags, key).toHaveLength(1)
  return tags[0].getAttribute('content')
}

/** A row of copy.md's § Meta table. */
function copyMeta(field: string): string {
  const section = copyMd.split('## Meta')[1].split('\n## ')[0]
  const row = section.split('\n').find(line => line.startsWith(`| ${field} |`))
  expect(row, field).toBeDefined()
  return row!.split('|')[2].trim()
}

const description = copyMeta('meta description')

describe('the root page’s tags are copy.md § Meta, verbatim', () => {
  it('title', () => {
    expect(root.title).toBe(copyMeta('`<title>`'))
  })

  it('description, and the share descriptions repeat it', () => {
    expect(copyMeta('og:description')).toBe('Same as meta description')
    expect(meta(root, 'description')).toBe(description)
    expect(meta(root, 'og:description')).toBe(description)
    expect(meta(root, 'twitter:description')).toBe(description)
  })

  it('share title', () => {
    expect(meta(root, 'og:title')).toBe(copyMeta('og:title'))
    expect(meta(root, 'twitter:title')).toBe(copyMeta('og:title'))
  })

  it('share image alt text', () => {
    expect(meta(root, 'og:image:alt')).toBe(copyMeta('og:image alt'))
    expect(meta(root, 'twitter:image:alt')).toBe(copyMeta('og:image alt'))
  })

  it('follows copy.md’s typography: no exclamation marks, curly apostrophes', () => {
    const texts = [root.title, description, copyMeta('og:title'), copyMeta('og:image alt')]
    for (const text of texts) {
      expect(text).not.toContain('!')
      expect(text).not.toContain("'")
    }
  })
})

describe('share tags', () => {
  it('point at the canonical root and one large share image', () => {
    expect(root.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://attune.coach/')
    expect(meta(root, 'og:url')).toBe('https://attune.coach/')
    expect(meta(root, 'og:type')).toBe('website')
    expect(meta(root, 'og:site_name')).toBe('Attune')
    expect(meta(root, 'og:image')).toBe('https://attune.coach/og-image.png')
    expect(meta(root, 'twitter:image')).toBe('https://attune.coach/og-image.png')
    expect(meta(root, 'twitter:card')).toBe('summary_large_image')
  })

  it('state the size check-site-layout.mjs holds the image to', () => {
    expect(meta(root, 'og:image:width')).toBe('1200')
    expect(meta(root, 'og:image:height')).toBe('630')
  })

  it('the root page is not kept out of search', () => {
    expect(root.querySelector('meta[name="robots"]')).toBeNull()
  })
})

describe('the app stays out of search', () => {
  it('app/index.html says noindex', () => {
    expect(meta(app, 'robots')).toBe('noindex')
  })

  // A crawler blocked by robots.txt never sees noindex, and Google can then
  // index the blocked URL from links alone. So /app/ stays crawlable and its
  // noindex does the work; robots.txt blocks nothing.
  it('robots.txt blocks nothing and names the sitemap', () => {
    expect(robots).toBe('User-agent: *\nAllow: /\n\nSitemap: https://attune.coach/sitemap.xml\n')
  })
})

describe('the sitemap', () => {
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])

  it('is well-formed XML in the sitemap namespace', () => {
    const doc = new DOMParser().parseFromString(sitemap, 'application/xml')
    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.documentElement.namespaceURI).toBe('http://www.sitemaps.org/schemas/sitemap/0.9')
  })

  it('lists the root page and every free tool the build makes, and nothing else', () => {
    const tools = [...viteConfigSource.matchAll(/['"`](tools\/[a-z-]+\.html)['"`]/g)].map(m => m[1])
    expect([...locs].sort()).toEqual(['https://attune.coach/', ...tools.map(t => `https://attune.coach/${t}`)].sort())
  })
})

/**
 * Initiative 006: the free tools' own HTML is what a crawler reads before (or
 * without) running the page's script, so it carries the canonical link, the
 * share tags, a heading and description inside #root, and WebApplication
 * JSON-LD. React's createRoot replaces #root's children on mount.
 */
describe('the free tools’ static HTML', () => {
  const tools = [
    { name: 'fueling', source: fuelingHtml, h1: 'Trail Fueling Planner' },
    { name: 'heat', source: heatHtml, h1: 'Race-Day Heat Planner' },
    { name: 'mileage', source: mileageHtml, h1: 'Weekly mileage planner' },
    { name: 'predictor', source: predictorHtml, h1: 'Vert-Adjusted Finish Predictor' },
  ]

  it.each(tools)('$name: canonical link and share tags match the page', ({ name, source }) => {
    const doc = new DOMParser().parseFromString(source, 'text/html')
    const url = `https://attune.coach/tools/${name}.html`
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(url)
    expect(meta(doc, 'og:url')).toBe(url)
    expect(meta(doc, 'og:type')).toBe('website')
    expect(meta(doc, 'og:site_name')).toBe('Attune')
    expect(meta(doc, 'og:title')).toBe(doc.title)
    expect(meta(doc, 'twitter:title')).toBe(doc.title)
    expect(meta(doc, 'og:description')).toBe(meta(doc, 'description'))
    expect(meta(doc, 'twitter:description')).toBe(meta(doc, 'description'))
    expect(meta(doc, 'og:image')).toBe('https://attune.coach/og-image.png')
    expect(meta(doc, 'twitter:image')).toBe('https://attune.coach/og-image.png')
    expect(meta(doc, 'twitter:card')).toBe('summary_large_image')
    expect(meta(doc, 'og:image:width')).toBe('1200')
    expect(meta(doc, 'og:image:height')).toBe('630')
    expect(meta(doc, 'og:image:alt')).toBe(copyMeta('og:image alt'))
    expect(meta(doc, 'twitter:image:alt')).toBe(copyMeta('og:image alt'))
    expect(doc.querySelector('meta[name="robots"]')).toBeNull()
  })

  it.each(tools)('$name: #root holds the heading and the meta description, as plain text', ({ source, h1 }) => {
    const doc = new DOMParser().parseFromString(source, 'text/html')
    const root = doc.getElementById('root')!
    expect(root.querySelectorAll('h1')).toHaveLength(1)
    expect(root.querySelector('h1')!.textContent).toBe(h1)
    expect(root.querySelector('p')!.textContent).toBe(meta(doc, 'description'))
    expect(root.querySelector('script, img, a')).toBeNull()
  })

  it.each(tools)('$name: JSON-LD is a free WebApplication for this page, with no ratings or reviews', ({ name, source, h1 }) => {
    const doc = new DOMParser().parseFromString(source, 'text/html')
    const blocks = doc.querySelectorAll('script[type="application/ld+json"]')
    expect(blocks).toHaveLength(1)
    const ld = JSON.parse(blocks[0].textContent!)
    expect(ld).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: h1,
      url: `https://attune.coach/tools/${name}.html`,
      description: meta(doc, 'description'),
      applicationCategory: 'SportsApplication',
      operatingSystem: 'Any',
      isAccessibleForFree: true,
      publisher: { '@type': 'Organization', name: 'Attune', url: 'https://attune.coach/' },
    })
  })
})
