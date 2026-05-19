import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { Course, TerrainHeightmap } from '../types/course'
import { hasTerrainAsset, loadTerrain } from '../data/terrain'
import { isWebGLAvailable } from './webgl'

const Course3DScene = lazy(() => import('./Course3DScene'))

interface Props {
  course: Course
  /** Height of the rendered canvas. Defaults to a portrait-ish 320px. */
  heightPx?: number
  /** Called when the user collapses the preview. Lets parent components
   *  swap back to a compact summary. */
  onClose?: () => void
}

type LoadResult =
  | { kind: 'loading' }
  | { kind: 'ready'; terrain: TerrainHeightmap }
  | { kind: 'failed'; reason: string }

/**
 * The visible entry point for the 3D course renderer. Three layers of
 * gating, in order:
 *
 *   1. Does a heightmap JSON exist for this course? (`hasTerrainAsset`)
 *      No  → render null (parent decides whether to show a CTA at all).
 *   2. Does the browser support WebGL?
 *      No  → render an explanatory fallback strip.
 *   3. Has the heightmap finished loading?
 *      No  → render a skeleton; main bundle stays free of three.js until
 *            the dynamic import resolves.
 *
 * The actual three.js scene lives in `Course3DScene.tsx` and is imported
 * lazily so it's split into its own chunk.
 */
export default function Course3DPreview({ course, heightPx = 320, onClose }: Props) {
  const courseSupported = hasTerrainAsset(course.id)
  const webglSupported = useMemo(() => isWebGLAvailable(), [])
  const [result, setResult] = useState<LoadResult>({ kind: 'loading' })

  useEffect(() => {
    if (!courseSupported || !webglSupported) return
    let cancelled = false
    // Reset to loading when course.id changes so we don't flash the
    // previous course's terrain while the new one is in flight.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResult({ kind: 'loading' })
    loadTerrain(course.id)
      .then(terrain => {
        if (cancelled) return
        if (!terrain) {
          setResult({ kind: 'failed', reason: 'no-terrain' })
          return
        }
        setResult({ kind: 'ready', terrain })
      })
      .catch(err => {
        if (cancelled) return
        setResult({ kind: 'failed', reason: err?.message ?? 'load-failed' })
      })
    return () => {
      cancelled = true
    }
  }, [course.id, courseSupported, webglSupported])

  if (!courseSupported) return null

  return (
    <div
      className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900"
      style={{ height: heightPx }}
    >
      {!webglSupported && (
        <Fallback>
          3D preview needs WebGL — your browser doesn't support it. The
          elevation profile above shows every climb and descent.
        </Fallback>
      )}
      {webglSupported && result.kind === 'failed' && (
        <Fallback>
          Couldn't load the 3D course data ({result.reason}). The elevation
          profile above still works.
        </Fallback>
      )}
      {webglSupported && result.kind === 'loading' && <Skeleton />}
      {webglSupported && result.kind === 'ready' && (
        <Suspense fallback={<Skeleton />}>
          <Course3DScene course={course} terrain={result.terrain} />
        </Suspense>
      )}

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close 3D course preview"
          className="absolute top-2 right-2 rounded-full bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 text-xs font-medium px-2 py-1 shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-white"
        >
          Close
        </button>
      )}

      {webglSupported && result.kind === 'ready' && (
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] text-slate-700 dark:text-slate-200 pointer-events-none">
          <span className="bg-white/85 dark:bg-slate-800/85 px-2 py-0.5 rounded">
            Drag to rotate · pinch to zoom
          </span>
          <span className="bg-white/85 dark:bg-slate-800/85 px-2 py-0.5 rounded">
            Vert. ×1.6
          </span>
        </div>
      )}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
      <div className="w-10 h-10 rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-orange-500 animate-spin" />
      <p className="text-xs">Loading course terrain…</p>
    </div>
  )
}

function Fallback({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full h-full flex items-center justify-center p-6 text-center text-xs text-slate-600 dark:text-slate-300">
      {children}
    </div>
  )
}
