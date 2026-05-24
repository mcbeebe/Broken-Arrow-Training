import { describe, it, expect } from 'vitest'
import { urlBase64ToUint8Array } from '../utils/push'

describe('urlBase64ToUint8Array', () => {
  it('decodes a URL-safe base64 VAPID key to the right byte length', () => {
    // A real applicationServerKey is a 65-byte uncompressed P-256 point.
    // 65 bytes → 88 base64 chars (with padding); url-safe form drops the
    // padding and swaps +/ for -_.
    const bytes = new Uint8Array(65)
    for (let i = 0; i < 65; i++) bytes[i] = i
    const std = btoa(String.fromCharCode(...bytes))
    const urlSafe = std.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    const decoded = urlBase64ToUint8Array(urlSafe)
    expect(decoded.length).toBe(65)
    expect(Array.from(decoded)).toEqual(Array.from(bytes))
  })

  it('handles keys that need padding restored', () => {
    // "TWlrZQ" is "Mike" with the trailing '=' stripped (url-safe form).
    const decoded = urlBase64ToUint8Array('TWlrZQ')
    expect(String.fromCharCode(...decoded)).toBe('Mike')
  })

  it('round-trips characters that use the url-safe alphabet', () => {
    // Bytes 0xFB,0xFF encode to "+/" in standard base64 → "-_" url-safe.
    const decoded = urlBase64ToUint8Array('-_8')
    expect(decoded[0]).toBe(0xfb)
    expect(decoded[1]).toBe(0xff)
  })
})
