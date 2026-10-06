/**
 * Initiative 003 (D9): a tool's "Get the full plan" goes to the root page's
 * invite form with the tool recorded as the source, not to the app's
 * sign-in wall. Until the landing page launches, the root forwards it on.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ToolShell } from '../../tools/ToolShell'

afterEach(cleanup)

describe('ToolShell call to action', () => {
  it('links to /?from=<toolId>#join', () => {
    render(<ToolShell title="Heat" tagline="t" toolId="tool-heat">x</ToolShell>)
    expect(screen.getByRole('link', { name: /get the full plan/i }).getAttribute('href')).toBe(
      '/?from=tool-heat#join',
    )
  })

  it('encodes the tool id', () => {
    render(<ToolShell title="T" tagline="t" toolId="tool a&b">x</ToolShell>)
    expect(screen.getByRole('link', { name: /get the full plan/i }).getAttribute('href')).toBe(
      '/?from=tool%20a%26b#join',
    )
  })
})
