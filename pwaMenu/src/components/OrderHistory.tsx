import { useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useOrderHistoryData, useTableStore } from '../stores/tableStore'
import type { OrderRecord, OrderStatus } from '../types'

interface OrderHistoryProps {
  isOpen: boolean
  onClose: () => void
}

// Color mapping for statuses (labels are now translated)
const STATUS_COLORS: Record<OrderStatus, { color: string; bgColor: string }> = {
  submitted: { color: 'text-yellow-400', bgColor: 'bg-yellow-400/10' },
  confirmed: { color: 'text-blue-400', bgColor: 'bg-blue-400/10' },
  preparing: { color: 'text-orange-400', bgColor: 'bg-orange-400/10' },
  ready: { color: 'text-green-400', bgColor: 'bg-green-400/10' },
  delivered: { color: 'text-green-500', bgColor: 'bg-green-500/10' },
  paid: { color: 'text-primary', bgColor: 'bg-primary/10' },
  cancelled: { color: 'text-red-400', bgColor: 'bg-red-400/10' },
}

function formatTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

interface OrderCardProps {
  order: OrderRecord
  getDinerColor: (dinerId: string) => string
  onReorder?: (order: OrderRecord) => void
}

function OrderCard({ order, getDinerColor, onReorder }: OrderCardProps) {
  const { t } = useTranslation()
  const statusColors = STATUS_COLORS[order.status]
  const statusLabel = t(`orderHistory.status.${order.status}`)

  return (
    <div className="bg-dark-card rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold">{t('orderHistory.round')} {order.round_number}</span>
          <span className="text-dark-muted text-sm">
            {formatTime(order.submitted_at)}
          </span>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors.color} ${statusColors.bgColor}`}>
          {statusLabel}
        </span>
      </div>

      {/* Items */}
      <div className="space-y-2">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center gap-3">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: getDinerColor(item.dinerId) }}
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <span className="text-white text-sm">
                {item.quantity}x {item.name}
              </span>
            </div>
            <span className="text-dark-muted text-sm">
              ${(item.price * item.quantity).toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      {/* Subtotal */}
      <div className="flex items-center justify-between pt-2 border-t border-dark-border">
        <span className="text-dark-muted text-sm">{t('orderHistory.subtotal')}</span>
        <span className="text-white font-semibold">${order.subtotal.toFixed(2)}</span>
      </div>

      {/* Re-order button */}
      {onReorder && order.items.length > 0 && (
        <div className="pt-1">
          <button
            onClick={() => onReorder(order)}
            className="w-full py-2 px-3 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
            </svg>
            {t('orderHistory.reorder', 'Repetir pedido')}
          </button>
        </div>
      )}

      {/* Timeline */}
      {(order.confirmed_at || order.ready_at || order.delivered_at) && (
        <div className="pt-2 border-t border-dark-border space-y-1">
          {order.confirmed_at && (
            <div className="flex items-center gap-2 text-xs text-dark-muted">
              <svg className="w-3 h-3 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              {t('orderHistory.confirmedAt', { time: formatTime(order.confirmed_at) })}
            </div>
          )}
          {order.ready_at && (
            <div className="flex items-center gap-2 text-xs text-dark-muted">
              <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              {t('orderHistory.readyAt', { time: formatTime(order.ready_at) })}
            </div>
          )}
          {order.delivered_at && (
            <div className="flex items-center gap-2 text-xs text-dark-muted">
              <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              {t('orderHistory.deliveredAt', { time: formatTime(order.delivered_at) })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function OrderHistory({ isOpen, onClose }: OrderHistoryProps) {
  const { t } = useTranslation()
  const { orders, currentRound, totalConsumed, session } = useOrderHistoryData()
  const getDinerColor = useTableStore((state) => state.getDinerColor)
  const addToCart = useTableStore((state) => state.addToCart)
  const syncOrdersFromBackend = useTableStore((state) => state.syncOrdersFromBackend)

  // Re-order: copy items from a past round into the cart
  const handleReorder = useCallback((order: OrderRecord) => {
    let addedCount = 0
    for (const item of order.items) {
      addToCart({
        productId: item.productId,
        name: item.name,
        price: item.price,
        image: item.image || '',
        quantity: item.quantity,
      })
      addedCount += item.quantity
    }
    if (addedCount > 0) {
      // Close the modal after re-ordering
      onClose()
    }
  }, [addToCart, onClose])

  // FIX: Sync orders from backend when modal opens
  // This ensures all diners see all orders even if they didn't submit
  useEffect(() => {
    if (isOpen) {
      syncOrdersFromBackend()
    }
  }, [isOpen, syncOrdersFromBackend])

  if (!isOpen) return null

  const roundWord = currentRound === 1 ? t('bottomNav.round') : t('bottomNav.round_plural')

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-dark-bg">
      {/* Header */}
      <header className="bg-dark-bg border-b border-dark-border px-4 sm:px-6 py-4 safe-area-top">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">{t('orderHistory.title')}</h1>
            <p className="text-dark-muted text-sm">
              {t('header.table')} {session?.table_number} · {currentRound} {roundWord}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-dark-card flex items-center justify-center hover:bg-dark-elevated transition-colors"
            aria-label={t('orderHistory.close')}
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        <div
          className="max-w-3xl mx-auto space-y-4"
          role="region"
          aria-label={t('orderHistory.ordersListLabel')}
          aria-live="polite"
          aria-atomic="false"
        >
          {orders.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-dark-card flex items-center justify-center">
                <svg className="w-8 h-8 text-dark-muted" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                </svg>
              </div>
              <p className="text-dark-muted">{t('orderHistory.noOrders')}</p>
              <p className="text-dark-muted text-sm mt-1">{t('orderHistory.ordersWillAppear')}</p>
            </div>
          ) : (
            // Show orders in reverse order (most recent first)
            [...orders].reverse().map((order) => (
              <OrderCard key={order.id} order={order} getDinerColor={getDinerColor} onReorder={handleReorder} />
            ))
          )}
        </div>
      </div>

      {/* Footer with total */}
      {orders.length > 0 && (
        <div className="bg-dark-card border-t border-dark-border px-4 sm:px-6 py-4 safe-area-bottom">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-dark-muted text-sm">{t('orderHistory.totalConsumed')}</span>
                <p className="text-white text-sm">
                  {t('orderHistory.itemsInRounds', {
                    items: orders.reduce((sum, o) => sum + o.items.length, 0),
                    rounds: currentRound,
                    roundWord
                  })}
                </p>
              </div>
              <span className="text-primary text-2xl font-bold">${totalConsumed.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
