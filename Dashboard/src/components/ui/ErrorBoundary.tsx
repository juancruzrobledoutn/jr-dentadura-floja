import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from './Button'
import { logError } from '../../utils/logger'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
  /** Name of the boundary for tracking purposes */
  name?: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

/**
 * SPRINT 6: Enhanced Error Boundary with reporting capabilities
 *
 * Features:
 * - Detailed error logging with component stack
 * - Optional error tracking service integration
 * - User-friendly error UI with retry mechanism
 * - Development-only error details display
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error with full context
    logError(
      `Error caught in boundary${this.props.name ? ` [${this.props.name}]` : ''}`,
      'ErrorBoundary',
      {
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent
      }
    )

    // Store errorInfo for display
    this.setState({ errorInfo })

    // Call custom error handler
    this.props.onError?.(error, errorInfo)

    // OPTIONAL: Send to error tracking service
    // this.reportToErrorTracking(error, errorInfo)
  }

  /**
   * Optional: Send error to tracking service (Sentry, LogRocket, etc.)
   * Uncomment and configure when ready to integrate
   */
  // private reportToErrorTracking(error: Error, errorInfo: React.ErrorInfo): void {
  //   if (import.meta.env.PROD) {
  //     // Example: Sentry integration
  //     // Sentry.captureException(error, {
  //     //   contexts: {
  //     //     react: {
  //     //       componentStack: errorInfo.componentStack,
  //     //     },
  //     //   },
  //     //   tags: {
  //     //     boundary: this.props.name || 'unknown',
  //     //   },
  //     // })
  //   }
  // }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-[var(--danger-border)]/10 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8 text-[var(--danger-icon)]" aria-hidden="true" />
            </div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">
              Algo salió mal
            </h2>
            <p className="text-[var(--text-tertiary)] max-w-md">
              Ha ocurrido un error inesperado. Por favor, intenta recargar la página.
            </p>

            {/* Development-only error details */}
            {import.meta.env.DEV && this.state.error && (
              <details className="text-left bg-[var(--bg-secondary)] rounded-lg p-4 max-w-2xl mx-auto">
                <summary className="text-[var(--text-tertiary)] cursor-pointer text-sm font-medium hover:text-[var(--text-secondary)]">
                  Detalles técnicos (desarrollo)
                </summary>
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-muted)] mb-1">Error:</p>
                    <pre className="text-xs text-[var(--danger-text)] overflow-auto bg-zinc-950 p-2 rounded">
                      {this.state.error.message}
                    </pre>
                  </div>
                  {this.state.error.stack && (
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-muted)] mb-1">Stack Trace:</p>
                      <pre className="text-xs text-[var(--text-tertiary)] overflow-auto bg-zinc-950 p-2 rounded max-h-40">
                        {this.state.error.stack}
                      </pre>
                    </div>
                  )}
                  {this.state.errorInfo?.componentStack && (
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-muted)] mb-1">Component Stack:</p>
                      <pre className="text-xs text-[var(--text-tertiary)] overflow-auto bg-zinc-950 p-2 rounded max-h-40">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}

            <div className="flex gap-3 justify-center pt-2">
              <Button
                variant="secondary"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
                Recargar página
              </Button>
              <Button onClick={this.handleReset}>
                Intentar de nuevo
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
