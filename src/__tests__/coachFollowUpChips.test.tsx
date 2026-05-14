import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CoachFollowUpChips from '../components/CoachFollowUpChips'

describe('<CoachFollowUpChips>', () => {
  it('renders all three follow-up chips', () => {
    render(<CoachFollowUpChips onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: 'Simpler' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'What should I do?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show sources' })).toBeInTheDocument()
  })

  it('fires onSelect with the simpler seed phrase', () => {
    const onSelect = vi.fn()
    render(<CoachFollowUpChips onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Simpler' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('Explain that in simpler words, no acronyms.')
  })

  it('fires onSelect with the next-action seed phrase', () => {
    const onSelect = vi.fn()
    render(<CoachFollowUpChips onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'What should I do?' }))
    expect(onSelect).toHaveBeenCalledWith('What specifically should I do today?')
  })

  it('fires onSelect with the sources seed phrase', () => {
    const onSelect = vi.fn()
    render(<CoachFollowUpChips onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show sources' }))
    expect(onSelect).toHaveBeenCalledWith('What data is that based on? Cite the engines or studies.')
  })

  it('disables every chip when disabled=true', () => {
    const onSelect = vi.fn()
    render(<CoachFollowUpChips onSelect={onSelect} disabled />)
    for (const btn of screen.getAllByRole('button')) {
      expect(btn).toBeDisabled()
    }
    fireEvent.click(screen.getByRole('button', { name: 'Simpler' }))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('exposes a labelled group for accessibility', () => {
    render(<CoachFollowUpChips onSelect={() => {}} />)
    const group = screen.getByRole('group', { name: /follow-up actions/i })
    expect(group).toBeInTheDocument()
  })
})
