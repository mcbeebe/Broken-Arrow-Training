import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { MileagePlanner } from './MileagePlanner'

// Entry point only — it mounts, it does not define (see predictor-page.tsx).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MileagePlanner />
  </StrictMode>,
)
