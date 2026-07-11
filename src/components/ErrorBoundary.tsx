import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Last line of defense against a white screen. Any render/effect crash —
 * including one triggered by a poisoned value arriving via cross-device
 * sync — lands here instead of unmounting the app into a blank page. The
 * screen shows the actual error so a user's screenshot IS the diagnosis,
 * and offers a reload (transient) without touching stored data.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary] app crashed:', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    const message = `${this.state.error.name}: ${this.state.error.message}`
    const stack = (this.state.error.stack || '').split('\n').slice(0, 6).join('\n')
    // Inline styles on purpose: this screen must render even if the
    // stylesheet failed to load.
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
        <div style={{ maxWidth: 560 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 16, color: '#94a3b8' }}>
            The app hit an error it couldn&apos;t recover from. Your training data is safe.
            Reloading usually fixes it — if this screen keeps coming back, send your coach a
            screenshot including the details below.
          </p>
          <pre data-testid="boot-error-detail" style={{ fontSize: 12, background: '#1e293b', borderRadius: 8, padding: 12, overflowX: 'auto', whiteSpace: 'pre-wrap', marginBottom: 16 }}>
            {message}
            {'\n'}
            {stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Reload the app
          </button>
        </div>
      </div>
    )
  }
}
