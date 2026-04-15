import { useState } from 'react'

/**
 * Visual mockup of the planned Coach feature for design review.
 * No LLM wiring — all responses are canned. Visit via `#coach-preview`
 * hash or a temporary tab entry.
 *
 * Shows:
 *   1. Chat interface with sample conversation + model-tier badge
 *   2. Proposal cards at all four tone levels
 *   3. Memory view with About Me + structured records
 *   4. Coach-brain toggle (Fast / Balanced / Careful)
 */

type TabId = 'chat' | 'proposals' | 'memory'
type Tone = 'optional' | 'suggested' | 'recommended' | 'strongly_encouraged'
type Brain = 'fast' | 'balanced' | 'careful'
type ModelUsed = 'haiku' | 'sonnet'

interface ChatMsg {
  role: 'user' | 'coach'
  text: string
  model?: ModelUsed
}

const SAMPLE_THREAD: ChatMsg[] = [
  { role: 'user', text: 'My left knee felt tight after the downhills yesterday. Should I skip tomorrow?' },
  {
    role: 'coach',
    model: 'sonnet',
    text: "That tracks with what you've told me before — downhills have been the main flare-up trigger for that knee. Tomorrow is an easy 3mi Z1–2, not much eccentric load, but I'd still lean toward swapping it for a 20-min spin or a walk. Keeps the week's volume intact, gives the joint 48h of quiet. Want me to draft the swap?",
  },
  { role: 'user', text: 'yeah propose it' },
  {
    role: 'coach',
    model: 'sonnet',
    text: "Proposed below. It's recommended — not required — because you're still early in the block and a missed easy day won't hurt fitness. If the knee feels clean by the morning, run it.",
  },
]

export default function CoachPreview() {
  const [tab, setTab] = useState<TabId>('chat')
  const [brain, setBrain] = useState<Brain>('balanced')

  return (
    <div className="max-w-md mx-auto pb-24">
      <Banner />

      <div className="px-3 mt-3">
        <TabBar tab={tab} onChange={setTab} />
      </div>

      <div className="px-3 mt-3">
        {tab === 'chat' && <ChatView brain={brain} onBrainChange={setBrain} />}
        {tab === 'proposals' && <ProposalsView />}
        {tab === 'memory' && <MemoryView />}
      </div>
    </div>
  )
}

// ─── Banner ──────────────────────────────────────────────────

function Banner() {
  return (
    <div className="bg-gradient-to-r from-indigo-500 to-teal-500 text-white px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">Design preview · not yet live</p>
      <h1 className="text-lg font-bold">Coach</h1>
      <p className="text-xs opacity-90">Week 1 · 9 weeks to Broken Arrow · GREEN readiness</p>
    </div>
  )
}

// ─── Tabs ────────────────────────────────────────────────────

function TabBar({ tab, onChange }: { tab: TabId; onChange: (t: TabId) => void }) {
  const tabs: { id: TabId; label: string }[] = [
    { id: 'chat', label: '💬 Chat' },
    { id: 'proposals', label: '📝 Proposals' },
    { id: 'memory', label: '🧠 Memory' },
  ]
  return (
    <div className="flex rounded-xl overflow-hidden border border-slate-200 bg-white">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            tab === t.id ? 'bg-indigo-500 text-white' : 'bg-white text-slate-600'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ─── Chat view ───────────────────────────────────────────────

function ChatView({ brain, onBrainChange }: { brain: Brain; onBrainChange: (b: Brain) => void }) {
  const [input, setInput] = useState('')
  const [thread, setThread] = useState<ChatMsg[]>(SAMPLE_THREAD)
  const [typing, setTyping] = useState(false)

  function handleSend() {
    if (!input.trim()) return
    const userMsg: ChatMsg = { role: 'user', text: input }
    setThread([...thread, userMsg])
    setInput('')
    setTyping(true)
    setTimeout(() => {
      const model: ModelUsed = brain === 'fast' ? 'haiku' : brain === 'careful' ? 'sonnet' : 'haiku'
      setThread(t => [...t, {
        role: 'coach',
        model,
        text: "(Mockup response — in the real build this is where Claude's reply would stream in, grounded against your memory, last-14-days compliance, and upcoming plan.)",
      }])
      setTyping(false)
    }, 600)
  }

  return (
    <div>
      <BrainToggle brain={brain} onChange={onBrainChange} />

      <div className="mt-3 space-y-3">
        {thread.map((m, i) => <MessageBubble key={i} msg={m} />)}
        {typing && (
          <div className="flex gap-1 px-3">
            <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '120ms' }} />
            <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '240ms' }} />
          </div>
        )}
      </div>

      {/* Sample inline proposal card after the last coach message */}
      {thread.length >= 4 && (
        <div className="mt-3">
          <ProposalCard
            tone="recommended"
            title="Swap tomorrow's easy run → 20-min spin"
            why="Left-knee tightness after downhill work; give the joint 48h before Saturday's tempo."
            cost="Minor: misses ~3 mi of Z2 volume; no impact on key session."
            alt="Alt: walk 30 min + hip flexor foam roll, skip the cardio."
          />
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Ask the coach…"
          className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button onClick={handleSend} className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm font-medium hover:bg-indigo-600">
          Send
        </button>
      </div>
      <p className="text-[10px] text-slate-400 mt-1.5 italic">
        Voice input coming later. Not yet wired to the API — responses are mocked.
      </p>
    </div>
  )
}

