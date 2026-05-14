/**
 * Types for tableStore
 */

import type { TableSession, Diner, CartItem, AddToCartInput, OrderRecord, OrderStatus, SplitMethod, PaymentShare, RoundConfirmation } from '../../types'

/**
 * Cart item from remote sync (backend format converted to local)
 */
export interface RemoteCartItem {
  id: string
  productId: string
  name: string
  price: number
  image: string
  quantity: number
  dinerId: string
  dinerName: string
  dinerColor?: string
  notes?: string
  backendItemId?: number
}

/**
 * Auth context passed from component layer to avoid cross-store dependency
 */
export interface AuthContext {
  userId?: string
  fullName?: string
  email?: string
  picture?: string
}

/**
 * M003 FIX: Track diner payments for individual balance display
 */
export interface DinerPayment {
  dinerId: string
  amount: number
  paidAt: string
  method: 'cash' | 'mercadopago'
}

/**
 * Table store state interface
 * Manages table session, cart, orders, and payment state
 */
export interface TableState {
  // ==========================================================================
  // State Properties
  // ==========================================================================

  /** Current table session or null if not joined */
  session: TableSession | null
  /** Current diner information */
  currentDiner: Diner | null
  /** Loading state for async operations */
  isLoading: boolean
  /** Whether an order is currently being submitted */
  isSubmitting: boolean
  /** ID of the last submitted order */
  lastOrderId: string | null
  /** Whether last order submission was successful (for UI feedback) */
  submitSuccess: boolean
  /** Whether session data might be outdated */
  isStale: boolean
  /** List of submitted orders */
  orders: OrderRecord[]
  /** Current round number */
  currentRound: number
  /** Individual diner payment records */
  dinerPayments: DinerPayment[]

  // ==========================================================================
  // Session Actions
  // ==========================================================================

  /** Joins a table and creates/gets a session */
  joinTable: (tableNumber: string, tableName?: string, dinerName?: string, authContext?: AuthContext) => Promise<void> | void
  /** Leaves the table and clears all session data. Also clears related stores (service calls). */
  leaveTable: () => void
  /** Updates the current diner's display name */
  updateMyName: (name: string) => void
  /** Sets the loading state */
  setLoading: (loading: boolean) => void
  /** Syncs state from localStorage when another tab updates (MULTI-TAB support) */
  syncFromStorage: () => void
  /** Retries failed diner registration with backend */
  retryDinerRegistration: () => Promise<boolean>

  // ==========================================================================
  // Cart Actions
  // ==========================================================================

  /** Adds an item to the shared cart */
  addToCart: (input: AddToCartInput) => void
  /** Updates the quantity of a cart item (0 removes it) */
  updateQuantity: (itemId: string, quantity: number) => void
  /** Removes an item from the cart */
  removeItem: (itemId: string) => void
  /** Clears all items from the cart */
  clearCart: () => void

  // ==========================================================================
  // Remote Cart Sync Actions (for real-time shared cart via WebSocket)
  // ==========================================================================

  /** Syncs full cart state from backend (on reconnection) */
  syncCartFromRemote: (items: RemoteCartItem[], version: number) => void
  /** Adds an item from remote diner (via WebSocket event) */
  addRemoteCartItem: (item: RemoteCartItem) => void
  /** Updates an item from remote diner (via WebSocket event) */
  updateRemoteCartItem: (item: RemoteCartItem) => void
  /** Removes an item from remote diner (via WebSocket event) */
  removeRemoteCartItem: (backendItemId: number) => void
  /** Clears cart from remote event (after round submission) */
  clearCartFromRemote: () => void

  // ==========================================================================
  // Order Actions
  // ==========================================================================

  /** Submits the current cart as an order round */
  submitOrder: () => Promise<{ success: boolean; orderId?: string; error?: string }>
  /** Updates the status of an order (called from WebSocket events) */
  updateOrderStatus: (orderId: string, status: OrderStatus) => void
  /** Removes an order by backend round ID (when waiter deletes entire round) */
  removeOrderByRoundId: (roundId: number) => void
  /** Removes a specific item from an order by product ID (when waiter deletes one item) */
  removeOrderItemByProduct: (roundId: number, productId: number) => void
  /** Resets the submit success state (call after showing success message) */
  resetSubmitSuccess: () => void
  /** Syncs orders from backend API (fetches all rounds for current session) */
  syncOrdersFromBackend: () => Promise<void>

  // ==========================================================================
  // Round Confirmation Actions (Confirmación Grupal)
  // ==========================================================================

  /** Propone enviar la ronda actual (inicia votación grupal) */
  proposeRound: () => void
  /** Confirma que este comensal está listo para enviar */
  confirmReady: () => void
  /** Cancela la confirmación de este comensal */
  cancelReady: () => void
  /** Cancela toda la propuesta de ronda (solo el que propuso puede hacerlo) */
  cancelRoundProposal: () => void
  /** Recibe actualización de confirmación vía WebSocket o localStorage */
  updateRoundConfirmation: (confirmation: RoundConfirmation | null) => void

  // ==========================================================================
  // Payment Actions
  // ==========================================================================

  /** Requests the check and transitions session to paying state */
  closeTable: () => Promise<{ success: boolean; error?: string; checkId?: number }>
  /** Calculates payment shares based on split method */
  getPaymentShares: (method: SplitMethod, tipPercentage?: number) => PaymentShare[]
  /** Records a payment made by a specific diner */
  recordDinerPayment: (dinerId: string, amount: number, method: 'cash' | 'mercadopago') => void

  // ==========================================================================
  // Getters
  // ==========================================================================

  /** Returns all cart items */
  getCartItems: () => CartItem[]
  /** Returns cart items for the current diner only */
  getMyItems: () => CartItem[]
  /** Returns total price of all cart items */
  getCartTotal: () => number
  /** Returns total price of current diner's cart items */
  getMyTotal: () => number
  /** Returns total quantity of items in cart */
  getCartCount: () => number
  /** Returns all diners at the table */
  getDiners: () => Diner[]
  /** Checks if current diner can modify a cart item */
  canModifyItem: (item: CartItem) => boolean
  /** Returns the avatar color for a diner */
  getDinerColor: (dinerId: string) => string
  /** Returns all submitted orders */
  getOrderHistory: () => OrderRecord[]
  /** Returns total amount consumed (sum of all orders) */
  getTotalConsumed: () => number
  /** Returns total amount consumed by a specific diner */
  getTotalByDiner: (dinerId: string) => number
  /** Returns total amount paid by a specific diner */
  getDinerPaidAmount: (dinerId: string) => number
  /** Returns all diner payment records */
  getDinerPayments: () => DinerPayment[]

  // ==========================================================================
  // Round Confirmation Getters
  // ==========================================================================

  /** Obtiene el estado actual de confirmación grupal */
  getRoundConfirmation: () => RoundConfirmation | null
  /** Verifica si hay una votación de confirmación activa */
  hasActiveConfirmation: () => boolean
  /** Verifica si el comensal actual ya confirmó */
  hasCurrentDinerConfirmed: () => boolean
  /** Cuenta cuántos comensales han confirmado */
  getConfirmationCount: () => { ready: number; total: number }
  /** Verifica si todos los comensales están listos */
  allDinersReady: () => boolean
}
