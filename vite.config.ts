/// <reference types="vitest/config" />
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

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
    viteStaticCopy({
      targets: [
        { src: 'node_modules/cesium/Build/Cesium/Workers', dest: 'cesium' },
        { src: 'node_modules/cesium/Build/Cesium/Assets', dest: 'cesium' },
        { src: 'node_modules/cesium/Build/Cesium/Widgets', dest: 'cesium' },
        { src: 'node_modules/cesium/Build/Cesium/ThirdParty', dest: 'cesium' },
      ],
    }),
  ],
  // Parameterized so the same source ships two builds during the
  // attune.coach cutover: legacy GH Pages project site keeps
  // `/Broken-Arrow-Training/`; the attune.coach build sets `/`.
  base: process.env.VITE_BASE_PATH ?? '/Broken-Arrow-Training/',
  // Free public calculators (G10) — extra HTML entries served pre-auth at
  // /tools/*. PURE CLIENT by locked rule (plan §1-D6): they share the app's
  // engines but make zero API calls, so the MULTI_USER_TODO auth/rate-limit
  // blockers stay out of their critical path.
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
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
