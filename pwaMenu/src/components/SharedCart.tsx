import { useMemo, useRef, useCallback, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSharedCartData, useCartActions, useTableStore, useRoundConfirmationActions, useRoundConfirmation } from '../stores/tableStore'
import { useIsMounted } from '../hooks/useIsMounted'
import { useOptimisticCart } from '../hooks/useOptimisticCart'
import { useEscapeKey } from '../hooks/useEscapeKey'
import LoadingSpinner from './ui/LoadingSpinner'
import ErrorAlert from './ui/ErrorAlert'
import CartEmpty from './cart/CartEmpty'
import OrderSuccess from './cart/OrderSuccess'
import CartItemCard from './cart/CartItemCard'
import { RoundConfirmationPanel } from './cart/RoundConfirmationPanel'
import type { CartItem } from '../types'

interface SharedCartProps {
  isOpen: boolean
  onClose: () => void
}

export default function SharedCart({ isOpen, onClose }: SharedCartProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const {
    session,
    currentDiner,
    cartItems,
    diners,
    isSubmitting,
    lastOrderId,
    submitSuccess,
    resetSubmitSuccess,
  } = useSharedCartData()

  const {
    updateQuantity,
    removeItem,
    canModifyItem,
    getDinerColor,
  } = useCartActions()

  // Round confirmation (Confirmación Grupal)
  const roundConfirmation = useRoundConfirmation()
  const {
    proposeRound,
    confirmReady,
    cancelReady,
    cancelRoundProposal,
  } = useRoundConfirmationActions()

  const addToCart = useTableStore((state) => state.addToCart)

  const isMounted = useIsMounted()
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onCloseRef = useRef(onClose)

  // Keep onClose ref updated
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Cleanup timer on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current)
        autoCloseTimerRef.current = null
      }
    }
  }, [])

  // Use reusable escape key hook for consistency
  useEscapeKey({
    enabled: isOpen,
    onEscape: onClose,
    disabled: isSubmitting,
  })

  // React 19: useOptimistic for instant UI feedback
  const {
    optimisticItems,
    isPending: isOptimisticPending,
    updateQuantityOptimistic,
    removeItemOptimistic,
  } = useOptimisticCart({
    cartItems,
    currentDinerId: currentDiner?.id || null,
    currentDinerName: currentDiner?.name || '',
    onAddToCart: addToCart,
    onUpdateQuantity: updateQuantity,
    onRemoveItem: removeItem,
  })

  // Local error state for submission errors
  const [submitError, setSubmitError] = useState<string | null>(null)

  // RACE CONDITION FIX: Deduplicate optimistic items by product_id + diner_id
  // This prevents visual glitches when temp IDs reconcile with real IDs
  const deduplicatedItems = useMemo(() => {
    const itemsMap = new Map<string, CartItem>()

    for (const item of optimisticItems) {
      const key = `${item.productId}-${item.dinerId}`
      const existing = itemsMap.get(key)

      if (!existing) {
        itemsMap.set(key, item)
      } else {
        // Prefer real IDs over temp IDs
        if (!item.id.startsWith('temp-')) {
          itemsMap.set(key, item)
        }
      }
    }

    return Array.from(itemsMap.values())
  }, [optimisticItems])

  // Use optimistic items for grouping (instant UI updates)
  // Group by dinerId, then sort items by product name within each group
  const itemsByDiner = useMemo(() => {
    const grouped = deduplicatedItems.reduce((acc, item) => {
      if (!acc[item.dinerId]) {
        acc[item.dinerId] = []
      }
      acc[item.dinerId].push(item)
      return acc
    }, {} as Record<string, CartItem[]>)

    // Sort items by product name within each diner's group
    for (const dinerId in grouped) {
      grouped[dinerId].sort((a, b) => a.name.localeCompare(b.name))
    }

    return grouped
  }, [deduplicatedItems])

  // Calculate totals from deduplicated items for instant feedback
  const optimisticCartTotal = useMemo(
    () => deduplicatedItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [deduplicatedItems]
  )

  const optimisticMyTotal = useMemo(
    () =>
      deduplicatedItems
        .filter((item) => item.dinerId === currentDiner?.id)
        .reduce((sum, item) => sum + item.price * item.quantity, 0),
    [deduplicatedItems, currentDiner?.id]
  )

  // Use optimistic handlers for instant feedback
  const handleQuantityChange = useCallback(
    (item: CartItem, delta: number) => {
      updateQuantityOptimistic(item.id, delta)
    },
    [updateQuantityOptimistic]
  )

  const handleRemoveItem = useCallback(
    (itemId: string) => {
      removeItemOptimistic(itemId)
    },
    [removeItemOptimistic]
  )

  // PWAM-004: Check if diner registration failed (blocks order submission)
  const dinerRegistrationFailed = currentDiner?.registrationFailed ?? false

  // Auto-close cart after successful submission
  useEffect(() => {
    if (submitSuccess && isMounted()) {
      autoCloseTimerRef.current = setTimeout(() => {
        if (!isMounted()) return
        onCloseRef.current?.()
        resetSubmitSuccess()
      }, 2500)
    }
  }, [submitSuccess, isMounted, resetSubmitSuccess])

  // MEMORY LEAK FIX: Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current)
        autoCloseTimerRef.current = null
      }
    }
  }, [])

  if (!isOpen) return null

  if (submitSuccess) {
    return <OrderSuccess orderId={lastOrderId} />
  }

  if (!session || !currentDiner) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-dark-bg">
        <p className="text-dark-muted">{t('cart.noActiveSession')}</p>
        <button
          onClick={onClose}
          className="mt-4 bg-primary hover:bg-primary/90 text-white font-semibold py-2 px-4 rounded-xl transition-colors"
        >
          {t('cart.close')}
        </button>
      </div>
    )
  }

  const effectiveLoading = isSubmitting

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-dark-bg"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* Header */}
      <header className="bg-dark-bg border-b border-dark-border px-4 sm:px-6 py-4 safe-area-top">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 id={titleId} className="text-xl sm:text-2xl font-bold text-white">
              {t('cart.title')}
            </h1>
            <p className="text-dark-muted text-sm">
              {t('cart.table')} {session.tableNumber} · {diners.length}{' '}
              {diners.length === 1 ? t('cart.diner_one') : t('cart.diner_other')}
              {isOptimisticPending && (
                <span
                  className="ml-2 text-primary animate-pulse"
                  role="status"
                  aria-live="polite"
                >
                  {t('cart.updating')}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={effectiveLoading}
            className="w-10 h-10 rounded-full bg-dark-card flex items-center justify-center hover:bg-dark-elevated transition-colors disabled:opacity-50"
            aria-label={t('cart.closeCart')}
          >
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Diners avatars */}
      <div className="bg-dark-card border-b border-dark-border px-4 sm:px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-2 overflow-x-auto">
          {diners.map((diner) => (
            <div
              key={diner.id}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${diner.id === currentDiner.id
                  ? 'bg-primary/20 border border-primary'
                  : 'bg-dark-elevated'
                }`}
            >
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: diner.avatarColor }}
                aria-hidden="true"
              />
              <span className="text-white text-sm">
                {diner.name}
                {diner.id === currentDiner.id && ` (${t('cart.you')})`}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Cart items */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        <div
          className="max-w-3xl mx-auto space-y-6"
          role="region"
          aria-label={t('cart.cartContents')}
          aria-live="polite"
          aria-atomic="false"
        >
          {optimisticItems.length === 0 ? (
            <CartEmpty onViewMenu={onClose} />
          ) : (
            Object.entries(itemsByDiner).map(([dinerId, items]) => {
              // Check if this is the current diner's section
              // Items may have local UUID or backend ID as dinerId
              const isMySection = dinerId === currentDiner.id ||
                dinerId === String(currentDiner.backendDinerId)
              // Get diner name from items (more reliable than finding in diners list)
              // Remote items have dinerName from backend, local items from currentDiner
              const dinerName = isMySection
                ? currentDiner.name
                : items[0]?.dinerName || t('cart.diner')
              const sectionTotal = items.reduce(
                (sum, item) => sum + item.price * item.quantity,
                0
              )
              // Get diner color - try item.dinerColor first (remote items), then local diner, then fallback
              const diner = diners.find((d) => d.id === dinerId)
              const dinerColor = items[0]?.dinerColor || diner?.avatarColor || getDinerColor(dinerId)

              return (
                <div key={dinerId} className="space-y-3">
                  {/* Section header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: dinerColor }}
                        aria-hidden="true"
                      />
                      <span className="text-white font-medium text-sm">
                        {isMySection ? t('cart.myOrders') : dinerName}
                      </span>
                    </div>
                    <span className="text-dark-muted text-sm">
                      ${sectionTotal.toFixed(2)}
                    </span>
                  </div>

                  {/* Items */}
                  <div className="space-y-2">
                    {items.map((item) => (
                      <CartItemCard
                        key={item.id}
                        item={item}
                        canModify={canModifyItem(item)}
                        isDisabled={effectiveLoading}
                        onQuantityChange={(delta) =>
                          handleQuantityChange(item, delta)
                        }
                        onRemove={() => handleRemoveItem(item.id)}
                      />
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Footer with totals */}
      {optimisticItems.length > 0 && (
        <div className="bg-dark-card border-t border-dark-border px-4 sm:px-6 py-4 safe-area-bottom">
          <div className="max-w-3xl mx-auto space-y-4">
            {/* Totals breakdown - use optimistic values for instant feedback */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-dark-muted">{t('cart.myTotal')}</span>
                <span className="text-white font-medium">
                  ${optimisticMyTotal.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white font-medium">{t('cart.tableTotal')}</span>
                <span className="text-primary text-xl font-bold">
                  ${optimisticCartTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Error message - role="alert" for screen reader announcement */}
            {submitError && (
              <div role="alert" aria-live="assertive">
                <ErrorAlert
                  title={t('cart.submitError')}
                  message={submitError}
                  onClose={() => setSubmitError(null)}
                />
              </div>
            )}

            {/* Paying status warning */}
            {session?.status === 'paying' && (
              <div className="bg-purple-900/50 border border-purple-500/30 rounded-xl p-3 text-center">
                <p className="text-purple-200 text-sm">
                  {t('cart.payingBanner', 'Cuenta solicitada — no se pueden agregar más pedidos')}
                </p>
              </div>
            )}

            {/* PWAM-004: Registration warning in cart */}
            {dinerRegistrationFailed && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-center">
                <p className="text-yellow-400 text-sm">
                  {t('errors.dinerRegistrationFailedCart', 'No puedes enviar pedidos hasta registrar tu sesion. Cierra el carrito y reintenta.')}
                </p>
              </div>
            )}

            {/* Round Confirmation Panel (Confirmación Grupal) */}
            {roundConfirmation && roundConfirmation.status === 'pending' && currentDiner && (
              <RoundConfirmationPanel
                confirmation={roundConfirmation}
                currentDinerId={currentDiner.id}
                onConfirm={confirmReady}
                onCancel={cancelReady}
                onCancelProposal={cancelRoundProposal}
                getDinerColor={getDinerColor}
              />
            )}

            {/* All ready confirmation message */}
            {roundConfirmation && roundConfirmation.status === 'confirmed' && (
              <div className="bg-green-500/10 border border-green-500/50 rounded-xl p-4 text-center">
                <div className="flex items-center justify-center gap-2 text-green-400">
                  <LoadingSpinner size="sm" />
                  <span className="font-semibold">{t('roundConfirmation.submitting')}</span>
                </div>
              </div>
            )}

            {/* Order button - Only show when no active confirmation */}
            {!roundConfirmation && (
              <>
                <button
                  onClick={proposeRound}
                  disabled={effectiveLoading || optimisticItems.length === 0 || dinerRegistrationFailed || session?.status === 'paying'}
                  className="w-full bg-primary hover:bg-primary/90 disabled:bg-dark-elevated disabled:text-dark-muted text-white font-semibold py-4 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {effectiveLoading ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span>{t('cart.submitting')}</span>
                    </>
                  ) : dinerRegistrationFailed ? (
                    <>
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                        />
                      </svg>
                      <span>{t('cart.registrationRequired', 'Registro requerido')}</span>
                    </>
                  ) : submitError ? (
                    <>
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                        />
                      </svg>
                      <span>{t('cart.retrySubmit')}</span>
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
                        />
                      </svg>
                      <span>{t('cart.proposeOrder', 'Proponer Enviar Pedido')}</span>
                    </>
                  )}
                </button>
                <p className="text-dark-muted text-xs text-center">
                  {t('cart.confirmationRequired', 'Todos los comensales deberán confirmar antes de enviar')}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
