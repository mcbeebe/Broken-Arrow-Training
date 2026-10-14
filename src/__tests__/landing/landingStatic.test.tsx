/**
 * Initiative 006: the root page's crawlable text. It is generated from
 * content.ts and must list the headings the real page renders, in the same
 * order, so a crawler that never runs the page reads what a visitor sees.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import rootHtml from '../../../index.html?raw'
import copyMd from '../../../docs/initiatives/003-landing-page/copy.md?raw'
import { LandingPage } from '../../landing/LandingPage'
import { HERO } from '../../landing/content'
import { injectLandingStatic, landingJsonLd, landingStaticHtml, STATIC_ID } from '../../../scripts/deploy/landing-static'
import { LANDING_STATIC } from '../../../scripts/deploy/landing-static-content'

afterEach(cleanup)

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')
const built = injectLandingStatic(rootHtml, LANDING_STATIC)

describe('the static text', () => {
  it('lists the h1 and the h2s the rendered page shows, in the same order', () => {
    const { container } = render(<LandingPage />)
    const rendered = [...container.querySelectorAll('h1, h2')].map(h => h.textContent)
    const doc = parse(built)
    const fromStatic = [...doc.querySelectorAll(`#${STATIC_ID} h1, #${STATIC_ID} h2`)].map(h => h.textContent)
    expect(fromStatic).toEqual(rendered)
    expect(fromStatic[0]).toBe(HERO.title)
  })

  it('puts each section intro straight after its heading, verbatim', () => {
    const doc = parse(built)
    const { container } = render(<LandingPage />)
    const renderedText = container.textContent ?? ''
    for (const section of doc.querySelectorAll(`#${STATIC_ID} section`)) {
      const intro = section.querySelector('p')?.textContent
      if (intro) expect(renderedText).toContain(intro)
    }
    const hero = [...doc.querySelectorAll(`#${STATIC_ID} header p`)].map(p => p.textContent)
    expect(hero).toEqual([HERO.subhead, HERO.lead])
  })

  it('is plain semantic HTML: header, main, sections, no images, scripts or links', () => {
    const block = parse(built).getElementById(STATIC_ID)!
    expect(block.querySelector('header h1')).not.toBeNull()
    expect(block.querySelectorAll('main > section').length).toBeGreaterThan(5)
    expect(block.querySelector('img, script, a, style, link')).toBeNull()
  })

  it('is inside #root and visually hidden without needing a stylesheet', () => {
    const doc = parse(built)
    expect(doc.getElementById('root')!.firstElementChild!.id).toBe(STATIC_ID)
    const style = doc.getElementById(STATIC_ID)!.getAttribute('style')!
    expect(style).toContain('clip')
    expect(style).not.toContain('display:none')
  })

  it('escapes text', () => {
    const html = landingStaticHtml({ ...LANDING_STATIC, hero: { title: 'A <b> & B', subhead: 's', lead: 'l' } })
    expect(html).toContain('A &lt;b&gt; &amp; B')
  })
})

describe('injecting into index.html', () => {
  it('changes nothing else: the head tags and the guard script are still there, byte for byte', () => {
    const stripped = built
      .replace(/ {2}<script type="application\/ld\+json">[\s\S]*?<\/script>\n {2}/, '')
      .replace(/<div id="root">[\s\S]*?<\/div><\/div>/, '<div id="root"></div>')
    expect(stripped).toBe(rootHtml)
  })

  it('refuses an index.html whose #root or head it cannot find, rather than skip silently', () => {
    expect(() => injectLandingStatic(rootHtml.replace('<div id="root"></div>', '<div id="root"> </div>'), LANDING_STATIC)).toThrow(/exactly once/)
    expect(() => injectLandingStatic(rootHtml.replace(/<meta name="description"[^>]*>/, ''), LANDING_STATIC)).toThrow(/meta description/)
  })

  it('the source index.html itself holds none of it (a switched-off build injects nothing)', () => {
    const doc = parse(rootHtml)
    expect(doc.getElementById('root')!.innerHTML).toBe('')
    expect(doc.querySelector('script[type="application/ld+json"], h1')).toBeNull()
  })
})

describe('the JSON-LD', () => {
  const description = copyMd.split('## Meta')[1].split('\n').find(l => l.startsWith('| meta description |'))!.split('|')[2].trim()
  const graph = JSON.parse(landingJsonLd(LANDING_STATIC, description))['@graph']

  it('parses from the built page as one block', () => {
    const blocks = parse(built).querySelectorAll('script[type="application/ld+json"]')
    expect(blocks).toHaveLength(1)
    expect(JSON.parse(blocks[0].textContent!)['@graph']).toEqual(graph)
  })

  it('states the organization and the app, and nothing it can not back up', () => {
    expect(graph).toEqual([
      { '@type': 'Organization', '@id': 'https://attune.coach/#organization', name: 'Attune', url: 'https://attune.coach/', logo: 'https://attune.coach/attune-mark.svg' },
      {
        '@type': 'WebApplication',
        name: 'Attune',
        url: 'https://attune.coach/',
        description,
        applicationCategory: 'HealthApplication',
        operatingSystem: 'Web',
        publisher: { '@id': 'https://attune.coach/#organization' },
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Attune is free during the beta.' },
      },
    ])
    expect(JSON.stringify(graph)).not.toMatch(/aggregateRating|review|ratingValue/i)
  })

  it('takes its description from the page’s meta description, which is copy.md § Meta', () => {
    expect(description).toMatch(/Free during the beta\.$/)
    expect(parse(rootHtml).querySelector('meta[name="description"]')!.getAttribute('content')).toBe(description)
  })

  it('the offer wording is the landing page’s own FAQ answer, and copy.md says the same', () => {
    expect(copyMd).toContain('Attune is free during the beta.')
  })
})
