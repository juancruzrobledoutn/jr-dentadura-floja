import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

interface PaidViewProps {
  totalConsumed: number
  tableNumber: string
  onLeaveTable: () => void
}

/**
 * Generates receipt text for sharing
 */
function generateReceiptText(
  tableNumber: string,
  totalConsumed: number,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  return `${t('closeTable.thankYou')}

${t('closeTable.paidAmount')}: $${totalConsumed.toFixed(2)}
${t('header.table')}: ${tableNumber}

---
Sabor - ${t('app.subtitle')}`
}

export function PaidView({
  totalConsumed,
  tableNumber,
  onLeaveTable,
}: PaidViewProps) {
  const { t } = useTranslation()

  const handleShareReceipt = useCallback(async () => {
    const receiptText = generateReceiptText(tableNumber, totalConsumed, t)

    // Use Web Share API if available (mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: t('closeTable.shareReceipt'),
          text: receiptText,
        })
      } catch (err) {
        // User cancelled or share failed - fallback to clipboard
        if ((err as Error).name !== 'AbortError') {
          await navigator.clipboard.writeText(receiptText)
        }
      }
    } else {
      // Fallback: copy to clipboard (desktop)
      await navigator.clipboard.writeText(receiptText)
    }
  }, [tableNumber, totalConsumed, t])

  return (
    <div className="min-h-screen bg-dark-bg flex flex-col items-center justify-center p-4 safe-area-inset overflow-x-hidden w-full max-w-full">
      <div className="w-full max-w-sm text-center animate-status-enter">
        {/* L001 FIX: Animated success icon */}
        <div className="relative w-24 h-24 mx-auto mb-6">
          <div className="absolute inset-0 rounded-full bg-green-500/20 animate-icon-pop" />
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              className="w-12 h-12 text-green-500"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" className="opacity-30" />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75"
                className="animate-checkmark-draw"
              />
            </svg>
          </div>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">{t('closeTable.thankYou')}</h1>
        <p className="text-dark-muted mb-6">{t('closeTable.comeBackSoon')}</p>

        <div className="bg-dark-card rounded-xl p-4 mb-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-dark-muted text-sm">{t('closeTable.paidAmount')}</span>
            <span className="text-primary font-bold text-xl">${totalConsumed.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-dark-muted text-sm">{t('header.table')}</span>
            <span className="text-white">{tableNumber}</span>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={onLeaveTable}
            className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-4 px-4 rounded-xl transition-colors"
          >
            {t('closeTable.leaveTable')}
          </button>
          <button
            onClick={handleShareReceipt}
            className="w-full bg-dark-card hover:bg-dark-elevated text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
            aria-label={t('closeTable.shareReceipt')}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"
              />
            </svg>
            {t('closeTable.shareReceipt')}
          </button>
        </div>
      </div>
    </div>
  )
}
