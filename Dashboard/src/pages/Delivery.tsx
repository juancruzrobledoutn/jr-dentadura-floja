import { useState, useMemo, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PageContainer } from '../components/layout'
import { Card, Button, Modal } from '../components/ui'
import {
  Package,
  Truck,
  ShoppingBag,
  Clock,
  CheckCircle,
  XCircle,
  Plus,
  ChevronRight,
  Phone,
  MapPin,
  User,
  FileText,
} from 'lucide-react'
import { useBranchStore, selectBranches, selectSelectedBranchId } from '../stores/branchStore'
import {
  useDeliveryStore,
  selectDeliveryOrders,
  selectDeliveryLoading,
} from '../stores/deliveryStore'
import { useProductStore } from '../stores/productStore'
import { handleError } from '../utils/logger'
import { toast } from '../stores/toastStore'
import type { DeliveryOrder, DeliveryOrderCreate, DeliveryOrderCreateItem } from '../services/api'

// -------------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------------

function getDeliveryStatusLabels(t: (key: string) => string): Record<string, string> {
  return {
    RECEIVED: t('pages.delivery.statusLabels.RECEIVED'),
    PREPARING: t('pages.delivery.statusLabels.PREPARING'),
    READY: t('pages.delivery.statusLabels.READY'),
    OUT_FOR_DELIVERY: t('pages.delivery.statusLabels.OUT_FOR_DELIVERY'),
    DELIVERED: t('pages.delivery.statusLabels.DELIVERED'),
    PICKED_UP: t('pages.delivery.statusLabels.PICKED_UP'),
    CANCELED: t('pages.delivery.statusLabels.CANCELED'),
  }
}

const STATUS_COLORS: Record<string, string> = {
  RECEIVED: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  PREPARING: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  READY: 'bg-green-500/20 text-green-400 border-green-500/30',
  OUT_FOR_DELIVERY: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  DELIVERED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  PICKED_UP: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  CANCELED: 'bg-red-500/20 text-red-400 border-red-500/30',
}

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  RECEIVED: Clock,
  PREPARING: Package,
  READY: CheckCircle,
  OUT_FOR_DELIVERY: Truck,
  DELIVERED: CheckCircle,
  PICKED_UP: ShoppingBag,
  CANCELED: XCircle,
}

const NEXT_STATUS: Record<string, string | null> = {
  RECEIVED: 'PREPARING',
  PREPARING: 'READY',
  READY: null, // depends on order type
  OUT_FOR_DELIVERY: 'DELIVERED',
  DELIVERED: null,
  PICKED_UP: null,
  CANCELED: null,
}

function getPaymentLabels(t: (key: string) => string): Record<string, string> {
  return {
    CASH: t('pages.delivery.paymentLabels.CASH'),
    CARD: t('pages.delivery.paymentLabels.CARD'),
    MP: t('pages.delivery.paymentLabels.MP'),
    TRANSFER: t('pages.delivery.paymentLabels.TRANSFER'),
  }
}

