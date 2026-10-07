/// <reference types="vitest/config" />
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { moduleMap } from './scripts/deploy/vite-plugin-module-map'

/**
 * Cesium needs its Workers/, Assets/, Widgets/, ThirdParty/ folders
 * served at runtime from `<base>/cesium/`. We don't use
 * `vite-plugin-cesium` because it injects an eager `<script>` tag
 * into index.html, defeating the lazy-load strategy for the 3D
 * scene chunk. Instead we just copy the runtime assets and let the
 * lazy `import('cesium')` in Course3DScene.tsx pull the JS as its
 * own chunk on first use.
 */
export default defineConfig({
  plugins: [
    react(),
    // dist/.vite/module-map.json for check-site-layout.mjs (initiative 003).
    moduleMap(),
    viteStaticCopy({
      targets: [
        { src: 'node_modules/cesium/Build/Cesium/Workers', dest: 'cesium' },
        { src: 'node_modules/cesium/Build/Cesium/Assets', dest: 'cesium' },
        { src: 'node_modules/cesium/Build/Cesium/Widgets', dest: 'cesium' },
        { src: 'node_modules/cesium/Build/Cesium/ThirdParty', dest: 'cesium' },
      ],
    }),
  ],
  // attune.coach serves from the root. The legacy GH Pages project site
  // (`/Broken-Arrow-Training/`) is now only the static airlock, so nothing
  // builds with that prefix. Keep it '/': the guard, sw.js, Strava redirect
  // and migration receiver all hard-code `/app/` (initiative 003).
  base: process.env.VITE_BASE_PATH ?? '/',
  // Free public calculators (G10) — extra HTML entries served pre-auth at
  // /tools/*. PURE CLIENT by locked rule (plan §1-D6): they share the app's
  // engines but make zero API calls, so the MULTI_USER_TODO auth/rate-limit
  // blockers stay out of their critical path.
  //
  // Initiative 003: `index.html` is the root page (landing + legacy entry
  // guard) and the app is its own entry at `app/index.html`, so `/sw.js`,
  // `/version.json` and the tools stay at the root. The build manifest feeds
  // scripts/deploy/check-site-layout.mjs.
  build: {
    manifest: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app/index.html'),
        'tools-fueling': resolve(__dirname, 'tools/fueling.html'),
        'tools-predictor': resolve(__dirname, 'tools/predictor.html'),
        'tools-heat': resolve(__dirname, 'tools/heat.html'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
  },
})
