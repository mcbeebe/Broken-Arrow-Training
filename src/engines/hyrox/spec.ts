/**
 * Official HYROX race format as data (P3.1).
 *
 * Everything the generator prescribes about stations renders from this
 * module — the v1 defect was a hardcoded half-distance station list with
 * no machine-readable notion of race spec, so no athlete ever trained a
 * single station at race distance. Loads are per division and sex, cited
 * through the evidence layer so they cannot drift silently.
 *
 * Verified against the HYROX Singles rulebook (hyrox.com/rulebook),
 * 25/26–26/27 seasons. Doubles/relay formats are out of scope until the
 * product asks for them.
 */
import { tier, type TieredValue } from '../evidence'

export type HyroxDivision = 'open' | 'pro'
export type HyroxSex = 'male' | 'female'

export interface StationSpec {
  /** Stable key, race order. */
  key: 'skierg' | 'sled_push' | 'sled_pull' | 'burpee_broad_jump' | 'row' | 'farmers_carry' | 'sandbag_lunges' | 'wall_balls'
  name: string
  /** Race quantity: metres for erg/distance stations, reps for wall balls. */
  amount: number
  unit: 'm' | 'reps'
  /** Human-readable load at this division/sex ('' when bodyweight-only). */
  load: string
}

export const HYROX_RUN_LEGS = 8
export const HYROX_RUN_LEG_KM = 1

export const HYROX_SPEC_EVIDENCE: TieredValue<string> = tier(
  'HYROX Singles rulebook',
  'T3',
  'HYROX Singles rulebook 25/26–26/27 (hyrox.com/rulebook): 8×1 km runs each followed by one station; SkiErg 1000 m, Sled Push 50 m, Sled Pull 50 m, Burpee Broad Jump 80 m, Row 1000 m, Farmers Carry 200 m, Sandbag Lunges 100 m, Wall Balls to a 3.00 m (men) / 2.70 m (women) target.',
)

/** Division/sex loads. Total system weight for sleds (incl. sled). */
const LOADS: Record<HyroxDivision, Record<HyroxSex, { push: string; pull: string; carry: string; sandbag: string; wallBall: string; wallBallReps: number }>> = {
  open: {
    male:   { push: '152 kg', pull: '103 kg', carry: '2×24 kg', sandbag: '20 kg', wallBall: '6 kg to 3.0 m', wallBallReps: 100 },
    female: { push: '102 kg', pull: '78 kg',  carry: '2×16 kg', sandbag: '10 kg', wallBall: '4 kg to 2.7 m', wallBallReps: 100 },
  },
  pro: {
    male:   { push: '202 kg', pull: '153 kg', carry: '2×32 kg', sandbag: '30 kg', wallBall: '9 kg to 3.0 m', wallBallReps: 100 },
    female: { push: '152 kg', pull: '103 kg', carry: '2×24 kg', sandbag: '20 kg', wallBall: '6 kg to 2.7 m', wallBallReps: 100 },
  },
}

export function stationSpecs(division: HyroxDivision = 'open', sex: HyroxSex = 'male'): StationSpec[] {
  const l = LOADS[division][sex]
  return [
    { key: 'skierg',            name: 'SkiErg',            amount: 1000, unit: 'm',    load: '' },
    { key: 'sled_push',         name: 'Sled push',         amount: 50,   unit: 'm',    load: l.push },
    { key: 'sled_pull',         name: 'Sled pull',         amount: 50,   unit: 'm',    load: l.pull },
    { key: 'burpee_broad_jump', name: 'Burpee broad jumps', amount: 80,  unit: 'm',    load: '' },
    { key: 'row',               name: 'Row',               amount: 1000, unit: 'm',    load: '' },
    { key: 'farmers_carry',     name: 'Farmer carry',      amount: 200,  unit: 'm',    load: l.carry },
    { key: 'sandbag_lunges',    name: 'Sandbag lunges',    amount: 100,  unit: 'm',    load: l.sandbag },
    { key: 'wall_balls',        name: 'Wall balls',        amount: l.wallBallReps, unit: 'reps', load: l.wallBall },
  ]
}

/** One station's prescription at `pct` of race volume (loads never scale —
 *  Hyrox loads are fixed; volume is the training variable). Rounds erg
 *  metres to 50s, short distances to 5 m, reps to 5s. */
export function stationRx(spec: StationSpec, pct: number): string {
  const raw = spec.amount * pct
  const amount = spec.unit === 'reps'
    ? Math.max(10, Math.round(raw / 5) * 5)
    : spec.amount >= 1000
      ? Math.max(200, Math.round(raw / 50) * 50)
      : Math.max(10, Math.round(raw / 5) * 5)
  const qty = spec.unit === 'reps' ? `${amount}` : `${amount}m`
  return `${spec.name} ${qty}${spec.load ? ` @ ${spec.load}` : ''}`
}

/** All eight stations at `pct` of race volume, race order, ' · '-joined. */
export function stationCircuit(specs: StationSpec[], pct: number): string {
  return specs.map(s => stationRx(s, pct)).join(' · ')
}

/** The full-spec phrase the QA gate greps for — a stable contract between
 *  the generator and the validator (qa_hyrox_race_spec). */
export const FULL_SPEC_PHRASE = 'at full race spec'
