import { useState } from 'react'
import type { CoachPersona } from '../types'
import { COACH_TRAITS, DEFAULT_COACH_NAME } from '../types'

interface Props {
  persona: CoachPersona
  onSave: (p: CoachPersona) => void
}

export default function CoachPersonaEditor({ persona, onSave }: Props) {
  const [name, setName] = useState(persona.name)
  const [traits, setTraits] = useState<Set<string>>(new Set(persona.traits))
  const [dirty, setDirty] = useState(false)

  function toggleTrait(id: string) {
    setTraits(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setDirty(true)
  }

  function handleSave() {
    const p: CoachPersona = {
      name: name.trim(),
      traits: Array.from(traits),
    }
    onSave(p)
    setDirty(false)
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-800 dark:text-white">Customize Your Coach</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Give your coach a name and personality. These shape how they talk to you.
        </p>
      </div>

      {/* Coach name */}
      <div>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200 block mb-1">Coach name</label>
        <input
          type="text"
          value={name}
          onChange={e => { setName(e.target.value); setDirty(true) }}
          placeholder="e.g. Coach Chuck, Coach K, Sensei…"
          className="w-full px-3 py-2 text-base border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-400"
          maxLength={30}
        />
      </div>

      {/* Personality traits */}
      <div>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200 block mb-2">Personality</label>
        <div className="flex flex-wrap gap-2">
          {COACH_TRAITS.map(t => {
            const active = traits.has(t.id)
            return (
              <button
                key={t.id}
                onClick={() => toggleTrait(t.id)}
                title={t.desc}
                className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                  active
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-800 font-medium'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900'
                }`}
              >
                {t.emoji} {t.label}
              </button>
            )
          })}
        </div>
        {traits.size > 0 && (
          <p className="text-xs text-slate-400 mt-2">
            {Array.from(traits).map(id => {
              const t = COACH_TRAITS.find(x => x.id === id)
              return t ? t.desc : id
            }).join(' · ')}
          </p>
        )}
      </div>

      {/* Save */}
      {dirty && (
        <button
          onClick={handleSave}
          className="text-sm font-semibold px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          Save Coach Settings
        </button>
      )}

      {/* Preview */}
      {(name.trim() || traits.size > 0) && (
        <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl px-3 py-2.5">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <span className="font-medium text-indigo-700">{name.trim() || DEFAULT_COACH_NAME}</span>
            {traits.size > 0 && (
              <> will be {Array.from(traits).map(id => {
                const t = COACH_TRAITS.find(x => x.id === id)
                return t?.label.toLowerCase() || id
              }).join(', ')}</>
            )}
          </p>
        </div>
      )}
    </div>
  )
}
