import { useState } from 'react'

/**
 * Visual mockup of the planned Coach feature — ambient integration
 * version. Instead of a dedicated chat tab, the coach shows up where
 * you already work: a card on Summary, a line on day cards, an About
 * Me section in Settings. Thread access is a drawer, not a destination.
 *
 * All responses are canned — no LLM wiring.
 */

type Tone = 'optional' | 'suggested' | 'recommended' | 'strongly_encouraged'

export default function CoachPreview() {
  return (
    <div className="max-w-md mx-auto pb-16">
      <Banner />

      <div className="px-3 py-4 space-y-6">
        <SurfaceBlock
          name="① On the Summary page"
          sub="The coach's daily read lives at the top of your home screen. Glanceable, dismissable, optional to engage with."
        >
          <SummaryMock />
        </SurfaceBlock>

        <SurfaceBlock
          name="② On a day card"
          sub="When a specific day needs a note, a small coach line appears inline. No chat UI — just the relevant thought, in context."
        >
          <DayCardMock />
        </SurfaceBlock>

        <SurfaceBlock
          name="③ On the workout instruction modal"
          sub="Opening a workout shows the coach's take at the top of the detail view, with a small Ask link for follow-up."
        >
          <WorkoutModalMock />
        </SurfaceBlock>

        <SurfaceBlock
          name="④ In Settings → About Me"
          sub="Memory lives as a free-text field you own. The coach can suggest additions, which you approve. No separate memory view, no extra tab."
        >
          <AboutMeMock />
        </SurfaceBlock>

        <SurfaceBlock
          name="⑤ Proposals in the flow"
          sub="When the coach recommends changing something, the proposal shows up inline on Summary or on the affected day — visual weight scales by tone."
        >
          <div className="space-y-2">
            <ProposalCard
              tone="strongly_encouraged"
              title="Skip tomorrow's hill repeats"
              why="You reported 7/10 left-knee pain today — hill repeats load the same tissue."
              cost="Replace with 45-min spin or pool run. Keeps the load, protects the knee."
            />
            <ProposalCard
              tone="recommended"
              title="Swap Wed ↔ Tue this week"
              why="You have PT Wednesday morning — avoids a same-day double."
              cost="Tue adds 45 min of Z2; Wed becomes mobility only."
            />
            <ProposalCard
              tone="suggested"
              title="Try 5am for Saturday's long run"
              why="Forecast shows 85°F by 9am; your HR drifts above 75°F."
              cost="Earlier wake-up; fueling shifts earlier too."
            />
            <ProposalCard
              tone="optional"
              title="Add strides after Thursday's run"
              why="Light speed priming 3 weeks out from quality work."
              cost="Adds 5 min. Not critical."
            />
          </div>
        </SurfaceBlock>

        <SurfaceBlock
          name="⑥ Full conversation (drawer)"
          sub="When you want scroll-back, the Summary card's 'our conversation' link opens a drawer. Not a destination — just scroll history."
        >
          <ConversationDrawerMock />
        </SurfaceBlock>
      </div>
    </div>
  )
}

// ─── Banner + section wrapper ───────────────────────────────

function Banner() {
  return (
    <div className="bg-gradient-to-r from-indigo-500 to-teal-500 text-white px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">Design preview · not live yet</p>
      <h1 className="text-lg font-bold">Coach — ambient integration</h1>
      <p className="text-xs opacity-90">No dedicated chat tab. Coach lives inside the surfaces you already use.</p>
    </div>
  )
}

function SurfaceBlock({ name, sub, children }: { name: string; sub: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">{name}</p>
      <p className="text-xs text-slate-500 mb-2 leading-snug">{sub}</p>
      <div className="bg-slate-100 rounded-2xl p-2">
        {children}
      </div>
    </div>
  )
}

// ─── ① Summary coach card mock ──────────────────────────────

function SummaryMock() {
  const [input, setInput] = useState('')
  const [showDrawer, setShowDrawer] = useState(false)

  return (
    <div className="space-y-2">
      {/* Fake Summary header for context */}
      <div className="bg-white rounded-xl p-3 shadow-sm">
        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Tuesday, Apr 14 · GREEN</p>
        <p className="text-sm font-semibold text-slate-800">Easy run · 3 mi · Z1–2</p>
      </div>

      {/* Coach note — ambient, no chat UI */}
      <div className="bg-white rounded-xl p-3 shadow-sm border-l-4 border-indigo-400">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-lg">🤖</span>
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Coach's read</p>
        </div>
        <p className="text-sm text-slate-700 leading-snug">
          Your sleep was 6h 20m — lower than your baseline. Your HR was also elevated on yesterday's run. I'd keep today truly easy — hold the lower end of Z2 and skip the strides. Nothing lost from a conservative day here.
        </p>
        <div className="mt-2 flex items-center gap-3 text-[11px]">
          <button className="text-indigo-600 font-medium hover:text-indigo-700">Tell me more</button>
          <span className="text-slate-300">·</span>
          <button onClick={() => setShowDrawer(true)} className="text-slate-500 hover:text-slate-700">
            Our conversation →
          </button>
        </div>

        {/* Inline quick-ask input */}
        <div className="mt-3 flex gap-1.5">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Quick question for the coach…"
            className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <button className="px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-xs font-medium">
            Ask
          </button>
        </div>
      </div>

      {/* Show a pending proposal inline if there is one */}
      <ProposalCard
        tone="recommended"
        title="Swap Wed ↔ Tue this week"
        why="You have PT Wednesday morning — avoids a same-day double."
        cost="Tue adds 45 min of Z2; Wed becomes mobility only."
      />

      {showDrawer && <ConversationDrawerMock inline onClose={() => setShowDrawer(false)} />}
    </div>
  )
}

