import { useState } from 'react'
import type { RaceInfo, RacePriority } from '../types'
import type { UseSeasonReturn } from '../hooks/useSeason'
import { raceDateToIso } from '../engines/season'
import { isHyroxRaceInfo } from '../engines/season/planSeason'
import { BLOCK_STYLE } from '../utils/blockStyles'

/**
 * The race calendar (G1b): A/B/C races + the derived block timeline.
 * Guard: a single-race athlete sees only the "+ add another race"
 * affordance — no timeline, no advisories, no season machinery.
 *
 * Accessibility per the plan §4 checklist: priorities and block kinds are
 * encoded by LETTERS and LABELS (color is reinforcement, never the
 * message).
 */

const PRIORITY_HELP: Record<RacePriority, string> = {
  A: 'A — full build + 2-week taper',
  B: 'B — race-week mini-taper, trained through otherwise',
  C: 'C — trained through, no taper',
}

function fmtRange(startIso: string, endIso: string): string {
  const fmt = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }
  return startIso === endIso ? fmt(startIso) : `${fmt(startIso)}–${fmt(endIso)}`
}

export default function SeasonPanel({ seasonState }: { seasonState: UseSeasonReturn }) {
  const { season, planResult, isMultiRace, addRace, setPriority, setIntegration, removeRace } = seasonState
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [miles, setMiles] = useState('')
  const [priority, setPri] = useState<RacePriority>('B')
  const [description, setDescription] = useState('')
  const [integration, setIntegrationChoice] = useState<'layered' | 'sequential'>('layered')
  // Explicit format chips (null = untapped → fall back to name detection,
  // so typing "Hyrox Anaheim" still asks the integration question).
  const [format, setFormat] = useState<'road' | 'trail' | 'hyrox' | null>(null)

  const anchorIso = raceDateToIso(season.races[0]?.raceInfo.date ?? '')
  const datedBeforeAnchor = !!date && !!anchorIso && date <= anchorIso
  // The integration ask is defined for format-specific (Hyrox) races.
  const addFormIsHyrox = format ? format === 'hyrox' : isHyroxRaceInfo({ name, description })

  // One-time confirm for races captured before the integration choice
  // existed: never silently change an athlete's plan — ask.
  const pendingIntegration = season.races
    .slice(1)
    .find(r => r.integration === undefined && isHyroxRaceInfo(r.raceInfo) && r.status === 'upcoming')

  function submitAdd() {
    if (!name.trim() || !date) return
    const effectiveFormat = format ?? (addFormIsHyrox ? 'hyrox' : undefined)
    const race: RaceInfo = {
      name: name.trim(),
      date,
      startTime: '',
      distance: effectiveFormat === 'hyrox' ? 'Hyrox' : miles ? `${miles} mi` : '',
      distanceMiles: parseFloat(miles) || 0,
      elevation: '', elevationRange: '', course: '', cutoff: '',
      landmarks: [], gear: [], nutrition: '',
      description: description.trim() || undefined,
      format: effectiveFormat,
    }
    addRace(race, priority, addFormIsHyrox ? integration : 'sequential')
    setAdding(false)
    setName(''); setDate(''); setMiles(''); setPri('B'); setDescription(''); setIntegrationChoice('layered'); setFormat(null)
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 mb-3" data-testid="season-panel">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-slate-800 dark:text-white">
          {isMultiRace ? 'Your season' : 'Racing more than once this year?'}
        </h3>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-xs font-semibold text-teal-700 border border-teal-200 rounded-lg px-2 py-1 hover:bg-teal-50"
          >
            + Add another race
          </button>
        )}
      </div>
      {!isMultiRace && !adding && (
        <p className="text-xs text-slate-500">
          Add your next race and the plan chains them: recover, bridge, rebuild, taper — on purpose.
        </p>
      )}

      {adding && (
        <div className="mt-2 rounded-lg border border-slate-200 dark:border-slate-600 p-3 space-y-2">
          <input
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="Race name (e.g. Hyrox LA, CIM Marathon)"
            value={name} onChange={e => setName(e.target.value)}
          />
          <div className="flex gap-2">
            <input type="date" className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              value={date} onChange={e => setDate(e.target.value)} />
            <input type="number" inputMode="decimal" className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="miles" value={miles} onChange={e => setMiles(e.target.value)} />
          </div>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Race format">
            {(['road', 'trail', 'hyrox'] as const).map(k => (
              <button key={k}
                type="button" role="radio" aria-checked={format === k}
                onClick={() => setFormat(k)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold capitalize ${
                  format === k ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-500'
                }`}
              >{k}</button>
            ))}
          </div>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Race priority">
            {(['A', 'B', 'C'] as const).map(p => (
              <button key={p}
                role="radio" aria-checked={priority === p}
                onClick={() => setPri(p)}
                title={PRIORITY_HELP[p]}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold ${
                  priority === p ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-500'
                }`}
              >{PRIORITY_HELP[p]}</button>
            ))}
          </div>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="Tell us about it — format, goal, terrain (e.g. Hyrox open, first one, goal to finish strong)"
            aria-label="Race details"
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm resize-none"
          />
          {addFormIsHyrox && (
            <div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                When should this race’s training start?
              </p>
              <div className="flex gap-1.5" role="radiogroup" aria-label="Training integration">
                <button type="button" role="radio" aria-checked={integration === 'layered'}
                  onClick={() => setIntegrationChoice('layered')}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                    integration === 'layered' ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-500'
                  }`}>
                  Layer into my build now (recommended)
                </button>
                <button type="button" role="radio" aria-checked={integration === 'sequential'}
                  onClick={() => setIntegrationChoice('sequential')}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                    integration === 'sequential' ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-500'
                  }`}>
                  After my current race
                </button>
              </div>
            </div>
          )}
          {datedBeforeAnchor && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
              ⚠️ This date is on or before your current plan's race — the season chains races in
              date order. Double-check it if this race should come after.
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={submitAdd} disabled={!name.trim() || !date}
              className="rounded-lg bg-teal-700 text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50">
              Add race
            </button>
            <button onClick={() => setAdding(false)} className="text-sm text-slate-500 px-2">Cancel</button>
          </div>
        </div>
      )}

      {/* One-time integration confirm for pre-existing Hyrox-format races
          (captured before the layered option existed). Ask — never
          silently regenerate the athlete's plan. */}
      {pendingIntegration && !adding && (
        <div className="mt-2 rounded-lg border border-teal-200 bg-teal-50 dark:bg-teal-950 dark:border-teal-800 px-3 py-2" data-testid="integration-confirm">
          <p className="text-xs font-medium text-teal-900 dark:text-teal-100">
            Layer {pendingIntegration.raceInfo.name} prep into your current build?
          </p>
          <p className="text-[11px] text-teal-800 dark:text-teal-200 mt-0.5">
            1–2 station/strength sessions a week woven in now (your running stays
            untouched) — or keep everything after your current race.
          </p>
          <div className="flex gap-2 mt-1.5">
            <button
              onClick={() => setIntegration(pendingIntegration.id, 'layered')}
              className="rounded-lg bg-teal-700 text-white text-xs font-semibold px-2.5 py-1">
              Layer it in
            </button>
            <button
              onClick={() => setIntegration(pendingIntegration.id, 'sequential')}
              className="rounded-lg border border-teal-300 text-teal-800 dark:text-teal-200 text-xs font-semibold px-2.5 py-1">
              Keep it after
            </button>
          </div>
        </div>
      )}

      {isMultiRace && (
        <>
          {/* Race list with A/B/C priority control */}
          <div className="mt-2 space-y-1.5">
            {season.races.map((r, idx) => (
              <div key={r.id} className="flex items-center gap-2 text-sm">
                <div className="flex gap-0.5" role="radiogroup" aria-label={`${r.raceInfo.name} priority`}>
                  {(['A', 'B', 'C'] as const).map(p => (
                    <button key={p}
                      role="radio" aria-checked={r.priority === p}
                      onClick={() => setPriority(r.id, p)}
                      title={PRIORITY_HELP[p]}
                      className={`w-6 h-6 rounded text-[11px] font-bold border ${
                        r.priority === p
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'text-slate-400 border-slate-200'
                      }`}
                    >{p}</button>
                  ))}
                </div>
                <span className="font-medium text-slate-700 dark:text-slate-200 truncate">{r.raceInfo.name}</span>
                <span className="text-xs text-slate-400 ml-auto shrink-0">
                  {raceDateToIso(r.raceInfo.date) ?? r.raceInfo.date}
                </span>
                {idx > 0 && (
                  <button onClick={() => removeRace(r.id)} aria-label={`Remove ${r.raceInfo.name}`}
                    className="text-slate-300 hover:text-red-500 text-sm px-1">✕</button>
                )}
              </div>
            ))}
          </div>

          {/* Derived block timeline */}
          <div className="mt-3 flex flex-wrap gap-1" data-testid="season-timeline" aria-label="Season block timeline">
            {planResult.season.blocks.map(b => (
              <span key={b.id}
                className={`${BLOCK_STYLE[b.kind].bg} text-white rounded-md px-2 py-1 text-[10px] font-bold`}
                title={`${BLOCK_STYLE[b.kind].label} ${fmtRange(b.startDate, b.endDate)}`}
              >
                {BLOCK_STYLE[b.kind].label} <span className="font-medium opacity-80">{fmtRange(b.startDate, b.endDate)}</span>
              </span>
            ))}
          </div>

          {/* Season honesty */}
          {planResult.advisories.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {planResult.advisories.map(a => (
                <div key={a.id} className={`rounded-lg px-3 py-2 text-xs border ${
                  a.severity === 'critical' ? 'bg-red-50 border-red-200 text-red-800'
                  : a.severity === 'caution' ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-blue-50 border-blue-200 text-blue-800'
                }`}>
                  <span className="font-bold">{a.title}.</span> {a.detail}
                  {a.suggestion && <span className="block mt-0.5 opacity-80">{a.suggestion}</span>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
