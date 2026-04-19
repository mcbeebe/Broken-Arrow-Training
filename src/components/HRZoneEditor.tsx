import { useState } from 'react'
import type { HRZone } from '../types'

interface HRZoneEditorProps {
  zones: HRZone[]
  isCustomized: boolean
  maxHR: number
  maxHRCustomized: boolean
  onSave: (zones: HRZone[], maxHR: number) => void
  onReset: () => void
}

function parsePctRange(pct: string): { low: number; high: number } | null {
  const m = pct.match(/(\d+)\s*[–-]\s*(\d+)/)
  if (!m) return null
  return { low: parseInt(m[1], 10), high: parseInt(m[2], 10) }
}

function parseBpmRange(hr: string): { low: string; high: string } {
  const m = hr.match(/(\d+)\s*[–-]\s*(\d+)/)
  return { low: m ? m[1] : '', high: m ? m[2] : '' }
}

export default function HRZoneEditor({
  zones,
  isCustomized,
  maxHR,
  maxHRCustomized,
  onSave,
  onReset,
}: HRZoneEditorProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<HRZone[]>(zones)
  const [draftMaxHR, setDraftMaxHR] = useState<number>(maxHR)

  function startEdit() {
    setDraft(zones.map(z => ({ ...z })))
    setDraftMaxHR(maxHR)
    setEditing(true)
  }

  function handleSave() {
    onSave(draft, draftMaxHR)
    setEditing(false)
  }

  function updateZone(idx: number, updates: Partial<HRZone>) {
    setDraft(prev => prev.map((z, i) => i === idx ? { ...z, ...updates } : z))
  }

  // bpm → derive pct
  function updateBpm(idx: number, low: string, high: string) {
    const patch: Partial<HRZone> = { hr: `${low}–${high}` }
    if (draftMaxHR > 0) {
      const lowNum = parseInt(low, 10)
      const highNum = parseInt(high, 10)
      if (!isNaN(lowNum) && !isNaN(highNum)) {
        const lowPct = Math.round((lowNum / draftMaxHR) * 100)
        const highPct = Math.round((highNum / draftMaxHR) * 100)
        patch.pct = `${lowPct}–${highPct}%`
      }
    }
    updateZone(idx, patch)
  }

  // pct → derive bpm
  function updatePct(idx: number, lowPct: string, highPct: string) {
    const patch: Partial<HRZone> = { pct: `${lowPct}–${highPct}%` }
    if (draftMaxHR > 0) {
      const lowNum = parseInt(lowPct, 10)
      const highNum = parseInt(highPct, 10)
      if (!isNaN(lowNum) && !isNaN(highNum)) {
        const lowBpm = Math.round((lowNum / 100) * draftMaxHR)
        const highBpm = Math.round((highNum / 100) * draftMaxHR)
        patch.hr = `${lowBpm}–${highBpm}`
      }
    }
    updateZone(idx, patch)
  }

  // Recalc all bpm values from existing percentages + current draft max HR
  function recalcFromMaxHR() {
    if (draftMaxHR <= 0) return
    setDraft(prev => prev.map(z => {
      const p = parsePctRange(z.pct)
      if (!p) return z
      const lowBpm = Math.round((p.low / 100) * draftMaxHR)
      const highBpm = Math.round((p.high / 100) * draftMaxHR)
      return { ...z, hr: `${lowBpm}–${highBpm}` }
    }))
  }

  const rowsSource = editing ? draft : zones
  const displayMaxHR = editing ? draftMaxHR : maxHR

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Heart Rate Zones</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Max HR: {displayMaxHR} bpm
            {(isCustomized || maxHRCustomized) && <span className="ml-1.5 text-teal-600">· customized</span>}
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
          {(isCustomized || maxHRCustomized) && !editing && (
            <button
              onClick={onReset}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              title="Revert to plan defaults"
            >
              ↩ Reset
            </button>
          )}
          {editing && (
            <>
              <button
                onClick={() => setEditing(false)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
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

      {editing && (
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg px-3 py-2 flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">Max HR</label>
          <input
            type="number"
            value={draftMaxHR || ''}
            onChange={e => setDraftMaxHR(parseInt(e.target.value, 10) || 0)}
            className="w-20 px-2 py-1 text-sm border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800"
            placeholder="bpm"
            min={100}
            max={230}
          />
          <span className="text-xs text-slate-500 dark:text-slate-400">bpm</span>
          <button
            onClick={recalcFromMaxHR}
            disabled={draftMaxHR <= 0}
            className="ml-auto text-xs font-medium px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
            title="Recalculate all zone bpm ranges from current percentages × Max HR"
          >
            Recalculate zones
          </button>
        </div>
      )}

      <div className="space-y-1.5">
        {rowsSource.map((z, i) => {
          const { low, high } = parseBpmRange(z.hr)
          const pctParsed = parsePctRange(z.pct)
          const lowPct = pctParsed ? String(pctParsed.low) : ''
          const highPct = pctParsed ? String(pctParsed.high) : ''
          return (
            <div key={i} className="bg-slate-50 dark:bg-slate-900 rounded-lg px-3 py-2">
              {editing ? (
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={z.zone}
                    onChange={e => updateZone(i, { zone: e.target.value })}
                    className="w-full px-2 py-1 text-sm font-medium text-slate-800 dark:text-white border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800"
                    placeholder="Zone name (e.g., Z1 – Recovery)"
                  />
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={low}
                      onChange={e => updateBpm(i, e.target.value, high)}
                      className="w-16 px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800"
                      placeholder="low"
                    />
                    <span className="text-xs text-slate-400">–</span>
                    <input
                      type="number"
                      value={high}
                      onChange={e => updateBpm(i, low, e.target.value)}
                      className="w-16 px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800"
                      placeholder="high"
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400">bpm</span>
                    <span className="text-xs text-slate-400 ml-2">·</span>
                    <input
                      type="number"
                      value={lowPct}
                      onChange={e => updatePct(i, e.target.value, highPct)}
                      className="w-14 px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800"
                      placeholder="low%"
                    />
                    <span className="text-xs text-slate-400">–</span>
                    <input
                      type="number"
                      value={highPct}
                      onChange={e => updatePct(i, lowPct, e.target.value)}
                      className="w-14 px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800"
                      placeholder="high%"
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400">%</span>
                  </div>
                  <input
                    type="text"
                    value={z.desc}
                    onChange={e => updateZone(i, { desc: e.target.value })}
                    className="w-full px-2 py-1 text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800"
                    placeholder="Description"
                  />
                </div>
              ) : (
                <div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-semibold text-slate-800 dark:text-white">{z.zone}</span>
                    <span className="text-sm font-mono text-teal-700">{z.hr} bpm</span>
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-xs text-slate-500 dark:text-slate-400">{z.desc}</span>
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
        Editing Max HR updates the value used by the coach, readiness scoring, and charts.
      </p>
    </div>
  )
}
