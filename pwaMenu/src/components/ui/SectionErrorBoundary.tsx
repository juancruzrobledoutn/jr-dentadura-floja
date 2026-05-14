import { Component, ErrorInfo, ReactNode } from 'react'
import i18n from '../../i18n'
import { errorBoundaryLogger } from '../../utils/logger'

interface Props {
  children: ReactNode
  sectionName?: string
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

/**
 * Granular Error Boundary for app sections.
 * Allows an error in one section to not crash the entire application.
 */
export default class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    errorBoundaryLogger.error(`Error in section "${this.props.sectionName || 'unknown'}"`, {
      error,
      componentStack: errorInfo.componentStack,
    })
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      const errorTitle = this.props.sectionName
        ? i18n.t('errors.sectionError', { section: this.props.sectionName })
        : i18n.t('errors.sectionErrorGeneric')

      return (
        <div className="bg-dark-card border border-dark-border rounded-xl p-6 text-center" role="alert" aria-live="assertive">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-white font-medium mb-1">
            {errorTitle}
          </p>
          <p className="text-dark-muted text-sm mb-4">
            {i18n.t('errors.somethingWentWrong')}
          </p>
          <button
            onClick={this.handleRetry}
            className="bg-primary hover:bg-primary/90 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors"
          >
            {i18n.t('common.retry')}
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
