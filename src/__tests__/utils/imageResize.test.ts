import { it, expect, vi, afterEach } from 'vitest'
import { resizeImage } from '../../utils/imageResize'

/**
 * JPEG has no transparency. A transparent PNG drawn straight onto the
 * canvas is encoded on black, so a plan's dark text on a transparent
 * screenshot came out black on black (initiative 004, PR 5 review).
 */

afterEach(() => vi.restoreAllMocks())

it('paints a white ground before drawing the image', async () => {
  const calls: string[] = []
  const ctx = {
    set fillStyle(v: string) { calls.push(`fillStyle ${v}`) },
    fillRect: (...a: number[]) => calls.push(`fillRect ${a.join(',')}`),
    drawImage: () => calls.push('drawImage'),
  }
  const realCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'canvas') return realCreate(tag)
    return { width: 0, height: 0, getContext: () => ctx, toDataURL: () => 'data:image/jpeg;base64,QUJD' }
  }) as typeof document.createElement)
  vi.stubGlobal('Image', class {
    naturalWidth = 400
    naturalHeight = 300
    onload: (() => void) | null = null
    set src(_v: string) { setTimeout(() => this.onload?.()) }
  })

  const out = await resizeImage(new Blob([new Uint8Array([0x89, 0x50])], { type: 'image/png' }))
  vi.unstubAllGlobals()
  expect(out).toMatchObject({ mediaType: 'image/jpeg', base64: 'QUJD', width: 400, height: 300 })
  expect(calls).toEqual(['fillStyle #ffffff', 'fillRect 0,0,400,300', 'drawImage'])
})