// ─── ② DayCard coach line mock ──────────────────────────────

function DayCardMock() {
  return (
    <div className="space-y-2">
      {/* Normal day card with a coach line */}
      <div className="rounded-xl shadow-sm overflow-hidden" style={{ background: '#E0F2FE', borderLeft: '4px solid #0EA5E9' }}>
        <div className="px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">🏃</span>
              <span className="font-semibold text-sm text-slate-800">Thu 4/16</span>
              <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 font-medium">⚠ LIMITED</span>
            </div>
            <span className="text-xs text-slate-500 bg-white/60 rounded-full px-2 py-0.5">30 min</span>
          </div>
          <p className="font-medium text-sm text-slate-800 mt-1.5">⚠ LIMITED</p>
          <p className="text-xs text-slate-600">Easy walk or short jog, 20–30 min max</p>

          {/* Coach inline note — subtle, italic, no icons-everywhere */}
          <div className="mt-2 pt-2 border-t border-sky-200/60">
            <p className="text-xs text-indigo-700 leading-snug">
              <span className="font-semibold">Coach:</span> Last time you did a pre-race limited day you went too long and felt flat Sunday. Keep this to 20 min at the shorter end.
            </p>
            <button className="mt-1 text-[11px] text-indigo-500 font-medium">Ask about this day →</button>
          </div>
        </div>
      </div>

      {/* Another day — no coach note needed */}
      <div className="rounded-xl shadow-sm overflow-hidden" style={{ background: '#F1F5F9', borderLeft: '4px solid #94A3B8' }}>
        <div className="px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">🛌</span>
              <span className="font-semibold text-sm text-slate-800">Fri 4/17</span>
            </div>
            <span className="text-xs text-slate-500 bg-white/60 rounded-full px-2 py-0.5">—</span>
          </div>
          <p className="font-medium text-sm text-slate-800 mt-1.5">Rest</p>
          <p className="text-xs text-slate-600">Pre-race rest</p>
        </div>
      </div>
      <p className="text-[10px] text-slate-400 italic text-center">
        Coach only speaks up when there's something worth saying.
      </p>
    </div>
  )
}

// ─── ③ WorkoutModal coach note mock ────────────────────────

function WorkoutModalMock() {
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="px-3 py-2.5 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-800">Easy run · Tue 4/14</p>
          <span className="text-xs text-slate-400">✕</span>
        </div>
        <p className="text-xs text-slate-500">3 mi · Z1–2 (108–148) · 45 min</p>
      </div>

      {/* Coach's take — at the top of the detail view */}
      <div className="bg-indigo-50/60 px-3 py-2.5 border-b border-indigo-100">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-base">🤖</span>
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Coach</p>
        </div>
        <p className="text-xs text-slate-700 leading-snug">
          Straightforward easy day. Focus on drills — it's your scheduled drill day for week 1, and A-skips are the single highest-leverage form cue for your stride. You skipped these last block and your cadence stayed under 170.
        </p>
        <button className="mt-1.5 text-[11px] text-indigo-600 font-medium">Ask about this workout →</button>
      </div>

      <div className="px-3 py-2.5 space-y-2">
        <div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase">Purpose</p>
          <p className="text-xs text-slate-700">Aerobic base. Keep it conversational.</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase">How to execute</p>
          <p className="text-xs text-slate-700">Dynamic warm-up → 30 min Z2 → drills → cool-down…</p>
        </div>
      </div>
    </div>
  )
}

// ─── ④ About Me mock ────────────────────────────────────────

