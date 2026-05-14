/**
 * Main Zustand store for table session management
 * Refactored from monolithic tableStore.ts
 * Updated to integrate with backend API
 * Normalized to camelCase naming convention (Phase 1)
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartItem, Diner, OrderRecord } from '../../types'
import type { TableState, AuthContext } from './types'
import { tableStoreLogger } from '../../utils/logger'
import { sanitizeText, FALLBACK_IMAGES } from '../../utils/validation'
import { ApiError, ERROR_CODES } from '../../utils/errors'
import { QUANTITY } from '../../constants/timing'
import {
  isSessionExpired,
  isSessionStale,
  isValidPrice,
  isValidQuantity,
  generateId,
  generateDinerName,
  getColorForIndex,
  getSessionAgeHours,
  calculatePaymentShares,
  calculateCartTotal,
  calculateTotalConsumed,
  calculateTotalByDiner,
  withRetry,
  shouldExecute,
  limitOrders,
} from './helpers'
import { sessionAPI, dinerAPI, billingAPI, setTableToken } from '../../services/api'
import { dinerWS } from '../../services/websocket'
import type { SubmitRoundItem } from '../../types/backend'
import { useMenuStore } from '../menuStore'
import { useServiceCallStore } from '../serviceCallStore'
import { getDeviceId, getDeviceFingerprint } from '../../utils/deviceId'

// Stable empty arrays to prevent new reference on each getter call
const EMPTY_CART_ITEMS: CartItem[] = []
const EMPTY_DINERS: Diner[] = []

/**
 * Apply status update to an order record with proper timestamps
 */
function applyStatusUpdate(order: OrderRecord, status: OrderRecord['status']): OrderRecord {
  const updates: Partial<OrderRecord> = { status }
  const now = new Date().toISOString()

  if (status === 'confirmed') updates.confirmedAt = now
  if (status === 'ready') updates.readyAt = now
  if (status === 'delivered') updates.deliveredAt = now

  return { ...order, ...updates }
}

