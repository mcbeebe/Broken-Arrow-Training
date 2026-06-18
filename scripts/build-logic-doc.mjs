/**
 * Inlines the deterministic ground-truth JSON into the documentation HTML to
 * produce a single self-contained file (works from file:// with no fetch/CORS).
 *
 *   src:  docs/onboarding-logic-flow.src.html   (editable source, has token)
 *   data: docs/onboarding-ground-truth.json     (from the verification harness)
 *   out:  docs/onboarding-logic-flow.html        (self-contained deliverable)
 *
 * Run:  node scripts/build-logic-doc.mjs   (after the harness has written the JSON)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const srcPath = resolve(here, '../docs/onboarding-logic-flow.src.html')
const dataPath = resolve(here, '../docs/onboarding-ground-truth.json')
const outPath = resolve(here, '../docs/onboarding-logic-flow.html')

const src = readFileSync(srcPath, 'utf8')
const json = readFileSync(dataPath, 'utf8')

const TOKEN = '"__GROUND_TRUTH_JSON__"'
if (!src.includes(TOKEN)) {
  throw new Error(`Token ${TOKEN} not found in ${srcPath}`)
}
// Guard against the JSON closing the inline <script> early.
const safeJson = json.replace(/<\/script>/gi, '<\\/script>')
const out = src.split(TOKEN).join(safeJson)
writeFileSync(outPath, out)
console.log(`Built ${outPath} (${(out.length / 1024).toFixed(0)} KB, data ${(json.length / 1024).toFixed(0)} KB)`)
