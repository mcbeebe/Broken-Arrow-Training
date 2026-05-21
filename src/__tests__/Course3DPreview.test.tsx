import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Course3DPreview from '../components/Course3DPreview'
import { isWebGLAvailable } from '../components/webgl'
import { brokenArrow18k2026, brokenArrow11k2026 } from '../data/courses'

/**
 * Two gating layers under test:
 *  - course without any per-waypoint lat/lng → renders null (the 11K
 *    case; we have nothing to draw in 3D).
 *  - course with route lat/lng but no WebGL in jsdom → renders the
 *    fallback strip explaining the missing capability.
 * Neither path should pull Cesium into the test bundle.
 */
describe('Course3DPreview gating', () => {
  it('isWebGLAvailable returns false in jsdom', () => {
    expect(isWebGLAvailable()).toBe(false)
  })

  it('renders nothing when the course has no per-waypoint lat/lng', () => {
    const { container } = render(<Course3DPreview course={brokenArrow11k2026} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the WebGL fallback when route data exists but WebGL does not', () => {
    const { getByText } = render(<Course3DPreview course={brokenArrow18k2026} />)
    expect(getByText(/3D preview needs WebGL/i)).toBeInTheDocument()
  })
})
