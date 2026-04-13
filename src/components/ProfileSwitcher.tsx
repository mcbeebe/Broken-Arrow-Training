interface ProfileSwitcherProps {
  athleteId: string
  onSwitch: (id: string) => void
}

const PROFILES = [
  { id: 'mike', label: 'Mike 18K' },
  { id: 'lori', label: 'Lori 11K' },
  { id: 'jim', label: 'Jim 11K' },
]

export default function ProfileSwitcher({ athleteId, onSwitch }: ProfileSwitcherProps) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-teal-400/50">
      {PROFILES.map(p => (
        <button
          key={p.id}
          onClick={() => onSwitch(p.id)}
          className={`px-3 py-1 text-xs font-medium transition-colors ${
            athleteId === p.id
              ? 'bg-teal-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
