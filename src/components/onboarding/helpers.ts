import { isHyroxRaceInfo } from '../../engines/season/planSeason'
import { canLayerOntoAnchor } from '../../engines/season/layerSecondaryWork'
import type {
  AdditionalRace, ExperienceLevel, MenopauseStatus, RaceType,
} from '../../hooks/useOnboarding'
import type { DetailLevel } from '../../types'

/**
 * The pure helpers behind the onboarding flow: what the athlete typed, turned
 * into what the engines consume.
 *
 * assembleAdditionalRaces is the one that matters. It decides which races
 * reach the season engine at all, whether each is a Hyrox, which division it
 * runs, and whether a "layered" request survives — and it feeds BOTH the final
 * submit and the live preview, so a disagreement between them would show the
 * athlete one season and build another.
 */

/** One row of the season race builder — AdditionalRace-shaped with the
 *  miles field kept as raw input text and a local key for React lists. */
export interface SeasonRaceRow {
  key: number
  name: string
  date: string
  miles: string
  /** Elevation gain in feet (structured, P2) — free-typed, parsed on assemble. */
  vertFt: string
  priority: 'A' | 'B' | 'C'
  description: string
  integration: 'layered' | 'sequential'
  /** null = no chip tapped yet — format is inferred from name/description
   *  (so a row named "Hyrox LA" routes correctly without a tap). */
  format: 'road' | 'trail' | 'hyrox' | null
  /** Open/Pro for Hyrox-format rows (P3.1) — the sleds alone differ by ~50 kg. */
  hyroxDivision: 'open' | 'pro'
}

let seasonRowKey = 0
export function newSeasonRaceRow(): SeasonRaceRow {
  return { key: ++seasonRowKey, name: '', date: '', miles: '', vertFt: '', priority: 'B', description: '', integration: 'layered', format: null, hyroxDivision: 'open' }
}

/** Parse an "m:ss" erg split into seconds; undefined outside a plausible
 *  1km-erg window (2:00-10:00) so a typo never becomes a race target. */
export function parseErgSeconds(text: string): number | undefined {
  const m = text.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return undefined
  const sec = parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
  return sec >= 120 && sec <= 600 ? sec : undefined
}

/** Season-mode rows (and race-mode's single extra) → AdditionalRace list.
 *  Shared by handleComplete and the preview's provisionalConfig so both
 *  feed the SAME season shape into normalizeSeasonConfig. */
export function assembleAdditionalRaces(args: {
  raceType: RaceType | null
  goalMode: 'race' | 'season' | 'general' | null
  seasonRaces: SeasonRaceRow[]
  primaryKey: 'anchor' | number
  extraRaceName: string
  extraRaceDate: string
  extraRacePriority: 'A' | 'B' | 'C'
  extraRaceMiles: string
  extraRaceVertFt: string
  extraRaceDescription: string
}): AdditionalRace[] | undefined {
  const { raceType, goalMode, seasonRaces, primaryKey } = args
  if (raceType === 'general') return undefined
  if (goalMode === 'season') {
    const rows = seasonRaces
      .filter(r => r.name.trim() && r.date)
      .map(r => ({
        name: r.name.trim(),
        date: r.date,
        // The main goal is always a full 'A'; other rows carry their
        // role chip (Key race = B, Tune-up = C).
        priority: primaryKey === r.key ? 'A' as const : r.priority,
        isPrimary: primaryKey === r.key || undefined,
        distanceMiles: parseFloat(r.miles) || undefined,
        elevationGainFt: parseFloat(r.vertFt) > 0 ? Math.round(parseFloat(r.vertFt)) : undefined,
        description: r.description.trim() || undefined,
        // Untapped chips defer to name detection — never seed an
        // explicit format the athlete didn't choose.
        format: r.format ?? (isHyroxRaceInfo({ name: r.name, description: r.description }) ? 'hyrox' as const : undefined),
        // P3.1 — the row's division travels with a Hyrox-format race.
        hyroxDivision: (r.format ? r.format === 'hyrox' : isHyroxRaceInfo({ name: r.name, description: r.description }))
          ? r.hyroxDivision
          : undefined,
        // The integration ask applies to format-specific (Hyrox)
        // races; others run sequential (the only defined behavior). And an
        // anchor the transform cannot layer onto is coerced here rather than
        // stored as a request that will be silently refused — the athlete may
        // have chosen 'layered' before going back and switching their main
        // race to a Hyrox, and the choice is hidden from that point on.
        integration: (r.format ? r.format === 'hyrox' : isHyroxRaceInfo({ name: r.name, description: r.description }))
          ? (canLayerOntoAnchor(raceType) ? r.integration : 'sequential' as const)
          : 'sequential' as const,
      }))
    return rows.length > 0 ? rows : undefined
  }
  return args.extraRaceName.trim() && args.extraRaceDate
    ? [{
        name: args.extraRaceName.trim(),
        date: args.extraRaceDate,
        priority: args.extraRacePriority,
        distanceMiles: parseFloat(args.extraRaceMiles) || undefined,
        elevationGainFt: parseFloat(args.extraRaceVertFt) > 0 ? Math.round(parseFloat(args.extraRaceVertFt)) : undefined,
        description: args.extraRaceDescription.trim() || undefined,
      }]
    : undefined
}

/** Format a seconds total back into mm:ss or h:mm:ss for an input echo. */
export function formatSecondsLabel(total: number): string {
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

// Sensible default detail level derived from the experience answer. Newer
// athletes default to the simplest view; seasoned athletes to the fullest.
export function defaultDetailLevel(exp: ExperienceLevel | null): DetailLevel {
  if (exp === 'first_timer' || exp === 'beginner') return 'simple'
  if (exp === 'advanced' || exp === 'elite') return 'detailed'
  return 'balanced'
}

// A "real" stage on the menopause continuum carries coach personalization; the
// non-answers ('not_applicable' / 'prefer_not_to_say') and null do not.
export function isRealMenopauseStage(s: MenopauseStatus | null): boolean {
  return (
    s === 'premenopause' ||
    s === 'perimenopause' ||
    s === 'menopause' ||
    s === 'postmenopause'
  )
}
