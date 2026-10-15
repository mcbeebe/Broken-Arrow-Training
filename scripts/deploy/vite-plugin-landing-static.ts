/**
 * Puts the landing page's headings and intros into the built root index.html,
 * with Organization / WebApplication JSON-LD, so a crawler that doesn't run
 * the page's script has something to read (initiative 006). Only when the
 * build launches the landing page (VITE_LANDING_ENABLED === 'true', the
 * guard's own test); otherwise the root page is left exactly as it is. Also
 * emits dist/.vite/site-build.json, which check-site-layout.mjs reads to know
 * which kind of build it is checking (deploy.yml deletes dist/.vite).
 */
import { loadEnv } from 'vite'
import type { Plugin } from 'vite'
import { injectLandingStatic } from './landing-static'
import { LANDING_STATIC } from './landing-static-content'

/** Vite plugin: crawlable text and JSON-LD for the root page when the landing page is launched. */
export function landingStatic(): Plugin {
  let enabled = false
  return {
    name: 'attune-landing-static',
    apply: 'build',
    configResolved(config) {
      enabled = loadEnv(config.mode, config.envDir || config.root, 'VITE_').VITE_LANDING_ENABLED === 'true'
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        return enabled && ctx.path === '/index.html' ? injectLandingStatic(html, LANDING_STATIC) : html
      },
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '.vite/site-build.json', source: JSON.stringify({ landingEnabled: enabled }) })
    },
  }
}
