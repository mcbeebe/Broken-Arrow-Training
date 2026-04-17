import { useEffect, useState } from 'react'
import { coachApiAvailable, coachApiBase } from '../utils/coachApi'

interface Props {
  athleteId: string
}

interface Rollup {
  llm: {
    totalCalls: number
    totalInput: number
    totalOutput: number
    totalCost: number
    bySurface: Record<string, { calls: number; input: number; output: number; cost: number; failures: number }>
    byDay: Record<string, { calls: number; input: number; output: number; cost: number }>
  }
  interactions: Record<string, number>
}

interface Sample {
  ts: number
  model: string
  surface: string
  systemPrompt: string
  messages: { role: string; content: string }[]
  response: string
}

interface TelemetryResponse {
  rollup: Rollup
  samples: Sample[]
  days: number
}

/**
 * Operational diagnostics panel shown in Settings (Mike-only, Coach
 * enabled). Shows LLM usage / cost / interaction counts and lets you
 * inspect recent prompt+response samples for manual quality review.
 */
const ALL_ATHLETES = ['mike', 'jim', 'lori', 'joel']

export default function CoachDiagnostics({ athleteId }: Props) {
  const [viewingAthlete, setViewingAthlete] = useState(athleteId)
  const [data, setData] = useState<TelemetryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [days, setDays] = useState(30)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  async function load() {
    if (!coachApiAvailable()) return
    setLoading(true)
    try {
      const res = await fetch(
        `${coachApiBase()}/api/coach/telemetry?athleteId=${encodeURIComponent(viewingAthlete)}&days=${days}`,
      )
      if (res.ok) {
        const j = (await res.json()) as TelemetryResponse
        setData(j)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingAthlete, days])

  if (!coachApiAvailable()) {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700">Coach Diagnostics</h3>
        <p className="text-xs text-slate-400 mt-1">Coach API not configured.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-700">Coach Diagnostics</h3>
          <select
            value={viewingAthlete}
            onChange={e => setViewingAthlete(e.target.value)}
            className="text-[11px] bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-slate-700"
          >
            {ALL_ATHLETES.map(a => (
              <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-1.5">
          {[7, 30, 90].map(n => (
            <button
              key={n}
              onClick={() => setDays(n)}
              className={`text-[11px] px-2 py-0.5 rounded ${
                days === n ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {n}d
            </button>
          ))}
        </div>
      </div>

      {loading && !data && (
        <p className="text-xs text-slate-400">Loading…</p>
      )}

      {data && (
        <>
          {/* Usage summary */}
          <div className="grid grid-cols-2 gap-2">
            <StatCell label="LLM Calls" value={data.rollup.llm.totalCalls.toString()} />
            <StatCell label="Est. Cost" value={`$${data.rollup.llm.totalCost.toFixed(4)}`} />
            <StatCell label="Input tokens" value={data.rollup.llm.totalInput.toLocaleString()} />
            <StatCell label="Output tokens" value={data.rollup.llm.totalOutput.toLocaleString()} />
          </div>

          {/* By surface */}
          {Object.keys(data.rollup.llm.bySurface).length > 0 && (
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1">
                By surface
              </p>
              <div className="text-xs space-y-1">
                {Object.entries(data.rollup.llm.bySurface).map(([surface, b]) => (
                  <div key={surface} className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-700">{surface}</span>
                    <span className="text-slate-500">
                      {b.calls} calls · ${b.cost.toFixed(4)} · {b.failures > 0 ? `${b.failures} fail` : 'ok'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interactions */}
          {Object.keys(data.rollup.interactions).length > 0 && (
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1">
                Interactions
              </p>
              <div className="text-xs space-y-0.5">
                {Object.entries(data.rollup.interactions).map(([kind, count]) => (
                  <div key={kind} className="flex justify-between">
                    <span className="text-slate-700">{kind}</span>
                    <span className="text-slate-500">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sample review */}
          <div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1">
              Recent samples ({data.samples.length})
            </p>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {data.samples.slice(0, 20).map(s => {
                const isOpen = expanded.has(s.ts)
                return (
                  <div key={s.ts} className="border border-slate-100 rounded">
                    <button
                      onClick={() => {
                        const next = new Set(expanded)
                        if (isOpen) next.delete(s.ts)
                        else next.add(s.ts)
                        setExpanded(next)
                      }}
                      className="w-full text-left px-2 py-1 flex items-center justify-between hover:bg-slate-50"
                    >
                      <span className="text-[11px] text-slate-700 truncate">
                        {new Date(s.ts).toLocaleString()} · {s.surface} · {s.model}
                      </span>
                      <span className="text-[11px] text-slate-400">{isOpen ? '▴' : '▾'}</span>
                    </button>
                    {isOpen && (
                      <div className="px-2 py-2 bg-slate-50 space-y-2">
                        <details>
                          <summary className="text-[10px] font-semibold text-slate-500 cursor-pointer">
                            System prompt
                          </summary>
                          <pre className="text-[10px] text-slate-600 whitespace-pre-wrap mt-1 font-mono">
                            {s.systemPrompt}
                          </pre>
                        </details>
                        <details open>
                          <summary className="text-[10px] font-semibold text-slate-500 cursor-pointer">
                            Messages
                          </summary>
                          <div className="mt-1 space-y-1">
                            {s.messages.map((m, i) => (
                              <div key={i} className="text-[10px]">
                                <span className="font-semibold text-slate-600">{m.role}:</span>
                                <pre className="whitespace-pre-wrap font-mono text-slate-700">{m.content}</pre>
                              </div>
                            ))}
                          </div>
                        </details>
                        <details open>
                          <summary className="text-[10px] font-semibold text-slate-500 cursor-pointer">
                            Response
                          </summary>
                          <pre className="text-[10px] text-slate-700 whitespace-pre-wrap mt-1 font-mono">
                            {s.response}
                          </pre>
                        </details>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  )
}
