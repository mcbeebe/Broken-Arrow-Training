import { FOUNDER } from '../content'

/** The founder's note. Its wording is a draft that needs sign-off before launch (copy.md). */
export function FounderNote() {
  return (
    <figure className="m-0 min-w-0 flex-[1_1_420px]">
      <blockquote className="m-0 text-2xl font-medium leading-[1.45] tracking-[-0.01em]">{FOUNDER.quote}</blockquote>
      <figcaption className="mt-[18px] text-base text-landing-muted">
        <span className="font-bold text-landing-ink">{FOUNDER.name}</span>
        {FOUNDER.role}
      </figcaption>
    </figure>
  )
}
