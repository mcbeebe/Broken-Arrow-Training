// Parse "mm:ss" or "hh:mm:ss" into total seconds.
// Returns undefined on empty or malformed input.
export function parseTimeToSeconds(input: string): number | undefined {
  const trimmed = input.trim()
  if (!trimmed) return undefined
  const parts = trimmed.split(':').map(p => p.trim())
  if (parts.length < 2 || parts.length > 3) return undefined
  if (parts.some(p => !/^\d+$/.test(p))) return undefined
  const nums = parts.map(Number)
  if (nums.length === 2) return nums[0] * 60 + nums[1]
  return nums[0] * 3600 + nums[1] * 60 + nums[2]
}
