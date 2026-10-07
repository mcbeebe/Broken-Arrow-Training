import { useEffect, useRef } from 'react'
import { COACH, type CoachQuestion, type PersonalityId } from '../content'
import { coachDisplayName, coachStatus } from '../coachText'

interface Props {
  coachName: string
  personality: PersonalityId
  /** Index into COACH.questions. */
  question: number
  approved: boolean
  /** No more personality or question changes this visit. */
  limitReached: boolean
  /** The coach's name when the limit was reached (state.ts `limitName`). */
  limitName?: string | null
  onApprove?: () => void
  onAsk?: () => void
  onReset?: () => void
}

/**
 * Written conversations, one per question, voiced by the chosen personality
 * (design-spec.md § CoachDemo). The input and mic are decorative and
 * disabled, so nobody types into a fake chat.
 */
export function CoachDemo({ coachName, personality, question, approved, limitReached, limitName, onApprove, onAsk, onReset }: Props) {
  const name = coachDisplayName(coachName)
  const q: CoachQuestion = COACH.questions[question] ?? COACH.questions[0]
  // Approve replaces the button that had focus; keep the visitor's place.
  const confirmation = useRef<HTMLParagraphElement>(null)
  const wasApproved = useRef(approved)
  useEffect(() => {
    if (approved && !wasApproved.current) confirmation.current?.focus()
    wasApproved.current = approved
  }, [approved])
  return (
    <div className="mx-auto min-w-0 max-w-[500px] flex-[1_1_440px] rounded-[28px] bg-landing-card p-[22px] shadow-landing-float">
      <div className="flex items-center gap-3 border-0 border-b border-solid border-landing-line pb-3.5">
        <div
          aria-hidden="true"
          data-coach-initial
          className="flex size-11 flex-none items-center justify-center rounded-full bg-landing-action text-[19px] font-extrabold text-landing-action-text"
        >
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p data-coach-name className="m-0 text-base font-bold">
            {name}
          </p>
          <p data-coach-status className="m-0 text-[13px] text-landing-muted">
            {coachStatus(personality)}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3 pt-4">
        <p data-coach-question className="m-0 max-w-[84%] self-end rounded-[18px_18px_4px_18px] bg-landing-ink px-4 py-3 text-[15px] leading-normal text-landing-ground">
          {q.athlete}
        </p>
        <p
          aria-live="polite"
          data-coach-reply
          className="m-0 max-w-[92%] self-start rounded-[18px_18px_18px_4px] bg-landing-soft px-4 py-3 text-[15px] leading-[1.55]"
        >
          {q.replies[personality]}
        </p>
        {q.proposal && (
          <div className="rounded-2xl border-[1.5px] border-solid border-landing-action px-4 py-3.5">
            <p className="m-0 text-[13px] font-bold text-landing-action">{COACH.proposalHeading}</p>
            <dl className="m-0 mt-2 grid grid-cols-[76px_1fr] gap-y-1.5 text-[15px]">
              {q.proposal.map(row => (
                <div key={row.day} className="contents">
                  <dt className="text-landing-muted">{row.day}</dt>
                  <dd className="m-0">
                    <s className="text-landing-muted">{row.from}</s> {row.to}
                  </dd>
                </div>
              ))}
            </dl>
            {approved ? (
              // role="status" takes no name from its text; the label lets the focused line be read.
              <p ref={confirmation} role="status" aria-label={COACH.approved} tabIndex={-1} className="m-0 mt-3 text-[15px] font-semibold text-landing-action">
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
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-disabled={limitReached}
          onClick={limitReached ? undefined : onAsk}
          className={`h-11 rounded-full border-[1.5px] border-solid border-landing-action bg-landing-card px-4 text-[15px] font-semibold text-landing-action ${
            limitReached ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
          }`}
        >
          {COACH.askAnother}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="h-11 cursor-pointer rounded-full border-[1.5px] border-solid border-landing-input-border-soft bg-landing-card px-4 text-[15px] font-semibold text-landing-ink"
        >
          {COACH.reset}
        </button>
      </div>
      {/* Always in the DOM so the message is announced when it fills in. */}
      <p role="status" data-coach-limit className="m-0 mt-3 text-[15px] leading-normal empty:hidden">
        {limitReached && (
          <>
            {COACH.limitBefore}
            <a href={COACH.limitHref} className="font-semibold text-landing-action">
              {COACH.limitLink}
            </a>
            {COACH.limitTail}
            {coachDisplayName(limitName ?? coachName)}
            {COACH.limitEnd}
          </>
        )}
      </p>
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
