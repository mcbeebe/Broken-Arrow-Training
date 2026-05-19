/** True when WebGL is available in this environment. jsdom returns false,
 *  so test code can mount the renderer's parent without dragging three.js
 *  into the test bundle. */
export function isWebGLAvailable(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')
    return gl != null
  } catch {
    return false
  }
}