export const useTableStore = create<TableState>()(
  persist(
    (set, get) => ({
      // Initial state
      session: null,
      currentDiner: null,
      isLoading: false,
      isSubmitting: false,
      lastOrderId: null,
      submitSuccess: false,
      isStale: false,
      orders: [],
      currentRound: 0,
      dinerPayments: [], // M003 FIX: Track individual payments

      // =====================
      // SESSION ACTIONS
      // =====================

      joinTable: async (tableNumber: string, tableName?: string, dinerName?: string, authContext?: AuthContext) => {
        const state = get()
        if (state.isLoading) return

        // Check if already at this table
        if (state.session && state.session.tableNumber === tableNumber && state.currentDiner) {
          const existingDiner = state.session.diners.find(d => d.id === state.currentDiner!.id)
          if (existingDiner) return
        }

        set({ isLoading: true })

        try {
          // Try to parse tableNumber as numeric ID for backend
          const tableId = parseInt(tableNumber, 10)
          const isNumericId = !isNaN(tableId) && String(tableId) === tableNumber

          // Get branchSlug from menuStore for table disambiguation
          // Table codes are NOT unique across branches - each branch has its own "INT-01"
          // CORS-FIX: Fall back to env var if menuStore hasn't loaded yet (JoinTable renders before Home)
          const branchSlug = useMenuStore.getState().branchSlug || import.meta.env.VITE_BRANCH_SLUG

          // Use backend API - either by numeric ID or by alphanumeric code
          if (isNumericId || tableNumber.length > 0) {
            // Get session: by numeric ID if it's a pure number, otherwise by code
            // Pass branchSlug to ensure correct table is selected when using code
            const response = isNumericId
              ? await sessionAPI.createOrGetSession(tableId)
              : await sessionAPI.createOrGetSessionByCode(tableNumber, branchSlug || undefined)

            // Store token for future requests
            setTableToken(response.table_token)

            // Connect to WebSocket for real-time updates
            dinerWS.connect()

            // Create local diner first
            const dinerIndex = 0
            const localDinerId = generateId()
            const dinerDisplayName = dinerName || authContext?.fullName || generateDinerName(dinerIndex)
            const dinerColor = getColorForIndex(dinerIndex)

            // Register diner with backend (Phase 2 improvement)
            // Uses retry with exponential backoff for reliability
            // CRITICAL: Backend registration is required for order tracking
            // FASE 1: Include device_id for cross-session recognition
            let backendDinerId: number | undefined
            let registrationFailed = false
            try {
              const dinerResponse = await withRetry(
                () => dinerAPI.registerDiner({
                  name: dinerDisplayName,
                  color: dinerColor,
                  local_id: localDinerId,
                  device_id: getDeviceId(),
                  device_fingerprint: getDeviceFingerprint() || undefined,
                }),
                { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 5000 }
              )
              backendDinerId = dinerResponse.id
              tableStoreLogger.info('Diner registered with backend', { dinerId: dinerResponse.id, deviceId: dinerResponse.device_id })
            } catch (error) {
              // After retries failed, mark as failed but allow session to continue
              // User will see a warning and can retry registration later
              registrationFailed = true
              tableStoreLogger.error('Failed to register diner after retries', error)
            }

            const newDiner: Diner = {
              id: localDinerId,
              name: dinerDisplayName,
              avatarColor: dinerColor,
              joinedAt: new Date().toISOString(),
              isCurrentUser: true,
              userId: authContext?.userId,
              email: authContext?.email,
              picture: authContext?.picture,
              backendDinerId: backendDinerId,
              registrationFailed: registrationFailed || undefined,
            }

            set({
              isLoading: false,
              session: {
                id: String(response.session_id),
                tableNumber: tableNumber,
                tableName: tableName || response.table_code,
                restaurantId: import.meta.env.VITE_RESTAURANT_ID || 'default',
                status: response.status === 'PAYING' ? 'paying' : 'active',
                createdAt: new Date().toISOString(),
                diners: [newDiner],
                sharedCart: [],
                // Backend session data
                backendSessionId: response.session_id,
                backendTableId: response.table_id,
              },
              currentDiner: newDiner,
            })

            tableStoreLogger.info('Joined table via backend', {
              sessionId: response.session_id,
              tableCode: response.table_code,
              backendDinerId: backendDinerId,
            })
            return
          }

          // Fallback to local-only session (for demo/testing)
          const restaurantId = import.meta.env.VITE_RESTAURANT_ID || 'default'
          const session = {
            id: generateId(),
            tableNumber: tableNumber,
            tableName: tableName,
            restaurantId: restaurantId,
            status: 'active' as const,
            createdAt: new Date().toISOString(),
            diners: [] as Diner[],
            sharedCart: [] as CartItem[],
          }

          const dinerIndex = 0
          const newDiner: Diner = {
            id: generateId(),
            name: dinerName || authContext?.fullName || generateDinerName(dinerIndex),
            avatarColor: getColorForIndex(dinerIndex),
            joinedAt: new Date().toISOString(),
            isCurrentUser: true,
            userId: authContext?.userId,
            email: authContext?.email,
            picture: authContext?.picture,
          }

          set({
            isLoading: false,
            session: { ...session, diners: [newDiner] },
            currentDiner: newDiner,
          })
        } catch (error) {
          tableStoreLogger.error('Failed to join table', error)
          set({ isLoading: false })
          throw error
        }
      },

      leaveTable: () => {
        // PERF-FIX: Use destroy() instead of disconnect() to also clear listeners
        // This prevents memory leaks from accumulated event listeners
        dinerWS.destroy()
        // Clear table token
        setTableToken(null)

        // MED-04 FIX: Clear service call history when session ends
        useServiceCallStore.getState().clearCalls()

        set({
          session: null,
          currentDiner: null,
          lastOrderId: null,
          isStale: false,
          orders: [],
          currentRound: 0,
          dinerPayments: [], // M003 FIX: Clear diner payments on leave
        })

        tableStoreLogger.debug('Session ended, all stores cleaned up')
      },

      updateMyName: (newName: string) => {
        const { session, currentDiner } = get()
        if (!session || !currentDiner) return

        const updatedDiners = session.diners.map(d =>
          d.id === currentDiner.id ? { ...d, name: newName } : d
        )

        const updatedCart = session.sharedCart.map(item =>
          item.dinerId === currentDiner.id ? { ...item, dinerName: newName } : item
        )

        set({
          session: { ...session, diners: updatedDiners, sharedCart: updatedCart },
          currentDiner: { ...currentDiner, name: newName },
        })
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading })
      },

      // PWAM-004: Retry failed diner registration
      // FASE 1: Include device_id for cross-session recognition
      retryDinerRegistration: async () => {
        const { session, currentDiner } = get()
        if (!session || !currentDiner) return false
        if (!currentDiner.registrationFailed) return true // Already registered
        if (currentDiner.backendDinerId) return true // Has backend ID

        try {
          const dinerResponse = await withRetry(
            () => dinerAPI.registerDiner({
              name: currentDiner.name,
              color: currentDiner.avatarColor,
              local_id: currentDiner.id,
              device_id: getDeviceId(),
              device_fingerprint: getDeviceFingerprint() || undefined,
            }),
            { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 5000 }
          )

          // Update diner with backend ID and clear failed flag
          const updatedDiner: Diner = {
            ...currentDiner,
            backendDinerId: dinerResponse.id,
            registrationFailed: undefined,
          }

          set({
            currentDiner: updatedDiner,
            session: {
              ...session,
              diners: session.diners.map(d =>
                d.id === currentDiner.id ? updatedDiner : d
              ),
            },
          })

          tableStoreLogger.info('Diner registration retry succeeded', { dinerId: dinerResponse.id })
          return true
        } catch (error) {
          tableStoreLogger.error('Diner registration retry failed', error)
          return false
        }
      },

      // MULTI-TAB FIX: Sync state from localStorage when another tab updates
      syncFromStorage: () => {
        const { currentDiner } = get()
        if (!currentDiner) return

        // Read fresh state from localStorage
        const stored = localStorage.getItem('pwamenu-table-storage')
        if (!stored) return

        try {
          const parsed = JSON.parse(stored)
          const storageState = parsed?.state

          if (!storageState?.session) {
            // Other tab cleared session - sync locally
            set({
              session: null,
              currentDiner: null,
              orders: [],
              currentRound: 0,
            })
            return
          }

          // MULTI-TAB FIX: Merge cart items from both tabs using Map deduplication
          const currentCart = get().session?.sharedCart || []
          const storageCart = storageState.session.sharedCart || []

          // Create map of all items by ID (prefer storage version as source of truth)
          const mergedCartMap = new Map<string, CartItem>()

          // Add current tab items first
          currentCart.forEach((item: CartItem) => mergedCartMap.set(item.id, item))

          // Override with storage items (other tab is source of truth)
          storageCart.forEach((item: CartItem) => mergedCartMap.set(item.id, item))

          const mergedCart = Array.from(mergedCartMap.values())

          // Update with merged state
          set({
            session: {
              ...storageState.session,
              sharedCart: mergedCart,
            },
            orders: storageState.orders || [],
            currentRound: storageState.currentRound || 0,
            // Keep current diner as-is (each tab has its own diner)
          })

          tableStoreLogger.debug('Synced from storage', {
            currentCartSize: currentCart.length,
            storageCartSize: storageCart.length,
            mergedCartSize: mergedCart.length,
          })
        } catch (error) {
          tableStoreLogger.error('Failed to sync from storage', error)
        }
      },

      // =====================
      // CART ACTIONS
      // =====================

      addToCart: (input) => {
        const { session, currentDiner } = get()
        if (!session || !currentDiner) return

        // Block cart additions when check has been requested
        if (session.status === 'paying') return

        // Throttle rapid successive adds of the same product
        // DEF-HIGH-02 FIX: Reduced from 200ms to 100ms to be less aggressive
        if (!shouldExecute(`addToCart-${input.productId}`, 100)) {
          tableStoreLogger.debug('addToCart throttled', { productId: input.productId })
          return
        }

        if (!isValidPrice(input.price)) {
          tableStoreLogger.warn('Invalid price in addToCart', { price: input.price })
          return
        }

        const quantity = input.quantity || 1
        if (!isValidQuantity(quantity)) {
          tableStoreLogger.warn('Invalid quantity in addToCart', { quantity })
          return
        }

        // Ensure sharedCart exists (defensive check for corrupted session state)
        const cart = session.sharedCart || []

        // CART COUNT FIX: Check if item already exists for current diner
        // If it does, update quantity instead of creating duplicate
        const existingItemIndex = cart.findIndex(
          item => item.productId === input.productId && item.dinerId === currentDiner.id
        )

        // Local item ID for tracking
        let localItemId: string

        if (existingItemIndex !== -1) {
          // Item exists - update quantity
          const existingItem = cart[existingItemIndex]
          const newQuantity = Math.min(existingItem.quantity + quantity, QUANTITY.MAX_PRODUCT_QUANTITY)
          localItemId = existingItem.id

          const updatedCart = cart.map((item, index) =>
            index === existingItemIndex
              ? { ...item, quantity: newQuantity, notes: input.notes ? sanitizeText(input.notes) : item.notes }
              : item
          )

          set({
            session: {
              ...session,
              sharedCart: updatedCart,
              lastActivity: new Date().toISOString(), // SESSION TTL FIX
            },
          })

          tableStoreLogger.debug('Updated existing cart item quantity', {
            productId: input.productId,
            oldQuantity: existingItem.quantity,
            newQuantity: newQuantity,
          })
        } else {
          // Item doesn't exist - create new
          localItemId = generateId()
          const newItem: CartItem = {
            id: localItemId,
            productId: input.productId,
            name: input.name,
            price: input.price,
            image: input.image || FALLBACK_IMAGES.product,
            quantity,
            dinerId: currentDiner.id,
            dinerName: currentDiner.name,
            notes: input.notes ? sanitizeText(input.notes) : undefined,
          }

          set({
            session: {
              ...session,
              sharedCart: [...cart, newItem],
              lastActivity: new Date().toISOString(), // SESSION TTL FIX
            },
          })

          tableStoreLogger.debug('Added new cart item', { productId: input.productId, quantity })
        }

        // SHARED-CART: Sync to backend for real-time broadcast to other diners
        // Fire-and-forget - UI is already updated optimistically
        const productIdNum = parseInt(input.productId, 10)
        if (!isNaN(productIdNum)) {
          dinerAPI.addToCart({
            product_id: productIdNum,
            quantity,
            notes: input.notes ? sanitizeText(input.notes) : undefined,
            diner_id: currentDiner.backendDinerId,  // Send backend diner ID to identify who's adding
          }).then((response) => {
            // Update local item with backend ID for future updates/deletes
            const currentState = get()
            if (currentState.session) {
              const updatedCart = currentState.session.sharedCart.map((item) =>
                item.id === localItemId
                  ? { ...item, backendItemId: response.item_id }
                  : item
              )
              set({
                session: {
                  ...currentState.session,
                  sharedCart: updatedCart,
                },
              })
              tableStoreLogger.debug('Cart item synced to backend', {
                localId: localItemId,
                backendId: response.item_id,
              })
            }
          }).catch((error) => {
            // Log error but don't rollback - local state is source of truth for UI
            tableStoreLogger.error('Failed to sync cart item to backend', error)
          })
        }
      },

      updateQuantity: (itemId: string, quantity: number) => {
        const { session, currentDiner } = get()
        if (!session || !currentDiner) return

        // Throttle rapid quantity updates on the same item
        if (!shouldExecute(`updateQuantity-${itemId}`, 100)) {
          return
        }

        const item = session.sharedCart.find(i => i.id === itemId)
        if (!item || item.dinerId !== currentDiner.id) return

        if (typeof quantity !== 'number' || !isFinite(quantity) || isNaN(quantity)) {
          tableStoreLogger.warn('Invalid quantity in updateQuantity', { quantity })
          return
        }

        // Capture backend item ID before state update
        const backendItemId = item.backendItemId

        let updatedCart: CartItem[]
        const isRemoval = quantity <= 0
        const finalQuantity = isRemoval ? 0 : quantity > 99 ? 99 : Math.floor(quantity)

        if (isRemoval) {
          updatedCart = session.sharedCart.filter(i => i.id !== itemId)
        } else {
          updatedCart = session.sharedCart.map(i =>
            i.id === itemId ? { ...i, quantity: finalQuantity } : i
          )
        }

        set({
          session: {
            ...session,
            sharedCart: updatedCart,
            lastActivity: new Date().toISOString(), // SESSION TTL FIX
          },
        })

        // SHARED-CART: Sync to backend for real-time broadcast to other diners
        if (backendItemId) {
          if (isRemoval) {
            // DELETE item from backend
            dinerAPI.removeCartItem(backendItemId).then(() => {
              tableStoreLogger.debug('Cart item removed from backend', { backendItemId })
            }).catch((error) => {
              tableStoreLogger.error('Failed to remove cart item from backend', error)
            })
          } else {
            // PATCH item with new quantity
            dinerAPI.updateCartItem(backendItemId, {
              quantity: finalQuantity,
              notes: item.notes,
            }).then(() => {
              tableStoreLogger.debug('Cart item quantity updated on backend', {
                backendItemId,
                quantity: finalQuantity,
              })
            }).catch((error) => {
              tableStoreLogger.error('Failed to update cart item on backend', error)
            })
          }
        }
      },

      removeItem: (itemId: string) => {
        get().updateQuantity(itemId, 0)
      },

      clearCart: () => {
        const { session } = get()
        if (!session) return
        set({ session: { ...session, sharedCart: [] } })
      },

      // =====================
      // REMOTE CART SYNC ACTIONS
      // =====================

      /**
       * Sync full cart state from backend (on WebSocket reconnection)
       */
      syncCartFromRemote: (items, version) => {
        const { session } = get()
        if (!session) return

        tableStoreLogger.debug('Syncing cart from remote', { itemCount: items.length, version })

        // Convert remote items to local CartItem format
        const cartItems: CartItem[] = items.map((item) => ({
          id: item.id,
          productId: item.productId,
          name: item.name,
          price: item.price,
          image: item.image,
          quantity: item.quantity,
          dinerId: item.dinerId,
          dinerName: item.dinerName,
          notes: item.notes,
        }))

        set({
          session: {
            ...session,
            sharedCart: cartItems,
          },
        })
      },

      /**
       * Add an item from remote diner (via CART_ITEM_ADDED WebSocket event)
       */
      addRemoteCartItem: (item) => {
        const { session } = get()
        if (!session) return

        tableStoreLogger.debug('Adding remote cart item', { dinerName: item.dinerName, product: item.name })

        // Check if item already exists (by backendItemId)
        const existingIndex = session.sharedCart.findIndex(
          (i) => i.id === item.id || (item.backendItemId && i.id === `backend-${item.backendItemId}`)
        )

        if (existingIndex !== -1) {
          // Update existing item
          const updatedCart = [...session.sharedCart]
          updatedCart[existingIndex] = {
            id: item.id,
            productId: item.productId,
            name: item.name,
            price: item.price,
            image: item.image,
            quantity: item.quantity,
            dinerId: item.dinerId,
            dinerName: item.dinerName,
            dinerColor: item.dinerColor,
            notes: item.notes,
          }
          set({ session: { ...session, sharedCart: updatedCart } })
        } else {
          // Add new item
          const newItem: CartItem = {
            id: item.id,
            productId: item.productId,
            name: item.name,
            price: item.price,
            image: item.image,
            quantity: item.quantity,
            dinerId: item.dinerId,
            dinerName: item.dinerName,
            dinerColor: item.dinerColor,
            notes: item.notes,
          }
          set({ session: { ...session, sharedCart: [...session.sharedCart, newItem] } })
        }
      },

      /**
       * Update an item from remote diner (via CART_ITEM_UPDATED WebSocket event)
       */
      updateRemoteCartItem: (item) => {
        const { session } = get()
        if (!session) return

        tableStoreLogger.debug('Updating remote cart item', { itemId: item.id, qty: item.quantity })

        const updatedCart = session.sharedCart.map((i) => {
          if (i.id === item.id || (item.backendItemId && i.id === `backend-${item.backendItemId}`)) {
            return {
              id: item.id,
              productId: item.productId,
              name: item.name,
              price: item.price,
              image: item.image,
              quantity: item.quantity,
              dinerId: item.dinerId,
              dinerName: item.dinerName,
              dinerColor: item.dinerColor,
              notes: item.notes,
            }
          }
          return i
        })

        set({ session: { ...session, sharedCart: updatedCart } })
      },

      /**
       * Remove an item from remote diner (via CART_ITEM_REMOVED WebSocket event)
       */
      removeRemoteCartItem: (backendItemId) => {
        const { session } = get()
        if (!session) return

        tableStoreLogger.debug('Removing remote cart item', { backendItemId })

        const updatedCart = session.sharedCart.filter(
          (item) => item.id !== `backend-${backendItemId}`
        )

        set({ session: { ...session, sharedCart: updatedCart } })
      },

      /**
       * Clear cart from remote event (after round submission by another diner)
       */
      clearCartFromRemote: () => {
        const { session } = get()
        if (!session) return

        tableStoreLogger.debug('Clearing cart from remote event')
        set({ session: { ...session, sharedCart: [] } })
      },

      // =====================
      // ORDER ACTIONS
      // =====================

      submitOrder: async () => {
        const state = get()

        if (state.isSubmitting) {
          return { success: false, error: 'An order is already being submitted' }
        }

        if (!state.session || !state.currentDiner) {
          return { success: false, error: 'No active session' }
        }

        // MENU-STORE-HIGH-02 FIX: Capture session ID at start to detect if session changed during async ops
        const initialSessionId = state.session.id

        // RACE CONDITION FIX: Capture session timestamp for validation throughout operation
        const sessionTimestamp = state.session.createdAt

        // SESSION TTL FIX: Check if session has expired using lastActivity
        if (isSessionExpired(sessionTimestamp, state.session.lastActivity)) {
          set({ session: null, currentDiner: null })
          throw new ApiError('Session expired', 401, ERROR_CODES.AUTH_SESSION_EXPIRED)
        }

        if (state.session.status === 'paying') {
          return { success: false, error: 'No se pueden realizar pedidos mientras se procesa el pago' }
        }

        if (state.session.sharedCart.length === 0) {
          return { success: false, error: 'Cart is empty' }
        }

        // DEF-CRIT-01 FIX: Validate all products still exist in menu before submitting
        const menuStore = useMenuStore.getState()
        const invalidItems: string[] = []
        for (const item of state.session.sharedCart) {
          const productId = parseInt(item.productId, 10)
          if (!isNaN(productId)) {
            const product = menuStore.getProductById(productId)
            if (!product) {
              invalidItems.push(item.name)
            } else if (!product.isAvailable) {
              invalidItems.push(`${item.name} (no disponible)`)
            }
          }
        }

        if (invalidItems.length > 0) {
          tableStoreLogger.warn('Invalid products in cart', { invalidItems })
          return {
            success: false,
            error: `Productos no disponibles: ${invalidItems.join(', ')}. Por favor, actualiza tu carrito.`
          }
        }

        // Capture cart items before async operation for potential rollback
        const cartItems = [...state.session.sharedCart]
        const submitterId = state.currentDiner.id
        const submitterName = state.currentDiner.name
        const previousRound = state.currentRound

        // RACE CONDITION FIX: Re-validate expiration before critical operation
        // SESSION TTL FIX: Use lastActivity for validation
        if (isSessionExpired(sessionTimestamp, state.session.lastActivity)) {
          set({ session: null, currentDiner: null })
          throw new ApiError('Session expired before submission', 401, ERROR_CODES.AUTH_SESSION_EXPIRED)
        }

        // RACE CONDITION FIX: Mark items as submitting instead of removing them
        // This prevents data loss if new items are added during async operation
        const itemsToSubmit = cartItems.map(item => ({ ...item, _submitting: true }))

        set((currentState) => {
          // TYPE SAFETY: Ensure session exists before updating
          if (!currentState.session) return currentState

          // RACE CONDITION FIX: Triple-check expiration before state commit
          // SESSION TTL FIX: Use lastActivity
          if (isSessionExpired(currentState.session.createdAt, currentState.session.lastActivity)) {
            return {
              ...currentState,
              session: null,
              currentDiner: null
            }
          }

          return {
            isSubmitting: true,
            session: {
              ...currentState.session,
              // Replace cart items with marked versions
              sharedCart: currentState.session.sharedCart.map(item => {
                const submittingItem = itemsToSubmit.find(si => si.id === item.id)
                return submittingItem || item
              })
            }
          }
        })

        try {
          // Check if we have a backend session
          const hasBackendSession = state.session.backendSessionId !== undefined

          let backendRoundId: number | undefined
          let backendRoundNumber: number | undefined

          if (hasBackendSession) {
            // Use backend API to submit round
            const items: SubmitRoundItem[] = cartItems.map(item => ({
              product_id: parseInt(item.productId, 10),
              qty: item.quantity,
              // Include diner name in notes for attribution
              notes: item.notes
                ? `[${item.dinerName}] ${item.notes}`
                : `[${item.dinerName}]`,
            }))

            const response = await withRetry(
              async () => dinerAPI.submitRound({ items }),
              { maxRetries: 3, baseDelayMs: 1000 }
            )

            backendRoundId = response.round_id
            backendRoundNumber = response.round_number
            tableStoreLogger.info('Round submitted to backend', { roundId: response.round_id })
          } else {
            // Fallback: Simulate API call for demo mode
            await withRetry(
              async () => {
                await new Promise(resolve => setTimeout(resolve, 500))
              },
              { maxRetries: 3, baseDelayMs: 1000 }
            )
          }

          // RACE CONDITION FIX: Validate session after async operation
          const currentState = get()
          // SESSION TTL FIX: Use lastActivity
          if (!currentState.session || isSessionExpired(sessionTimestamp, currentState.session?.lastActivity)) {
            // Session expired during async operation
            set({ session: null, currentDiner: null, isSubmitting: false })
            throw new ApiError('Session expired during submission', 401, ERROR_CODES.AUTH_SESSION_EXPIRED)
          }

          // MENU-STORE-HIGH-02 FIX: Check if session changed during async operation (user left and rejoined)
          if (currentState.session.id !== initialSessionId) {
            tableStoreLogger.warn('Session changed during order submission', {
              originalSessionId: initialSessionId,
              currentSessionId: currentState.session.id,
            })
            set({ isSubmitting: false })
            return { success: false, error: 'Session changed during submission. Please try again.' }
          }

          const orderId = backendRoundId ? String(backendRoundId) : generateId()
          const roundNumber = backendRoundNumber ?? (previousRound + 1)
          const subtotal = calculateCartTotal(cartItems)

          // Clean items for storage (remove internal flags)
          const cleanedItems = cartItems.map(({ _submitting, ...item }) => item as CartItem)

          const newOrder: OrderRecord = {
            id: orderId,
            roundNumber: roundNumber,
            items: cleanedItems,
            subtotal,
            status: 'submitted',
            submittedBy: submitterId,
            submittedByName: submitterName,
            submittedAt: new Date().toISOString(),
            backendRoundId: backendRoundId,
          }

          // Use functional update to avoid stale state
          set((currentState) => {
            if (!currentState.session) return { isSubmitting: false }

            // Remove only items that were marked as submitting
            const remainingCart = currentState.session.sharedCart.filter(
              item => !item._submitting
            )

            return {
              // PERF-LRU-01: Limit orders to prevent memory growth
              orders: limitOrders([...currentState.orders, newOrder]),
              currentRound: roundNumber,
              isSubmitting: false,
              lastOrderId: orderId,
              submitSuccess: true,
              session: {
                ...currentState.session,
                sharedCart: remainingCart
              }
            }
          })

          return { success: true, orderId }
        } catch (error) {
          // Rollback: remove _submitting flag on failure
          set((currentState) => {
            if (!currentState.session) return { isSubmitting: false }

            tableStoreLogger.warn('Order submission failed, rolling back', { itemCount: cartItems.length })

            return {
              isSubmitting: false,
              session: {
                ...currentState.session,
                // Remove _submitting flag from failed items
                sharedCart: currentState.session.sharedCart.map(item => {
                  if (item._submitting) {
                    const { _submitting, ...cleanItem } = item
                    return cleanItem as CartItem
                  }
                  return item
                })
              }
            }
          })

          tableStoreLogger.error('Failed to submit order after retries', error)
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Error submitting order'
          }
        }
      },

      updateOrderStatus: (orderId: string, status) => {
        const { orders } = get()

        // Try to match by local orderId first, then by backendRoundId
        // This handles WebSocket events that use backend round_id
        const backendId = parseInt(orderId, 10)
        const isBackendId = !isNaN(backendId)

        const updatedOrders = orders.map(order => {
          // Match by local id
          if (order.id === orderId) {
            return applyStatusUpdate(order, status)
          }

          // Match by backendRoundId (for WebSocket events)
          if (isBackendId && order.backendRoundId === backendId) {
            return applyStatusUpdate(order, status)
          }

          return order
        })

        set({ orders: updatedOrders })
      },

      /**
       * Remove an order by its backend round ID (used when waiter deletes entire round)
       * SYNC FIX: Handle ROUND_ITEM_DELETED event with round_deleted=true
       */
      removeOrderByRoundId: (roundId: number) => {
        const { orders } = get()
        const updatedOrders = orders.filter(order => order.backendRoundId !== roundId)
        if (updatedOrders.length !== orders.length) {
          tableStoreLogger.info('Order removed by waiter', { roundId })
          set({ orders: updatedOrders })
        }
      },

      /**
       * Remove a specific item from an order (used when waiter deletes one item)
       * SYNC FIX: Handle ROUND_ITEM_DELETED event with round_deleted=false
       * Note: Matches by product_id since we don't have backend item_id mapping
       */
      removeOrderItemByProduct: (roundId: number, productId: number) => {
        const { orders } = get()
        const updatedOrders = orders.map(order => {
          if (order.backendRoundId !== roundId) return order
          // Find and remove first item matching the product_id
          const productIdStr = String(productId)
          const itemIndex = order.items.findIndex(item => item.productId === productIdStr)
          if (itemIndex === -1) return order
          const updatedItems = [...order.items]
          updatedItems.splice(itemIndex, 1)
          // If no items left, the order should be removed by removeOrderByRoundId instead
          if (updatedItems.length === 0) return order
          // Recalculate subtotal
          const subtotal = updatedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)
          tableStoreLogger.info('Item removed from order by waiter', { roundId, productId })
          return { ...order, items: updatedItems, subtotal }
        })
        set({ orders: updatedOrders })
      },

      resetSubmitSuccess: () => {
        set({ submitSuccess: false })
      },

      /**
       * Syncs orders from backend API
       * FIX: When another diner submits a round, other diners don't have the order
       * locally. This fetches all rounds from backend and merges with local state.
       */
      syncOrdersFromBackend: async () => {
        const { session, orders } = get()
        if (!session?.backendSessionId) {
          tableStoreLogger.debug('No backend session, skipping order sync')
          return
        }

        try {
          const backendRounds = await dinerAPI.getSessionRounds(session.backendSessionId)
          if (!backendRounds || backendRounds.length === 0) {
            tableStoreLogger.debug('No rounds from backend')
            return
          }

          // Convert backend rounds to local OrderRecord format
          const backendOrders: OrderRecord[] = backendRounds.map((round) => {
            // Map backend status to local status
            const statusMap: Record<string, OrderRecord['status']> = {
              'DRAFT': 'submitted',
              'PENDING': 'submitted',
              'CONFIRMED': 'submitted',
              'SUBMITTED': 'submitted',
              'IN_KITCHEN': 'confirmed',
              'READY': 'ready',
              'SERVED': 'delivered',
              'CANCELED': 'cancelled',
            }

            // Convert items
            const items: CartItem[] = round.items.map((item) => ({
              id: `backend-round-${round.id}-item-${item.id}`,
              productId: String(item.product_id),
              name: item.product_name,
              price: item.unit_price_cents / 100,
              image: '',
              quantity: item.qty,
              dinerId: 'unknown', // Backend doesn't track per-item diner
              dinerName: '',
              notes: item.notes || undefined,
            }))

            const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)

            return {
              id: `backend-${round.id}`,
              roundNumber: round.round_number,
              items,
              subtotal,
              status: statusMap[round.status] || 'submitted',
              submittedBy: 'unknown',
              submittedByName: '',
              submittedAt: round.created_at,
              backendRoundId: round.id,
            }
          })

          // Merge: Keep existing local orders if they have the same backendRoundId
          // but prefer local data (it may have more info like diner names)
          const existingRoundIds = new Set(orders.filter(o => o.backendRoundId).map(o => o.backendRoundId))
          const newOrders = backendOrders.filter(o => !existingRoundIds.has(o.backendRoundId))

          if (newOrders.length > 0) {
            tableStoreLogger.info('Synced orders from backend', { newCount: newOrders.length })
            // PERF-LRU-01: Limit orders to prevent memory growth
            set({ orders: limitOrders([...orders, ...newOrders]) })
          }
        } catch (error) {
          tableStoreLogger.error('Failed to sync orders from backend', error)
        }
      },

      // =====================
      // PAYMENT ACTIONS
      // =====================

      closeTable: async () => {
        const state = get()

        if (!state.session) {
          return { success: false, error: 'No active session' }
        }

        if (state.orders.length === 0) {
          return { success: false, error: 'No orders to close' }
        }

        if (state.session.sharedCart.length > 0) {
          return { success: false, error: 'There are items in cart not submitted' }
        }

        set({ isLoading: true })

        try {
          // Check if we have a backend session
          const hasBackendSession = state.session.backendSessionId !== undefined
          let checkId: number | undefined

          if (hasBackendSession) {
            // Use backend API to request check
            // Note: session_id is extracted from X-Table-Token header by backend
            const checkResponse = await withRetry(
              async () => billingAPI.requestCheck(),
              { maxRetries: 3, baseDelayMs: 1000 }
            )
            checkId = checkResponse.check_id
            tableStoreLogger.info('Check requested from backend', { checkId })
          } else {
            // Fallback: Simulate API call for demo mode
            await withRetry(
              async () => {
                await new Promise(resolve => setTimeout(resolve, 500))
              },
              { maxRetries: 3, baseDelayMs: 1000 }
            )
          }

          // Use functional update to avoid stale state after async operation
          set((currentState) => {
            if (!currentState.session) return { isLoading: false }

            return {
              session: {
                ...currentState.session,
                status: 'paying',
                backendCheckId: checkId,
              },
              isLoading: false,
            }
          })

          return { success: true, checkId }
        } catch (error) {
          set({ isLoading: false })
          tableStoreLogger.error('Failed to close table after retries', error)
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Error closing table'
          }
        }
      },

      getPaymentShares: (method, tipPercentage = 0) => {
        const { session, orders } = get()
        if (!session) return []
        return calculatePaymentShares(session.diners || [], orders, method, tipPercentage)
      },

      // M003 FIX: Record diner payment
      recordDinerPayment: (dinerId, amount, method) => {
        set((state) => ({
          dinerPayments: [
            ...state.dinerPayments,
            {
              dinerId,
              amount,
              method,
              paidAt: new Date().toISOString(),
            },
          ],
        }))
        tableStoreLogger.info('Diner payment recorded', { dinerId, amount, method })
      },

      // =====================
      // GETTERS
      // =====================

      getCartItems: () => get().session?.sharedCart || EMPTY_CART_ITEMS,

      getMyItems: () => {
        const { session, currentDiner } = get()
        if (!session || !currentDiner) return EMPTY_CART_ITEMS
        return session.sharedCart.filter(item => item.dinerId === currentDiner.id)
      },

      getCartTotal: () => {
        return calculateCartTotal(get().getCartItems())
      },

      getMyTotal: () => {
        return calculateCartTotal(get().getMyItems())
      },

      getCartCount: () => {
        const items = get().getCartItems()
        return items.reduce((sum, item) => sum + item.quantity, 0)
      },

      getDiners: () => get().session?.diners || EMPTY_DINERS,

      canModifyItem: (item) => {
        const { currentDiner } = get()
        return currentDiner?.id === item.dinerId
      },

      getDinerColor: (dinerId: string) => {
        const { session } = get()
        const diner = session?.diners.find(d => d.id === dinerId)
        return diner?.avatarColor || '#888888'
      },

      getOrderHistory: () => get().orders,

      getTotalConsumed: () => {
        return calculateTotalConsumed(get().orders)
      },

      getTotalByDiner: (dinerId: string) => {
        return calculateTotalByDiner(get().orders, dinerId)
      },

      // M003 FIX: Get total amount paid by a specific diner
      getDinerPaidAmount: (dinerId: string) => {
        const { dinerPayments } = get()
        return dinerPayments
          .filter((p) => p.dinerId === dinerId)
          .reduce((sum, p) => sum + p.amount, 0)
      },

      // M003 FIX: Get all diner payments
      getDinerPayments: () => get().dinerPayments,

      // =====================
      // ROUND CONFIRMATION ACTIONS (Confirmación Grupal)
      // =====================

      proposeRound: () => {
        const { session, currentDiner } = get()
        if (!session || !currentDiner) {
          tableStoreLogger.warn('Cannot propose round: no session or diner')
          return
        }
        if (session.status === 'paying') {
          tableStoreLogger.warn('Cannot propose round: check already requested')
          return
        }
        if (session.sharedCart.length === 0) {
          tableStoreLogger.warn('Cannot propose round: cart is empty')
          return
        }
        if (session.roundConfirmation?.status === 'pending') {
          tableStoreLogger.warn('Cannot propose round: confirmation already pending')
          return
        }

        const now = new Date()
        const expiresAt = new Date(now.getTime() + 5 * 60 * 1000) // 5 minutes timeout

        const confirmation = {
          id: generateId(),
          proposedBy: currentDiner.id,
          proposedByName: currentDiner.name,
          proposedAt: now.toISOString(),
          status: 'pending' as const,
          expiresAt: expiresAt.toISOString(),
          dinerStatuses: session.diners.map(diner => ({
            dinerId: diner.id,
            dinerName: diner.name,
            isReady: diner.id === currentDiner.id, // El que propone está listo automáticamente
            readyAt: diner.id === currentDiner.id ? now.toISOString() : undefined,
          })),
        }

        // Bloquear items del carrito durante votación
        const lockedCart = session.sharedCart.map(item => ({ ...item, _locked: true }))

        // Check if all diners are already ready (single diner case)
        const allReady = confirmation.dinerStatuses.every(s => s.isReady)

        if (allReady) {
          // Single diner or all already confirmed - submit immediately
          confirmation.status = 'confirmed' as const

          set({
            session: {
              ...session,
              sharedCart: lockedCart,
              roundConfirmation: confirmation,
              lastActivity: now.toISOString(),
            }
          })

          tableStoreLogger.info('All diners ready on propose, submitting round', {
            confirmationId: confirmation.id,
            proposedBy: currentDiner.name,
            dinerCount: session.diners.length,
          })

          // Auto-submit after brief delay to show confirmation state
          setTimeout(() => {
            const currentState = get()
            if (currentState.session?.roundConfirmation?.status === 'confirmed') {
              // Unlock cart before submitting
              if (currentState.session) {
                const unlockedCart = currentState.session.sharedCart.map(
                  ({ _locked, ...item }) => item
                )
                set({
                  session: {
                    ...currentState.session,
                    sharedCart: unlockedCart,
                    roundConfirmation: null,
                  }
                })
              }
              // Submit the order
              get().submitOrder()
            }
          }, 1500)
        } else {
          set({
            session: {
              ...session,
              sharedCart: lockedCart,
              roundConfirmation: confirmation,
              lastActivity: now.toISOString(),
            }
          })

          tableStoreLogger.info('Round proposed', {
            confirmationId: confirmation.id,
            proposedBy: currentDiner.name,
            dinerCount: session.diners.length,
          })
        }
      },

      confirmReady: () => {
        const { session, currentDiner } = get()
        if (!session?.roundConfirmation || !currentDiner) {
          tableStoreLogger.warn('Cannot confirm ready: no active confirmation or diner')
          return
        }
        if (session.roundConfirmation.status !== 'pending') {
          tableStoreLogger.warn('Cannot confirm ready: confirmation not pending')
          return
        }

        const now = new Date().toISOString()
        const updatedStatuses = session.roundConfirmation.dinerStatuses.map(status =>
          status.dinerId === currentDiner.id
            ? { ...status, isReady: true, readyAt: now }
            : status
        )

        const updatedConfirmation = {
          ...session.roundConfirmation,
          dinerStatuses: updatedStatuses,
        }

        // Verificar si todos están listos
        const allReady = updatedStatuses.every(s => s.isReady)

        if (allReady) {
          // ¡Todos listos! Marcar como confirmado y enviar la ronda
          updatedConfirmation.status = 'confirmed' as const
          set({
            session: {
              ...session,
              roundConfirmation: updatedConfirmation,
              lastActivity: now,
            }
          })

          tableStoreLogger.info('All diners ready, submitting round', {
            confirmationId: updatedConfirmation.id,
          })

          // Auto-submit después de un breve delay para mostrar la confirmación
          setTimeout(() => {
            const currentState = get()
            // Verificar que todavía estamos en estado confirmed
            if (currentState.session?.roundConfirmation?.status === 'confirmed') {
              // Desbloquear carrito antes de enviar
              if (currentState.session) {
                const unlockedCart = currentState.session.sharedCart.map(
                  ({ _locked, ...item }) => item
                )
                set({
                  session: {
                    ...currentState.session,
                    sharedCart: unlockedCart,
                    roundConfirmation: null,
                  }
                })
              }
              // Enviar la orden
              get().submitOrder()
            }
          }, 1500) // 1.5 segundos para mostrar el estado "Todos listos"
        } else {
          set({
            session: {
              ...session,
              roundConfirmation: updatedConfirmation,
              lastActivity: now,
            }
          })
        }

        tableStoreLogger.info('Diner confirmed ready', {
          dinerId: currentDiner.id,
          dinerName: currentDiner.name,
          allReady,
        })
      },

      cancelReady: () => {
        const { session, currentDiner } = get()
        if (!session?.roundConfirmation || !currentDiner) {
          tableStoreLogger.warn('Cannot cancel ready: no active confirmation or diner')
          return
        }
        if (session.roundConfirmation.status !== 'pending') {
          tableStoreLogger.warn('Cannot cancel ready: confirmation not pending')
          return
        }

        const updatedStatuses = session.roundConfirmation.dinerStatuses.map(status =>
          status.dinerId === currentDiner.id
            ? { ...status, isReady: false, readyAt: undefined }
            : status
        )

        const updatedConfirmation = {
          ...session.roundConfirmation,
          dinerStatuses: updatedStatuses,
        }

        set({
          session: {
            ...session,
            roundConfirmation: updatedConfirmation,
            lastActivity: new Date().toISOString(),
          }
        })

        tableStoreLogger.info('Diner cancelled ready', {
          dinerId: currentDiner.id,
          dinerName: currentDiner.name,
        })
      },

      cancelRoundProposal: () => {
        const { session, currentDiner } = get()
        if (!session?.roundConfirmation || !currentDiner) {
          tableStoreLogger.warn('Cannot cancel proposal: no active confirmation or diner')
          return
        }

        // Solo el que propuso puede cancelar toda la propuesta
        // O cancelar si expiró
        const isProposer = session.roundConfirmation.proposedBy === currentDiner.id
        const isExpired = new Date() > new Date(session.roundConfirmation.expiresAt)

        if (!isProposer && !isExpired) {
          tableStoreLogger.warn('Cannot cancel proposal: not the proposer and not expired')
          return
        }

        // Desbloquear items del carrito
        const unlockedCart = session.sharedCart.map(({ _locked, ...item }) => item)

        set({
          session: {
            ...session,
            sharedCart: unlockedCart,
            roundConfirmation: null,
            lastActivity: new Date().toISOString(),
          }
        })

        tableStoreLogger.info('Round proposal cancelled', {
          confirmationId: session.roundConfirmation.id,
          cancelledBy: currentDiner.name,
          reason: isExpired ? 'expired' : 'manual',
        })
      },

      updateRoundConfirmation: (confirmation) => {
        const { session } = get()
        if (!session) return

        if (confirmation === null) {
          // Limpiar confirmación y desbloquear carrito
          const unlockedCart = session.sharedCart.map(({ _locked, ...item }) => item)
          set({
            session: {
              ...session,
              sharedCart: unlockedCart,
              roundConfirmation: null,
            }
          })
        } else {
          set({
            session: {
              ...session,
              roundConfirmation: confirmation,
            }
          })
        }
      },

      // =====================
      // ROUND CONFIRMATION GETTERS
      // =====================

      getRoundConfirmation: () => get().session?.roundConfirmation || null,

      hasActiveConfirmation: () => {
        const confirmation = get().session?.roundConfirmation
        return confirmation?.status === 'pending'
      },

      hasCurrentDinerConfirmed: () => {
        const { session, currentDiner } = get()
        if (!session?.roundConfirmation || !currentDiner) return false
        const status = session.roundConfirmation.dinerStatuses.find(
          s => s.dinerId === currentDiner.id
        )
        return status?.isReady ?? false
      },

      getConfirmationCount: () => {
        const confirmation = get().session?.roundConfirmation
        if (!confirmation) return { ready: 0, total: 0 }
        const ready = confirmation.dinerStatuses.filter(s => s.isReady).length
        const total = confirmation.dinerStatuses.length
        return { ready, total }
      },

      allDinersReady: () => {
        const { ready, total } = get().getConfirmationCount()
        return total > 0 && ready === total
      },
    }),
    {
      name: 'pwamenu-table-storage',
      partialize: (state) => ({
        session: state.session,
        currentDiner: state.currentDiner,
        orders: state.orders,
        currentRound: state.currentRound,
        dinerPayments: state.dinerPayments, // M003 FIX: Persist diner payments
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.session) {
          // SESSION TTL FIX: Check expiration using lastActivity
          if (isSessionExpired(state.session.createdAt, state.session.lastActivity)) {
            state.session = null
            state.currentDiner = null
            state.orders = []
            state.currentRound = 0
            state.lastOrderId = null
            tableStoreLogger.info('Session expired, clearing data')
            return
          }

          if (isSessionStale(state.session.createdAt)) {
            const ageHours = getSessionAgeHours(state.session.createdAt)
            tableStoreLogger.warn(`Session is ${ageHours}h old. Data might be outdated.`)
            state.isStale = true
          }

          if (state.currentDiner) {
            const syncedDiners = state.session.diners.map(d => ({
              ...d,
              isCurrentUser: d.id === state.currentDiner!.id,
            }))
            state.session = { ...state.session, diners: syncedDiners }
          }
        }
      },
    }
  )
)
