#!/usr/bin/env node
/**
 * Initiative 003: fail the build when the published layout would break an
 * existing entry into the app. Run right after `npm run build`:
 *
 *   node scripts/deploy/check-site-layout.mjs [distDir]
 *
 * Checks that the root page, the app at /app/, the tools, the service worker
 * and the manifest are where installs, notifications and links expect them;
 * that the manifest keeps existing installs' identity and points into /app/;
 * that only the app links the manifest; that the root page keeps its inline
 * fallback; that the root page's guard (its entry's static import closure,
 * JS and CSS) stays under GUARD_BUDGET_BYTES gzipped; that the whole landing
 * page (guard + dynamic imports + the shared React chunk + CSS) stays under
 * PAGE_BUDGET_BYTES; and, from dist/.vite/module-map.json (written by
 * scripts/deploy/vite-plugin-module-map.ts), that every chunk the landing
 * page loads holds only its own code, React and the bundler's runtime; and
 * that every app screenshot the landing page references exists and stays under
 * SCREEN_BUDGET_BYTES, and all of them under SCREENS_TOTAL_BUDGET_BYTES.
 */
import * as nodeFs from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

/** Gzipped size limit for the root entry's static import closure. */
export const GUARD_BUDGET_BYTES = 10 * 1024

/** Gzipped size limit for everything the landing page loads (JS + CSS). */
export const PAGE_BUDGET_BYTES = 90 * 1024

/** Size limit for each app screenshot the landing page shows (already-compressed images). */
export const SCREEN_BUDGET_BYTES = 80 * 1024

/** Size limit for all of them together: a phone that scrolls the row pays for every one. */
export const SCREENS_TOTAL_BUDGET_BYTES = 240 * 1024

/** How the landing page's code names its screenshots (content.ts SCREENS), in any image format. */
const SCREEN_URL = /\/landing\/app\/[\w-]+\.(?:webp|avif|png|jpe?g|gif|svg)/g

/**
 * The only modules the landing page may ship (design-spec.md § Files): its own
 * code, React, and the bundler's runtime helpers. An allowlist, so any app
 * module (src/types, src/palettes.ts, anything added later) fails the build,
 * and so does an unexpected helper; add one here only after checking what it
 * is. Module ids are root-relative (vite-plugin-module-map.ts); virtual ones
 * start with \0.
 */
const ALLOWED_IN_LANDING = [
  /^index\.html$/,
  /^src\/landing\/[^?]+$/,
  /^node_modules\/(react|react-dom|scheduler)\/[^?]+$/,
  /^\0?(vite\/(modulepreload-polyfill|preload-helper)|rolldown\/runtime)\.js$/,
]

/** All the page's copy; the guard needs only SECTION_IDS (src/landing/sections.ts). */
const NOT_IN_GUARD = /(^|\/)src\/landing\/content\.ts$/

/** The landing page's self-hosted font: required, preloaded by the guard, used by the landing CSS. */
const LANDING_FONT = 'fonts/schibsted-grotesk-latin-wght-normal.woff2'

const REQUIRED_FILES = [
  'index.html',
  'app/index.html',
  'tools/fueling.html',
  'tools/predictor.html',
  'tools/heat.html',
  'tools/mileage.html',
  'sw.js',
  'favicon.svg',
  'attune-mark.svg',
  LANDING_FONT,
  'manifest.webmanifest',
]

