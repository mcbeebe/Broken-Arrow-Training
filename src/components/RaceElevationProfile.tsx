import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { RaceInfo } from '../types'

interface ElevationProfileProps {
  race: RaceInfo
}

interface ProfilePoint {
  mile: number
  elevation: number
  label?: string
  grade?: string
}

const PROFILE_18K: ProfilePoint[] = [
  { mile: 0.0, elevation: 6200, label: 'Start (Base Area)', grade: '' },
  { mile: 0.5, elevation: 6450, grade: '+10%' },
  { mile: 1.0, elevation: 6750, grade: '+12%' },
  { mile: 1.5, elevation: 7100, grade: '+14%' },
  { mile: 2.0, elevation: 7400, label: 'KT-22 Saddle', grade: '+12%' },
  { mile: 2.5, elevation: 7650, grade: '+10%' },
  { mile: 3.0, elevation: 7900, label: 'Red Dog Ridge', grade: '+10%' },
  { mile: 3.5, elevation: 8300, grade: '+16%' },
  { mile: 4.0, elevation: 8650, label: 'Stairway to Heaven', grade: '+14%' },
  { mile: 4.5, elevation: 8950, grade: '+12%' },
  { mile: 4.7, elevation: 9000, label: 'Washeshu Peak (HIGH POINT)', grade: '+4%' },
  { mile: 4.9, elevation: 8850, label: 'Siberia Aid Station', grade: '-12%' },
  { mile: 5.5, elevation: 8400, grade: '-17%' },
  { mile: 6.0, elevation: 7900, grade: '-20%' },
  { mile: 6.5, elevation: 7500, label: 'Shirley Canyon', grade: '-16%' },
  { mile: 7.0, elevation: 7100, grade: '-16%' },
  { mile: 7.6, elevation: 6800, label: "Julia's Aid Station", grade: '-8%' },
  { mile: 8.0, elevation: 6650, grade: '-7%' },
  { mile: 8.5, elevation: 6550, grade: '-4%' },
  { mile: 9.0, elevation: 6450, label: 'Western States Trail', grade: '-4%' },
  { mile: 9.5, elevation: 6380, grade: '-3%' },
  { mile: 10.0, elevation: 6300, grade: '-3%' },
  { mile: 10.5, elevation: 6250, grade: '-2%' },
  { mile: 11.0, elevation: 6200, label: 'Finish! Ring das bell!', grade: '-2%' },
]

const PROFILE_11K: ProfilePoint[] = [
  { mile: 0.0, elevation: 6200, label: 'Start (Base Area)', grade: '' },
  { mile: 0.5, elevation: 6400, grade: '+8%' },
  { mile: 1.0, elevation: 6650, grade: '+10%' },
  { mile: 1.5, elevation: 6950, label: 'Begin Stairway', grade: '+12%' },
  { mile: 2.0, elevation: 7300, grade: '+14%' },
  { mile: 2.5, elevation: 7650, label: 'Stairway to Heaven', grade: '+14%' },
  { mile: 3.0, elevation: 7900, grade: '+10%' },
  { mile: 3.3, elevation: 8000, label: 'Siberia Ridge (HIGH POINT)', grade: '+6%' },
  { mile: 3.5, elevation: 7950, grade: '-3%' },
  { mile: 4.0, elevation: 7750, label: 'Begin descent', grade: '-8%' },
  { mile: 4.5, elevation: 7400, grade: '-14%' },
  { mile: 5.0, elevation: 7000, grade: '-16%' },
  { mile: 5.5, elevation: 6700, grade: '-12%' },
  { mile: 6.0, elevation: 6450, grade: '-10%' },
  { mile: 6.8, elevation: 6200, label: 'Finish! Ring das bell!', grade: '-6%' },
]

