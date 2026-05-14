/**
 * Zustand selectors for tableStore
 * Extracted to improve organization and reusability
 *
 * NOTE: Selectors that return objects use useShallow for shallow equality.
 * Derived values (reduce, filter, map) should be computed in components
 * with useMemo to avoid infinite re-render loops.
 */

import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useTableStore } from './store'
import type { CartItem, Diner } from '../../types'

// Stable empty array references to prevent re-renders when session is null
const EMPTY_CART_ITEMS: CartItem[] = []
const EMPTY_DINERS: Diner[] = []

// ============================================
// Simple selectors - subscribe to single values
// LOW-02 FIX: Added JSDoc comments
// ============================================

/** Returns the current table session */
export const useSession = () => useTableStore((state) => state.session)
/** Returns the current diner information */
export const useCurrentDiner = () => useTableStore((state) => state.currentDiner)
/** Returns loading state for async operations */
export const useIsLoading = () => useTableStore((state) => state.isLoading)
/** Returns whether an order is being submitted */
export const useIsSubmitting = () => useTableStore((state) => state.isSubmitting)
/** Returns the ID of the last submitted order */
export const useLastOrderId = () => useTableStore((state) => state.lastOrderId)
/** Returns whether last order submission was successful */
export const useSubmitSuccess = () => useTableStore((state) => state.submitSuccess)
/** Returns whether session data might be outdated */
export const useIsStale = () => useTableStore((state) => state.isStale)
/** Returns all submitted orders */
export const useOrders = () => useTableStore((state) => state.orders)
/** Returns the current round number */
export const useCurrentRound = () => useTableStore((state) => state.currentRound)
/** Returns all diner payment records */
export const useDinerPayments = () => useTableStore((state) => state.dinerPayments)

// ============================================
// Derived selectors - compute from state
// Use stable empty arrays to prevent unnecessary re-renders
// ============================================

/** Returns all items in the shared cart */
export const useCartItems = () => useTableStore((state) => state.session?.sharedCart ?? EMPTY_CART_ITEMS)
/** Returns all diners at the table */
export const useDiners = () => useTableStore((state) => state.session?.diners ?? EMPTY_DINERS)

// ============================================
// Composite selectors - reduce re-renders
// Derived values computed with useMemo in hook
// ============================================

/**
 * Cart count selector - optimized to only re-render when count changes
 * Prevents unnecessary re-renders of Header component
 */
export const useCartCount = () =>
  useTableStore((state) => {
    if (!state.session?.sharedCart) return 0
    return state.session.sharedCart.reduce((sum, item) => sum + item.quantity, 0)
  })

/**
 * Header data selector - combines session info for header component
 */
export const useHeaderData = () => {
  const session = useTableStore((state) => state.session)
  const currentDiner = useTableStore((state) => state.currentDiner)
  const cartCount = useCartCount()

  // Compute derived values with useMemo using stable references
  const diners = useMemo(() => session?.diners ?? EMPTY_DINERS, [session?.diners])

  return { session, currentDiner, cartCount, diners }
}

/**
 * Shared cart data selector - all data needed for cart component
 */
export const useSharedCartData = () => {
  const session = useTableStore((state) => state.session)
  const currentDiner = useTableStore((state) => state.currentDiner)
  const isSubmitting = useTableStore((state) => state.isSubmitting)
  const lastOrderId = useTableStore((state) => state.lastOrderId)
  const submitSuccess = useTableStore((state) => state.submitSuccess)
  const resetSubmitSuccess = useTableStore((state) => state.resetSubmitSuccess)

  // Compute derived values with useMemo using stable references
  const cartItems = useMemo(() => session?.sharedCart ?? EMPTY_CART_ITEMS, [session?.sharedCart])
  const diners = useMemo(() => session?.diners ?? EMPTY_DINERS, [session?.diners])

  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cartItems]
  )

  const myTotal = useMemo(
    () =>
      cartItems
        .filter((item) => item.dinerId === currentDiner?.id)
        .reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cartItems, currentDiner?.id]
  )

  return { session, currentDiner, cartItems, cartTotal, myTotal, diners, isSubmitting, lastOrderId, submitSuccess, resetSubmitSuccess }
}

