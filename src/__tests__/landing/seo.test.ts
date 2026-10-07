/**
 * Initiative 003 PR 5 (go live): what search engines and link previews read.
 * The root page's title, description and share tags are copy.md's § Meta,
 * verbatim; the app stays out of search; the sitemap lists exactly the
 * public pages the build makes. check-site-layout.mjs checks the built
 * files (sitemap URLs exist, the share image is a 1200×630 PNG).
 */
import { describe, it, expect } from 'vitest'
import rootHtml from '../../../index.html?raw'
import appHtml from '../../../app/index.html?raw'
import robots from '../../../public/robots.txt?raw'
import sitemap from '../../../public/sitemap.xml?raw'
import copyMd from '../../../docs/initiatives/003-landing-page/copy.md?raw'
import viteConfigSource from '../../../vite.config.ts?raw'

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

  it('robots.txt allows the site, disallows /app/ and names the sitemap', () => {
    const lines = robots.trim().split('\n').map(l => l.trim())
    expect(lines).toContain('User-agent: *')
    expect(lines).toContain('Allow: /')
    expect(lines).toContain('Disallow: /app/')
    expect(lines).toContain('Sitemap: https://attune.coach/sitemap.xml')
    expect(lines.filter(l => l.startsWith('Disallow:'))).toEqual(['Disallow: /app/'])
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
    const tools = [...viteConfigSource.matchAll(/'(tools\/[a-z-]+\.html)'/g)].map(m => m[1])
    expect(tools).toHaveLength(4)
    expect([...locs].sort()).toEqual(['https://attune.coach/', ...tools.map(t => `https://attune.coach/${t}`)].sort())
  })
})
