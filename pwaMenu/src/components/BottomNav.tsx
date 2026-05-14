import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOrderHistoryData, useSession } from '../stores/tableStore'
import OrderHistory from './OrderHistory'

interface BottomNavProps {
  onCloseTable?: () => void
  onAIChat?: () => void
  onCallWaiter?: () => void
}

export default function BottomNav({ onCloseTable, onAIChat, onCallWaiter }: BottomNavProps) {
  const { t } = useTranslation()
  const session = useSession()
  const { orders, currentRound } = useOrderHistoryData()
  const [showHistory, setShowHistory] = useState(false)

  const hasOrders = orders.length > 0

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 bg-dark-bg safe-area-bottom"
        aria-label={t('bottomNav.mainNav')}
      >
        {/* AI Chat button - centered above the nav bar */}
        <div className="flex justify-center">
          <button
            onClick={onAIChat}
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white flex items-center justify-center hover:bg-gray-100 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-dark-bg shadow-lg -mb-6 sm:-mb-7 relative z-10"
            aria-label={t('bottomNav.aiAssistant')}
          >
            <svg
              className="w-6 h-6 sm:w-7 sm:h-7 text-dark-bg"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </button>
        </div>

        {/* Bottom buttons bar */}
        <div className="border-t border-dark-border bg-dark-bg pb-4 sm:pb-6 pt-3 sm:pt-4">
          <div className="max-w-7xl mx-auto px-2 sm:px-4 md:px-8 lg:px-12 flex items-center justify-center gap-2">
            {/* Call Waiter button */}
            <button
              onClick={onCallWaiter}
              disabled={!session}
              className="flex-1 max-w-[120px] h-10 sm:h-12 rounded-lg border border-dark-border flex flex-col items-center justify-center hover:border-white hover:bg-white/5 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50 disabled:hover:border-dark-border disabled:hover:bg-transparent"
              aria-label={t('header.callWaiter')}
            >
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5 text-dark-muted"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
                />
              </svg>
              <span className="text-dark-muted text-[10px] sm:text-xs font-medium mt-0.5">{t('bottomNav.callWaiter')}</span>
            </button>

            {/* Order history button */}
            <button
              onClick={() => setShowHistory(true)}
              disabled={!hasOrders}
              className="flex-1 max-w-[120px] h-10 sm:h-12 rounded-lg border border-dark-border flex flex-col items-center justify-center hover:border-white hover:bg-white/5 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50 disabled:hover:border-dark-border disabled:hover:bg-transparent"
              aria-label={t('bottomNav.orderHistory')}
            >
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5 text-dark-muted"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
                />
              </svg>
              <span className="text-dark-muted text-[10px] sm:text-xs font-medium mt-0.5">
                {hasOrders ? t('bottomNav.roundLabel', { round: currentRound }) : t('bottomNav.orders')}
              </span>
            </button>

            {/* Request bill button */}
            <button
              onClick={onCloseTable}
              disabled={!session}
              className={`flex-1 max-w-[120px] h-10 sm:h-12 rounded-lg border flex flex-col items-center justify-center transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50 disabled:hover:border-dark-border disabled:hover:bg-transparent ${session?.status === 'paying' ? 'border-purple-500 bg-purple-500/10' : 'border-dark-border hover:border-white hover:bg-white/5'}`}
              aria-label={t('bottomNav.askForBill')}
            >
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5 text-dark-muted"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
                />
              </svg>
              <span className={`text-[10px] sm:text-xs font-medium mt-0.5 ${session?.status === 'paying' ? 'text-purple-300' : 'text-dark-muted'}`}>{session?.status === 'paying' ? t('bottomNav.billRequested', 'Cuenta pedida') : t('bottomNav.bill')}</span>
            </button>
          </div>
        </div>
      </nav>

      {/* History modal */}
      <OrderHistory isOpen={showHistory} onClose={() => setShowHistory(false)} />
    </>
  )
}
