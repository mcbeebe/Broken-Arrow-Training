/**
 * Initiative 003: a link like attune.coach/#tools must land on the tools
 * section even though the page renders after a dynamic import.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { scrollToAnchor } from '../../landing/scrollToAnchor'

afterEach(() => {
  document.body.innerHTML = ''
})

function section(id: string) {
  const el = document.createElement('section')
  el.id = id
  el.scrollIntoView = vi.fn()
  document.body.append(el)
  return el
}

describe('scrollToAnchor', () => {
  it.each(['#tools', '#coach', '#join', '#how', '#you', '#top', '#main'])('scrolls to %s', hash => {
    const el = section(hash.slice(1))
    expect(scrollToAnchor(hash)).toBe(true)
    expect(el.scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('ignores a hash that is not a landing anchor, even if an element has that id', () => {
    const el = section('invite-email')
    expect(scrollToAnchor('#invite-email')).toBe(false)
    expect(el.scrollIntoView).not.toHaveBeenCalled()
  })

  it.each(['', '#'])('does nothing for %j', hash => {
    expect(scrollToAnchor(hash)).toBe(false)
  })

  it('does nothing when the section is missing', () => {
    expect(scrollToAnchor('#tools')).toBe(false)
  })
})
