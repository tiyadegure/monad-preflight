import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

/**
 * Catches unexpected render errors anywhere below it and shows a calm
 * fallback panel instead of a blank page. Nothing is signed or sent when
 * this appears, so the safest advice is simply to reload.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Monad PreFlight hit an unexpected error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="panel" role="alert">
          <p className="panel-label">Something went wrong</p>
          <p className="error-note">
            The app hit an unexpected problem and stopped to stay safe. Nothing was signed or
            sent. Reloading the page usually fixes it.
          </p>
          <button
            type="button"
            className="btn-ghost"
            style={{ marginTop: 12 }}
            onClick={() => location.reload()}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
