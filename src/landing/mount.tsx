/**
 * Loaded with import() by src/landing/main.tsx only when the guard keeps the
 * visitor on `/`, so installed apps and deep links never download the page.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LandingPage } from './LandingPage'
import './landing.css'

/** Render the landing page into `root`. */
export function mountLanding(root: HTMLElement): void {
  createRoot(root).render(
    <StrictMode>
      <LandingPage />
    </StrictMode>,
  )
}
