import { useState } from 'react'
import type { AthleteProfileExtras } from '../hooks/useAthleteProfile'

/**
 * R7 — Settings → Coach editor for the structured athlete profile. The fields
 * feed a binding ATHLETE_PROFILE_DIRECTIVE the coach adapts within (masters
 * recovery, beginner progression caution, injury-aware loading) and the
 * readiness engine's age/experience tuning (R8). Everything is optional;
 * leaving a field blank means the coach makes no claim about it.
 */

interface Props {
  profile: AthleteProfileExtras
  onSave: (next: AthleteProfileExtras) => void
}

type Injury = NonNullable<AthleteProfileExtras['injuryHistory']>[number]
type Goal = NonNullable<AthleteProfileExtras['goals']>[number]

const EXPERIENCE_OPTS: { value: NonNullable<AthleteProfileExtras['experienceLevel']>; label: string }[] = [
  { value: 'first_timer', label: 'First-timer' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'elite', label: 'Elite' },
]

const inputCls =
  'w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 ' +
  'px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100'
const labelCls = 'block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1'

export default function AthleteProfileEditor({ profile, onSave }: Props) {
  const [draft, setDraft] = useState<AthleteProfileExtras>(profile)
  const [saved, setSaved] = useState(false)

  function patch(next: Partial<AthleteProfileExtras>) {
    setDraft(prev => ({ ...prev, ...next }))
    setSaved(false)
  }

  const injuries: Injury[] = draft.injuryHistory ?? []
  const goals: Goal[] = draft.goals ?? []

  function setInjury(i: number, next: Partial<Injury>) {
    const copy = injuries.map((inj, idx) => (idx === i ? { ...inj, ...next } : inj))
    patch({ injuryHistory: copy })
  }
  function addInjury() {
    patch({ injuryHistory: [...injuries, { region: '', status: 'active' }] })
  }
  function removeInjury(i: number) {
    patch({ injuryHistory: injuries.filter((_, idx) => idx !== i) })
  }

  function setGoal(i: number, next: Partial<Goal>) {
    const copy = goals.map((g, idx) => (idx === i ? { ...g, ...next } : g))
    patch({ goals: copy })
  }
  function addGoal() {
    patch({ goals: [...goals, { text: '', priority: 'primary' }] })
  }
  function removeGoal(i: number) {
    patch({ goals: goals.filter((_, idx) => idx !== i) })
  }

  function handleSave() {
    // Drop incomplete injury/goal rows before persisting.
    const next: AthleteProfileExtras = {
      ...draft,
      injuryHistory: injuries.filter(inj => inj.region.trim()),
      goals: goals.filter(g => g.text.trim()),
    }
    onSave(next)
    setSaved(true)
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          <span aria-hidden>🧬</span> Athlete profile
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Helps your coach tailor recovery, progression, and injury caution. All optional.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="ap-birth">Date of birth</label>
          <input
            id="ap-birth"
            type="date"
            className={inputCls}
            value={draft.birthDate ?? ''}
            onChange={e => patch({ birthDate: e.target.value || undefined })}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="ap-sex">Sex</label>
          <select
            id="ap-sex"
            className={inputCls}
            value={draft.sex ?? ''}
            onChange={e => patch({ sex: (e.target.value || undefined) as AthleteProfileExtras['sex'] })}
          >
            <option value="">—</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="ap-exp">Experience</label>
          <select
            id="ap-exp"
            className={inputCls}
            value={draft.experienceLevel ?? ''}
            onChange={e =>
              patch({ experienceLevel: (e.target.value || undefined) as AthleteProfileExtras['experienceLevel'] })
            }
          >
            <option value="">—</option>
            {EXPERIENCE_OPTS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="ap-weight">Weight (kg)</label>
          <input
            id="ap-weight"
            type="number"
            min={0}
            className={inputCls}
            value={draft.weightKg ?? ''}
            onChange={e => patch({ weightKg: e.target.value ? Number(e.target.value) : undefined })}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className={labelCls + ' mb-0'}>Injury history</span>
          <button type="button" onClick={addInjury} className="text-xs text-teal-700 dark:text-teal-400">
            + Add
          </button>
        </div>
        <div className="space-y-2">
          {injuries.length === 0 && (
            <p className="text-xs text-slate-400">None — the coach won't assume any.</p>
          )}
          {injuries.map((inj, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                className={inputCls + ' flex-1'}
                placeholder="Region (e.g. right knee)"
                value={inj.region}
                onChange={e => setInjury(i, { region: e.target.value })}
              />
              <select
                className={inputCls + ' w-28'}
                value={inj.status}
                onChange={e => setInjury(i, { status: e.target.value as Injury['status'] })}
              >
                <option value="active">Active</option>
                <option value="chronic">Chronic</option>
                <option value="resolved">Resolved</option>
              </select>
              <button
                type="button"
                onClick={() => removeInjury(i)}
                className="text-xs text-slate-400 hover:text-red-500"
                aria-label="Remove injury"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className={labelCls + ' mb-0'}>Goals</span>
          <button type="button" onClick={addGoal} className="text-xs text-teal-700 dark:text-teal-400">
            + Add
          </button>
        </div>
        <div className="space-y-2">
          {goals.map((g, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                className={inputCls + ' flex-1'}
                placeholder="Goal (e.g. finish Broken Arrow 18K strong)"
                value={g.text}
                onChange={e => setGoal(i, { text: e.target.value })}
              />
              <select
                className={inputCls + ' w-28'}
                value={g.priority ?? 'primary'}
                onChange={e => setGoal(i, { priority: e.target.value as Goal['priority'] })}
              >
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
              </select>
              <button
                type="button"
                onClick={() => removeGoal(i)}
                className="text-xs text-slate-400 hover:text-red-500"
                aria-label="Remove goal"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-md bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700"
        >
          Save profile
        </button>
        {saved && <span className="text-xs text-teal-700 dark:text-teal-400">Saved ✓</span>}
      </div>
    </div>
  )
}
