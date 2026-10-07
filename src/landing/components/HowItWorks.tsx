import { HOW } from '../content'

/** “How a morning works”: four steps on white (`#how`). */
export function HowItWorks() {
  return (
    <section id="how" className="bg-landing-card">
      <div className="mx-auto max-w-landing px-6 py-[88px]">
        <h2 className="m-0 text-[clamp(32px,4vw,48px)] font-extrabold leading-[1.05] tracking-[-0.03em]">{HOW.title}</h2>
        <ol className="m-0 mt-11 grid list-none grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-8 p-0">
          {HOW.steps.map((step, i) => (
            <li key={step.title} className="border-0 border-t-2 border-solid border-landing-action pt-[18px]">
              <p aria-hidden="true" className="m-0 text-[44px] font-extrabold leading-none text-landing-action">
                {i + 1}
              </p>
              <h3 className="m-0 mt-3.5 text-[21px] font-bold">{step.title}</h3>
              <p className="m-0 mt-2 text-base leading-[1.55] text-landing-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
