import { BRAND, NAV } from '../content'
import { AttuneMark } from './AttuneMark'

/** Wordmark left, nav right. At ≤640px only Sign in and the invite button stay. */
export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-landing flex-wrap items-center justify-between gap-4 px-6 py-[22px]">
      <a href="#top" className="flex items-center gap-2.5 text-landing-ink no-underline">
        <AttuneMark />
        <span className="text-[22px] font-extrabold tracking-[-0.02em]">{BRAND}</span>
      </a>
      <nav aria-label={NAV.label} className="flex flex-wrap items-center gap-x-[22px] text-[15px] font-medium">
        {NAV.links.map(l => (
          <a
            key={l.href}
            href={l.href}
            className="inline-flex min-h-[44px] items-center text-landing-muted no-underline max-[640px]:hidden"
          >
            {l.label}
          </a>
        ))}
        <a href={NAV.signIn.href} className="inline-flex min-h-[44px] items-center text-landing-muted no-underline">
          {NAV.signIn.label}
        </a>
        <a
          href={NAV.cta.href}
          className="inline-flex min-h-[44px] items-center rounded-full bg-landing-ink px-[18px] font-semibold text-landing-ground no-underline"
        >
          {NAV.cta.label}
        </a>
      </nav>
    </header>
  )
}