export default function RaceElevationProfile({ race }: ElevationProfileProps) {
  const is18K = race.distanceMiles >= 10
  const profile = is18K ? PROFILE_18K : PROFILE_11K
  const peakElev = Math.max(...profile.map(p => p.elevation))
  const minElev = Math.min(...profile.map(p => p.elevation))

  const aidStations = profile.filter(p => p.label?.includes('Aid') || p.label?.includes('HIGH POINT'))

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
      <p className="text-sm font-semibold text-slate-700 mb-1">Elevation Profile</p>
      <p className="text-xs text-slate-400 mb-3">
        {race.elevation} · {race.elevationRange}
      </p>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={profile} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="elevProfile" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0d9488" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#0d9488" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="mile"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickFormatter={v => `${v}`}
              axisLine={false}
              tickLine={false}
              label={{ value: 'Miles', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: '#94a3b8' }}
            />
            <YAxis
              domain={[minElev - 200, peakElev + 300]}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickFormatter={v => `${(v / 1000).toFixed(1)}k`}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                padding: '8px 12px',
              }}
              formatter={(value, _name, props) => {
                const pt = (props as { payload?: ProfilePoint }).payload
                if (!pt) return [`${value}`, '']
                const parts = [`${pt.elevation.toLocaleString()} ft`]
                if (pt.grade) parts.push(`Grade: ${pt.grade}`)
                if (pt.label) parts.push(pt.label)
                return [parts.join(' · '), '']
              }}
              labelFormatter={v => `Mile ${v}`}
            />
            {aidStations.map((as, i) => (
              <ReferenceLine
                key={i}
                x={as.mile}
                stroke="#f59e0b"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
            ))}
            <Area
              type="monotone"
              dataKey="elevation"
              stroke="#0d9488"
              strokeWidth={2}
              fill="url(#elevProfile)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Grade breakdown */}
      <div className="mt-3 space-y-1.5">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Segment Grades</p>
        {getSegments(profile).map((seg, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className="h-2.5 rounded-full shrink-0"
              style={{
                width: `${Math.max(8, Math.abs(seg.avgGrade) * 4)}px`,
                backgroundColor: seg.avgGrade > 10 ? '#dc2626' : seg.avgGrade > 5 ? '#f59e0b' : seg.avgGrade > 0 ? '#22c55e' : seg.avgGrade > -10 ? '#3b82f6' : '#8b5cf6',
              }}
            />
            <span className="text-xs text-slate-700 font-medium w-20 shrink-0">Mi {seg.from}–{seg.to}</span>
            <span className={`text-xs font-semibold w-10 shrink-0 ${seg.avgGrade > 0 ? 'text-red-600' : 'text-blue-600'}`}>
              {seg.avgGrade > 0 ? '+' : ''}{seg.avgGrade}%
            </span>
            <span className="text-xs text-slate-500 truncate">{seg.label}</span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3 pt-2 border-t border-slate-100">
        <span className="flex items-center gap-1 text-[10px] text-slate-500">
          <span className="w-2 h-2 rounded-full bg-red-500" /> Steep climb (&gt;10%)
        </span>
        <span className="flex items-center gap-1 text-[10px] text-slate-500">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> Moderate (5–10%)
        </span>
        <span className="flex items-center gap-1 text-[10px] text-slate-500">
          <span className="w-2 h-2 rounded-full bg-green-500" /> Easy (&lt;5%)
        </span>
        <span className="flex items-center gap-1 text-[10px] text-slate-500">
          <span className="w-2 h-2 rounded-full bg-blue-500" /> Descent
        </span>
      </div>
    </div>
  )
}

interface Segment {
  from: string
  to: string
  avgGrade: number
  label: string
}

function getSegments(profile: ProfilePoint[]): Segment[] {
  const segments: Segment[] = []
  let segStart = 0

  for (let i = 1; i < profile.length; i++) {
    const prev = profile[i - 1]
    const curr = profile[i]
    const prevClimbing = prev.elevation < (profile[Math.min(i, profile.length - 1)]?.elevation ?? prev.elevation)
    const currClimbing = curr.elevation >= prev.elevation

    if (i === profile.length - 1 || (prevClimbing !== currClimbing && i > segStart + 1)) {
      const startPt = profile[segStart]
      const endPt = profile[i]
      const distMi = endPt.mile - startPt.mile
      const elevChange = endPt.elevation - startPt.elevation
      const avgGrade = distMi > 0 ? Math.round((elevChange / (distMi * 5280)) * 100) : 0

      const label = profile.slice(segStart, i + 1).find(p => p.label)?.label || ''

      segments.push({
        from: startPt.mile.toFixed(1),
        to: endPt.mile.toFixed(1),
        avgGrade,
        label: label.replace(' (HIGH POINT)', '').replace('!', ''),
      })
      segStart = i
    }
  }

  return segments
}