const MANIFEST_LINK = /<link\b[^>]*\brel=["']?manifest\b/i

/**
 * Check a built site.
 *
 * @param {string} distDir The Vite output directory.
 * @param {{ existsSync(path: string): boolean, readFileSync(path: string): Uint8Array }} [fs]
 *   Read-only filesystem; defaults to node:fs (tests pass an in-memory one).
 * @returns {string[]} One message per problem; empty when the layout is good.
 */
export function checkSiteLayout(distDir, fs = nodeFs) {
  const errors = []
  const path = rel => join(distDir, rel)
  const existsSync = p => fs.existsSync(p)
  const readFileSync = p => new TextDecoder().decode(fs.readFileSync(p))

  for (const rel of REQUIRED_FILES) {
    if (!existsSync(path(rel))) errors.push(`missing dist/${rel}`)
  }

  if (existsSync(path('manifest.webmanifest'))) {
    errors.push(...checkWebManifest(readFileSync(path('manifest.webmanifest'))))
  }

  if (existsSync(path('app/index.html')) && !MANIFEST_LINK.test(readFileSync(path('app/index.html')))) {
    errors.push('dist/app/index.html must link the web app manifest')
  }
  if (existsSync(path('index.html'))) {
    const rootHtml = readFileSync(path('index.html'))
    if (MANIFEST_LINK.test(rootHtml)) {
      errors.push('dist/index.html must not link the web app manifest (only the app is installable)')
    }
    if (!rootHtml.includes('data-root-fallback') || !rootHtml.includes('__attuneGuardRan')) {
      errors.push('dist/index.html lost its inline fallback (data-root-fallback) that forwards when the guard fails to load')
    }
  }

  const viteManifestPath = path('.vite/manifest.json')
  if (!existsSync(viteManifestPath)) {
    errors.push('missing dist/.vite/manifest.json (is build.manifest on in vite.config.ts?)')
  } else {
    let viteManifest
    try {
      viteManifest = JSON.parse(readFileSync(viteManifestPath))
    } catch {
      viteManifest = null
    }
    if (viteManifest) {
      errors.push(...checkGuardBudget(distDir, viteManifest, fs))
      if (viteManifest['index.html']?.isEntry) {
        errors.push(...checkPageBudget(distDir, viteManifest, fs))
        errors.push(...checkModuleMap(distDir, viteManifest, readFileSync, existsSync))
        errors.push(...checkFontWiring(distDir, viteManifest, readFileSync, existsSync))
        errors.push(...checkScreens(distDir, viteManifest, fs))
      }
    } else errors.push('dist/.vite/manifest.json is not valid JSON')
  }

  return errors
}

/**
 * Every chunk and stylesheet reachable from the root entry.
 *
 * @param {Record<string, any>} viteManifest
 * @param {boolean} dynamic Follow dynamic imports too (the whole page), or not (the guard).
 * @returns {{ js: string[], css: string[] }}
 */
function closure(viteManifest, dynamic) {
  const seen = new Set()
  const js = []
  const css = []
  const visit = key => {
    if (seen.has(key)) return
    seen.add(key)
    const chunk = viteManifest[key]
    if (!chunk) return
    js.push(chunk.file)
    css.push(...(chunk.css ?? []))
    for (const dep of chunk.imports ?? []) visit(dep)
    if (dynamic) for (const dep of chunk.dynamicImports ?? []) visit(dep)
  }
  visit('index.html')
  return { js: [...new Set(js)], css: [...new Set(css)] }
}

/**
 * The guard preloads the font and the landing CSS's @font-face loads it. If
 * the two drift, the preload fetches a file nothing uses and the real one
 * loads late. Only checked once the page has CSS (i.e. there is a page).
 */
function checkFontWiring(distDir, viteManifest, readFileSync, existsSync) {
  const url = `/${LANDING_FONT}`
  const read = file => (existsSync(join(distDir, file)) ? readFileSync(join(distDir, file)) : '')
  const { css } = closure(viteManifest, true)
  if (!css.length) return []
  const errors = []
  if (!css.some(file => read(file).includes(url))) {
    errors.push(`the landing CSS no longer loads ${url} (${css.join(', ')})`)
  }
  if (!closure(viteManifest, false).js.some(file => read(file).includes(url))) {
    errors.push(`the root page guard no longer preloads ${url}, the font the landing CSS uses`)
  }
  return errors
}

/**
 * Every screenshot the landing page's chunks name must ship, and each stays
 * small: they load lazily, but a phone still pays for every one it scrolls to.
 */
function checkScreens(distDir, viteManifest, fs) {
  const { js } = closure(viteManifest, true)
  const urls = new Set()
  for (const file of js) {
    const full = join(distDir, file)
    if (!fs.existsSync(full)) continue
    for (const m of new TextDecoder().decode(fs.readFileSync(full)).matchAll(SCREEN_URL)) urls.add(m[0])
  }
  const errors = []
  let total = 0
  for (const url of urls) {
    const full = join(distDir, url.slice(1))
    if (!fs.existsSync(full)) {
      errors.push(`the landing page shows ${url}, but dist${url} is missing`)
      continue
    }
    const size = fs.readFileSync(full).length
    total += size
    if (size > SCREEN_BUDGET_BYTES) errors.push(`dist${url} is ${size} bytes, over the ${SCREEN_BUDGET_BYTES}-byte screenshot budget`)
  }
  if (total > SCREENS_TOTAL_BUDGET_BYTES) {
    errors.push(`the landing page's screenshots total ${total} bytes, over the ${SCREENS_TOTAL_BUDGET_BYTES}-byte budget`)
  }
  return errors
}

function checkPageBudget(distDir, viteManifest, fs) {
  const { js, css } = closure(viteManifest, true)
  let total = 0
  for (const file of [...js, ...css]) {
    const full = join(distDir, file)
    // A missing guard chunk is reported by checkGuardBudget; don't repeat it.
    if (fs.existsSync(full)) total += gzipSync(fs.readFileSync(full)).length
  }
  if (total <= PAGE_BUDGET_BYTES) return []
  return [
    `landing page is ${total} bytes gzipped, over the ${PAGE_BUDGET_BYTES}-byte budget ` +
      `(${[...js, ...css].join(', ')}).`,
  ]
}

function checkModuleMap(distDir, viteManifest, readFileSync, existsSync) {
  const mapPath = join(distDir, '.vite/module-map.json')
  if (!existsSync(mapPath)) {
    return ['missing dist/.vite/module-map.json (is moduleMap() from scripts/deploy/vite-plugin-module-map.ts in vite.config.ts?)']
  }
  let map
  try {
    map = JSON.parse(readFileSync(mapPath))
  } catch {
    return ['dist/.vite/module-map.json is not valid JSON']
  }
  const errors = []
  const guard = new Set(closure(viteManifest, false).js)
  for (const file of closure(viteManifest, true).js) {
    const modules = map[file]
    if (!Array.isArray(modules)) {
      errors.push(`dist/${file} has no entry in dist/.vite/module-map.json, so its contents can't be checked`)
      continue
    }
    for (const mod of modules) {
      if (!ALLOWED_IN_LANDING.some(re => re.test(mod))) {
        errors.push(
          `the landing page ships a module outside its allowlist: dist/${file} contains ${mod} ` +
            '(allowed: src/landing/, react, react-dom, scheduler, the Vite/Rolldown runtime)',
        )
      }
      if (guard.has(file) && NOT_IN_GUARD.test(mod)) {
        errors.push(`the root page guard ships ${mod} (dist/${file}); import SECTION_IDS from src/landing/sections.ts instead`)
      }
    }
  }
  return errors
}

function checkWebManifest(raw) {
  let manifest
  try {
    manifest = JSON.parse(raw)
  } catch {
    return ['dist/manifest.webmanifest is not valid JSON']
  }
  const errors = []
  if (manifest.id !== '/?view=today') {
    errors.push(`manifest id must be "/?view=today" (existing installs' identity), got ${JSON.stringify(manifest.id)}`)
  }
  if (!isAppUrl(manifest.start_url)) {
    errors.push(`manifest start_url must start with /app/, got ${JSON.stringify(manifest.start_url)}`)
  }
  if (manifest.scope !== '/') {
    errors.push(`manifest scope must be "/", got ${JSON.stringify(manifest.scope)}`)
  }
  for (const shortcut of manifest.shortcuts ?? []) {
    if (!isAppUrl(shortcut?.url)) {
      errors.push(`manifest shortcut url must start with /app/, got ${JSON.stringify(shortcut?.url)}`)
    }
  }
  return errors
}

function isAppUrl(url) {
  return typeof url === 'string' && url.startsWith('/app/')
}

function checkGuardBudget(distDir, viteManifest, fs) {
  const entry = viteManifest['index.html']
  if (!entry?.isEntry) return ['dist/.vite/manifest.json has no index.html entry']

  const { js, css } = closure(viteManifest, false)
  const files = [...js, ...css]

  let total = 0
  const errors = []
  for (const file of files) {
    const full = join(distDir, file)
    if (!fs.existsSync(full)) {
      errors.push(`root entry chunk dist/${file} is missing`)
      continue
    }
    total += gzipSync(fs.readFileSync(full)).length
  }
  if (total > GUARD_BUDGET_BYTES) {
    errors.push(
      `root page guard is ${total} bytes gzipped, over the ${GUARD_BUDGET_BYTES}-byte budget ` +
        `(${files.join(', ')}). Load the landing page with import(), not a static import.`,
    )
  }
  return errors
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const distDir = resolve(process.argv[2] ?? 'dist')
  const errors = checkSiteLayout(distDir)
  if (errors.length) {
    for (const e of errors) console.error(`✗ ${e}`)
    process.exit(1)
  }
  console.log(`✓ site layout OK (${distDir})`)
}
