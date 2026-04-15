import { useState } from 'react'
import type { HRZone } from '../types'

interface HRZoneEditorProps {
  zones: HRZone[]
  isCustomized: boolean
  maxHR: number
  onSave: (zones: HRZone[]) => void
  onReset: () => void
}

export default function HRZoneEditor({ zones, isCustomized, maxHR, onSave, onReset }: HRZoneEditorProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<HRZone[]>(zones)

  function startEdit() {
    setDraft(zones.map(z => ({ ...z })))
    setEditing(true)
  }

  function handleSave() {
    onSave(draft)
    setEditing(false)
  }

  function updateZone(idx: number, updates: Partial<HRZone>) {
    setDraft(draft.map((z, i) => i === idx ? { ...z, ...updates } : z))
  }

  function updateZoneRange(idx: number, low: string, high: string) {
    updateZone(idx, { hr: `${low}–${high}` })
    // Also update pct if max HR is known
    if (maxHR > 0) {
      const lowNum = parseInt(low)
      const highNum = parseInt(high)
      if (!isNaN(lowNum) && !isNaN(highNum)) {
        const lowPct = Math.round((lowNum / maxHR) * 100)
        const highPct = Math.round((highNum / maxHR) * 100)
        updateZone(idx, { pct: `${lowPct}–${highPct}%` })
      }
    }
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Heart Rate Zones</h3>
          <p className="text-xs text-slate-500">
            Max HR: {maxHR} bpm
            {isCustomized && <span className="ml-1.5 text-teal-600">· customized</span>}
          </p>
        </div>
        <div className="flex gap-2">
          {!editing && (
            <button
              onClick={startEdit}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-teal-100 text-teal-700 hover:bg-teal-200 transition-colors"
            >
              ✏️ Edit
            </button>
          )}
          {isCustomized && !editing && (
            <button
              onClick={onReset}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              title="Revert to plan defaults"
            >
              ↩ Reset
            </button>
          )}
          {editing && (
            <>
              <button
                onClick={() => setEditing(false)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors"
              >
                Save
              </button>
            </>
          )}
        </div>
      </div>

      {/* Zones table */}
      <div className="space-y-1.5">
        {(editing ? draft : zones).map((z, i) => {
          const match = z.hr.match(/(\d+)\s*[–-]\s*(\d+)/)
          const low = match ? match[1] : ''
          const high = match ? match[2] : ''
          return (
            <div key={i} className="bg-slate-50 rounded-lg px-3 py-2">
              {editing ? (
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={z.zone}
                    onChange={e => updateZone(i, { zone: e.target.value })}
                    className="w-full px-2 py-1 text-sm font-medium text-slate-800 border border-slate-200 rounded bg-white"
                    placeholder="Zone name (e.g., Z1 – Recovery)"
                  />
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={low}
                      onChange={e => updateZoneRange(i, e.target.value, high)}
                      className="w-16 px-2 py-1 text-xs border border-slate-200 rounded bg-white"
                      placeholder="low"
                    />
                    <span className="text-xs text-slate-400">–</span>
                    <input
                      type="number"
                      value={high}
                      onChange={e => updateZoneRange(i, low, e.target.value)}
                      className="w-16 px-2 py-1 text-xs border border-slate-200 rounded bg-white"
                      placeholder="high"
                    />
                    <span className="text-xs text-slate-500">bpm</span>
                    <span className="ml-auto text-xs text-slate-400">{z.pct}</span>
                  </div>
                  <input
                    type="text"
                    value={z.desc}
                    onChange={e => updateZone(i, { desc: e.target.value })}
                    className="w-full px-2 py-1 text-xs text-slate-600 border border-slate-200 rounded bg-white"
                    placeholder="Description"
                  />
                </div>
              ) : (
                <div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-semibold text-slate-800">{z.zone}</span>
                    <span className="text-sm font-mono text-teal-700">{z.hr} bpm</span>
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-xs text-slate-500">{z.desc}</span>
                    <span className="text-xs text-slate-400">{z.pct}</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-[10px] text-slate-400">
        Zones control grading, chart overlays, and DayCard targets. Changes are saved per-athlete.
      </p>
    </div>
  )
}