function getOrderTypeLabels(t: (key: string) => string): Record<string, string> {
  return {
    TAKEOUT: t('pages.delivery.typeLabels.TAKEOUT'),
    DELIVERY: t('pages.delivery.typeLabels.DELIVERY'),
  }
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(cents / 100)
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getNextStatus(order: DeliveryOrder): string | null {
  if (order.status === 'READY') {
    return order.order_type === 'DELIVERY' ? 'OUT_FOR_DELIVERY' : 'PICKED_UP'
  }
  return NEXT_STATUS[order.status] ?? null
}

// -------------------------------------------------------------------------
// Component
// -------------------------------------------------------------------------

export default function Delivery() {
  const { t } = useTranslation()
  useDocumentTitle(t('pages.delivery.titleFull'))

  const STATUS_LABELS = getDeliveryStatusLabels(t)
  const PAYMENT_LABELS = getPaymentLabels(t)
  const ORDER_TYPE_LABELS = getOrderTypeLabels(t)

  const selectedBranchId = useBranchStore(selectSelectedBranchId)
  const branches = useBranchStore(selectBranches)
  const orders = useDeliveryStore(selectDeliveryOrders)
  const isLoading = useDeliveryStore(selectDeliveryLoading)
  const fetchOrders = useDeliveryStore((s) => s.fetchOrders)
  const createOrder = useDeliveryStore((s) => s.createOrder)
  const updateStatus = useDeliveryStore((s) => s.updateStatus)
  const deleteOrder = useDeliveryStore((s) => s.deleteOrder)

  const products = useProductStore((s) => s.products)
  const fetchProducts = useProductStore((s) => s.fetchProducts)

  const [statusFilter, setStatusFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [detailOrder, setDetailOrder] = useState<DeliveryOrder | null>(null)

  // Fetch orders when branch changes
  const branchNumericId = selectedBranchId ? parseInt(selectedBranchId, 10) : null

  useEffect(() => {
    if (branchNumericId) {
      fetchOrders(branchNumericId, statusFilter || undefined, typeFilter || undefined)
    }
  }, [branchNumericId, statusFilter, typeFilter, fetchOrders])

  // Fetch products for the create modal
  useEffect(() => {
    if (branchNumericId) {
      fetchProducts(undefined, branchNumericId)
    }
  }, [branchNumericId, fetchProducts])

  const filteredOrders = useMemo(() => {
    return orders
  }, [orders])

  const handleAdvanceStatus = useCallback(
    async (order: DeliveryOrder) => {
      const next = getNextStatus(order)
      if (!next) return
      try {
        await updateStatus(order.id, next)
        toast.success(`${t('pages.delivery.statusUpdated')} ${STATUS_LABELS[next]}`)
      } catch (error) {
        const msg = handleError(error, 'Delivery.handleAdvanceStatus')
        toast.error(msg)
      }
    },
    [updateStatus],
  )

  const handleCancel = useCallback(
    async (order: DeliveryOrder) => {
      try {
        await updateStatus(order.id, 'CANCELED')
        toast.success(t('pages.delivery.orderCanceled'))
      } catch (error) {
        const msg = handleError(error, 'Delivery.handleCancel')
        toast.error(msg)
      }
    },
    [updateStatus],
  )

  const handleDelete = useCallback(
    async (order: DeliveryOrder) => {
      try {
        await deleteOrder(order.id)
        toast.success(t('pages.delivery.orderDeleted'))
        setDetailOrder(null)
      } catch (error) {
        const msg = handleError(error, 'Delivery.handleDelete')
        toast.error(msg)
      }
    },
    [deleteOrder],
  )

  const handleCreateOrder = useCallback(
    async (data: DeliveryOrderCreate) => {
      if (!branchNumericId) return
      try {
        await createOrder(branchNumericId, data)
        toast.success(t('pages.delivery.orderCreated'))
        setIsCreateModalOpen(false)
      } catch (error) {
        const msg = handleError(error, 'Delivery.handleCreateOrder')
        toast.error(msg)
      }
    },
    [branchNumericId, createOrder],
  )

  if (!selectedBranchId) {
    return (
      <PageContainer title={t('pages.delivery.titleFull')} description={t('pages.delivery.selectBranchDesc')}>
        <Card>
          <p className="text-[var(--text-muted)] text-center py-8">
            {t('pages.delivery.selectBranchFromDashboard')}
          </p>
        </Card>
      </PageContainer>
    )
  }

  const branchName = branches.find((b) => b.id === selectedBranchId)?.name ?? ''

  return (
    <PageContainer
      title={t('pages.delivery.titleFull')}
      description={`Gestion de pedidos para ${branchName}`}
    >
      {/* Filters and Actions */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="w-40 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary-500)]"
        >
          <option value="">{t('pages.delivery.allTypes')}</option>
          <option value="TAKEOUT">{t('pages.delivery.typeLabels.TAKEOUT')}</option>
          <option value="DELIVERY">{t('pages.delivery.typeLabels.DELIVERY')}</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-44 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary-500)]"
        >
          <option value="">{t('pages.delivery.allStatuses')}</option>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>

        <div className="flex-1" />

        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
          Nuevo Pedido
        </Button>
      </div>

      {/* Orders List */}
      {isLoading && filteredOrders.length === 0 ? (
        <div className="flex items-center justify-center py-12" role="status">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <span className="sr-only">{t('pages.delivery.loadingOrders')}</span>
        </div>
      ) : filteredOrders.length === 0 ? (
        <Card>
          <p className="text-[var(--text-muted)] text-center py-8">
            {t('pages.delivery.noOrders')}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onAdvance={handleAdvanceStatus}
              onCancel={handleCancel}
              onDetail={setDetailOrder}
            />
          ))}
        </div>
      )}

      {/* Create Modal */}
      {isCreateModalOpen && (
        <CreateOrderModal
          products={products}
          onClose={() => setIsCreateModalOpen(false)}
          onCreate={handleCreateOrder}
        />
      )}

      {/* Detail Modal */}
      {detailOrder && (
        <OrderDetailModal
          order={detailOrder}
          onClose={() => setDetailOrder(null)}
          onAdvance={handleAdvanceStatus}
          onCancel={handleCancel}
          onDelete={handleDelete}
        />
      )}
    </PageContainer>
  )
}

