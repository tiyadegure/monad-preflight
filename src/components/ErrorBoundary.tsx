import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { t } from '../lib/i18n'
import type { Lang } from '../lib/i18n'

interface ErrorBoundaryProps {
  children: ReactNode
  lang: Lang
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
      const { lang } = this.props
      return (
        <div className="panel" role="alert">
          <p className="panel-label">{t(lang, 'eb.title')}</p>
          <p className="error-note">{t(lang, 'eb.body')}</p>
          <button
            type="button"
            className="btn-ghost"
            style={{ marginTop: 12 }}
            onClick={() => location.reload()}
          >
            {t(lang, 'eb.reload')}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
