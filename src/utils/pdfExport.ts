import jsPDF from 'jspdf'
import type { ActualWorkout, PlannedDay, PerformanceMetrics, RaceInfo, StrengthExerciseLog, TrainingWeek } from '../types'

// Minimal readiness summary inlined here so this PR ships independently of
// the race-ready hero card branch. When that branch lands, this can switch
// to the shared computeRaceReadiness util.
function targetCtlForDistance(miles: number): number {
  if (miles <= 3.5) return 35
  if (miles <= 7) return 40
  if (miles <= 14) return 55
  if (miles <= 27) return 65
  return 75
}
function quickReadinessPct(ctl: number, distanceMiles: number): number {
  const target = targetCtlForDistance(distanceMiles)
  return Math.max(0, Math.min(100, Math.round((ctl / target) * 100)))
}

export type ExportWindowWeeks = 4 | 12 | 26

export interface AthletePdfInput {
  athleteName: string
  race: RaceInfo
  weeks: TrainingWeek[]
  performance: PerformanceMetrics[]
  /** How far back to include — drives the "last N weeks" window. */
  windowWeeks: ExportWindowWeeks
  /** Optional override for now() — used in tests. */
  generatedAt?: Date
}

// ─── Formatting helpers ─────────────────────────────────────────

function formatPaceSecPerMile(distanceMi: number, movingSec: number): string | null {
  if (!distanceMi || !movingSec || distanceMi <= 0 || movingSec <= 0) return null
  const secPerMi = movingSec / distanceMi
  const m = Math.floor(secPerMi / 60)
  const s = Math.round(secPerMi % 60)
  return `${m}:${String(s).padStart(2, '0')}/mi`
}

