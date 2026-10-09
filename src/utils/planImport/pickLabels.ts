/**
 * What the plan picker accepts, how it labels a chosen file, and when two
 * picks are the same (initiative 004). Shared by the Settings upload sheet
 * and onboarding's upload step.
 */

import type { UploadInput } from './prepareUpload'

/** The file chooser's `accept`: every kind the reader takes, plus the older
 *  Word and Excel formats, so it can ask for a re-save instead of hiding them. */
export const FILE_ACCEPT = [
  '.pdf', '.csv', '.tsv', '.txt', '.docx', '.docm', '.dotx', '.dotm', '.xlsx', '.xlsm', '.xltx', '.xltm', '.doc', '.xls',
  'application/pdf', 'text/csv', 'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/*',
].join(',')

/** The short badge on a chosen file's chip: its extension, or IMG for a photo. */
export function badgeFor(file: File): string {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(file.name)?.[1]?.toUpperCase()
  if (file.type.startsWith('image/')) return 'IMG'
  return ext && ext.length <= 4 ? ext : 'FILE'
}

/** A file's size in decimal units, as the limits are stated ("up to 15 MB" is
 *  15,000,000 bytes). */
export function sizeLabel(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}

/** Whether two picks would send the same thing: the same file, or the same
 *  text, with the same note as sent (trimmed). Onboarding uses it so going
 *  back and forward never reads a plan twice, while a changed one is read.
 *  A file chosen again is the same file when its name, size, type and
 *  last-modified time all match. */
export function sameUpload(a: UploadInput, b: UploadInput): boolean {
  if ((a.hint ?? '').trim() !== (b.hint ?? '').trim()) return false
  if ('file' in a) return 'file' in b && sameFile(a.file, b.file)
  return 'text' in b && a.text === b.text
}

function sameFile(a: File, b: File): boolean {
  return a === b || (a.name === b.name && a.size === b.size && a.type === b.type && a.lastModified === b.lastModified)
}
