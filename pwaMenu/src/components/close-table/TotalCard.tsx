import { memo } from 'react'
import { useTranslation } from 'react-i18next'

// Tip percentage options
export const TIP_OPTIONS = [0, 10, 15, 20] as const
export type TipPercentage = typeof TIP_OPTIONS[number]

interface TotalCardProps {
  totalConsumed: number
  ordersCount: number
  currentRound: number
  tipPercentage?: TipPercentage
  onTipChange?: (tip: TipPercentage) => void
}

export const TotalCard = memo(function TotalCard({
  totalConsumed,
  ordersCount,
  currentRound,
  tipPercentage = 0,
  onTipChange,
}: TotalCardProps) {
  const { t } = useTranslation()
  const orderWord = ordersCount === 1 ? t('closeTable.order_one') : t('closeTable.order_other')
  const roundWord = currentRound === 1 ? t('bottomNav.round') : t('bottomNav.round_plural')

  const tipAmount = totalConsumed * (tipPercentage / 100)
  const grandTotal = totalConsumed + tipAmount

  return (
    <div className="bg-dark-card rounded-xl p-6">
      <div className="text-center">
        <p className="text-dark-muted text-sm mb-1">{t('closeTable.totalConsumed')}</p>
        <p className="text-primary text-4xl font-bold">${totalConsumed.toFixed(2)}</p>
        <p className="text-dark-muted text-sm mt-2">
          {ordersCount} {orderWord} · {currentRound} {roundWord}
        </p>
      </div>

      {/* PWAM-009: Tip selector */}
      {onTipChange && (
        <div className="mt-4 pt-4 border-t border-dark-border">
          <p className="text-dark-muted text-sm mb-2 text-center">
            {t('closeTable.addTip', 'Agregar propina')}
          </p>
          <div className="flex justify-center gap-2">
            {TIP_OPTIONS.map((tip) => (
              <button
                key={tip}
                onClick={() => onTipChange(tip)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tipPercentage === tip
                    ? 'bg-primary text-white'
                    : 'bg-dark-elevated text-dark-muted hover:text-white'
                }`}
              >
                {tip === 0 ? t('closeTable.noTip', 'Sin') : `${tip}%`}
              </button>
            ))}
          </div>

          {tipPercentage > 0 && (
            <div className="mt-3 space-y-1 text-center">
              <p className="text-dark-muted text-sm">
                {t('closeTable.tipAmount', 'Propina')}: ${tipAmount.toFixed(2)}
              </p>
              <p className="text-white font-semibold">
                {t('closeTable.grandTotal', 'Total a pagar')}: ${grandTotal.toFixed(2)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
})
