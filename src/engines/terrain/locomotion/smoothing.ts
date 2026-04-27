/**
 * Savitzky-Golay smoothing for noisy 1-D signals (e.g. barometric altitude).
 *
 * For each output sample, fits a polynomial of degree `order` by least squares
 * to a window of `window` consecutive input samples and reports the polynomial
 * value at the sample's position within the window. Interior samples use a
 * window centred on themselves; edge samples re-use the nearest fixed-size
 * window and shift their evaluation offset (see Press, Numerical Recipes 14.9).
 * Constant signals — and any polynomial of degree ≤ `order` — pass through
 * unchanged at every position, including edges.
 *
 * @see Savitzky A, Golay MJE (1964) Anal. Chem. 36(8):1627-39.
 * @see Press WH et al., Numerical Recipes 3rd ed., §14.9 "Savitzky-Golay Smoothing Filters."
 */

const coeffCache = new Map<string, readonly number[]>()

/**
 * Compute SG coefficients h[k] such that
 *   smoothed = Σₖ h[k] · window[k]
 * where the polynomial is fit to positions 0..window-1 within the window
 * and evaluated at the given `offset` (0 = leftmost sample, m = centre,
 * window-1 = rightmost sample).
 */
function sgCoefficients(window: number, order: number, offset: number): readonly number[] {
  const key = `${window}:${order}:${offset}`
  const cached = coeffCache.get(key)
  if (cached) return cached

  const cols = order + 1

  // Vandermonde X[k][j] = k^j  (positions 0..window-1)
  const X: number[][] = []
  for (let k = 0; k < window; k++) {
    const row: number[] = []
    for (let j = 0; j < cols; j++) row.push(j === 0 ? 1 : Math.pow(k, j))
    X.push(row)
  }

  // X^T X
  const xtx: number[][] = Array.from({ length: cols }, () => new Array(cols).fill(0))
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < cols; j++) {
      let s = 0
      for (let k = 0; k < window; k++) s += X[k][i] * X[k][j]
      xtx[i][j] = s
    }
  }
  const inv = invertSymmetric(xtx)

  // Evaluation vector e[j] = offset^j  (so polynomial value at offset = e · β)
  const e = new Array<number>(cols)
  for (let j = 0; j < cols; j++) e[j] = j === 0 ? 1 : Math.pow(offset, j)

  // Coefficients h[k] = (X · (X^T X)⁻¹ · e)[k]  =  Σᵢ X[k][i] · (Σⱼ inv[i][j] · e[j])
  const v = new Array<number>(cols).fill(0)
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < cols; j++) v[i] += inv[i][j] * e[j]
  }
  const coeffs = new Array<number>(window)
  for (let k = 0; k < window; k++) {
    let h = 0
    for (let i = 0; i < cols; i++) h += X[k][i] * v[i]
    coeffs[k] = h
  }

  const frozen = Object.freeze(coeffs)
  coeffCache.set(key, frozen)
  return frozen
}

function invertSymmetric(m: number[][]): number[][] {
  const n = m.length
  const a: number[][] = m.map((row, i) => {
    const aug = new Array<number>(2 * n).fill(0)
    for (let j = 0; j < n; j++) aug[j] = row[j]
    aug[n + i] = 1
    return aug
  })

  for (let i = 0; i < n; i++) {
    let pivot = i
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(a[r][i]) > Math.abs(a[pivot][i])) pivot = r
    }
    if (pivot !== i) {
      const tmp = a[i]
      a[i] = a[pivot]
      a[pivot] = tmp
    }
    const div = a[i][i]
    if (div === 0) throw new Error('Singular matrix in SG coefficient solve')
    for (let j = 0; j < 2 * n; j++) a[i][j] /= div
    for (let r = 0; r < n; r++) {
      if (r === i) continue
      const f = a[r][i]
      if (f === 0) continue
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[i][j]
    }
  }

  return a.map(row => row.slice(n))
}

/**
 * Smooth a 1-D signal with a Savitzky-Golay filter.
 *
 * @param input   the noisy signal
 * @param window  odd integer in [order + 1, input.length]; sliding-window size
 * @param order   polynomial degree; signals of degree ≤ order pass through unchanged
 * @returns       smoothed array of the same length as `input`
 */
export function savitzkyGolay(
  input: readonly number[],
  window: number,
  order: number,
): number[] {
  if (window % 2 === 0) throw new Error(`SG window must be odd (got ${window})`)
  if (window <= order) throw new Error(`SG window (${window}) must exceed order (${order})`)

  const n = input.length
  if (n === 0) return []
  if (n < window) return Array.from(input)

  const m = (window - 1) / 2
  const out = new Array<number>(n)

  for (let i = 0; i < n; i++) {
    let windowStart: number
    if (i < m) windowStart = 0
    else if (i > n - 1 - m) windowStart = n - window
    else windowStart = i - m
    const offset = i - windowStart
    const coeffs = sgCoefficients(window, order, offset)

    let s = 0
    for (let k = 0; k < window; k++) s += coeffs[k] * input[windowStart + k]
    out[i] = s
  }
  return out
}
