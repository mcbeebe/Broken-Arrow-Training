/**
 * The one call to the plan-import endpoint (initiative 004, PR 5):
 * `POST /api/coach/plan_import` on the coach API's origin, with the athlete's
 * session token.
 *
 * Never throws. Every outcome is a value the upload sheet can show: the
 * server's own error codes, Vercel's non-JSON answers (a function that isn't
 * deployed yet, a body over its limit, its own timeout), a network failure,
 * the athlete cancelling, and the browser giving up after CLIENT_TIMEOUT_MS.
 */

import { coachApiBase, coachAuthHeaders } from '../coachApi'
import type { PlanImportBody } from './prepareUpload'
import { CLIENT_TIMEOUT_MS } from './uploadLimits'

export const PLAN_IMPORT_PATH = '/api/coach/plan_import'

/** Codes the server sends as `{error}`; `api/coach/plan_import.py`. */
export const SERVER_ERROR_CODES = [
  'bad_request', 'data_required', 'bad_data', 'text_required',
  'too_large', 'too_long', 'unsupported_kind', 'not_a_pdf', 'unsupported_image',
  'not_available', 'import_limit', 'budget_exceeded',
  'plan_too_long', 'read_failed', 'file_unreadable', 'timeout', 'busy', 'llm_unavailable',
] as const
export type ServerErrorCode = typeof SERVER_ERROR_CODES[number]

/** Outcomes only the browser can see. */
export type ClientErrorCode =
  | 'signed_out'
  | 'not_deployed'
  | 'unavailable'
  | 'network'
  | 'aborted'
  | 'server_error'

export type ImportErrorCode = ServerErrorCode | ClientErrorCode

export type PlanImportResponse =
  | { ok: true; extraction: unknown; warnings: unknown; importsLeft: number | null }
  | { ok: false; code: ImportErrorCode; used?: number; limit?: number }

function isServerCode(value: unknown): value is ServerErrorCode {
  return typeof value === 'string' && (SERVER_ERROR_CODES as readonly string[]).includes(value)
}

function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

/** An error the server didn't name, by its HTTP status. */
function codeForStatus(status: number): ImportErrorCode {
  if (status === 401) return 'signed_out'
  if (status === 403) return 'not_available'
  if (status === 404) return 'not_deployed'
  if (status === 413) return 'too_large'
  if (status === 429) return 'import_limit'
  if (status === 504) return 'timeout'
  if (status === 503) return 'unavailable'
  return 'server_error'
}

/**
 * Send one upload to the reader.
 *
 * @param body  from `prepareUpload`; carries no file name
 * @param opts  `signal` cancels; `fetchImpl`, `base`, `headers` and
 *              `timeoutMs` are injectable for tests
 * @returns the extraction and uploads left, or why it failed
 */
export async function requestPlanImport(
  body: PlanImportBody,
  opts: {
    signal?: AbortSignal
    fetchImpl?: typeof fetch
    base?: string
    headers?: Record<string, string>
    timeoutMs?: number
  } = {},
): Promise<PlanImportResponse> {
  const base = opts.base ?? coachApiBase()
  if (!base) return { ok: false, code: 'unavailable' }
  if (opts.signal?.aborted) return { ok: false, code: 'aborted' }

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, opts.timeoutMs ?? CLIENT_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  opts.signal?.addEventListener('abort', onAbort, { once: true })

  try {
    const res = await (opts.fetchImpl ?? fetch)(`${base}${PLAN_IMPORT_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(opts.headers ?? coachAuthHeaders()) },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    // The body is read under the same timer: the reply is one JSON object
    // sent at the end, and a stalled read is still a timeout.
    const text = await res.text()
    let json: unknown = null
    try { json = JSON.parse(text) } catch { /* Vercel's own pages are not JSON */ }
    const data = typeof json === 'object' && json !== null && !Array.isArray(json)
      ? json as Record<string, unknown>
      : null

    if (res.ok) {
      if (!data || !('extraction' in data)) return { ok: false, code: 'server_error' }
      return { ok: true, extraction: data.extraction, warnings: data.warnings, importsLeft: count(data.importsLeft) ?? null }
    }
    // A 401's error is a sentence, not a code.
    if (res.status === 401) return { ok: false, code: 'signed_out' }
    const code = isServerCode(data?.error) ? data.error : codeForStatus(res.status)
    if (code === 'import_limit') {
      return { ok: false, code, used: count(data?.used), limit: count(data?.limit) }
    }
    return { ok: false, code }
  } catch {
    if (timedOut) return { ok: false, code: 'timeout' }
    if (opts.signal?.aborted) return { ok: false, code: 'aborted' }
    return { ok: false, code: 'network' }
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
  }
}