function MessageBubble({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
        isUser
          ? 'bg-indigo-500 text-white rounded-br-sm'
          : 'bg-slate-100 text-slate-800 rounded-bl-sm'
      }`}>
        <p className="leading-snug whitespace-pre-wrap">{msg.text}</p>
        {!isUser && msg.model && (
          <p className={`text-[9px] mt-1 ${msg.model === 'sonnet' ? 'text-indigo-600 font-semibold' : 'text-slate-400'}`}>
            {msg.model === 'sonnet' ? '⚡ Sonnet — careful reasoning' : '· Haiku'}
          </p>
        )}
      </div>
    </div>
  )
}

function BrainToggle({ brain, onChange }: { brain: Brain; onChange: (b: Brain) => void }) {
  const opts: { id: Brain; label: string; sub: string }[] = [
    { id: 'fast', label: 'Fast', sub: 'Haiku only' },
    { id: 'balanced', label: 'Balanced', sub: 'Auto' },
    { id: 'careful', label: 'Careful', sub: 'Sonnet' },
  ]
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2">
      <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1.5 px-1">Coach brain</p>
      <div className="flex gap-1">
        {opts.map(o => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors text-center ${
              brain === o.id ? 'bg-white shadow-sm border border-indigo-200 text-indigo-700' : 'text-slate-500'
            }`}
          >
            <div>{o.label}</div>
            <div className="text-[9px] font-normal opacity-70">{o.sub}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Proposals view ──────────────────────────────────────────

function ProposalsView() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 mb-1">
        The four tone levels the coach uses. Each card is Accept / Edit / Reject — never auto-applied.
      </p>

      <ProposalCard
        tone="strongly_encouraged"
        title="Skip tomorrow's hill repeats"
        why="You reported sharp left-knee pain at 7/10 on a 5K race. Hill repeats would load the same tissue."
        cost="Miss one quality session in week 4. We'll replace with a pool run or bike alternative."
        alt="If pain is < 3/10 by morning, sub 45-min spin + technique drills."
      />

      <ProposalCard
        tone="recommended"
        title="Swap Wed ↔ Tue this week"
        why="You have PT Wednesday morning — moving the easy run avoids a same-day double."
        cost="Wed now has only mobility; Tue adds 45 min of Z2."
        alt="Alt: drop Wed entirely, keep Tue as planned."
      />

      <ProposalCard
        tone="suggested"
        title="Try 5am for Saturday's long run"
        why="Forecast shows 85°F by 9am. Your HR data shows meaningful drift above 75°F."
        cost="Earlier wake-up. Fueling needs to shift earlier too."
        alt="Keep 7am start, expect ~10% HR drift."
      />

      <ProposalCard
        tone="optional"
        title="Add strides after Thursday's run"
        why="You're 3 weeks from your first quality session — a light priming dose of speed keeps the neuromuscular system awake."
        cost="Adds 5 min to Thursday. Not critical for Broken Arrow."
        alt="Skip — won't affect race outcome."
      />
    </div>
  )
}

function ProposalCard({ tone, title, why, cost, alt }: { tone: Tone; title: string; why: string; cost: string; alt: string }) {
  const [expanded, setExpanded] = useState(tone === 'recommended' || tone === 'strongly_encouraged')
  const style = toneStyle(tone)

  return (
    <div className={`rounded-xl border overflow-hidden ${style.container}`}>
      <button onClick={() => setExpanded(!expanded)} className="w-full px-3 py-2 text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${style.chip}`}>
                {style.label}
              </span>
              <span className="text-xs font-semibold text-slate-800">{title}</span>
            </div>
          </div>
          <span className="text-slate-400 text-xs mt-0.5">{expanded ? '▼' : '›'}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-slate-200/60">
          <div className="pt-2">
            <p className="text-[10px] font-semibold text-slate-500 uppercase">Why</p>
            <p className="text-xs text-slate-700">{why}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase">Cost</p>
            <p className="text-xs text-slate-700">{cost}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase">Alternative</p>
            <p className="text-xs text-slate-700">{alt}</p>
          </div>
          <div className="flex gap-2 pt-1">
            <button className={`flex-1 py-1.5 text-xs font-semibold rounded-lg ${style.primaryBtn}`}>Accept</button>
            <button className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50">Edit</button>
            <button className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50">Reject</button>
          </div>
        </div>
      )}
    </div>
  )
}

