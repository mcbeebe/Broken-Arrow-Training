/**
 * Loaded with import() by src/landing/main.tsx only when the guard keeps the
 * visitor on `/`, so installed apps and deep links never download the page.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { LandingPage } from './LandingPage'
import { scrollToAnchor } from './scrollToAnchor'
import './landing.css'

/** Render the landing page into `root`, then honour a `#section` in the URL. */
export function mountLanding(root: HTMLElement): void {
  const reactRoot = createRoot(root)
  flushSync(() => {
    reactRoot.render(
      <StrictMode>
        <LandingPage />
      </StrictMode>,
    )
  })
  scrollToAnchor(window.location.hash)
}
