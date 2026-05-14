import { Component, ErrorInfo, ReactNode } from 'react'
import { withTranslation, WithTranslation } from 'react-i18next'
import { sanitizeText } from '../utils/validation'
import { errorBoundaryLogger } from '../utils/logger'

interface Props extends WithTranslation {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    errorBoundaryLogger.error('Error caught by ErrorBoundary', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    })
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render(): ReactNode {
    const { t } = this.props

    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen bg-dark-bg flex flex-col items-center justify-center px-4">
          <div className="w-full max-w-md text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>

            <h1 className="text-2xl font-bold text-white mb-2">
              {t('errors.generic')}
            </h1>
            <p className="text-dark-muted mb-6">
              {t('errors.unexpected')}
            </p>

            {/* Only show error details in development to prevent XSS/information disclosure */}
            {import.meta.env.DEV && this.state.error && (
              <details className="mb-6 text-left" open>
                <summary className="text-dark-muted text-sm cursor-pointer hover:text-white transition-colors">
                  {t('errors.details')}
                </summary>
                <pre className="mt-2 p-3 bg-dark-card rounded-lg text-red-400 text-xs overflow-x-auto whitespace-pre-wrap">
                  {sanitizeText(this.state.error.message)}
                  {'\n\n'}
                  {sanitizeText(this.state.error.stack || '')}
                </pre>
              </details>
            )}

            <button
              onClick={this.handleRetry}
              className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-3 px-4 rounded-xl transition-colors"
            >
              {t('errors.tryAgain')}
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

const ErrorBoundaryWithTranslation = withTranslation()(ErrorBoundary)
ErrorBoundaryWithTranslation.displayName = 'ErrorBoundary'

export default ErrorBoundaryWithTranslation
