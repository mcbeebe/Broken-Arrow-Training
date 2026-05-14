import { useState } from 'react'
import type { RaceInfo, PerformanceMetrics, TrainingWeek } from '../types'
import { generateAthletePdf, pdfFilename, type ExportWindowWeeks } from '../utils/pdfExport'

interface Props {
  open: boolean
  onClose: () => void
  athleteName: string
  race: RaceInfo
  weeks: TrainingWeek[]
  performance: PerformanceMetrics[]
}

const WINDOWS: { weeks: ExportWindowWeeks; label: string; hint: string }[] = [
  { weeks: 4, label: '4 weeks', hint: 'Recent block' },
  { weeks: 12, label: '12 weeks', hint: 'Full build' },
  { weeks: 26, label: '26 weeks', hint: 'Half year' },
]

/**
 * "Share with my coach" — picks a window and downloads a printable PDF.
 *
 * Client-side only. No backend, no auth, no token store. The PDF is
 * generated in the browser via jsPDF and saved through a synthetic
 * download anchor.
 */
export default function ExportDialog({ open, onClose, athleteName, race, weeks, performance }: Props) {
  const [windowWeeks, setWindowWeeks] = useState<ExportWindowWeeks>(12)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!open) return null

  async function handleDownload() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const blob = generateAthletePdf({ athleteName, race, weeks, performance, windowWeeks })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = pdfFilename(athleteName)
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      onClose()
    } catch (e) {
      setError((e as Error).message || 'Failed to generate PDF')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-dialog-title"
    >
      <div
        className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div>
          <h2 id="export-dialog-title" className="text-lg font-bold text-slate-800 dark:text-white">Share with my coach</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Download a printable summary you can send to a coach, physio, or training partner.
          </p>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Include the last</p>
          <div className="grid grid-cols-3 gap-2">
            {WINDOWS.map(w => {
              const active = w.weeks === windowWeeks
              return (
                <button
                  key={w.weeks}
                  type="button"
                  onClick={() => setWindowWeeks(w.weeks)}
                  className={`rounded-lg p-2 border text-left transition-colors ${
                    active
                      ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950 dark:border-indigo-700'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-500'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">{w.label}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">{w.hint}</p>
                </button>
              )
            })}
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 text-sm font-medium px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={busy}
            className="flex-1 text-sm font-medium px-4 py-2 rounded-xl bg-indigo-600 text-white disabled:opacity-60"
          >
            {busy ? 'Generating…' : 'Download PDF'}
          </button>
        </div>
      </div>
    </div>
  )
}
