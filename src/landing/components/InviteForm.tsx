import { useEffect, useRef, useState, type FormEvent } from 'react'
import { INVITE } from '../content'
import { requestInvite, type InviteInput, type InviteResult } from '../api'
import { readReferralSource } from '../referral'

/** Mirrors EMAIL_RE in api/auth/google.py. */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; email: string }
  /** `field`: the email itself is wrong, so focus it rather than the message. */
  | { kind: 'error'; message: string; field: boolean; invalid: boolean }

interface Props {
  /** Injectable for tests; defaults to the real request. */
  submit?: (input: InviteInput) => Promise<InviteResult>
  /** Where the visitor came from; defaults to the stored first touch, else 'landing'. */
  getSource?: () => string
}

function messageFor(result: Exclude<InviteResult, { ok: true }>): string {
  switch (result.kind) {
    case 'invalid':
      return result.message ?? INVITE.errors.invalidEmail
    case 'throttled':
      return INVITE.errors.throttled
    case 'unavailable':
      return INVITE.errors.unavailable
    case 'network':
      return INVITE.errors.network
  }
}

/**
 * The hero's invite form (design-spec.md § InviteForm). Posts to the existing
 * access queue; every state and message comes from copy.md via content.ts.
 */
export function InviteForm({ submit = requestInvite, getSource = () => readReferralSource() ?? 'landing' }: Props) {
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })
  const emailRef = useRef<HTMLInputElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const sentRef = useRef<HTMLHeadingElement>(null)

  // Move focus to whatever just appeared: the success heading, or the error.
  useEffect(() => {
    if (state.kind === 'sent') sentRef.current?.focus()
    else if (state.kind === 'error') (state.field ? emailRef : errorRef).current?.focus()
  }, [state])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (state.kind === 'sending') return
    const address = email.trim()
    if (!EMAIL_RE.test(address)) {
      setState({ kind: 'error', message: INVITE.errors.invalidEmail, field: true, invalid: true })
      return
    }
    setState({ kind: 'sending' })
    const result = await submit({ email: address, note: note.trim(), source: getSource(), hp_contact_ref: honeypot })
    setState(
      result.ok
        ? { kind: 'sent', email: address }
        : { kind: 'error', message: messageFor(result), field: false, invalid: result.kind === 'invalid' },
    )
  }

  if (state.kind === 'sent') {
    return (
      <div role="status" className="mt-[34px] max-w-[520px] rounded-[20px] bg-landing-card p-6 shadow-landing-float">
        <h2 ref={sentRef} tabIndex={-1} className="m-0 text-2xl font-extrabold tracking-[-0.02em]">
          {INVITE.success.heading}
        </h2>
        <p className="mb-0 mt-2 text-base leading-[1.55] text-landing-muted">
          {INVITE.success.bodyBefore}
          <strong className="font-semibold text-landing-ink">{state.email}</strong>
          {INVITE.success.bodyAfter}
          <a href={INVITE.success.linkHref} className="font-semibold">
            {INVITE.success.linkText}
          </a>
          {INVITE.success.bodyEnd}
        </p>
      </div>
    )
  }

  const sending = state.kind === 'sending'
  const error = state.kind === 'error' ? state : null

  return (
    <form noValidate onSubmit={onSubmit} className="mt-[34px] flex max-w-[520px] flex-col gap-3">
      <label htmlFor="invite-email" className="text-[15px] font-semibold">
        {INVITE.emailLabel}
      </label>
      <div className="flex flex-wrap gap-2.5">
        <input
          ref={emailRef}
          id="invite-email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder={INVITE.emailPlaceholder}
          value={email}
          onChange={e => setEmail(e.target.value)}
          aria-invalid={error?.invalid || undefined}
          aria-describedby={error ? 'invite-error' : undefined}
          className="h-[52px] min-w-0 flex-[1_1_240px] rounded-xl border-[1.5px] border-solid border-landing-input-border bg-landing-card px-4 text-[17px] text-landing-ink"
        />
        <button
          type="submit"
          disabled={sending}
          className="h-[52px] cursor-pointer rounded-xl border-0 bg-landing-action px-[22px] text-base font-bold text-landing-action-text disabled:cursor-wait"
        >
          {sending ? INVITE.sending : INVITE.submit}
        </button>
      </div>
      {error && (
        <p ref={errorRef} id="invite-error" role="alert" tabIndex={-1} className="m-0 text-[15px] font-semibold text-landing-error">
          {error.message}
        </p>
      )}
      <label htmlFor="invite-goal" className="mt-1.5 text-[15px] font-semibold">
        {INVITE.goalLabel} <span className="font-normal text-landing-muted">{INVITE.goalOptional}</span>
      </label>
      <input
        id="invite-goal"
        type="text"
        name="note"
        maxLength={INVITE.goalMaxLength}
        placeholder={INVITE.goalPlaceholder}
        value={note}
        onChange={e => setNote(e.target.value)}
        className="h-12 rounded-xl border-[1.5px] border-solid border-landing-input-border-soft bg-landing-card px-4 text-base text-landing-ink"
      />
      {/* Honeypot: hidden from people and assistive tech; bots fill it, the server drops them. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <input
          type="text"
          name="hp_contact_ref"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={e => setHoneypot(e.target.value)}
        />
      </div>
      <p className="mb-0 mt-1 text-[15px] text-landing-muted">
        {INVITE.fineprint}{' '}
        <a href={INVITE.signInHref} className="font-semibold">
          {INVITE.signIn}
        </a>
      </p>
    </form>
  )
}
