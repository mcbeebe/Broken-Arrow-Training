import { useEffect, useState } from 'react'

interface Props {
  unreadCount: number
  onOpen: () => void
  onDismiss: () => void
}

/**
 * Dismissable toast that slides in when the coach has unread proactive
 * turns and the user hasn't yet acknowledged this session.
 */
export default function CoachPingToast({ unreadCount, onOpen, onDismiss }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (unreadCount > 0 && !dismissed) {
      const t = setTimeout(() => setVisible(true), 500)
      return () => clearTimeout(t)
    } else {
      setVisible(false)
    }
  }, [unreadCount, dismissed])

  if (unreadCount === 0 || dismissed || !visible) return null

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-50 max-w-sm w-[92%] bg-amber-50 border border-amber-200 rounded-xl shadow-lg px-3 py-2.5 flex items-center gap-3 animate-in fade-in slide-in-from-top-4"
      style={{ top: 'max(0.75rem, calc(env(safe-area-inset-top) + 0.25rem))' }}
      role="status"
    >
      <span className="text-lg">🤖</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-amber-900">
          Coach has {unreadCount} new {unreadCount === 1 ? 'note' : 'notes'}
        </p>
        <p className="text-[11px] text-amber-700/80">
          Tap to read — or dismiss for now.
        </p>
      </div>
      <button
        onClick={() => {
          onOpen()
          setDismissed(true)
        }}
        className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-amber-600 text-white hover:bg-amber-700 transition-colors"
      >
        Open
      </button>
      <button
        onClick={() => {
          setDismissed(true)
          onDismiss()
        }}
        className="text-amber-700/60 hover:text-amber-900 text-base leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
