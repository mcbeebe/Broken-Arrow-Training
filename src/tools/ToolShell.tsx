import type { ReactNode } from 'react'

/**
 * Shared shell for the free public calculators (G10 — the acquisition
 * funnel). Rules, locked in docs/gap-closure-build-plan.md §1-D6:
 *   - PURE CLIENT: no fetch, no storage, no auth — a guard test enforces it;
 *   - same engines as the app (imported, never copied);
 *   - every page ends in the "get the full plan" CTA carrying ?from= so
 *     tool→signup conversion is measurable;
 *   - masters-accessible: ≥16px body, high contrast, no color-only meaning.
 */

export function ToolShell({ title, tagline, toolId, children }: {
  title: string
  tagline: string
  toolId: string
  children: ReactNode
}) {
  const appHref = `${import.meta.env.BASE_URL}?from=${encodeURIComponent(toolId)}`
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800" style={{ fontSize: 16 }}>
      <header className="bg-slate-900 text-white px-5 py-6">
        <div className="max-w-xl mx-auto">
          <div className="flex items-center gap-2 text-teal-300 font-bold tracking-wide text-sm mb-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" aria-hidden />
            ATTUNE · free tools
          </div>
          <h1 className="text-2xl font-bold leading-tight">{title}</h1>
          <p className="text-slate-300 mt-1">{tagline}</p>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-5 py-6">{children}</main>

      <footer className="max-w-xl mx-auto px-5 pb-10">
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-5 py-4">
          <p className="font-semibold text-teal-900">This calculator is about 1% of the engine.</p>
          <p className="text-teal-800 mt-1">
            The full coach builds your whole plan around numbers like these — readiness that
            actually changes your training, trail-specific workouts, and a coach that explains why.
          </p>
          <a
            href={appHref}
            className="inline-block mt-3 rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-800"
          >
            Get the full plan →
          </a>
        </div>
        <p className="text-xs text-slate-400 mt-4">
          Runs entirely in your browser — nothing you enter is sent anywhere.
        </p>
      </footer>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block mb-4">
      <span className="block text-sm font-semibold text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  )
}

export const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-base bg-white ' +
  'focus:outline-none focus:ring-2 focus:ring-teal-500'