function formatHMS(seconds: number): string {
  if (!seconds || seconds <= 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

function formatHrZoneSummary(zones: ActualWorkout['hrZoneSummary']): string | null {
  if (!zones || zones.length === 0) return null
  const total = zones.reduce((s, z) => s + (z.seconds || 0), 0)
  if (total <= 0) return null
  const parts = zones
    .filter(z => z.seconds > 0)
    .sort((a, b) => a.zone - b.zone)
    .map(z => `${Math.round((z.seconds / total) * 100)}% Z${z.zone}`)
  return parts.join(' · ')
}

function dayOfWeek(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return ''
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
}

function summariseStrength(log: StrengthExerciseLog[]): string[] {
  return log.slice(0, 12).map(ex => {
    const sets = ex.sets || []
    if (sets.length === 0) return `• ${ex.name}`
    // Group by identical (reps, weight). For typical strength logs the
    // pattern is "3×8 @ 135 lb" or "3×8, 1×6 @ varying". Show up to two
    // (reps × weight) groupings inline.
    const buckets = new Map<string, number>()
    for (const s of sets) {
      const key = `${s.reps}|${s.weight || ''}`
      buckets.set(key, (buckets.get(key) ?? 0) + 1)
    }
    const summary = Array.from(buckets.entries()).slice(0, 2).map(([k, count]) => {
      const [reps, weight] = k.split('|')
      const w = weight ? ` @ ${weight}` : ''
      return `${count}×${reps}${w}`
    }).join(', ')
    return `• ${ex.name} — ${summary}`
  })
}

function plannedDayStatus(day: PlannedDay): string {
  // ASCII-only so jsPDF's Helvetica font renders cleanly. Non-ASCII glyphs
  // like ✓ ✗ · trigger letter-spaced rendering at small bold sizes.
  if (day.type === 'rest') return 'REST'
  if (day.actual) return 'DONE'
  return 'MISS'
}

// ─── Main exporter ──────────────────────────────────────────────

/**
 * Generate a printable PDF training-log summary the athlete can hand to a
 * human coach, physio, or training partner. Text-only via jsPDF — no DOM
 * scraping, no html2canvas, no backend round-trip.
 *
 * Returns a Blob ready to attach to a download anchor, save into a
 * `URL.createObjectURL`, or assert on in tests.
 */
export function generateAthletePdf(input: AthletePdfInput): Blob {
  const { athleteName, race, weeks, performance, windowWeeks, generatedAt } = input
  const now = generatedAt ?? new Date()
  // Uncompressed streams: ~20% larger output but every coach reviewing
  // these PDFs is on a desktop reader where size is irrelevant, and it
  // makes the output reviewable / diffable / grep-able. Worth it.
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: false })

  const PAGE_LEFT = 48
  const PAGE_RIGHT = 564 // letter width 612 − 48 margin
  const LINE = 14
  let y = 64

  function pageBreakIfNeeded(reserve = LINE) {
    if (y + reserve > 740) {
      doc.addPage()
      y = 64
    }
  }
  function writeHeading(text: string, size = 16) {
    pageBreakIfNeeded(size + 6)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(size)
    doc.text(text, PAGE_LEFT, y)
    y += size + 6
  }
  function writeLine(text: string, opts: { bold?: boolean; size?: number; gap?: number; indent?: number } = {}) {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
    doc.setFontSize(opts.size ?? 11)
    const left = PAGE_LEFT + (opts.indent ?? 0)
    const wrapWidth = PAGE_RIGHT - left
    const lines = doc.splitTextToSize(text, wrapWidth)
    for (const line of lines) {
      pageBreakIfNeeded()
      doc.text(line, left, y)
      y += opts.gap ?? LINE
    }
  }
  function writeRule() {
    doc.setDrawColor(200)
    doc.line(PAGE_LEFT, y - 6, PAGE_RIGHT, y - 6)
    y += 6
  }

  // ── Header ─────────────────────────────────────────────────────
  writeHeading(athleteName || 'Athlete')
  writeLine(`Broken Arrow Training · generated ${now.toLocaleDateString()}`, { size: 10 })
  writeLine(`Window: last ${windowWeeks} weeks`, { size: 10 })
  y += 8
  writeRule()

  // ── Race ───────────────────────────────────────────────────────
  writeHeading('Goal race', 13)
  writeLine(race.name, { bold: true })
  writeLine(`${race.distance} · ${race.elevation}`)
  writeLine(`${race.date}`)
  if (race.course) writeLine(race.course, { size: 10 })
  y += 4

  // ── Race readiness — quick CTL-vs-target snapshot ──────────────
  if (performance.length > 0 && race.distanceMiles > 0) {
    const latest = performance[performance.length - 1]
    const pct = quickReadinessPct(latest.ctl, race.distanceMiles)
    writeHeading('Race readiness', 13)
    writeLine(`${pct}% ready — based on current fitness vs. typical level for this distance.`)
    y += 4
  }

  // ── Fitness / fatigue trend ────────────────────────────────────
  writeHeading('Fitness · Fatigue · Recovery Balance', 13)
  if (performance.length > 0) {
    const latest = performance[performance.length - 1]
    const oldest = performance[Math.max(0, performance.length - windowWeeks * 7)]
    const ctlDelta = latest.ctl - oldest.ctl
    writeLine(`Current — Fitness ${latest.ctl.toFixed(0)} · Fatigue ${latest.atl.toFixed(0)} · Recovery Balance ${latest.tsb >= 0 ? '+' : ''}${latest.tsb.toFixed(0)}`)
    writeLine(`Load ramp: ${latest.acwr.toFixed(2)} (safe range 0.8–1.3)`)
    writeLine(`Fitness ${ctlDelta >= 0 ? 'up' : 'down'} ${Math.abs(ctlDelta).toFixed(0)} points over the window.`)
  } else {
    writeLine('No fitness metrics in the selected window.')
  }
  y += 4

  // ── Plan adherence (aggregate) ─────────────────────────────────
  writeHeading('Plan adherence', 13)
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - windowWeeks * 7)
  const inWindow = weeks.filter(w => {
    if (!w.dates) return true
    // `dates` is a free-text range like "2026-05-01 - 2026-05-07" or
    // "May 1 – May 7". Split on " – " / " - " / em-dash with spaces so we
    // don't tear an ISO date apart on its inner hyphens.
    const startStr = w.dates.split(/\s+[–-]\s+/)[0]?.trim() ?? w.dates.trim()
    const start = new Date(startStr)
    return Number.isNaN(start.getTime()) ? true : start >= cutoff
  })
  let plannedCount = 0
  let completedCount = 0
  for (const week of inWindow) {
    for (const day of week.days ?? []) {
      if (day.type === 'rest') continue
      plannedCount += 1
      if (day.actual) completedCount += 1
    }
  }
  const adherencePct = plannedCount > 0 ? Math.round((completedCount / plannedCount) * 100) : null
  if (adherencePct != null) {
    writeLine(`${completedCount} of ${plannedCount} scheduled sessions completed (${adherencePct}%).`)
  } else {
    writeLine('No scheduled sessions in this window.')
  }
  y += 8

  // ── Per-week training log ──────────────────────────────────────
  //
  // Each week renders: header line + every day with plan, actual stats, HR,
  // pace, elevation, RPE, training effect, strength exercises, and notes.
  // This is the section a human coach actually wants to read.
  writeHeading('Training log', 13)
  if (inWindow.length === 0) {
    writeLine('No weeks in this window.')
  }

  // Render oldest → newest so the document reads chronologically.
  const orderedWeeks = [...inWindow].sort((a, b) => a.num - b.num)
  for (const week of orderedWeeks) {
    pageBreakIfNeeded(28)
    y += 4
    writeLine(
      `Week ${week.num}${week.dates ? ` — ${week.dates}` : ''}${week.focus ? `  ·  ${week.focus}` : ''}${week.miles ? `  ·  ${week.miles} mi planned` : ''}`,
      { bold: true, size: 11 },
    )

    for (const day of week.days ?? []) {
      const actual = day.actual
      const status = plannedDayStatus(day)
      const dateIso = actual?.startDate?.slice(0, 10)
      const dayLabel = dateIso ? `${dayOfWeek(dateIso)} ${dateIso.slice(5)}` : day.day
      const plannedBits = [day.workout, day.zone, day.time].filter(b => b && b !== '—').join(' · ')

      pageBreakIfNeeded(28)
      writeLine(`${status} ${dayLabel}  ${(day.type || '').toString().toUpperCase()}`, { bold: true, size: 10 })
      if (plannedBits) {
        writeLine(`Planned: ${plannedBits}`, { size: 10, indent: 14 })
      }
      if (day.detail && day.detail !== day.workout) {
        writeLine(day.detail, { size: 9, indent: 14 })
      }

      if (actual) {
        const statBits: string[] = []
        if (actual.distance > 0) statBits.push(`${actual.distance.toFixed(2)} mi`)
        const sec = actual.movingTime || actual.elapsedTime
        if (sec > 0) statBits.push(formatHMS(sec))
        const pace = formatPaceSecPerMile(actual.distance, actual.movingTime || actual.elapsedTime)
        if (pace) statBits.push(pace)
        if (actual.avgHR) statBits.push(`${actual.avgHR} avg HR${actual.maxHR ? ` (${actual.maxHR} max)` : ''}`)
        if (actual.elevationGain) statBits.push(`${Math.round(actual.elevationGain)} ft`)
        if (statBits.length > 0) writeLine(statBits.join(' · '), { size: 10, indent: 14 })

        const secondLine: string[] = []
        if (actual.rpe) secondLine.push(`RPE ${actual.rpe}/10`)
        const zoneSummary = formatHrZoneSummary(actual.hrZoneSummary)
        if (zoneSummary) secondLine.push(zoneSummary)
        if (actual.aerobicTE) secondLine.push(`Aerobic TE ${actual.aerobicTE.toFixed(1)}`)
        if (actual.epoc) secondLine.push(`EPOC ${Math.round(actual.epoc)}`)
        if (actual.calories) secondLine.push(`${Math.round(actual.calories)} kcal`)
        if (secondLine.length > 0) writeLine(secondLine.join(' · '), { size: 9, indent: 14 })

        if (actual.strengthLog && actual.strengthLog.length > 0) {
          for (const ex of summariseStrength(actual.strengthLog)) {
            writeLine(ex, { size: 9, indent: 20 })
          }
          if (actual.strengthLog.length > 12) {
            writeLine(`(${actual.strengthLog.length - 12} more exercises)`, { size: 9, indent: 20 })
          }
        }

        if (actual.notes && actual.notes.trim()) {
          writeLine(`"${actual.notes.trim()}"`, { size: 9, indent: 14 })
        }
      } else if (day.type !== 'rest') {
        writeLine('Missed.', { size: 9, indent: 14 })
      }
      y += 2
    }
    y += 4
  }

  // ── Footer ─────────────────────────────────────────────────────
  pageBreakIfNeeded(40)
  y += 8
  writeRule()
  writeLine('Share this with your coach, physio, or training partner.', { size: 9 })
  writeLine('Source: Broken Arrow Training', { size: 9 })

  return doc.output('blob')
}

export function pdfFilename(athleteName: string, now: Date = new Date()): string {
  const safeName = (athleteName || 'athlete').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'athlete'
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `broken-arrow-${safeName}-${y}${m}${d}.pdf`
}
