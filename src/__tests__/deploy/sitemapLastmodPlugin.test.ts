/**
 * Initiative 006, the half of the sitemap <lastmod> work that touches the
 * environment: what happens without git history, and the checkout setting that
 * supplies it. A deploy that stamps today's date on every page is a green
 * workflow with a wrong sitemap, so both are pinned here.
 */
import { describe, it, expect } from 'vitest'
import { resolveLastmod } from '../../../scripts/deploy/vite-plugin-sitemap-lastmod'
import { SITEMAP_SOURCES } from '../../../scripts/deploy/sitemap-lastmod'
import deployYml from '../../../.github/workflows/deploy.yml?raw'

describe('resolveLastmod', () => {
  it("uses git's date when it has one, in CI or not", () => {
    expect(resolveLastmod('2026-09-30', '2026-10-14', true, '/')).toEqual({ date: '2026-09-30', fellBack: false })
    expect(resolveLastmod('2026-09-30', '2026-10-14', false, '/')).toEqual({ date: '2026-09-30', fellBack: false })
  })

  it('falls back to the build date, and says so, on a local build with no history', () => {
    expect(resolveLastmod(null, '2026-10-14', false, '/')).toEqual({ date: '2026-10-14', fellBack: true })
  })

  it('fails the build in CI when git cannot say, naming the URL and the fix', () => {
    expect(() => resolveLastmod(null, '2026-10-14', true, 'https://attune.coach/tools/heat.html')).toThrow(
      /tools\/heat\.html[\s\S]*fetch-depth: 0/,
    )
  })
})

describe('deploy.yml supplies the history the sitemap needs', () => {
  it('checks out the build-and-deploy job with fetch-depth: 0', () => {
    const job = deployYml.split(/^ {2}build-and-deploy-attune:/m)[1]
    expect(job, 'build-and-deploy-attune job not found').toBeTruthy()
    const checkout = job.split(/^ {2}[a-z][\w-]*:/m)[0].match(/actions\/checkout@[^\n]*\n(?: {8,}[^\n]*\n)*/)?.[0] ?? ''
    expect(checkout).toMatch(/fetch-depth:\s*0\b/)
  })
})

describe('SITEMAP_SOURCES covers what the pages compute with', () => {
  it('dates the predictor and mileage pages by their engines, not only their components', () => {
    expect(SITEMAP_SOURCES['/tools/predictor.html']).toContain('src/engines/planGenerator')
    expect(SITEMAP_SOURCES['/tools/mileage.html']).toContain('src/engines/planGenerator')
    expect(SITEMAP_SOURCES['/tools/mileage.html']).toContain('src/data/methods')
  })

  it("dates the landing page by its stylesheet config and assets too", () => {
    expect(SITEMAP_SOURCES['/']).toEqual(expect.arrayContaining(['tailwind.landing.config.js', 'public/landing', 'public/fonts']))
  })
})
