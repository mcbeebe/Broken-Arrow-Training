/**
 * The landing page renders after a dynamic import(), so the browser's own jump
 * to `#tools` or `#coach` on load finds nothing yet. Once it has rendered,
 * jump there ourselves, but only for the page's own anchors.
 */
import { LANDING_ANCHORS } from './legacyEntry'

/**
 * Scroll to the element `hash` names, if it is a landing anchor and exists.
 *
 * @returns Whether it scrolled.
 */
export function scrollToAnchor(hash: string, doc: Document = document): boolean {
  if (!hash || hash === '#' || !LANDING_ANCHORS.has(hash)) return false
  const target = doc.getElementById(hash.slice(1))
  if (!target) return false
  target.scrollIntoView()
  return true
}
