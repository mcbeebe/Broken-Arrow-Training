/**
 * Resize an image File/Blob to fit within ~1.15MP and return a JPEG
 * data URL + base64 (no prefix) ready to send to Anthropic vision.
 *
 * Anthropic recommends ≤1092×1092 (~1.15MP) for the best signal-per-token.
 * We preserve aspect ratio and only downscale; small images pass through.
 */
const MAX_PIXELS = 1092 * 1092
const JPEG_QUALITY = 0.85

export interface ResizedImage {
  /** "image/jpeg" — always re-encoded to JPEG. */
  mediaType: string
  /** Base64 string, no data: prefix — ready for Anthropic API. */
  base64: string
  /** Full data URL for inline preview in <img>. */
  dataUrl: string
  /** Width × height after resize. */
  width: number
  height: number
  /** Approximate byte size of the encoded JPEG. */
  bytes: number
}

export async function resizeImage(file: File | Blob): Promise<ResizedImage> {
  const dataUrl = await readAsDataURL(file)
  const img = await loadImage(dataUrl)

  const pixels = img.naturalWidth * img.naturalHeight
  const scale = pixels > MAX_PIXELS ? Math.sqrt(MAX_PIXELS / pixels) : 1
  const w = Math.round(img.naturalWidth * scale)
  const h = Math.round(img.naturalHeight * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  ctx.drawImage(img, 0, 0, w, h)

  const outDataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  const base64 = outDataUrl.split(',', 2)[1] || ''
  // base64 length × 0.75 ≈ byte length
  const bytes = Math.round(base64.length * 0.75)

  return {
    mediaType: 'image/jpeg',
    base64,
    dataUrl: outDataUrl,
    width: w,
    height: h,
    bytes,
  }
}

function readAsDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image decode failed'))
    img.src = src
  })
}
