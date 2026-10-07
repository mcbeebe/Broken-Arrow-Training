import { TOOLS } from '../content'

/** “Try it before you’re in”: the free calculators (`#tools`). */
export function ToolsPanel() {
  return (
    <section id="tools" className="mx-auto max-w-landing px-6 py-[72px]">
      <div className="flex flex-wrap items-start gap-9 rounded-[28px] bg-landing-deep p-[clamp(24px,5vw,44px)] text-landing-on-deep">
        <div className="min-w-0 flex-[1_1_300px]">
          <h2 className="m-0 text-[32px] font-extrabold leading-[1.1] tracking-[-0.03em]">{TOOLS.title}</h2>
          <p className="m-0 mt-3.5 text-[17px] leading-[1.55] text-landing-on-deep-muted">{TOOLS.body}</p>
        </div>
        <div className="grid min-w-0 flex-[2_1_480px] grid-cols-1 gap-3.5 sm:grid-cols-2">
          {TOOLS.items.map(t => (
            <a key={t.href} href={t.href} className="block rounded-[18px] bg-landing-deep-card p-5 text-landing-on-deep no-underline">
              <span className="block text-lg font-bold">{t.name}</span>
              <span className="mt-1.5 block text-[15px] leading-normal text-landing-on-deep-muted">{t.body}</span>
              <span className="mt-3.5 block text-[15px] font-bold text-landing-accent-on-deep">{t.link}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
