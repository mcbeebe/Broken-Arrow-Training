import { SCREENS } from '../content'

/**
 * “See it in the app”: real screens, cropped so nothing personal shows. A
 * swipe row on phones, columns on wider screens. Lazy-loaded with fixed
 * dimensions, so they cost nothing until scrolled to and never shift the page.
 */
export function AppScreens() {
  return (
    <section className="bg-landing-card">
      <div className="mx-auto max-w-landing px-6 py-24">
        <h2 className="m-0 text-[clamp(32px,4vw,48px)] font-extrabold leading-[1.05] tracking-[-0.03em]">{SCREENS.title}</h2>
        <p className="m-0 mt-4 max-w-[30em] text-lg leading-[1.55] text-landing-muted">{SCREENS.intro}</p>
        <ul
          aria-label={SCREENS.title}
          className="-mx-6 m-0 mt-10 flex list-none snap-x snap-mandatory scroll-px-6 items-start gap-5 overflow-x-auto px-6 pb-4 sm:mx-0 sm:block sm:columns-2 sm:gap-6 sm:overflow-visible sm:px-0 sm:pb-0 lg:columns-3"
        >
          {SCREENS.items.map(s => (
            // In the phone row a portrait screen gets a narrower card, so it doesn't set the row's height.
            <li key={s.id} className={`${s.height > s.width * 1.5 ? 'w-[46%]' : 'w-[78%]'} flex-none snap-start sm:mb-6 sm:w-auto sm:break-inside-avoid`}>
              <figure className="m-0">
                <img
                  src={s.src}
                  width={s.width}
                  height={s.height}
                  alt={s.alt}
                  loading="lazy"
                  decoding="async"
                  className="block h-auto w-full rounded-2xl border border-solid border-landing-line shadow-landing-float"
                />
                <figcaption className="mt-3 text-[15px] leading-normal text-landing-muted">{s.caption}</figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
