import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Course } from '../types/course'
import { isWebGLAvailable } from './webgl'

const Course3DScene = lazy(() => import('./Course3DScene'))

interface Props {
  course: Course
  /** Height of the rendered canvas while inline. Defaults to a
   *  portrait-ish 320px. Fullscreen mode ignores this. */
  heightPx?: number
  /** Called when the user collapses the preview from inline mode.
   *  Lets parent components swap back to a compact summary. */
  onClose?: () => void
}

/**
 * The visible entry point for the 3D course renderer. Two gates:
 *
 *   1. Does the browser support WebGL?
 *      No  → render an explanatory fallback strip; Cesium never loads.
 *   2. Has the Cesium chunk finished loading?
 *      No  → render a skeleton.
 *
 * Cesium (≈2MB gzipped) lives in a dedicated lazy chunk so the main
 * bundle never pays the cost. The terrain mesh and satellite imagery
 * come from Cesium itself — no per-course heightmap fetch needed.
 *
 * Owns its fullscreen state so callers don't have to thread it
 * through parent components.
 */
export default function Course3DPreview({ course, heightPx = 320, onClose }: Props) {
  const hasRouteData = useMemo(
    () =>
      course.elevationProfile.some(p => p.latitude != null && p.longitude != null),
    [course],
  )
  const webglSupported = useMemo(() => isWebGLAvailable(), [])
  const [fullscreen, setFullscreen] = useState(false)

  // Suppress page scroll under the fullscreen overlay so pinch-zoom
  // on the canvas doesn't double up with mobile-safari rubber-banding
  // the page itself.
  useEffect(() => {
    if (!fullscreen || typeof document === 'undefined') return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [fullscreen])

  // Close fullscreen on Escape for keyboard users.
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  if (!hasRouteData) return null

  const body = (
    <>
      {!webglSupported && (
        <Fallback>
          3D preview needs WebGL — your browser doesn't support it. The
          elevation profile above shows every climb and descent.
        </Fallback>
      )}
      {webglSupported && (
        <Suspense fallback={<Skeleton />}>
          <Course3DScene course={course} />
        </Suspense>
      )}

      <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
        {webglSupported && (
          <button
            type="button"
            onClick={() => setFullscreen(f => !f)}
            aria-label={fullscreen ? 'Exit fullscreen' : 'View fullscreen'}
            className="rounded-full bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 text-xs font-medium px-2 py-1 shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-white flex items-center gap-1"
          >
            <span aria-hidden>{fullscreen ? '⤡' : '⤢'}</span>
            <span>{fullscreen ? 'Exit' : 'Fullscreen'}</span>
          </button>
        )}
        {fullscreen ? (
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            aria-label="Close 3D course preview"
            className="rounded-full bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 text-xs font-medium px-2 py-1 shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-white"
          >
            Close
          </button>
        ) : (
          onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close 3D course preview"
              className="rounded-full bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 text-xs font-medium px-2 py-1 shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-white"
            >
              Close
            </button>
          )
        )}
      </div>

      {webglSupported && (
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] text-slate-700 dark:text-slate-200 pointer-events-none z-10">
          <span className="bg-white/85 dark:bg-slate-800/85 px-2 py-0.5 rounded">
            Drag to rotate · pinch to zoom
          </span>
          <span className="bg-white/85 dark:bg-slate-800/85 px-2 py-0.5 rounded">
            Satellite · real terrain
          </span>
        </div>
      )}
    </>
  )

  if (fullscreen && typeof document !== 'undefined') {
    return createPortal(
      <div
        className="fixed inset-0 z-50 bg-slate-100 dark:bg-slate-900"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="relative w-full h-full">{body}</div>
      </div>,
      document.body,
    )
  }

  return (
    <div
      className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900"
      style={{ height: heightPx }}
    >
      {body}
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
