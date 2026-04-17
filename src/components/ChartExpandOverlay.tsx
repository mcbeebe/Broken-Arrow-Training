import { useState, useEffect } from 'react'

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

      {expanded && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex flex-col"
          onClick={() => setExpanded(false)}
        >
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <p className="text-white font-semibold text-base">{title}</p>
            <button
              onClick={() => setExpanded(false)}
              className="text-white/70 hover:text-white text-lg font-bold px-2"
            >
              Close
            </button>
          </div>
          <div
            className="flex-1 px-2 pb-6 min-h-0"
            onClick={e => e.stopPropagation()}
          >
            {children(true)}
          </div>
        </div>
      )}
    </>
  )
}
