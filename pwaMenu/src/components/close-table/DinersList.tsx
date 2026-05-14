import { useTranslation } from 'react-i18next'
import type { Diner, SplitMethod, PaymentShare, OrderRecord, CartItem } from '../../types'

interface DinersListProps {
  diners: Diner[]
  shares: PaymentShare[]
  splitMethod: SplitMethod
  getDinerColor: (dinerId: string) => string
  getDinerPaidAmount?: (dinerId: string) => number // M003 FIX: Optional paid amount getter
}

export function DinersList({ diners, shares, splitMethod, getDinerColor, getDinerPaidAmount }: DinersListProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-2">
      {diners.map((diner) => {
        const share = shares.find((s) => s.dinerId === diner.id)
        const shareAmount = share?.amount ?? 0
        const paidAmount = getDinerPaidAmount?.(diner.id) ?? 0
        const remainingAmount = Math.max(0, shareAmount - paidAmount)
        const isPaidInFull = paidAmount >= shareAmount && shareAmount > 0

        return (
          <div key={diner.id} className="bg-dark-card rounded-xl p-4 flex items-center gap-4">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold relative"
              style={{ backgroundColor: getDinerColor(diner.id) }}
            >
              {diner.name.charAt(0).toUpperCase()}
              {/* M003 FIX: Show checkmark if paid in full */}
              {isPaidInFull && (
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium truncate">{diner.name}</p>
              <p className="text-dark-muted text-xs">
                {splitMethod === 'equal' ? t('closeTable.equalSplit') : t('closeTable.byConsumption')}
              </p>
              {/* M003 FIX: Show paid/remaining balance */}
              {paidAmount > 0 && (
                <p className="text-xs mt-1">
                  <span className="text-green-400">{t('closeTable.paid')}: ${paidAmount.toFixed(2)}</span>
                  {!isPaidInFull && (
                    <span className="text-orange-400 ml-2">
                      {t('closeTable.remaining')}: ${remainingAmount.toFixed(2)}
                    </span>
                  )}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className={`font-bold ${isPaidInFull ? 'text-green-400 line-through' : 'text-white'}`}>
                ${shareAmount.toFixed(2)}
              </p>
              {!isPaidInFull && paidAmount > 0 && (
                <p className="text-orange-400 text-sm font-semibold">${remainingAmount.toFixed(2)}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface ConsumptionDetailProps {
  diners: Diner[]
  orders: OrderRecord[]
  getDinerColor: (dinerId: string) => string
}

export function ConsumptionDetail({ diners, orders, getDinerColor }: ConsumptionDetailProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-3 pt-2">
      <h3 className="text-dark-muted text-sm font-medium">{t('closeTable.detailByDiner')}</h3>
      {diners.map((diner) => {
        const dinerItems = orders.flatMap((order) =>
          order.items.filter((item) => item.dinerId === diner.id)
        )
        if (dinerItems.length === 0) return null
        return (
          <DinerConsumptionCard
            key={diner.id}
            dinerName={diner.name}
            items={dinerItems}
            dinerColor={getDinerColor(diner.id)}
          />
        )
      })}
    </div>
  )
}

interface DinerConsumptionCardProps {
  dinerName: string
  items: CartItem[]
  dinerColor: string
}

function DinerConsumptionCard({ dinerName, items, dinerColor }: DinerConsumptionCardProps) {
  return (
    <div className="bg-dark-elevated rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: dinerColor }} />
        <span className="text-white text-sm font-medium">{dinerName}</span>
      </div>
      {items.map((item, idx) => (
        <div key={`${item.id}-${idx}`} className="flex justify-between text-xs pl-5">
          <span className="text-dark-muted">
            {item.quantity}x {item.name}
          </span>
          <span className="text-white">${(item.price * item.quantity).toFixed(2)}</span>
        </div>
      ))}
    </div>
  )
}
