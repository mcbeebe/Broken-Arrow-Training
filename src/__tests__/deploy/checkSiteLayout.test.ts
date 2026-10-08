// @vitest-environment node
/**
 * Initiative 003: scripts/deploy/check-site-layout.mjs runs right after
 * `npm run build` in deploy.yml and fails the job when the published layout
 * would break an existing entry into the app. These tests hand it fixture
 * dist/ folders (in memory, so the app's typecheck needs no Node types) and
 * check that it passes a good one and catches each break.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  checkSiteLayout,
  GUARD_BUDGET_BYTES,
  PAGE_BUDGET_BYTES,
  SCREEN_BUDGET_BYTES,
  SCREENS_TOTAL_BUDGET_BYTES,
  type ReadOnlyFs,
} from '../../../scripts/deploy/check-site-layout.mjs'

const DIST = '/dist'
const FONT = '/fonts/schibsted-grotesk-latin-wght-normal.woff2'
const SHARE_TAGS =
  '<meta property="og:image" content="https://attune.coach/og-image.png" />' +
  '<meta property="og:image:width" content="1200" />' +
  '<meta property="og:image:height" content="630" />' +
  '<meta property="og:image:alt" content="A card" />' +
  '<meta name="twitter:image" content="https://attune.coach/og-image.png" />'
const ROOT_HTML =
  SHARE_TAGS +
  '<script data-root-fallback>if (!window.__attuneGuardRan) {}</script>' +
  '<script type="module" src="/assets/main-abc.js"></script>'
/**
 * The shape of a PNG as far as the check reads it: the signature, the IHDR
 * chunk's length, type, width and height, filler, then the IEND chunk.
 */
