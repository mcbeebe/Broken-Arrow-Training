import { FAQ } from '../content'

/** Questions, as native `<details>` (keyboard and screen-reader support for free). */
export function Faq() {
  return (
    <div className="min-w-0 flex-[1_1_420px]">
      <h2 className="m-0 mb-2 text-[26px] font-extrabold tracking-[-0.02em]">{FAQ.title}</h2>
      {FAQ.items.map(item => (
        <details key={item.q} className="border-0 border-b border-solid border-landing-line">
          <summary className="min-h-[44px] py-2.5 text-[17px] font-bold">{item.q}</summary>
          <p className="m-0 mb-3.5 text-base leading-[1.55] text-landing-muted">{item.a}</p>
        </details>
      ))}
    </div>
  )
}
