import { Deflate } from 'fflate'

/**
 * A zip written byte by byte, so a test can make it lie: an entry can
 * declare any size, whatever its data really comes to. Real tools never
 * write these; a crafted file can.
 */
export interface RawEntry {
  name: string
  /** The entry's bytes as stored: raw deflate for method 8. */
  data: Uint8Array
  method: 0 | 8
  /** The unzipped size the entry claims. Defaults to `data.length`. */
  declaredSize?: number
}

export function rawZip(entries: RawEntry[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const e of entries) {
    const name = enc.encode(e.name)
    const declared = e.declaredSize ?? e.data.length
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(8, e.method, true)
    lv.setUint32(18, e.data.length, true); lv.setUint32(22, declared, true); lv.setUint16(26, name.length, true)
    local.set(name, 30)
    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(10, e.method, true)
    cv.setUint32(20, e.data.length, true); cv.setUint32(24, declared, true); cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    locals.push(local, e.data)
    centrals.push(central)
    offset += local.length + e.data.length
  }
  const cdSize = centrals.reduce((sum, c) => sum + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true)
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true)
  const out = new Uint8Array(offset + cdSize + 22)
  let at = 0
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** Raw deflate of `megabytes` MB of zeros, without ever holding them all. */
export function deflatedZeros(megabytes: number): Uint8Array<ArrayBuffer> {
  const block = new Uint8Array(1 << 20)
  const chunks: Uint8Array[] = []
  const d = new Deflate({ level: 9 }, data => { chunks.push(data) })
  for (let i = 0; i < megabytes; i++) d.push(block, i === megabytes - 1)
  const out = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0))
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}