/**
 * Cart actions selector - stable action references
 * Uses useShallow for stable object reference
 */
export const useCartActions = () =>
  useTableStore(
    useShallow((state) => ({
      updateQuantity: state.updateQuantity,
      removeItem: state.removeItem,
      canModifyItem: state.canModifyItem,
      getDinerColor: state.getDinerColor,
      submitOrder: state.submitOrder,
      clearCart: state.clearCart,
    }))
  )

/**
 * Order history data selector - for order history component
 */
export const useOrderHistoryData = () => {
  const orders = useTableStore((state) => state.orders)
  const currentRound = useTableStore((state) => state.currentRound)
  const session = useTableStore((state) => state.session)

  // Compute derived values with useMemo
  const totalConsumed = useMemo(
    () => orders.reduce((sum, order) => sum + order.subtotal, 0),
    [orders]
  )

  const pendingOrders = useMemo(
    () => orders.filter((o) => !['delivered', 'paid', 'cancelled'].includes(o.status)),
    [orders]
  )

  const completedOrders = useMemo(
    () => orders.filter((o) => ['delivered', 'paid'].includes(o.status)),
    [orders]
  )

  return { orders, currentRound, totalConsumed, pendingOrders, completedOrders, session }
}

/**
 * Close table actions selector - for close table flow
 * Uses useShallow for stable object reference
 */
export const useCloseTableActions = () =>
  useTableStore(
    useShallow((state) => ({
      closeTable: state.closeTable,
      getPaymentShares: state.getPaymentShares,
      getTotalConsumed: state.getTotalConsumed,
      getTotalByDiner: state.getTotalByDiner,
      leaveTable: state.leaveTable,
      recordDinerPayment: state.recordDinerPayment, // M003 FIX
      getDinerPaidAmount: state.getDinerPaidAmount, // M003 FIX
      getDinerPayments: state.getDinerPayments, // M003 FIX
    }))
  )

// ============================================
// Round Confirmation selectors (Confirmación Grupal)
// ============================================

/** Returns the current round confirmation state */
export const useRoundConfirmation = () =>
  useTableStore((state) => state.session?.roundConfirmation ?? null)

/**
 * Round confirmation actions selector
 * Uses useShallow for stable object reference
 */
export const useRoundConfirmationActions = () =>
  useTableStore(
    useShallow((state) => ({
      proposeRound: state.proposeRound,
      confirmReady: state.confirmReady,
      cancelReady: state.cancelReady,
      cancelRoundProposal: state.cancelRoundProposal,
      hasActiveConfirmation: state.hasActiveConfirmation,
      hasCurrentDinerConfirmed: state.hasCurrentDinerConfirmed,
      getConfirmationCount: state.getConfirmationCount,
      allDinersReady: state.allDinersReady,
    }))
  )

/**
 * Round confirmation data selector - all data needed for confirmation panel
 */
export const useRoundConfirmationData = () => {
  const session = useTableStore((state) => state.session)
  const currentDiner = useTableStore((state) => state.currentDiner)
  const roundConfirmation = useTableStore((state) => state.session?.roundConfirmation ?? null)

  // Compute derived values with useMemo
  const confirmationCount = useMemo(() => {
    if (!roundConfirmation) return { ready: 0, total: 0 }
    const ready = roundConfirmation.dinerStatuses.filter(s => s.isReady).length
    const total = roundConfirmation.dinerStatuses.length
    return { ready, total }
  }, [roundConfirmation])

  const allReady = useMemo(
    () => confirmationCount.total > 0 && confirmationCount.ready === confirmationCount.total,
    [confirmationCount]
  )

  const hasCurrentDinerConfirmed = useMemo(() => {
    if (!roundConfirmation || !currentDiner) return false
    const status = roundConfirmation.dinerStatuses.find(s => s.dinerId === currentDiner.id)
    return status?.isReady ?? false
  }, [roundConfirmation, currentDiner])

  const isProposer = useMemo(
    () => roundConfirmation?.proposedBy === currentDiner?.id,
    [roundConfirmation?.proposedBy, currentDiner?.id]
  )

  return {
    session,
    currentDiner,
    roundConfirmation,
    confirmationCount,
    allReady,
    hasCurrentDinerConfirmed,
    isProposer,
  }
}