// -------------------------------------------------------------------------
// OrderCard
// -------------------------------------------------------------------------

function OrderCard({
  order,
  onAdvance,
  onCancel,
  onDetail,
}: {
  order: DeliveryOrder
  onAdvance: (order: DeliveryOrder) => void
  onCancel: (order: DeliveryOrder) => void
  onDetail: (order: DeliveryOrder) => void
}) {
  const { t } = useTranslation()
  const STATUS_LABELS = getDeliveryStatusLabels(t)
  const ORDER_TYPE_LABELS = getOrderTypeLabels(t)
  const StatusIcon = STATUS_ICONS[order.status] ?? Clock
  const nextStatus = getNextStatus(order)
  const isTerminal = !nextStatus && order.status !== 'CANCELED'

  return (
    <Card className="hover:border-[var(--primary-500)]/30 transition-colors cursor-pointer">
      <div onClick={() => onDetail(order)} className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[order.status]}`}
            >
              <StatusIcon className="w-3 h-3" aria-hidden="true" />
              {STATUS_LABELS[order.status]}
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                order.order_type === 'DELIVERY'
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'bg-cyan-500/20 text-cyan-400'
              }`}
            >
              {ORDER_TYPE_LABELS[order.order_type]}
            </span>
          </div>
          <span className="text-xs text-[var(--text-muted)]">#{order.id}</span>
        </div>

        {/* Customer */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <User className="w-3.5 h-3.5 text-[var(--text-muted)]" aria-hidden="true" />
            {order.customer_name}
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Phone className="w-3 h-3" aria-hidden="true" />
            {order.customer_phone}
          </div>
          {order.delivery_address && (
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <MapPin className="w-3 h-3" aria-hidden="true" />
              <span className="truncate">{order.delivery_address}</span>
            </div>
          )}
        </div>

        {/* Items summary */}
        <div className="text-xs text-[var(--text-muted)]">
          {order.items.length} item{order.items.length !== 1 ? 's' : ''} &middot;{' '}
          <span className="font-semibold text-[var(--text-primary)]">
            {formatCurrency(order.total_cents)}
          </span>
          {order.is_paid && (
            <span className="ml-2 text-green-400 font-medium">{t('pages.delivery.paid')}</span>
          )}
        </div>

        {/* Time */}
        <div className="text-xs text-[var(--text-muted)]">{formatDateTime(order.created_at)}</div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border-default)]">
        {nextStatus && (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onAdvance(order)
            }}
          >
            <ChevronRight className="w-3 h-3 mr-1" aria-hidden="true" />
            {STATUS_LABELS[nextStatus]}
          </Button>
        )}
        {!isTerminal && order.status !== 'CANCELED' && (
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation()
              onCancel(order)
            }}
          >
            <XCircle className="w-3 h-3 mr-1" aria-hidden="true" />
            Cancelar
          </Button>
        )}
      </div>
    </Card>
  )
}

// -------------------------------------------------------------------------
// OrderDetailModal
// -------------------------------------------------------------------------

