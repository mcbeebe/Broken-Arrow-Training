import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Course3DPreview from '../components/Course3DPreview'
import { isWebGLAvailable } from '../components/webgl'
import { brokenArrow18k2026 } from '../data/courses'

/**
 * jsdom has no WebGL and no terrain JSON is registered, so the
 * component should render nothing — never pulling three.js into the
 * test bundle. That's the contract.
 */
describe('Course3DPreview gating', () => {
  it('isWebGLAvailable returns false in jsdom', () => {
    expect(isWebGLAvailable()).toBe(false)
  })

  it('renders nothing when no terrain asset is registered', () => {
    const { container } = render(<Course3DPreview course={brokenArrow18k2026} />)
    expect(container.firstChild).toBeNull()
  })
})
