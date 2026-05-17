import type { ReactNode } from 'react'

export interface FilterChipOption<V extends string = string> {
  value: V
  label: string
  icon?: ReactNode
  disabled?: boolean
}

interface Props<V extends string = string> {
  options: FilterChipOption<V>[]
  value: V
  onChange: (next: V) => void
  /** Required for screen readers — describes the dimension being filtered. */
  ariaLabel: string
  /** Visual size — tight (Strava timeframe pills) or comfy (sport pills). */
  size?: 'sm' | 'md'
  /** Horizontal scroll when overflowing instead of wrapping. */
  scroll?: boolean
  className?: string
}

const SIZE_CLASSES: Record<'sm' | 'md', string> = {
  sm: 'text-xs px-2.5 py-1',
  md: 'text-sm px-3 py-1.5',
}

/**
 * Single-select pill row used everywhere a Strava-style filter chip lives:
 * sport selector ("All Run / Run / Bike"), metric selector ("Distance /
 * Time / Elevation Gain"), timeframe selector ("7D / 1M / 3M / 6M / YTD /
 * 1Y"). One component, three placements.
 */
export default function FilterChipRow<V extends string = string>({
  options, value, onChange, ariaLabel, size = 'md', scroll = false, className = '',
}: Props<V>) {
  const wrap = scroll ? 'overflow-x-auto flex-nowrap' : 'flex-wrap'
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`flex items-center gap-1.5 ${wrap} ${className}`}
    >
      {options.map(opt => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full font-semibold transition-colors ${SIZE_CLASSES[size]} ${
              active
                ? 'bg-intelligence-500 text-white border border-intelligence-500 dark:bg-intelligence-600 dark:border-intelligence-600'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {opt.icon && <span aria-hidden className="shrink-0">{opt.icon}</span>}
            <span>{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
