/**
 * Initiative 006: the built sitemap.xml gets a <lastmod> per URL, from git
 * (scripts/deploy/vite-plugin-sitemap-lastmod.ts). The pure half is here.
 */
import { describe, it, expect } from 'vitest'
import { SITEMAP_SOURCES, pathOf, stampSitemap } from '../../../scripts/deploy/sitemap-lastmod'
import sitemap from '../../../public/sitemap.xml?raw'

describe('stampSitemap', () => {
  const xml = '<urlset><url><loc>https://attune.coach/</loc></url><url><loc>https://attune.coach/tools/heat.html</loc></url></urlset>'

  it('puts a <lastmod> right after each <loc>', () => {
    const out = stampSitemap(xml, loc => (loc.endsWith('heat.html') ? '2026-10-01' : '2026-09-30'))
    expect(out).toBe(
      '<urlset><url><loc>https://attune.coach/</loc><lastmod>2026-09-30</lastmod></url>' +
        '<url><loc>https://attune.coach/tools/heat.html</loc><lastmod>2026-10-01</lastmod></url></urlset>',
    )
  })

  it('replaces a <lastmod> a URL already has, and keeps other children', () => {
    const out = stampSitemap('<urlset><url><loc>https://attune.coach/</loc><lastmod>2020-01-01</lastmod><priority>1.0</priority></url></urlset>', () => '2026-10-14')
    expect(out).toBe('<urlset><url><loc>https://attune.coach/</loc><lastmod>2026-10-14</lastmod><priority>1.0</priority></url></urlset>')
  })

  it('stamps the same input the same way twice (deterministic)', () => {
    const date = () => '2026-10-14'
    expect(stampSitemap(stampSitemap(xml, date), date)).toBe(stampSitemap(xml, date))
  })

  it('refuses a date that is not YYYY-MM-DD', () => {
    expect(() => stampSitemap(xml, () => '14/10/2026')).toThrow(/YYYY-MM-DD/)
  })

  it('produces well-formed sitemap XML', () => {
    const doc = new DOMParser().parseFromString(stampSitemap(sitemap, () => '2026-10-14'), 'application/xml')
    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.querySelectorAll('url > lastmod')).toHaveLength(doc.querySelectorAll('url').length)
  })
})

describe('the sitemap source', () => {
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])

  it('names, for every URL it lists, the files that date it', () => {
    for (const loc of locs) expect(SITEMAP_SOURCES[pathOf(loc)], loc).toBeDefined()
    expect(Object.keys(SITEMAP_SOURCES).sort()).toEqual(locs.map(pathOf).sort())
  })
})
