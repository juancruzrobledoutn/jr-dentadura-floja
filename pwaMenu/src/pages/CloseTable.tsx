import { useState, useCallback, useEffect, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useOrderHistoryData,
  useCloseTableActions,
  useTableStore,
  useSession,
} from '../stores/tableStore'
import { useCloseTableFlow } from '../hooks/useCloseTableFlow'
import {
  CloseStatusView,
  PaidView,
  NoSessionView,
  OrdersList,
  CloseTableHeader,
  TotalCard,
  CartWarning,
  TabSelector,
  SummaryTab,
  ErrorBanner,
} from '../components/close-table'
import type { CloseTableTab } from '../components/close-table'
import type { TipPercentage } from '../components/close-table/TotalCard'
import SectionErrorBoundary from '../components/ui/SectionErrorBoundary'
import type { SplitMethod } from '../types'
import { dinerWS } from '../services/websocket'

const FeedbackModal = lazy(() => import('../components/FeedbackModal'))

interface CloseTableProps {
  onBack: () => void
}

export default function CloseTable({ onBack }: CloseTableProps) {
  const { t } = useTranslation()
  const session = useSession()
  const { orders, totalConsumed, currentRound } = useOrderHistoryData()
  const { closeTable, getPaymentShares, leaveTable, getDinerPaidAmount } = useCloseTableActions()
  const getDinerColor = useTableStore((state) => state.getDinerColor)

  // REACT 19 IMPROVEMENT: Document metadata for better UX
  const documentTitle = session
    ? `${t('closeTable.title')} ${session.tableNumber}`
    : t('closeTable.title')

  const [activeTab, setActiveTab] = useState<CloseTableTab>('summary')
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('byConsumption')
  const [tipPercentage, setTipPercentage] = useState<TipPercentage>(0)

  const [feedbackOpen, setFeedbackOpen] = useState(false)

  const {
    closeStatus,
    error,
    isProcessing,
    startCloseFlow,
    confirmPayment,
    setError,
    setCloseStatus,
  } = useCloseTableFlow(closeTable)

  // Listen for CHECK_PAID event to automatically move to paid state
  useEffect(() => {
    if (closeStatus !== 'waiting_waiter') return

    const unsubscribe = dinerWS.on('CHECK_PAID', () => {
      setCloseStatus('paid')
    })

    return unsubscribe
  }, [closeStatus, setCloseStatus])

  // FIX: Sync orders from backend on mount to ensure all diners see all orders
  // This fixes the issue where a diner who didn't submit sees empty order history
  const syncOrdersFromBackend = useTableStore((state) => state.syncOrdersFromBackend)
  useEffect(() => {
    syncOrdersFromBackend()
  }, [syncOrdersFromBackend])

  const handleCloseTable = useCallback(async () => {
    if (!session) return

    if (session.sharedCart.length > 0) {
      setError(t('closeTable.cartErrorPending'))
      return
    }

    await startCloseFlow()
  }, [session, startCloseFlow, setError, t])

  const handleLeaveTable = useCallback(() => {
    leaveTable()
    onBack()
  }, [leaveTable, onBack])

  // No session view
  if (!session) {
    return <NoSessionView onBack={onBack} />
  }

  // Processing states view
  if (isProcessing) {
    return (
      <CloseStatusView
        status={closeStatus}
        totalConsumed={totalConsumed}
        checkId={session.backendCheckId}
        onConfirmPayment={confirmPayment}
      />
    )
  }

  // Paid view
  if (closeStatus === 'paid') {
    return (
      <>
        <PaidView
          totalConsumed={totalConsumed}
          tableNumber={session.tableNumber}
          onLeaveTable={handleLeaveTable}
        />
        {!feedbackOpen && (
          <div className="fixed bottom-24 left-0 right-0 flex justify-center z-40">
            <button
              onClick={() => setFeedbackOpen(true)}
              className="px-6 py-3 rounded-full bg-orange-500 text-white font-semibold shadow-lg hover:bg-orange-600 transition-colors animate-bounce"
            >
              {t('feedback.leaveReview', 'Dejar opinion')}
            </button>
          </div>
        )}
        <Suspense fallback={null}>
          <FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
        </Suspense>
      </>
    )
  }

  const diners = session.diners
  const shares = getPaymentShares(splitMethod, tipPercentage)
  const hasItemsInCart = session.sharedCart.length > 0

  return (
    <>
      <title>{documentTitle}</title>
      <meta name="description" content={t('closeTable.description') || 'Solicita la cuenta y revisa el consumo de tu mesa'} />

      <div className="min-h-screen bg-dark-bg safe-area-inset overflow-x-hidden w-full max-w-full">
        {/* Header */}
        <CloseTableHeader tableNumber={session.tableNumber} onBack={onBack} />

        {/* Content */}
        <main className="px-4 sm:px-6 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Total with tip selector */}
            <TotalCard
              totalConsumed={totalConsumed}
              ordersCount={orders.length}
              currentRound={currentRound}
              tipPercentage={tipPercentage}
              onTipChange={setTipPercentage}
            />

            {/* Warning if there are items in cart */}
            {hasItemsInCart && (
              <CartWarning cartItemsCount={session.sharedCart.length} />
            )}

            {/* Tabs */}
            <TabSelector
              activeTab={activeTab}
              ordersCount={orders.length}
              onTabChange={setActiveTab}
            />

            {/* Tab Content */}
            <SectionErrorBoundary sectionName={activeTab === 'summary' ? 'Resumen' : 'Pedidos'}>
              {activeTab === 'summary' ? (
                <SummaryTab
                  diners={diners}
                  shares={shares}
                  orders={orders}
                  splitMethod={splitMethod}
                  onSplitMethodToggle={() =>
                    setSplitMethod((m) => (m === 'equal' ? 'byConsumption' : 'equal'))
                  }
                  getDinerColor={getDinerColor}
                  getDinerPaidAmount={getDinerPaidAmount}
                />
              ) : (
                <OrdersList orders={orders} getDinerColor={getDinerColor} />
              )}
            </SectionErrorBoundary>

            {/* Error */}
            {error && <ErrorBanner message={error} />}

            {/* Request bill button */}
            <button
              onClick={handleCloseTable}
              disabled={orders.length === 0 || hasItemsInCart}
              className="w-full bg-primary hover:bg-primary/90 disabled:bg-dark-elevated disabled:text-dark-muted text-white font-semibold py-4 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{t('closeTable.requestBill')}</span>
            </button>

            {orders.length === 0 && (
              <p className="text-dark-muted text-sm text-center">
                {t('closeTable.noOrdersToClose')}
              </p>
            )}
          </div>
        </main>
      </div>
    </>
  )
}