function OrderDetailModal({
  order,
  onClose,
  onAdvance,
  onCancel,
  onDelete,
}: {
  order: DeliveryOrder
  onClose: () => void
  onAdvance: (order: DeliveryOrder) => void
  onCancel: (order: DeliveryOrder) => void
  onDelete: (order: DeliveryOrder) => void
}) {
  const { t } = useTranslation()
  const STATUS_LABELS = getDeliveryStatusLabels(t)
  const PAYMENT_LABELS = getPaymentLabels(t)
  const ORDER_TYPE_LABELS = getOrderTypeLabels(t)
  const nextStatus = getNextStatus(order)
  const StatusIcon = STATUS_ICONS[order.status] ?? Clock

  return (
    <Modal isOpen onClose={onClose} title={`Pedido #${order.id}`} size="lg">
      <div className="space-y-4">
        {/* Status + Type */}
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border ${STATUS_COLORS[order.status]}`}
          >
            <StatusIcon className="w-4 h-4" aria-hidden="true" />
            {STATUS_LABELS[order.status]}
          </span>
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              order.order_type === 'DELIVERY'
                ? 'bg-purple-500/20 text-purple-400'
                : 'bg-cyan-500/20 text-cyan-400'
            }`}
          >
            {order.order_type === 'DELIVERY' ? (
              <Truck className="w-4 h-4 mr-1" aria-hidden="true" />
            ) : (
              <ShoppingBag className="w-4 h-4 mr-1" aria-hidden="true" />
            )}
            {ORDER_TYPE_LABELS[order.order_type]}
          </span>
        </div>

        {/* Customer Info */}
        <div className="bg-[var(--bg-tertiary)] rounded-lg p-4 space-y-2">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t('pages.delivery.customer')}</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-[var(--text-muted)]">{t('common.name')}: </span>
              <span className="text-[var(--text-primary)]">{order.customer_name}</span>
            </div>
            <div>
              <span className="text-[var(--text-muted)]">{t('common.phone')}: </span>
              <span className="text-[var(--text-primary)]">{order.customer_phone}</span>
            </div>
            {order.customer_email && (
              <div className="col-span-2">
                <span className="text-[var(--text-muted)]">{t('common.email')}: </span>
                <span className="text-[var(--text-primary)]">{order.customer_email}</span>
              </div>
            )}
          </div>
        </div>

        {/* Delivery Info */}
        {order.order_type === 'DELIVERY' && (
          <div className="bg-[var(--bg-tertiary)] rounded-lg p-4 space-y-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t('pages.delivery.title')}</h3>
            <div className="text-sm space-y-1">
              <div>
                <span className="text-[var(--text-muted)]">{t('common.address')}: </span>
                <span className="text-[var(--text-primary)]">
                  {order.delivery_address || '-'}
                </span>
              </div>
              {order.delivery_instructions && (
                <div>
                  <span className="text-[var(--text-muted)]">{t('pages.delivery.instructions')}: </span>
                  <span className="text-[var(--text-primary)]">
                    {order.delivery_instructions}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Items */}
        <div className="bg-[var(--bg-tertiary)] rounded-lg p-4 space-y-2">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t('pages.delivery.items')}</h3>
          <div className="space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <div>
                  <span className="text-[var(--text-primary)]">
                    {item.qty}x {item.product_name}
                  </span>
                  {item.notes && (
                    <p className="text-xs text-[var(--text-muted)] ml-4">{item.notes}</p>
                  )}
                </div>
                <span className="text-[var(--text-primary)] font-medium">
                  {formatCurrency(item.subtotal_cents)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-between pt-2 border-t border-[var(--border-default)] font-semibold text-sm">
            <span>Total</span>
            <span className="text-[var(--primary-500)]">{formatCurrency(order.total_cents)}</span>
          </div>
        </div>

        {/* Payment & Notes */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-[var(--text-muted)]">{t('pages.delivery.paymentMethod')}: </span>
            <span className="text-[var(--text-primary)]">
              {order.payment_method ? PAYMENT_LABELS[order.payment_method] ?? order.payment_method : '-'}
            </span>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">{t('pages.delivery.paid')}: </span>
            <span className={order.is_paid ? 'text-green-400' : 'text-yellow-400'}>
              {order.is_paid ? t('common.yes') : t('common.no')}
            </span>
          </div>
          {order.notes && (
            <div className="col-span-2">
              <span className="text-[var(--text-muted)]">{t('common.notes')}: </span>
              <span className="text-[var(--text-primary)]">{order.notes}</span>
            </div>
          )}
          <div>
            <span className="text-[var(--text-muted)]">{t('pages.delivery.created')}: </span>
            <span className="text-[var(--text-primary)]">{formatDateTime(order.created_at)}</span>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center gap-2 mt-6 pt-4 border-t border-[var(--border-default)]">
        {nextStatus && (
          <Button onClick={() => onAdvance(order)}>
            <ChevronRight className="w-4 h-4 mr-1" aria-hidden="true" />
            {STATUS_LABELS[nextStatus]}
          </Button>
        )}
        {order.status !== 'CANCELED' &&
          order.status !== 'DELIVERED' &&
          order.status !== 'PICKED_UP' && (
            <Button variant="ghost" onClick={() => onCancel(order)}>
              <XCircle className="w-4 h-4 mr-1" aria-hidden="true" />
              Cancelar
            </Button>
          )}
        <div className="flex-1" />
        {(order.status === 'CANCELED' ||
          order.status === 'DELIVERED' ||
          order.status === 'PICKED_UP') && (
          <Button variant="ghost" className="text-red-400" onClick={() => onDelete(order)}>
            Eliminar
          </Button>
        )}
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </Modal>
  )
}

// -------------------------------------------------------------------------
// CreateOrderModal
// -------------------------------------------------------------------------

interface CreateFormItem {
  product_id: number
  product_name: string
  qty: number
  price_cents: number
  notes: string
}

function CreateOrderModal({
  products,
  onClose,
  onCreate,
}: {
  products: Array<{ id: string; name: string; price: number; branch_prices?: Array<{ branch_id: string; price: number }> }>
  onClose: () => void
  onCreate: (data: DeliveryOrderCreate) => Promise<void>
}) {
  const { t } = useTranslation()
  const PAYMENT_LABELS = getPaymentLabels(t)
  const [orderType, setOrderType] = useState<string>('TAKEOUT')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [deliveryInstructions, setDeliveryInstructions] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<CreateFormItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Product search
  const [productSearch, setProductSearch] = useState('')

  const filteredProducts = useMemo(() => {
    if (!productSearch) return products.slice(0, 20)
    const lower = productSearch.toLowerCase()
    return products.filter((p) => p.name.toLowerCase().includes(lower)).slice(0, 20)
  }, [products, productSearch])

  const addItem = useCallback(
    (product: (typeof products)[0]) => {
      const existing = items.find((i) => i.product_id === parseInt(product.id, 10))
      if (existing) {
        setItems((prev) =>
          prev.map((i) =>
            i.product_id === existing.product_id ? { ...i, qty: i.qty + 1 } : i,
          ),
        )
        return
      }
      setItems((prev) => [
        ...prev,
        {
          product_id: parseInt(product.id, 10),
          product_name: product.name,
          qty: 1,
          price_cents: Math.round(product.price * 100),
          notes: '',
        },
      ])
    },
    [items],
  )

  const removeItem = useCallback((productId: number) => {
    setItems((prev) => prev.filter((i) => i.product_id !== productId))
  }, [])

  const updateItemQty = useCallback((productId: number, qty: number) => {
    if (qty < 1) return
    setItems((prev) => prev.map((i) => (i.product_id === productId ? { ...i, qty } : i)))
  }, [])

  const totalCents = useMemo(
    () => items.reduce((sum, i) => sum + i.price_cents * i.qty, 0),
    [items],
  )

  const handleSubmit = useCallback(async () => {
    if (!customerName.trim()) {
      toast.error(t('pages.delivery.customerNameRequired'))
      return
    }
    if (!customerPhone.trim()) {
      toast.error(t('pages.delivery.customerPhoneRequired'))
      return
    }
    if (items.length === 0) {
      toast.error(t('pages.delivery.addAtLeastOneProduct'))
      return
    }
    if (orderType === 'DELIVERY' && !deliveryAddress.trim()) {
      toast.error(t('pages.delivery.addressRequired'))
      return
    }

    const orderItems: DeliveryOrderCreateItem[] = items.map((i) => ({
      product_id: i.product_id,
      qty: i.qty,
      notes: i.notes || undefined,
    }))

    setIsSubmitting(true)
    try {
      await onCreate({
        order_type: orderType,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_email: customerEmail.trim() || undefined,
        delivery_address: orderType === 'DELIVERY' ? deliveryAddress.trim() : undefined,
        delivery_instructions:
          orderType === 'DELIVERY' && deliveryInstructions.trim()
            ? deliveryInstructions.trim()
            : undefined,
        payment_method: paymentMethod || undefined,
        notes: notes.trim() || undefined,
        items: orderItems,
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [
    orderType,
    customerName,
    customerPhone,
    customerEmail,
    deliveryAddress,
    deliveryInstructions,
    paymentMethod,
    notes,
    items,
    onCreate,
  ])

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Nuevo Pedido"
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} isLoading={isSubmitting}>
            Crear Pedido
          </Button>
        </div>
      }
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {/* Order Type */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
            Tipo de pedido
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOrderType('TAKEOUT')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                orderType === 'TAKEOUT'
                  ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50'
                  : 'border-[var(--border-default)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              <ShoppingBag className="w-4 h-4" aria-hidden="true" />
              Retiro
            </button>
            <button
              type="button"
              onClick={() => setOrderType('DELIVERY')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                orderType === 'DELIVERY'
                  ? 'bg-purple-500/20 text-purple-400 border-purple-500/50'
                  : 'border-[var(--border-default)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              <Truck className="w-4 h-4" aria-hidden="true" />
              Delivery
            </button>
          </div>
        </div>

        {/* Customer Info */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
              Nombre *
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary-500)]"
              placeholder="Nombre del cliente"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
              Telefono *
            </label>
            <input
              type="text"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary-500)]"
              placeholder="Telefono"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
              Email
            </label>
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary-500)]"
              placeholder="Email (opcional)"
            />
          </div>
        </div>

        {/* Delivery Address (only for DELIVERY) */}
        {orderType === 'DELIVERY' && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Direccion de entrega *
              </label>
              <input
                type="text"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary-500)]"
                placeholder="Calle, numero, piso, depto"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Instrucciones de entrega
              </label>
              <input
                type="text"
                value={deliveryInstructions}
                onChange={(e) => setDeliveryInstructions(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary-500)]"
                placeholder="Timbre, referencia, etc."
              />
            </div>
          </div>
        )}

        {/* Payment Method */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
            Metodo de pago
          </label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary-500)]"
          >
            <option value="">Sin definir</option>
            {Object.entries(PAYMENT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Product Search + Items */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
            Productos *
          </label>
          <input
            type="text"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary-500)] mb-2"
            placeholder="Buscar producto..."
          />

          {/* Product suggestions */}
          {productSearch && filteredProducts.length > 0 && (
            <div className="bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg max-h-40 overflow-y-auto mb-2">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    addItem(p)
                    setProductSearch('')
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <span className="text-[var(--text-primary)]">{p.name}</span>
                  <span className="text-[var(--text-muted)]">
                    {formatCurrency(Math.round(p.price * 100))}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Selected items */}
          {items.length > 0 && (
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.product_id}
                  className="flex items-center gap-2 bg-[var(--bg-tertiary)] rounded-lg px-3 py-2"
                >
                  <span className="flex-1 text-sm text-[var(--text-primary)]">
                    {item.product_name}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateItemQty(item.product_id, item.qty - 1)}
                      className="w-6 h-6 flex items-center justify-center rounded bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      -
                    </button>
                    <span className="w-8 text-center text-sm text-[var(--text-primary)]">
                      {item.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateItemQty(item.product_id, item.qty + 1)}
                      className="w-6 h-6 flex items-center justify-center rounded bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-sm font-medium text-[var(--text-primary)] w-20 text-right">
                    {formatCurrency(item.price_cents * item.qty)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(item.product_id)}
                    className="text-red-400 hover:text-red-300 ml-1"
                    aria-label={`Eliminar ${item.product_name}`}
                  >
                    <XCircle className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
              <div className="flex justify-between text-sm font-semibold px-3 pt-2 border-t border-[var(--border-default)]">
                <span>Total</span>
                <span className="text-[var(--primary-500)]">{formatCurrency(totalCents)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
            <FileText className="w-3.5 h-3.5 inline mr-1" aria-hidden="true" />
            Notas
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary-500)] resize-none"
            rows={2}
            placeholder="Notas adicionales..."
          />
        </div>
      </div>
    </Modal>
  )
}
