import jsPDF from 'jspdf'
import type { RaceInfo, PerformanceMetrics, TrainingWeek } from '../types'

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

/**
 * Generate a printable PDF summary the athlete can hand to a human coach,
 * physio, or training partner. Text-only via jsPDF — no DOM scraping, no
 * html2canvas, no backend round-trip.
 *
 * Returns a Blob ready to attach to a download anchor, save into a
 * `URL.createObjectURL`, or assert on in tests.
 */
export function generateAthletePdf(input: AthletePdfInput): Blob {
  const { athleteName, race, weeks, performance, windowWeeks, generatedAt } = input
  const now = generatedAt ?? new Date()
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })

  const PAGE_LEFT = 48
  const PAGE_RIGHT = 564 // letter width 612 − 48 margin
  const LINE = 16
  let y = 64

  const writeHeading = (text: string, size = 16) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(size)
    doc.text(text, PAGE_LEFT, y)
    y += size + 6
  }
  const writeLine = (text: string, opts: { bold?: boolean; size?: number; gap?: number } = {}) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
    doc.setFontSize(opts.size ?? 11)
    const lines = doc.splitTextToSize(text, PAGE_RIGHT - PAGE_LEFT)
    for (const line of lines) {
      if (y > 740) {
        doc.addPage()
        y = 64
      }
      doc.text(line, PAGE_LEFT, y)
      y += opts.gap ?? LINE
    }
  }
  const writeRule = () => {
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

  // ── Weekly plan compliance ─────────────────────────────────────
  writeHeading('Plan adherence', 13)
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - windowWeeks * 7)
  const inWindow = weeks.filter(w => {
    if (!w.dates) return true
    const start = new Date(w.dates.split(/[–-]/)[0]?.trim() ?? '')
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
  y += 4

  // ── Recent completed sessions ──────────────────────────────────
  writeHeading('Recent sessions', 13)
  const recentActuals: { date: string; name: string; distance?: number; minutes?: number }[] = []
  for (const week of inWindow) {
    for (const day of week.days ?? []) {
      if (!day.actual) continue
      const seconds = day.actual.movingTime || day.actual.elapsedTime
      recentActuals.push({
        date: day.actual.startDate?.slice(0, 10) ?? '',
        name: day.actual.name || day.workout || 'Session',
        distance: day.actual.distance,
        minutes: seconds ? Math.round(seconds / 60) : undefined,
      })
    }
  }
  recentActuals.sort((a, b) => (a.date < b.date ? 1 : -1))
  if (recentActuals.length === 0) {
    writeLine('No completed sessions in this window.')
  } else {
    for (const a of recentActuals.slice(0, 20)) {
      const distance = a.distance ? `${a.distance.toFixed(1)} mi` : ''
      const duration = a.minutes ? `${a.minutes} min` : ''
      const bits = [a.date, a.name, distance, duration].filter(Boolean).join(' · ')
      writeLine(bits, { size: 10, gap: 14 })
    }
  }
  y += 8

  // ── Footer ─────────────────────────────────────────────────────
  if (y > 700) {
    doc.addPage()
    y = 64
  }
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
