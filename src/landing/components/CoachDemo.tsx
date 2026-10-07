import { COACH, type TraitId } from '../content'
import { coachDisplayName, coachStatus } from '../coachText'

interface Props {
  coachName: string
  traits: ReadonlySet<TraitId>
  approved: boolean
  /** Wired in initiative 003 PR 4. */
  onApprove?: () => void
}

/**
 * A static conversation and one proposal (design-spec.md § CoachDemo). The
 * input and mic are decorative and disabled, so nobody types into a fake chat.
 */
export function CoachDemo({ coachName, traits, approved, onApprove }: Props) {
  const name = coachDisplayName(coachName)
  return (
    <div className="mx-auto min-w-0 max-w-[500px] flex-[1_1_440px] rounded-[28px] bg-landing-card p-[22px] shadow-landing-float">
      <div className="flex items-center gap-3 border-0 border-b border-solid border-landing-line pb-3.5">
        <div
          aria-hidden="true"
          className="flex size-11 flex-none items-center justify-center rounded-full bg-landing-action text-[19px] font-extrabold text-landing-action-text"
        >
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="m-0 text-base font-bold">{name}</p>
          <p className="m-0 text-[13px] text-landing-muted">{coachStatus(traits)}</p>
        </div>
      </div>
      <div className="flex flex-col gap-3 pt-4">
        <p className="m-0 max-w-[84%] self-end rounded-[18px_18px_4px_18px] bg-landing-ink px-4 py-3 text-[15px] leading-normal text-landing-ground">
          {COACH.athleteMessage}
        </p>
        <p className="m-0 max-w-[92%] self-start rounded-[18px_18px_18px_4px] bg-landing-soft px-4 py-3 text-[15px] leading-[1.55]">
          {COACH.coachMessage}
        </p>
        <div className="rounded-2xl border-[1.5px] border-solid border-landing-action px-4 py-3.5">
          <p className="m-0 text-[13px] font-bold text-landing-action">{COACH.proposal.heading}</p>
          <dl className="m-0 mt-2 grid grid-cols-[76px_1fr] gap-y-1.5 text-[15px]">
            {COACH.proposal.rows.map(row => (
              <div key={row.day} className="contents">
                <dt className="text-landing-muted">{row.day}</dt>
                <dd className="m-0">
                  <s className="text-landing-muted">{row.from}</s> {row.to}
                </dd>
              </div>
            ))}
          </dl>
          {approved ? (
            <p role="status" className="m-0 mt-3 text-[15px] font-semibold text-landing-action">
              {COACH.approved}
            </p>
          ) : (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onApprove}
                className="h-11 flex-1 cursor-pointer rounded-[10px] border-0 bg-landing-action font-bold text-landing-action-text"
              >
                {COACH.approve}
              </button>
              <button
                type="button"
                className="h-11 flex-1 cursor-pointer rounded-[10px] border-[1.5px] border-solid border-landing-input-border-soft bg-landing-card font-semibold text-landing-ink"
              >
                {COACH.keep}
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2.5">
        <label htmlFor="coach-ask" className="sr-only">
          {COACH.inputLabel}
        </label>
        <input
          id="coach-ask"
          type="text"
          disabled
          aria-disabled="true"
          placeholder={`${COACH.inputPlaceholderBefore}${name}${COACH.inputPlaceholderAfter}`}
          className="h-[46px] min-w-0 flex-1 rounded-full border-[1.5px] border-solid border-landing-input-border-soft bg-landing-card px-3.5 text-[15px]"
        />
        <button
          type="button"
          disabled
          aria-disabled="true"
          aria-label={COACH.micLabel}
          className="flex size-[46px] flex-none items-center justify-center rounded-full border-0 bg-landing-ink"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <rect x="7" y="2" width="6" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-landing-ground" />
            <path d="M4 10a6 6 0 0 0 12 0M10 16v2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-landing-ground" />
          </svg>
        </button>
      </div>
    </div>
  )
}
