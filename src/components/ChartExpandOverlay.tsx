import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface ChartExpandOverlayProps {
  children: (expanded: boolean) => React.ReactNode
  title: string
}

export default function ChartExpandOverlay({ children, title }: ChartExpandOverlayProps) {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!expanded) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [expanded])

  return (
    <>
      <div
        onClick={() => setExpanded(true)}
        className="cursor-pointer active:opacity-80 transition-opacity"
        role="button"
        tabIndex={0}
        aria-label={`Expand ${title} chart`}
      >
        {children(false)}
      </div>

      {expanded && createPortal(
        <div
          className="fixed inset-0 flex flex-col"
          style={{ zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.97)' }}
          onClick={() => setExpanded(false)}
        >
          <div className="flex items-center justify-between px-4 pt-3 pb-1 shrink-0">
            <p className="text-white font-semibold text-base">{title}</p>
            <button
              onClick={() => setExpanded(false)}
              className="text-blue-400 hover:text-blue-300 text-base font-semibold px-2 py-1"
            >
              Close
            </button>
          </div>
          <div
            className="flex-1 px-2 pb-4"
            style={{ height: 'calc(100vh - 56px)' }}
            onClick={e => e.stopPropagation()}
          >
            {children(true)}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
