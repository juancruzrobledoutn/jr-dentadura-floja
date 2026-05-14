import { useTranslation } from 'react-i18next'
import type { OrderRecord } from '../../types'

interface OrdersListProps {
  orders: OrderRecord[]
  getDinerColor: (dinerId: string) => string
}

export function OrdersList({ orders, getDinerColor }: OrdersListProps) {
  if (orders.length === 0) {
    return <EmptyOrders />
  }

  return (
    <div className="space-y-4">
      {orders.map((order, orderIdx) => (
        <OrderCard
          key={order.id}
          order={order}
          roundNumber={orderIdx + 1}
          getDinerColor={getDinerColor}
        />
      ))}
    </div>
  )
}

function EmptyOrders() {
  const { t } = useTranslation()

  return (
    <div className="bg-dark-card rounded-xl p-8 text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-dark-elevated flex items-center justify-center">
        <svg
          className="w-8 h-8 text-dark-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"
          />
        </svg>
      </div>
      <p className="text-dark-muted">{t('orderHistory.noOrders')}</p>
      <p className="text-dark-muted text-xs mt-1">{t('orderHistory.ordersWillAppear')}</p>
    </div>
  )
}

interface OrderCardProps {
  order: OrderRecord
  roundNumber: number
  getDinerColor: (dinerId: string) => string
}

function OrderCard({ order, roundNumber, getDinerColor }: OrderCardProps) {
  const { t } = useTranslation()
  const orderTotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0)

  return (
    <div className="bg-dark-card rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-primary font-semibold">{t('orderHistory.round')} {roundNumber}</span>
          <OrderStatusBadge status={order.status} />
        </div>
        <span className="text-white font-bold">${orderTotal.toFixed(2)}</span>
      </div>
      <div className="space-y-2">
        {order.items.map((item, idx) => (
          <div key={`${item.id}-${idx}`} className="flex items-center gap-3">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: getDinerColor(item.dinerId) }}
            />
            <span className="text-dark-muted text-sm flex-1">
              {item.quantity}x {item.name}
            </span>
            <span className="text-white text-sm">
              ${(item.price * item.quantity).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function OrderStatusBadge({ status }: { status: OrderRecord['status'] }) {
  const { t } = useTranslation()

  const statusConfig = {
    served: { bg: 'bg-green-500/20', text: 'text-green-400', key: 'served' },
    delivered: { bg: 'bg-green-500/20', text: 'text-green-400', key: 'delivered' },
    preparing: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', key: 'preparing' },
    ready: { bg: 'bg-blue-500/20', text: 'text-blue-400', key: 'ready' },
    confirmed: { bg: 'bg-dark-elevated', text: 'text-dark-muted', key: 'confirmed' },
    submitted: { bg: 'bg-dark-elevated', text: 'text-dark-muted', key: 'submitted' },
    paid: { bg: 'bg-green-500/20', text: 'text-green-400', key: 'paid' },
    cancelled: { bg: 'bg-red-500/20', text: 'text-red-400', key: 'cancelled' },
  }

  const config = statusConfig[status] || statusConfig.submitted

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${config.bg} ${config.text}`}>
      {t(`orderHistory.status.${config.key}`)}
    </span>
  )
}
