export function formatMiles(miles: number): string {
  return miles % 1 === 0 ? `${miles} mi` : `${miles.toFixed(1)} mi`
}

export function formatSeconds(seconds: number): string {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}`
  }
  return `${mins} min`
}

export function formatPace(miles: number, seconds: number): string {
  if (miles === 0) return '--'
  const paceSeconds = seconds / miles
  const mins = Math.floor(paceSeconds / 60)
  const secs = Math.round(paceSeconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}/mi`
}

export function getMilesNumber(miles: number | string): number {
  if (typeof miles === 'number') return miles
  const match = String(miles).match(/(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}
