/**
 * Writes dist/.vite/module-map.json: each output chunk's file name → the
 * source modules bundled into it (root-relative). Vite's build manifest can't
 * say what a shared chunk contains, and the landing page shares React's chunk
 * with the app, so scripts/deploy/check-site-layout.mjs reads this map to
 * prove no app code, recharts or cesium reaches the landing page
 * (initiative 003). deploy.yml deletes dist/.vite before publishing.
 */
import { isAbsolute, relative } from 'node:path'
import type { Plugin } from 'vite'

/** Vite plugin: emit dist/.vite/module-map.json on build. */
export function moduleMap(): Plugin {
  let root = process.cwd()
  const rel = (id: string) => {
    // Virtual ids (\0-prefixed) and query suffixes stay as they are, minus the root.
    const [path, query] = id.split('?')
    const clean = isAbsolute(path) ? relative(root, path).split('\\').join('/') : path
    return query === undefined ? clean : `${clean}?${query}`
  }
  return {
    name: 'attune-module-map',
    apply: 'build',
    configResolved(config) {
      root = config.root
    },
    generateBundle(_options, bundle) {
      const map: Record<string, string[]> = {}
      for (const [file, output] of Object.entries(bundle)) {
        if (output.type === 'chunk') map[file] = output.moduleIds.map(rel)
      }
      this.emitFile({ type: 'asset', fileName: '.vite/module-map.json', source: JSON.stringify(map, null, 1) })
    },
  }
}
