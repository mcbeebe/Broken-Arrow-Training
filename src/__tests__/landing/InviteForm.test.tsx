/**
 * Initiative 003: the hero's invite form, every state in copy.md § Form states.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { InviteForm } from '../../landing/components/InviteForm'
import type { InviteResult } from '../../landing/api'
import { INVITE } from '../../landing/content'

function setup(result: InviteResult | Promise<InviteResult> = { ok: true }, source = 'landing') {
  const submit = vi.fn(async () => result)
  const utils = render(<InviteForm submit={submit} getSource={() => source} />)
  const email = screen.getByLabelText(INVITE.emailLabel) as HTMLInputElement
  const goal = screen.getByLabelText(new RegExp(INVITE.goalLabel.replace('?', '\\?'))) as HTMLInputElement
  const button = screen.getByRole('button', { name: INVITE.submit })
  return { ...utils, submit, email, goal, button }
}

async function send(button: HTMLElement) {
  await act(async () => { fireEvent.click(button) })
}

describe('the fields', () => {
  it('labels the email field and gives it the right type and autocomplete', () => {
    const { email } = setup()
    expect(email.type).toBe('email')
    expect(email.autocomplete).toBe('email')
    expect(email.placeholder).toBe(INVITE.emailPlaceholder)
  })

  it('caps the goal at 200, matching MAX_REQUEST_NOTE_LEN', () => {
    expect(setup().goal.maxLength).toBe(200)
  })

  it('has a hidden honeypot that browsers won’t autofill and keyboards skip', () => {
    const { container } = setup()
    const hp = container.querySelector<HTMLInputElement>('input[name="hp_contact_ref"]')!
    expect(hp).not.toBeNull()
    expect(hp.tabIndex).toBe(-1)
    expect(hp.autocomplete).toBe('off')
    expect(hp.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('is a noValidate form, so our message shows instead of the browser’s', () => {
    const { container } = setup()
    expect(container.querySelector('form')!.noValidate).toBe(true)
  })
})

describe('client validation', () => {
  it.each(['', '   ', 'name', 'name@example', '@example.com', 'a b@example.com'])('rejects %j without sending', async value => {
    const { email, button, submit } = setup()
    fireEvent.change(email, { target: { value } })
    await send(button)
    expect(submit).not.toHaveBeenCalled()
    expect(screen.getByText(INVITE.errors.invalidEmail)).toBeInTheDocument()
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(document.activeElement).toBe(email)
  })

  it('accepts name@example.com', async () => {
    const { email, button, submit } = setup()
    fireEvent.change(email, { target: { value: 'name@example.com' } })
    await send(button)
    expect(submit).toHaveBeenCalledTimes(1)
  })
})

describe('sending', () => {
  it('sends email, goal, source and the honeypot', async () => {
    const { email, goal, button, submit, container } = setup({ ok: true }, 'tool-heat')
    fireEvent.change(email, { target: { value: ' new@example.com ' } })
    fireEvent.change(goal, { target: { value: 'My first HYROX' } })
    fireEvent.change(container.querySelector('input[name="hp_contact_ref"]')!, { target: { value: 'bot' } })
    await send(button)
    expect(submit).toHaveBeenCalledWith({
      email: 'new@example.com',
      note: 'My first HYROX',
      source: 'tool-heat',
      hp_contact_ref: 'bot',
    })
  })

  it('catches a bot that sets the honeypot without typing (no input events)', async () => {
    const { email, button, submit, container } = setup()
    fireEvent.change(email, { target: { value: 'new@example.com' } })
    container.querySelector<HTMLInputElement>('input[name="hp_contact_ref"]')!.value = 'spam'
    await send(button)
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ hp_contact_ref: 'spam' }))
  })

  it('sends an empty honeypot for a person', async () => {
    const { email, button, submit } = setup()
    fireEvent.change(email, { target: { value: 'new@example.com' } })
    await send(button)
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ hp_contact_ref: '' }))
  })

  it('shows “Sending…” and disables the button until the answer comes back', async () => {
    let resolve!: (r: InviteResult) => void
    const { email, button } = setup(new Promise<InviteResult>(r => { resolve = r }))
    fireEvent.change(email, { target: { value: 'new@example.com' } })
    await send(button)
    const busy = screen.getByRole('button', { name: INVITE.sending })
    expect(busy).toBeDisabled()
    await act(async () => { resolve({ ok: true }) })
    expect(screen.queryByRole('button', { name: INVITE.sending })).toBeNull()
  })
})

describe('success', () => {
  it('replaces the form with the success panel, names the email, and moves focus there', async () => {
    const { email, button, container } = setup({ ok: true })
    fireEvent.change(email, { target: { value: 'new@example.com' } })
    await send(button)
    const panel = await screen.findByRole('status')
    expect(panel).toHaveTextContent(INVITE.success.heading)
    expect(panel).toHaveTextContent('new@example.com')
    expect(panel.textContent).toContain(INVITE.success.bodyBefore + 'new@example.com' + INVITE.success.bodyAfter)
    expect(screen.getByRole('link', { name: INVITE.success.linkText })).toHaveAttribute('href', '#tools')
    expect(container.querySelector('form')).toBeNull()
    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true))
  })
})

describe('errors', () => {
  const CASES: [string, InviteResult, string][] = [
    ['server 400', { ok: false, kind: 'invalid', message: 'Please enter a valid email address.' }, 'Please enter a valid email address.'],
    ['server 400 without a message', { ok: false, kind: 'invalid' }, INVITE.errors.invalidEmail],
    ['503 or 5xx', { ok: false, kind: 'unavailable' }, INVITE.errors.unavailable],
    ['429', { ok: false, kind: 'throttled' }, INVITE.errors.throttled],
    ['network failure', { ok: false, kind: 'network' }, INVITE.errors.network],
  ]

  it.each(CASES)('%s shows copy.md’s message and moves focus to it', async (_name, result, message) => {
    const { email, button } = setup(result)
    fireEvent.change(email, { target: { value: 'new@example.com' } })
    await send(button)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(message)
    await waitFor(() => expect(document.activeElement).toBe(alert))
    // The form stays, so the visitor can try again.
    expect(screen.getByRole('button', { name: INVITE.submit })).toBeEnabled()
  })
})
