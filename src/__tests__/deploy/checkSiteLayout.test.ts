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
  type ReadOnlyFs,
} from '../../../scripts/deploy/check-site-layout.mjs'

const DIST = '/dist'

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
  write('index.html', '<script type="module" src="/assets/main-abc.js"></script>')
  write('app/index.html', '<link rel="manifest" href="/manifest.webmanifest" />')
  for (const tool of ['fueling', 'predictor', 'heat']) write(`tools/${tool}.html`, '<html></html>')
  write('sw.js', '// sw')
  write('favicon.svg', '<svg/>')
  write('manifest.webmanifest', JSON.stringify(goodManifest))
  write('.vite/manifest.json', JSON.stringify(viteManifest))
  write('assets/main-abc.js', 'console.log(1)')
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
    'sw.js',
    'favicon.svg',
    'manifest.webmanifest',
  ])('fails when %s is missing', rel => {
    remove(rel)
    expect(check()).toContain(`missing dist/${rel}`)
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
    write('index.html', '<link rel=manifest href="/manifest.webmanifest">')
    expect(check().join('\n')).toContain('dist/index.html must not link the web app manifest')
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
    write('assets/shared-def.js', incompressible(Math.floor(GUARD_BUDGET_BYTES * 0.6)))
    expect(check()).toEqual([])
  })

  it('sets the guard budget at 10 KB gzipped', () => {
    expect(GUARD_BUDGET_BYTES).toBe(10 * 1024)
  })
})