function AboutMeMock() {
  const [aboutMe, setAboutMe] = useState(
    `Training for Broken Arrow 18K (June 2026). History of left-knee tightness after downhills — ice + rest works, foam rolling the hip flexors (not the quad) gets at the referred pain. Right hamstring flared in 2024, now managed. Ice baths yes; icy-hot is useless for me. Foam rolling yes, static stretching no. Prefer 5am runs, hate trail in rain.

PT is Sara at NorthBay, typically Wed mornings.`,
  )

  return (
    <div className="bg-white rounded-xl p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-sm font-semibold text-slate-700">About Me</p>
          <p className="text-[10px] text-slate-400">What the coach knows about you. You own this.</p>
        </div>
      </div>
      <textarea
        value={aboutMe}
        onChange={e => setAboutMe(e.target.value)}
        rows={7}
        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none leading-relaxed"
      />

      {/* Pending coach-learned addition */}
      <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Coach noticed</p>
        <p className="text-xs text-slate-700 mt-0.5 leading-snug">
          "Mike's biggest fitness jumps have come from volume, not intensity — 40+ mpw weeks outpace tempo-heavy weeks."
        </p>
        <div className="mt-1.5 flex gap-1.5">
          <button className="text-[11px] font-semibold text-indigo-600">Add to About Me</button>
          <span className="text-slate-300">·</span>
          <button className="text-[11px] text-slate-500">Dismiss</button>
        </div>
      </div>
    </div>
  )
}

// ─── Proposal card (reused) ─────────────────────────────────

function ProposalCard({ tone, title, why, cost }: { tone: Tone; title: string; why: string; cost: string }) {
  const [expanded, setExpanded] = useState(tone === 'recommended' || tone === 'strongly_encouraged')
  const s = toneStyle(tone)
  return (
    <div className={`rounded-xl border overflow-hidden ${s.container}`}>
      <button onClick={() => setExpanded(!expanded)} className="w-full px-3 py-2 text-left">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${s.chip}`}>{s.label}</span>
            <span className="text-xs font-semibold text-slate-800">{title}</span>
          </div>
          <span className="text-slate-400 text-xs">{expanded ? '▼' : '›'}</span>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-2 border-t border-slate-200/60 space-y-1.5">
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase">Why</p>
            <p className="text-xs text-slate-700">{why}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase">Tradeoff</p>
            <p className="text-xs text-slate-700">{cost}</p>
          </div>
          <div className="flex gap-1.5 pt-1">
            <button className={`flex-1 py-1 text-xs font-semibold rounded-lg ${s.primaryBtn}`}>Accept</button>
            <button className="flex-1 py-1 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-600">Edit</button>
            <button className="flex-1 py-1 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-600">Reject</button>
          </div>
        </div>
      )}
    </div>
  )
}

function toneStyle(tone: Tone) {
  switch (tone) {
    case 'strongly_encouraged':
      return { label: '⚠ Strongly encouraged', container: 'bg-red-50 border-red-300', chip: 'bg-red-600 text-white', primaryBtn: 'bg-red-600 text-white' }
    case 'recommended':
      return { label: '📌 Recommended', container: 'bg-amber-50 border-amber-200', chip: 'bg-amber-500 text-white', primaryBtn: 'bg-amber-600 text-white' }
    case 'suggested':
      return { label: '💡 Suggested', container: 'bg-teal-50 border-teal-200', chip: 'bg-teal-500 text-white', primaryBtn: 'bg-teal-600 text-white' }
    case 'optional':
      return { label: '· Optional', container: 'bg-slate-50 border-slate-200', chip: 'bg-slate-400 text-white', primaryBtn: 'bg-slate-600 text-white' }
  }
}

// ─── ⑥ Conversation drawer mock ─────────────────────────────

function ConversationDrawerMock({ inline, onClose }: { inline?: boolean; onClose?: () => void } = {}) {
  const wrapper = inline
    ? 'mt-3 bg-white rounded-xl border border-slate-200 overflow-hidden'
    : 'bg-white rounded-xl shadow-sm overflow-hidden'

  return (
    <div className={wrapper}>
      <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-700">Our conversation</p>
        {inline && <button onClick={onClose} className="text-xs text-slate-400">✕</button>}
      </div>
      <div className="px-3 py-3 space-y-2 max-h-64 overflow-y-auto">
        <Bubble role="coach">Your sleep was 6h 20m last night — that's lower than your baseline. I'd keep today conservative.</Bubble>
        <Bubble role="user">makes sense. how's my week looking overall?</Bubble>
        <Bubble role="coach">Volume's tracking 8% under target so far this week. Not a concern — you have a hard Saturday coming and the low week intentionally front-loaded rest. Trust the plan.</Bubble>
        <Bubble role="user">my left knee is tight</Bubble>
        <Bubble role="coach">Noted — logging that. How bad, 1–10? Downhill-triggered like usual or something new?</Bubble>
      </div>
      <p className="text-[10px] text-slate-400 italic text-center pb-2">Scroll history — not a destination.</p>
    </div>
  )
}

function Bubble({ role, children }: { role: 'user' | 'coach'; children: React.ReactNode }) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] px-3 py-1.5 rounded-2xl text-xs leading-snug ${
        isUser ? 'bg-indigo-500 text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'
      }`}>{children}</div>
    </div>
  )
}