function toneStyle(tone: Tone) {
  switch (tone) {
    case 'strongly_encouraged':
      return {
        label: '⚠ Strongly encouraged',
        container: 'bg-red-50 border-red-300',
        chip: 'bg-red-600 text-white',
        primaryBtn: 'bg-red-600 text-white hover:bg-red-700',
      }
    case 'recommended':
      return {
        label: '📌 Recommended',
        container: 'bg-amber-50 border-amber-200',
        chip: 'bg-amber-500 text-white',
        primaryBtn: 'bg-amber-600 text-white hover:bg-amber-700',
      }
    case 'suggested':
      return {
        label: '💡 Suggested',
        container: 'bg-teal-50 border-teal-200',
        chip: 'bg-teal-500 text-white',
        primaryBtn: 'bg-teal-600 text-white hover:bg-teal-700',
      }
    case 'optional':
      return {
        label: '· Optional',
        container: 'bg-slate-50 border-slate-200',
        chip: 'bg-slate-400 text-white',
        primaryBtn: 'bg-slate-600 text-white hover:bg-slate-700',
      }
  }
}

// ─── Memory view ─────────────────────────────────────────────

function MemoryView() {
  const [aboutMe, setAboutMe] = useState(
    `Training for Broken Arrow 18K (June 2026). History of left-knee tightness after downhills — ice + rest works, foam rolling the hip flexors (not the quad) gets at the referred pain. Right hamstring flared in 2024, now managed. Ice baths yes; icy-hot is useless for me. Foam rolling yes, static stretching no. Prefer 5am runs, hate trail in rain.

PT is Sara at NorthBay, typically Wed mornings.`,
  )

  return (
    <div className="space-y-3">
      {/* About Me */}
      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-slate-700">About Me</p>
          <span className="text-[9px] text-slate-400">editable · auto-populated</span>
        </div>
        <textarea
          value={aboutMe}
          onChange={e => setAboutMe(e.target.value)}
          rows={7}
          className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none leading-relaxed"
        />
        <p className="text-[10px] text-slate-400 mt-1 italic">
          The coach reads this on every turn. When the coach learns something new in conversation, it'll append a "— coach learned today" line you can keep or edit.
        </p>
      </div>

      {/* Coach-inferred addition (pending) */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wider bg-indigo-500 text-white px-1.5 py-0.5 rounded">
            Coach learned today
          </span>
        </div>
        <p className="text-xs text-slate-700 leading-snug">
          "Mike responds to volume, not intensity. The two biggest fitness jumps in his last block both came during 40+ mpw weeks, not during tempo-heavy weeks."
        </p>
        <div className="flex gap-2 mt-2">
          <button className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
            Add to About Me
          </button>
          <button className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50">
            Edit
          </button>
          <button className="py-1.5 px-3 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-slate-50">
            Dismiss
          </button>
        </div>
      </div>

      {/* Structured records summary */}
      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <p className="text-xs font-semibold text-slate-700 mb-2">What the coach is tracking</p>
        <div className="space-y-1.5">
          <RecordRow icon="🩹" label="Left knee" value="Managed · trigger: downhills · last flareup: this week" />
          <RecordRow icon="🩹" label="Right hamstring" value="Resolved · monitor on long runs" />
          <RecordRow icon="❄️" label="Ice baths" value="Loves" />
          <RecordRow icon="🧘" label="Static stretching" value="Refuses" />
          <RecordRow icon="🌅" label="Morning runs" value="Strong preference — 5am" />
          <RecordRow icon="👤" label="PT — Sara, NorthBay" value="Wed mornings" />
          <RecordRow icon="📈" label="Principle" value="Responds to volume, not intensity" />
        </div>
        <button className="w-full mt-3 py-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700">
          View + edit all →
        </button>
      </div>
    </div>
  )
}

function RecordRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="w-5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="text-slate-500"> · {value}</span>
      </div>
    </div>
  )
}
