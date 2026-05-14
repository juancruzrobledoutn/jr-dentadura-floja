import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  parsePaymentResult,
  isPaymentApproved,
  isPaymentPending,
  formatCurrency,
  type MPPaymentResult,
} from '../services/mercadoPago'
import { useTableStore } from '../stores/tableStore'

interface PaymentResultProps {
  onContinue: () => void
}

type ResultStatus = 'loading' | 'approved' | 'pending' | 'rejected' | 'error'

export default function PaymentResult({ onContinue }: PaymentResultProps) {
  const { t } = useTranslation()
  const leaveTable = useTableStore((state) => state.leaveTable)
  const session = useTableStore((state) => state.session)

  const [status, setStatus] = useState<ResultStatus>('loading')
  const [paymentResult, setPaymentResult] = useState<MPPaymentResult | null>(null)
  const [isMock, setIsMock] = useState(false)
  const [total, setTotal] = useState<number | null>(null)

  // REACT 19 IMPROVEMENT: Document metadata based on payment status
  const documentTitle = status === 'loading'
    ? t('paymentResult.loading')
    : status === 'approved'
    ? t('paymentResult.approved')
    : status === 'pending'
    ? t('paymentResult.pending')
    : t('paymentResult.rejected')

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const result = parsePaymentResult(searchParams)
    setPaymentResult(result)

    // Check if this is a mock payment
    const mockParam = searchParams.get('mock')
    setIsMock(mockParam === 'true')

    // Get total from mock params if available
    const totalParam = searchParams.get('total')
    if (totalParam) {
      setTotal(parseFloat(totalParam))
    }

    // Determine status
    if (isPaymentApproved(result)) {
      setStatus('approved')
    } else if (isPaymentPending(result)) {
      setStatus('pending')
    } else if (result.status === 'rejected' || result.collection_status === 'rejected') {
      setStatus('rejected')
    } else if (result.status === 'cancelled' || result.collection_status === 'cancelled') {
      setStatus('rejected')
    } else {
      // Check mock status param
      const mockStatus = searchParams.get('status')
      if (mockStatus === 'approved') {
        setStatus('approved')
      } else if (mockStatus === 'pending') {
        setStatus('pending')
      } else {
        setStatus('error')
      }
    }
  }, [])

  const handleLeaveTable = useCallback(() => {
    leaveTable()
    // Clear URL params
    window.history.replaceState({}, '', window.location.pathname.replace('/payment/success', ''))
    onContinue()
  }, [leaveTable, onContinue])

  const handleRetry = useCallback(() => {
    // Clear URL params and go back
    window.history.replaceState({}, '', window.location.pathname.replace('/payment/success', ''))
    onContinue()
  }, [onContinue])

  // Status-specific content
  const statusConfig = {
    loading: {
      icon: (
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      ),
      title: t('paymentResult.loading'),
      description: t('paymentResult.loadingDescription'),
      bgColor: 'bg-dark-elevated',
    },
    approved: {
      icon: (
        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center">
          <svg
            className="w-10 h-10 text-green-500"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      ),
      title: t('paymentResult.approved'),
      description: t('paymentResult.approvedDescription'),
      bgColor: 'bg-green-500/10',
    },
    pending: {
      icon: (
        <div className="w-20 h-20 bg-yellow-500/20 rounded-full flex items-center justify-center">
          <svg
            className="w-10 h-10 text-yellow-500"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
      ),
      title: t('paymentResult.pending'),
      description: t('paymentResult.pendingDescription'),
      bgColor: 'bg-yellow-500/10',
    },
    rejected: {
      icon: (
        <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center">
          <svg
            className="w-10 h-10 text-red-500"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      ),
      title: t('paymentResult.rejected'),
      description: t('paymentResult.rejectedDescription'),
      bgColor: 'bg-red-500/10',
    },
    error: {
      icon: (
        <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center">
          <svg
            className="w-10 h-10 text-red-500"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
      ),
      title: t('paymentResult.error'),
      description: t('paymentResult.errorDescription'),
      bgColor: 'bg-red-500/10',
    },
  }

  const config = statusConfig[status]

  return (
    <>
      <title>{documentTitle}</title>
      <meta name="description" content={config.description} />

      <div className="min-h-screen bg-dark-bg safe-area-inset flex flex-col overflow-x-hidden w-full max-w-full">
        {/* Header */}
        <header className="bg-dark-card border-b border-dark-border px-4 py-4">
        <h1 className="text-lg font-semibold text-white text-center">
          {t('paymentResult.title')}
        </h1>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className={`w-full max-w-md ${config.bgColor} rounded-2xl p-8 text-center`}>
          {/* Icon */}
          <div className="flex justify-center mb-6">{config.icon}</div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-white mb-2">{config.title}</h2>

          {/* Description */}
          <p className="text-dark-muted mb-6">{config.description}</p>

          {/* Payment details */}
          {status !== 'loading' && (
            <div className="bg-dark-bg/50 rounded-xl p-4 mb-6 text-left space-y-2">
              {total && (
                <div className="flex justify-between">
                  <span className="text-dark-muted">{t('paymentResult.total')}</span>
                  <span className="text-white font-semibold">{formatCurrency(total)}</span>
                </div>
              )}
              {session?.table_number && (
                <div className="flex justify-between">
                  <span className="text-dark-muted">{t('paymentResult.table')}</span>
                  <span className="text-white">{session.table_number}</span>
                </div>
              )}
              {paymentResult?.payment_id && (
                <div className="flex justify-between">
                  <span className="text-dark-muted">{t('paymentResult.paymentId')}</span>
                  <span className="text-white text-sm font-mono">
                    {paymentResult.payment_id}
                  </span>
                </div>
              )}
              {paymentResult?.external_reference && (
                <div className="flex justify-between">
                  <span className="text-dark-muted">{t('paymentResult.reference')}</span>
                  <span className="text-white text-sm font-mono">
                    {paymentResult.external_reference.substring(0, 12)}...
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Mock indicator */}
          {isMock && (
            <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg px-3 py-2 mb-6">
              <p className="text-yellow-400 text-sm font-medium">
                {t('paymentResult.mockPayment')}
              </p>
            </div>
          )}

          {/* Actions */}
          {status === 'approved' && (
            <button
              onClick={handleLeaveTable}
              className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-4 px-4 rounded-xl transition-colors"
            >
              {t('paymentResult.leaveTable')}
            </button>
          )}

          {status === 'pending' && (
            <div className="space-y-3">
              <button
                onClick={handleLeaveTable}
                className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-4 px-4 rounded-xl transition-colors"
              >
                {t('paymentResult.leaveTable')}
              </button>
              <p className="text-dark-muted text-xs">
                {t('paymentResult.pendingNote')}
              </p>
            </div>
          )}

          {(status === 'rejected' || status === 'error') && (
            <div className="space-y-3">
              <button
                onClick={handleRetry}
                className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-4 px-4 rounded-xl transition-colors"
              >
                {t('paymentResult.retry')}
              </button>
              <button
                onClick={handleLeaveTable}
                className="w-full bg-dark-elevated hover:bg-dark-border text-white font-medium py-3 px-4 rounded-xl transition-colors"
              >
                {t('paymentResult.cancel')}
              </button>
            </div>
          )}
        </div>
      </main>
      </div>
    </>
  )
}
