import { FOOTER } from '../content'

/** The closing call to action: the one place orange fills a button (tokens.json). */
export function SiteFooter() {
  return (
    <footer className="bg-landing-deep text-landing-on-deep-muted">
      <div className="mx-auto flex max-w-landing flex-wrap items-center justify-between gap-7 px-6 py-14">
        <div>
          <p className="m-0 text-[30px] font-extrabold tracking-[-0.02em] text-landing-on-deep">{FOOTER.line}</p>
          <p className="mb-0 mt-1.5 text-base">{FOOTER.sub}</p>
        </div>
        <a
          href={FOOTER.cta.href}
          className="inline-flex min-h-[44px] items-center rounded-full bg-landing-cta-on-deep-bg px-6 py-[15px] text-base font-bold text-landing-cta-on-deep-text no-underline"
        >
          {FOOTER.cta.label}
        </a>
      </div>
      <div className="mx-auto flex max-w-landing flex-wrap items-center gap-x-[22px] px-6 pb-8 text-sm">
        {FOOTER.links.map(l => (
          <a key={l.href} href={l.href} className="inline-flex min-h-[44px] items-center text-landing-on-deep-muted">
            {l.label}
          </a>
        ))}
        <span>{FOOTER.copyright}</span>
      </div>
    </footer>
  )
}
