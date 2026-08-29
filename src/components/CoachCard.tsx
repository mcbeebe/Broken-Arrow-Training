import { useState } from 'react'
import type { CoachRecommendation } from '../types'

interface CoachCardProps {
  recommendation: CoachRecommendation
  onSwap?: (fromIndex: number, toIndex: number) => void
}

export default function CoachCard({ recommendation, onSwap }: CoachCardProps) {
  const [expanded, setExpanded] = useState(true)
  const [swapDone, setSwapDone] = useState(false)

  const rec = recommendation
  const isMorning = rec.timeOfDay === 'morning'

  // Color theme based on action type
  const actionColors = {
    execute: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', icon: '\u2705' },
    modify: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', icon: '\u26A0\uFE0F' },
    skip: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', icon: '\uD83D\uDED1' },
    swap: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', icon: '\uD83D\uDD04' },
    sleep_target: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-800', icon: '\uD83C\uDF19' },
    propose_edit: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-800', icon: '\uD83D\uDCCB' },
  }

  const colors = rec.action ? actionColors[rec.action.type] : (isMorning ? actionColors.execute : actionColors.sleep_target)

  function handleSwap() {
    if (rec.action?.swapFromIndex != null && rec.action?.swapToIndex != null && onSwap) {
      onSwap(rec.action.swapFromIndex, rec.action.swapToIndex)
      setSwapDone(true)
    }
  }

  return (
    <div className={`mx-3 mt-3 rounded-xl ${colors.bg} border ${colors.border} overflow-hidden`}>
      <div
        className="px-4 py-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">{isMorning ? '\u2600\uFE0F' : '\uD83C\uDF19'}</span>
            <span className={`text-sm font-bold ${colors.text}`}>
              {isMorning ? 'Morning Coach' : 'Evening Coach'}
            </span>
          </div>
          <span className="text-xs text-slate-400">{expanded ? '\u25BC' : '\u203A'}</span>
        </div>
        <p className={`text-sm font-semibold ${colors.text} mt-1`}>
          {colors.icon} {rec.headline}
        </p>
      </div>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          <p className={`text-xs ${colors.text} leading-relaxed`}>{rec.body}</p>

          {rec.sleepTarget && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-indigo-600 font-medium">{'\uD83D\uDECF'} Sleep target:</span>
              <span className={`font-bold ${colors.text}`}>{rec.sleepTarget}</span>
            </div>
          )}

          {rec.action && rec.action.type === 'swap' && !swapDone && onSwap && (
            <button
              onClick={(e) => { e.stopPropagation(); handleSwap() }}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              {rec.action.label}
            </button>
          )}

          {swapDone && (
            <p className="text-xs font-medium text-green-700">{'\u2705'} Swap applied! Refresh to see updated plan.</p>
          )}

          {rec.action && rec.action.type !== 'swap' && (
            <div className={`text-xs ${colors.text} opacity-75 italic`}>
              {'\uD83D\uDCA1'} {rec.action.detail}
            </div>
          )}

          {/* Data inputs that drove this recommendation */}
          <div className="flex flex-wrap gap-1 mt-1">
            {rec.inputs.map((input, i) => (
              <span key={i} className="text-[11px] text-slate-500 bg-white/60 rounded px-1.5 py-0.5">
                {input}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
