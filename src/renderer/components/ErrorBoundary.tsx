import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Icon } from '../lib/icons'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Renderer crash', error, info.componentStack)
    window.teamwork?.reportRendererError(
      `React renderer crash: ${error.message}`,
      `${error.stack ?? ''}\n${info.componentStack ?? ''}`
    )
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="splash">
          <div className="splash-card">
            <div className="content-state-icon is-error">
              <Icon name="alert" size={32} />
            </div>
            <h1>The interface encountered an error</h1>
            <p>{this.state.error.message}</p>
            <button
              type="button"
              className="button primary"
              onClick={() => window.location.reload()}
            >
              Reload interface
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
