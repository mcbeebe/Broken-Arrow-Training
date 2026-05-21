import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Course3DPreview from '../components/Course3DPreview'
import { isWebGLAvailable } from '../components/webgl'
import { brokenArrow18k2026, brokenArrow11k2026 } from '../data/courses'

/**
 * Two gating layers under test:
 *  - course without a baked heightmap → renders null (the 11K case).
 *  - course with a heightmap but no WebGL in jsdom → renders the
 *    fallback strip explaining the missing capability.
 * Neither path should pull three.js into the test bundle.
 */
describe('Course3DPreview gating', () => {
  it('isWebGLAvailable returns false in jsdom', () => {
    expect(isWebGLAvailable()).toBe(false)
  })

  it('renders nothing when no terrain asset is registered', () => {
    const { container } = render(<Course3DPreview course={brokenArrow11k2026} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the WebGL fallback when terrain exists but WebGL does not', () => {
    const { getByText } = render(<Course3DPreview course={brokenArrow18k2026} />)
    expect(getByText(/3D preview needs WebGL/i)).toBeInTheDocument()
  })
})
