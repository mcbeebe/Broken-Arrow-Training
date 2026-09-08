import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { HeatPlanner } from './HeatPlanner'

// Entry point only — it mounts, it does not define. A file that does both
// cannot be hot-reloaded (react-refresh/only-export-components), which is
// why src/main.tsx has always been shaped this way too.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HeatPlanner />
  </StrictMode>,
)
