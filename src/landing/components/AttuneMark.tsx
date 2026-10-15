import { themed } from '../tokens'

/** The interim Attune mark (design-spec.md § AttuneMark). Decorative: the wordmark beside it names it. */
export function AttuneMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true" focusable="false">
      <circle cx="15" cy="15" r="13" fill="none" style={{ stroke: themed('action') }} strokeWidth="3" />
      <path
        d="M8 17 L12.5 12 L16 15.5 L22 9"
        fill="none"
        style={{ stroke: themed('signal') }}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
