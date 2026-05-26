/// <reference types="vitest/config" />
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
  base: '/',
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
  },
})