function png(width: number, height: number): Uint8Array {
  const out = new Uint8Array(24 + 8 + 12)
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  const view = new DataView(out.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  out.set([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82], 32)
  return out
}
const sitemap = (...urls: string[]) =>
  `<?xml version="1.0"?><urlset>${urls.map(u => `<url><loc>${u}</loc></url>`).join('')}</urlset>`

const goodManifest = {
  id: '/?view=today',
  start_url: '/app/?view=today',
  scope: '/',
  shortcuts: [{ url: '/app/?view=today' }, { url: '/app/?view=coach' }],
}

const viteManifest = {
  'index.html': { file: 'assets/main-abc.js', src: 'index.html', isEntry: true, imports: ['_shared.js'] },
  '_shared.js': { file: 'assets/shared-def.js' },
  'app/index.html': { file: 'assets/app-ghi.js', src: 'app/index.html', isEntry: true },
}

/** dist/.vite/module-map.json: chunk file → the source modules in it. */
const moduleMap: Record<string, string[]> = {
  'assets/main-abc.js': ['src/landing/main.tsx', 'src/landing/boot.ts'],
  'assets/shared-def.js': ['src/landing/referral.ts'],
  'assets/app-ghi.js': ['src/main.tsx', 'src/App.tsx', 'src/components/LoginScreen.tsx'],
}

let files: Map<string, Uint8Array>

const fs: ReadOnlyFs = {
  existsSync: p => files.has(p),
  readFileSync: p => {
    const body = files.get(p)
    if (!body) throw new Error(`ENOENT ${p}`)
    return body
  },
}

function write(rel: string, body: string | Uint8Array) {
  files.set(`${DIST}/${rel}`, typeof body === 'string' ? new TextEncoder().encode(body) : body)
}

function remove(rel: string) {
  files.delete(`${DIST}/${rel}`)
}

/** Random bytes don't compress, so their gzip size is about their raw size. */
function incompressible(size: number): Uint8Array {
  const out = new Uint8Array(size)
  for (let i = 0; i < size; i += 65536) crypto.getRandomValues(out.subarray(i, Math.min(size, i + 65536)))
  return out
}

const check = () => checkSiteLayout(DIST, fs)

beforeEach(() => {
  files = new Map()
  write('index.html', ROOT_HTML)
  write('app/index.html', '<link rel="manifest" href="/manifest.webmanifest" />')
  for (const tool of ['fueling', 'predictor', 'heat', 'mileage']) write(`tools/${tool}.html`, '<html></html>')
  write('sw.js', '// sw')
  write('favicon.svg', '<svg/>')
  write('attune-mark.svg', '<svg/>')
  write('fonts/schibsted-grotesk-latin-wght-normal.woff2', 'font')
  write('manifest.webmanifest', JSON.stringify(goodManifest))
  write('robots.txt', 'User-agent: *')
  write('sitemap.xml', sitemap('https://attune.coach/', 'https://attune.coach/tools/heat.html'))
  write('og-image.png', png(1200, 630))
  write('.vite/manifest.json', JSON.stringify(viteManifest))
  write('.vite/module-map.json', JSON.stringify(moduleMap))
  write('assets/main-abc.js', `const FONT_URL = '${FONT}'`)
  write('assets/shared-def.js', 'console.log(2)')
  write('assets/app-ghi.js', incompressible(GUARD_BUDGET_BYTES * 5))
})

describe('checkSiteLayout', () => {
  it('passes a good layout, and the app bundle does not count toward the guard budget', () => {
    expect(check()).toEqual([])
  })

  it.each([
    'index.html',
    'app/index.html',
    'tools/fueling.html',
    'tools/predictor.html',
    'tools/heat.html',
    'tools/mileage.html',
    'sw.js',
    'favicon.svg',
    'attune-mark.svg',
    'fonts/schibsted-grotesk-latin-wght-normal.woff2',
    'manifest.webmanifest',
    'robots.txt',
    'sitemap.xml',
  ])('fails when %s is missing', rel => {
    remove(rel)
    expect(check()).toContain(`missing dist/${rel}`)
  })

  describe('sitemap and the share image', () => {
    it('reads a page URL ending in / as its index.html', () => {
      write('sitemap.xml', sitemap('https://attune.coach/', 'https://attune.coach/tools/'))
      expect(check()).toEqual(['dist/sitemap.xml lists https://attune.coach/tools/, but dist/tools/index.html is missing'])
    })

    it('fails when a sitemap URL is not a built page', () => {
      write('sitemap.xml', sitemap('https://attune.coach/', 'https://attune.coach/tools/pace.html'))
      expect(check()).toEqual(['dist/sitemap.xml lists https://attune.coach/tools/pace.html, but dist/tools/pace.html is missing'])
    })

    it('fails on a URL that is a folder or a file but not a page, even one that exists', () => {
      write('sitemap.xml', sitemap('https://attune.coach/', 'https://attune.coach/tools', 'https://attune.coach/sw.js'))
      expect(check()).toEqual([
        'dist/sitemap.xml lists https://attune.coach/tools, which is not a page',
        'dist/sitemap.xml lists https://attune.coach/sw.js, which is not a page',
      ])
    })

    it.each(['https://attune.coach/app/', 'https://attune.coach/app/index.html'])('fails when the sitemap lists the app (%s), which is noindex', url => {
      write('sitemap.xml', sitemap('https://attune.coach/', url))
      expect(check()).toEqual([`dist/sitemap.xml lists ${url}, but the app is noindex`])
    })

    it('fails on a URL on another origin, and on an empty sitemap', () => {
      write('sitemap.xml', sitemap('https://attune.example/'))
      expect(check()).toEqual(['dist/sitemap.xml lists https://attune.example/, which is not on https://attune.coach'])
      write('sitemap.xml', sitemap())
      expect(check()).toEqual(['dist/sitemap.xml lists no URLs'])
    })

    it.each(['og:image', 'twitter:image'])('fails when %s names a file the build lacks', tag => {
      write('index.html', ROOT_HTML.replace(`"${tag}" content="https://attune.coach/og-image.png"`, `"${tag}" content="https://attune.coach/share.png"`))
      expect(check()).toEqual([`dist/index.html's ${tag} is https://attune.coach/share.png, but dist/share.png is missing`])
    })

    it.each(['og:image', 'twitter:image'])('fails when %s is gone or off the site', tag => {
      const tagged = `"${tag}" content="https://attune.coach/og-image.png"`
      write('index.html', ROOT_HTML.replace(tagged, `"${tag}" content="https://cdn.example/x.png"`))
      expect(check()).toEqual([`dist/index.html's ${tag} is https://cdn.example/x.png, not on https://attune.coach`])
      write('index.html', ROOT_HTML.replace(tagged, `"${tag}-gone" content="x"`))
      expect(check()).toEqual([`dist/index.html has no ${tag}`])
    })

    it('fails when the share image is not the size its tags state', () => {
      write('og-image.png', png(1200, 628))
      expect(check()).toEqual(["dist/og-image.png is 1200×628, but index.html's og:image:width and og:image:height say 1200×630"])
      write('og-image.png', png(2400, 1260))
      write('index.html', ROOT_HTML.replace('content="1200"', 'content="2400"').replace('content="630"', 'content="1260"'))
      expect(check()).toEqual([])
    })

    it('fails when the size tags are gone', () => {
      write('index.html', ROOT_HTML.replace('og:image:height', 'og:image:tall'))
      expect(check()).toEqual(["dist/index.html must state the og:image's size (og:image:width and og:image:height)"])
    })

    it('checks whichever file og:image names, not a fixed name', () => {
      write('index.html', ROOT_HTML.replaceAll('og-image.png', 'share-v2.png'))
      write('share-v2.png', png(1280, 630))
      expect(check()).toEqual(["dist/share-v2.png is 1280×630, but index.html's og:image:width and og:image:height say 1200×630"])
    })

    it('fails when the share image is not a PNG, or is cut short', () => {
      const whole = png(1200, 630)
      write('og-image.png', 'GIF89a' + '.'.repeat(60))
      expect(check()).toEqual(['dist/og-image.png (the og:image) is not a whole PNG'])
      write('og-image.png', whole.slice(0, 40))
      expect(check()).toEqual(['dist/og-image.png (the og:image) is not a whole PNG'])
      write('og-image.png', whole.slice(0, 20))
      expect(check()).toEqual(['dist/og-image.png (the og:image) is not a whole PNG'])
    })
  })

  describe('app screenshots', () => {
    beforeEach(() => {
      write('assets/shared-def.js', "const S = ['/landing/app/today.webp', '/landing/app/coach.webp']")
      write('landing/app/today.webp', new Uint8Array(1000))
      write('landing/app/coach.webp', new Uint8Array(SCREEN_BUDGET_BYTES))
    })

    it('passes when every screenshot the page names ships and is within budget', () => {
      expect(check()).toEqual([])
    })

    it('fails when one the page names is missing', () => {
      remove('landing/app/coach.webp')
      expect(check()).toEqual(['the landing page shows /landing/app/coach.webp, but dist/landing/app/coach.webp is missing'])
    })

    it('fails when one is over budget', () => {
      write('landing/app/today.webp', new Uint8Array(SCREEN_BUDGET_BYTES + 1))
      expect(check().join('\n')).toContain(`dist/landing/app/today.webp is ${SCREEN_BUDGET_BYTES + 1} bytes, over the ${SCREEN_BUDGET_BYTES}-byte screenshot budget`)
    })

    it('checks screenshots in any image format, not just WebP', () => {
      write('assets/shared-def.js', "const S = ['/landing/app/today.png']")
      expect(check()).toEqual(['the landing page shows /landing/app/today.png, but dist/landing/app/today.png is missing'])
    })

    it('fails when they are each within budget but too heavy together', () => {
      const n = Math.ceil(SCREENS_TOTAL_BUDGET_BYTES / SCREEN_BUDGET_BYTES) + 1
      const names = Array.from({ length: n }, (_, i) => `/landing/app/s${i}.webp`)
      write('assets/shared-def.js', JSON.stringify(names))
      for (const n of names) write(n.slice(1), new Uint8Array(SCREEN_BUDGET_BYTES))
      expect(check().join('\n')).toContain(`over the ${SCREENS_TOTAL_BUDGET_BYTES}-byte budget`)
    })

    it('ignores screenshots the app bundle names (only the landing page’s count)', () => {
      write('assets/app-ghi.js', "'/landing/app/nowhere.webp'")
      expect(check()).toEqual([])
    })
  })

  it('fails when the Vite build manifest is missing', () => {
    remove('.vite/manifest.json')
    expect(check().join('\n')).toContain('.vite/manifest.json')
  })

  it('fails when the Vite build manifest is not JSON', () => {
    write('.vite/manifest.json', '{')
    expect(check().join('\n')).toContain('.vite/manifest.json is not valid JSON')
  })

  it.each([
    ['id', { ...goodManifest, id: '/app/?view=today' }],
    ['start_url', { ...goodManifest, start_url: '/?view=today' }],
    ['scope', { ...goodManifest, scope: '/app/' }],
    ['shortcut', { ...goodManifest, shortcuts: [{ url: '/app/?view=today' }, { url: './?view=coach' }] }],
    ['shortcut', { ...goodManifest, shortcuts: [{ url: '/apple?view=today' }] }],
  ])('fails on a wrong manifest %s', (field, manifest) => {
    write('manifest.webmanifest', JSON.stringify(manifest))
    const errors = check()
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain(`manifest ${field}`)
  })

  it('fails when the manifest is not JSON', () => {
    write('manifest.webmanifest', '{')
    expect(check()).toEqual(['dist/manifest.webmanifest is not valid JSON'])
  })

  it('fails when the app page does not link the manifest', () => {
    write('app/index.html', '<html></html>')
    expect(check()).toEqual(['dist/app/index.html must link the web app manifest'])
  })

  it('fails when the root page links the manifest', () => {
    write('index.html', ROOT_HTML + '<link rel=manifest href="/manifest.webmanifest">')
    expect(check().join('\n')).toContain('dist/index.html must not link the web app manifest')
  })

  it('fails when the root page loses its inline fallback', () => {
    write('index.html', SHARE_TAGS + '<script type="module" src="/assets/main-abc.js"></script>')
    expect(check()).toEqual([
      'dist/index.html lost its inline fallback (data-root-fallback) that forwards when the guard fails to load',
    ])
  })

  it('counts CSS in the guard closure toward the budget', () => {
    write(
      '.vite/manifest.json',
      JSON.stringify({
        ...viteManifest,
        'index.html': { ...viteManifest['index.html'], css: ['assets/landing.css'] },
      }),
    )
    write('assets/landing.css', incompressible(GUARD_BUDGET_BYTES + 1024))
    expect(check().join('\n')).toMatch(/assets\/landing\.css/)
  })

  it('fails when the root entry is missing from the build manifest', () => {
    write('.vite/manifest.json', JSON.stringify({ 'app/index.html': viteManifest['app/index.html'] }))
    expect(check()).toEqual(['dist/.vite/manifest.json has no index.html entry'])
  })

  it('fails when a chunk in the guard closure is missing', () => {
    remove('assets/shared-def.js')
    expect(check()).toEqual(['root entry chunk dist/assets/shared-def.js is missing'])
  })

  it('fails when the guard closure is over budget, counting static imports', () => {
    write('assets/shared-def.js', incompressible(GUARD_BUDGET_BYTES + 1024))
    expect(check().join('\n')).toMatch(/over the 10240-byte budget/)
  })

  it('ignores dynamic imports in the guard budget', () => {
    write(
      '.vite/manifest.json',
      JSON.stringify({
        ...viteManifest,
        'index.html': { ...viteManifest['index.html'], dynamicImports: ['src/landing/LandingPage.tsx'] },
        'src/landing/LandingPage.tsx': { file: 'assets/landing-big.js' },
      }),
    )
    write('.vite/module-map.json', JSON.stringify({ ...moduleMap, 'assets/landing-big.js': ['src/landing/LandingPage.tsx'] }))
    write('assets/landing-big.js', incompressible(GUARD_BUDGET_BYTES * 3))
    expect(check()).toEqual([])
  })

  it('counts a shared import once even when it is reached twice', () => {
    write(
      '.vite/manifest.json',
      JSON.stringify({
        ...viteManifest,
        'index.html': { ...viteManifest['index.html'], imports: ['_shared.js', '_other.js'] },
        '_other.js': { file: 'assets/other.js', imports: ['_shared.js'] },
      }),
    )
    write('assets/other.js', 'x')
    write('.vite/module-map.json', JSON.stringify({ ...moduleMap, 'assets/other.js': ['src/landing/other.ts'] }))
    write('assets/shared-def.js', incompressible(Math.floor(GUARD_BUDGET_BYTES * 0.6)))
    expect(check()).toEqual([])
  })

  it('sets the guard budget at 10 KB gzipped', () => {
    expect(GUARD_BUDGET_BYTES).toBe(10 * 1024)
  })
})

/** CSS that loads the landing font, padded with `body`. */
function withFont(body: Uint8Array): Uint8Array {
  const head = new TextEncoder().encode(`@font-face{src:url(${FONT})}`)
  const out = new Uint8Array(head.length + body.length)
  out.set(head)
  out.set(body, head.length)
  return out
}

/** A landing page: guard entry → dynamic LandingPage chunk → shared React chunk + CSS. */
function landingBuild(sizes: { page?: number; react?: number; css?: number } = {}) {
  write(
    '.vite/manifest.json',
    JSON.stringify({
      ...viteManifest,
      'index.html': { ...viteManifest['index.html'], dynamicImports: ['src/landing/mount.tsx'] },
      'src/landing/mount.tsx': {
        file: 'assets/mount-1.js',
        imports: ['_react.js'],
        css: ['assets/mount-1.css'],
        dynamicImports: ['src/landing/lazy.tsx'],
      },
      'src/landing/lazy.tsx': { file: 'assets/lazy-2.js', imports: ['_react.js'] },
      '_react.js': { file: 'assets/react-3.js' },
      'app/index.html': { ...viteManifest['app/index.html'], imports: ['_react.js'] },
    }),
  )
  write(
    '.vite/module-map.json',
    JSON.stringify({
      ...moduleMap,
      'assets/mount-1.js': ['src/landing/mount.tsx', 'src/landing/LandingPage.tsx'],
      'assets/lazy-2.js': ['src/landing/lazy.tsx'],
      'assets/react-3.js': ['node_modules/react/index.js', 'node_modules/react-dom/client.js'],
    }),
  )
  write('assets/mount-1.js', incompressible(sizes.page ?? 1024))
  write('assets/lazy-2.js', 'x')
  write('assets/react-3.js', incompressible(sizes.react ?? 1024))
  write('assets/mount-1.css', withFont(incompressible(sizes.css ?? 512)))
}

describe('the whole landing page budget', () => {
  it('sets it at 90 KB gzipped', () => {
    expect(PAGE_BUDGET_BYTES).toBe(90 * 1024)
  })

  it('passes a landing page under budget', () => {
    landingBuild()
    expect(check()).toEqual([])
  })

  it('counts the shared React chunk', () => {
    landingBuild({ page: 30 * 1024, react: 62 * 1024 })
    expect(check().join('\n')).toMatch(/landing page is \d+ bytes gzipped, over the 92160-byte budget/)
  })

  it('counts the landing CSS', () => {
    landingBuild({ page: 50 * 1024, css: 42 * 1024 })
    expect(check().join('\n')).toMatch(/over the 92160-byte budget/)
  })

  it('counts nested dynamic imports', () => {
    landingBuild()
    write('assets/lazy-2.js', incompressible(PAGE_BUDGET_BYTES))
    expect(check().join('\n')).toMatch(/over the 92160-byte budget/)
  })

  it('does not count the app’s own chunks', () => {
    landingBuild()
    write('assets/app-ghi.js', incompressible(PAGE_BUDGET_BYTES * 3))
    expect(check()).toEqual([])
  })
})

describe('no app code in the landing page', () => {
  it('fails when the module map is missing', () => {
    remove('.vite/module-map.json')
    expect(check().join('\n')).toContain('missing dist/.vite/module-map.json')
  })

  it('fails when the module map is not JSON', () => {
    write('.vite/module-map.json', '{')
    expect(check().join('\n')).toContain('dist/.vite/module-map.json is not valid JSON')
  })

  it('fails when a landing chunk is missing from the module map', () => {
    landingBuild()
    const { ['assets/lazy-2.js']: _gone, ...rest } = JSON.parse(new TextDecoder().decode(files.get(`${DIST}/.vite/module-map.json`)!))
    write('.vite/module-map.json', JSON.stringify(rest))
    expect(check().join('\n')).toContain('assets/lazy-2.js has no entry in dist/.vite/module-map.json')
  })

  it.each([
    'src/App.tsx',
    'src/components/LoginScreen.tsx',
    'src/engines/hyrox/spec.ts',
    'src/hooks/useOnboarding.ts',
    'src/utils/coachApi.ts',
    'src/data/methods/index.ts',
    'src/types/index.ts',
    'src/palettes.ts',
    'src/schema/plan.ts',
    'src/tools/fueling-page.tsx',
    'src/main.tsx',
    'node_modules/recharts/es6/index.js',
    'node_modules/lodash/index.js',
    'node_modules/cesium/Source/Cesium.js',
    '\0commonjsHelpers.js?commonjs-proxy&node_modules/recharts/lib/index.js',
  ])('fails when the landing page ships %s', mod => {
    landingBuild()
    write(
      '.vite/module-map.json',
      JSON.stringify({ ...JSON.parse(new TextDecoder().decode(files.get(`${DIST}/.vite/module-map.json`)!)), 'assets/react-3.js': ['node_modules/react/index.js', mod] }),
    )
    const errors = check().join('\n')
    expect(errors).toContain('assets/react-3.js')
    expect(errors).toContain(`outside its allowlist: dist/assets/react-3.js contains ${mod}`)
  })

  it('also checks the guard’s own chunks', () => {
    write('.vite/module-map.json', JSON.stringify({ ...moduleMap, 'assets/shared-def.js': ['src/utils/auth.ts'] }))
    expect(check().join('\n')).toContain('outside its allowlist')
  })

  it.each(['index.html', '\0vite/preload-helper.js', '\0vite/modulepreload-polyfill.js', '\0rolldown/runtime.js', 'node_modules/scheduler/index.js'])(
    'allows %j',
    mod => {
      landingBuild()
      write(
        '.vite/module-map.json',
        JSON.stringify({ ...JSON.parse(new TextDecoder().decode(files.get(`${DIST}/.vite/module-map.json`)!)), 'assets/lazy-2.js': [mod] }),
      )
      expect(check()).toEqual([])
    },
  )

  it('allows the landing page’s own modules and React', () => {
    landingBuild()
    expect(check()).toEqual([])
  })
})

describe('the guard stays small', () => {
  it('fails when the guard ships content.ts (all the page copy)', () => {
    write('.vite/module-map.json', JSON.stringify({ ...moduleMap, 'assets/main-abc.js': ['src/landing/main.tsx', 'src/landing/content.ts'] }))
    expect(check().join('\n')).toContain('the root page guard ships src/landing/content.ts')
  })

  it('allows content.ts in the dynamic landing chunk', () => {
    landingBuild()
    const map = JSON.parse(new TextDecoder().decode(files.get(`${DIST}/.vite/module-map.json`)!))
    write('.vite/module-map.json', JSON.stringify({ ...map, 'assets/mount-1.js': ['src/landing/mount.tsx', 'src/landing/content.ts'] }))
    expect(check()).toEqual([])
  })
})

describe('the font is wired end to end', () => {
  it('fails when the landing CSS stops loading the font', () => {
    landingBuild()
    write('assets/mount-1.css', '@font-face{src:url(/fonts/other.woff2)}')
    expect(check().join('\n')).toContain(`the landing CSS no longer loads ${FONT}`)
  })

  it('fails when the guard stops preloading it', () => {
    landingBuild()
    write('assets/main-abc.js', 'console.log(1)')
    expect(check().join('\n')).toContain(`the root page guard no longer preloads ${FONT}`)
  })

  it('is not checked before there is a landing page', () => {
    write('assets/main-abc.js', 'console.log(1)')
    expect(check()).toEqual([])
  })
})
