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
 * fallback; and that the root page's guard (its entry's static import
 * closure, JS and CSS) stays under GUARD_BUDGET_BYTES gzipped.
 */
import * as nodeFs from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

/** Gzipped size limit for the root entry's static import closure. */
export const GUARD_BUDGET_BYTES = 10 * 1024

const REQUIRED_FILES = [
  'index.html',
  'app/index.html',
  'tools/fueling.html',
  'tools/predictor.html',
  'tools/heat.html',
  'sw.js',
  'favicon.svg',
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
    if (viteManifest) errors.push(...checkGuardBudget(distDir, viteManifest, fs))
    else errors.push('dist/.vite/manifest.json is not valid JSON')
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

  const seen = new Set()
  const files = []
  const visit = key => {
    if (seen.has(key)) return
    seen.add(key)
    const chunk = viteManifest[key]
    if (!chunk) return
    files.push(chunk.file, ...(chunk.css ?? []))
    for (const dep of chunk.imports ?? []) visit(dep)
  }
  visit('index.html')

  let total = 0
  const errors = []
  for (const file of new Set(files)) {
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
