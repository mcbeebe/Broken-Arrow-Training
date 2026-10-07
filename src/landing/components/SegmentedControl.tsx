/**
 * A row of toggle buttons (design-spec.md § SegmentedControl): the athlete
 * tabs on the white card and the chart toggle on deep. Each is a
 * `<button aria-pressed>`; Tab reaches every one.
 */
export interface SegmentOption<T extends string> {
  id: T
  label: string
}

interface Props<T extends string> {
  options: readonly SegmentOption<T>[]
  value: T
  /** Wired in initiative 003 PR 4; the buttons render inert until then. */
  onChange?: (id: T) => void
  tone: 'light' | 'deep'
  /** Id of the element naming the group, or a name for it. */
  labelledBy?: string
  label?: string
  className?: string
}

export function SegmentedControl<T extends string>({ options, value, onChange, tone, labelledBy, label, className = '' }: Props<T>) {
  const deep = tone === 'deep'
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      className={`gap-1.5 rounded-xl p-1 ${deep ? 'flex bg-landing-deep-card' : 'grid grid-cols-4 bg-landing-soft'} ${className}`}
    >
      {options.map(o => {
        const on = o.id === value
        const look = deep
          ? on ? 'bg-landing-on-deep text-landing-deep' : 'bg-transparent text-landing-on-deep-muted'
          : on ? 'bg-landing-card text-landing-ink shadow-landing-segment' : 'bg-transparent text-landing-muted'
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={onChange ? () => onChange(o.id) : undefined}
            className={`min-h-[44px] cursor-pointer rounded-[9px] border-0 text-sm font-bold ${deep ? 'px-3.5' : 'px-2'} ${look}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
