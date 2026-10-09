/**
 * One upload, from the athlete's pick to a plan they can review
 * (initiative 004, PR 5): prepare the file, send it, and turn the reply into
 * the plan the app stores. Holds the request so it can be cancelled, and
 * cancels it when the screen using it goes away.
 *
 * Lives outside the upload sheet so onboarding (PR 7) can start a read and
 * collect the result a few steps later.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { prepareUpload, type ResizeFn, type UploadInput } from '../utils/planImport/prepareUpload'
import { requestPlanImport } from '../utils/planImport/client'
import { normalizeExtraction, type NormalizedImport } from '../utils/planImport/normalize'
import type { ImportProblem } from '../utils/planImport/importErrors'

export type PlanImportState =
  | { step: 'idle' }
  | { step: 'reading'; sourceName: string; startedAt: number }
  | { step: 'review'; sourceName: string; result: NormalizedImport; importsLeft: number | null }
  | { step: 'error'; problem: ImportProblem; sourceName?: string; limit?: number }

export interface PlanImportDeps {
  resize?: ResizeFn
  fetchImpl?: typeof fetch
  base?: string
  headers?: Record<string, string>
  now?: () => Date
}

/**
 * The upload flow's state and actions.
 *
 * `read` runs one upload. `reset` goes back to the picker: it stops a read
 * in flight (the athlete cancelled) or clears a result or an error.
 */
export function usePlanImport(deps: PlanImportDeps = {}) {
  const [state, setState] = useState<PlanImportState>({ step: 'idle' })
  const controller = useRef<AbortController | null>(null)
  // Only the latest read may change the state: a cancelled one that
  // answers late must not overwrite what the athlete did since.
  const latest = useRef(0)
  const depsRef = useRef(deps)
  useEffect(() => { depsRef.current = deps })

  useEffect(() => () => controller.current?.abort(), [])

  const read = useCallback(async (input: UploadInput) => {
    controller.current?.abort()
    const id = ++latest.current
    const d = depsRef.current
    const now = d.now ?? (() => new Date())
    // Reading starts now: a big Word or Excel file takes a moment to open
    // in the browser, before anything is sent.
    setState({ step: 'reading', sourceName: 'file' in input ? input.file.name || 'My plan' : 'Pasted text', startedAt: now().getTime() })
    const prepared = await prepareUpload(input, { resize: d.resize })
    if (id !== latest.current) return
    if (!prepared.ok) {
      setState({ step: 'error', problem: prepared.reason })
      return
    }
    const sourceName = prepared.source.name
    const ctrl = new AbortController()
    controller.current = ctrl

    const res = await requestPlanImport(prepared.body, {
      signal: ctrl.signal, fetchImpl: d.fetchImpl, base: d.base, headers: d.headers,
    })
    if (id !== latest.current) return
    controller.current = null
    // A cancelled read never gets here: `reset` moved `latest` on.
    if (!res.ok) {
      setState({ step: 'error', problem: res.code, sourceName, ...(res.limit !== undefined ? { limit: res.limit } : {}) })
      return
    }
    const normalized = normalizeExtraction({
      extraction: res.extraction,
      warnings: res.warnings,
      source: prepared.source,
      importedAt: now().toISOString(),
    })
    if (!normalized.ok) {
      setState({ step: 'error', problem: normalized.reason, sourceName })
      return
    }
    setState({ step: 'review', sourceName, result: normalized.value, importsLeft: res.importsLeft })
  }, [])

  const reset = useCallback(() => {
    latest.current++
    controller.current?.abort()
    controller.current = null
    setState({ step: 'idle' })
  }, [])

  return { state, read, reset }
}
