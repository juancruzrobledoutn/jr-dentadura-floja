import { useOptimistic, useCallback, useTransition, useRef } from 'react'
import type { CartItem, AddToCartInput } from '../types'

/**
 * Action types for optimistic cart updates
 */
type CartAction =
  | { type: 'add'; item: CartItem }
  | { type: 'remove'; itemId: string }
  | { type: 'update_quantity'; itemId: string; quantity: number }
  | { type: 'clear' }

/**
 * Reducer for optimistic cart state
 */
function cartReducer(state: CartItem[], action: CartAction): CartItem[] {
  switch (action.type) {
    case 'add':
      return [...state, action.item]
    case 'remove':
      return state.filter((item) => item.id !== action.itemId)
    case 'update_quantity':
      if (action.quantity <= 0) {
        return state.filter((item) => item.id !== action.itemId)
      }
      return state.map((item) =>
        item.id === action.itemId ? { ...item, quantity: action.quantity } : item
      )
    case 'clear':
      return []
    default:
      return state
  }
}

interface UseOptimisticCartOptions {
  cartItems: CartItem[]
  currentDinerId: string | null
  currentDinerName: string
  onAddToCart: (input: AddToCartInput) => void
  onUpdateQuantity: (itemId: string, quantity: number) => void
  onRemoveItem: (itemId: string) => void
}

interface UseOptimisticCartReturn {
  /** Optimistic cart items - updates instantly before server confirms */
  optimisticItems: CartItem[]
  /** Whether an optimistic update is in progress */
  isPending: boolean
  /** Add item with instant UI feedback */
  addToCartOptimistic: (input: AddToCartInput) => void
  /** Update quantity with instant UI feedback */
  updateQuantityOptimistic: (itemId: string, delta: number) => void
  /** Remove item with instant UI feedback */
  removeItemOptimistic: (itemId: string) => void
}

/**
 * Hook for optimistic cart updates using React 19's useOptimistic.
 * Provides instant UI feedback while syncing with store in background.
 *
 * @example
 * ```tsx
 * const { optimisticItems, isPending, addToCartOptimistic } = useOptimisticCart({
 *   cartItems,
 *   currentDinerId,
 *   currentDinerName,
 *   onAddToCart: addToCart,
 *   onUpdateQuantity: updateQuantity,
 *   onRemoveItem: removeItem,
 * })
 * ```
 */
export function useOptimisticCart({
  cartItems,
  currentDinerId,
  currentDinerName,
  onAddToCart,
  onUpdateQuantity,
  onRemoveItem,
}: UseOptimisticCartOptions): UseOptimisticCartReturn {
  const [isPending, startTransition] = useTransition()

  // useOptimistic provides instant UI updates that revert on re-render with new server state
  const [optimisticItems, addOptimistic] = useOptimistic(
    cartItems,
    cartReducer
  )

  // RACE CONDITION FIX: Counter to guarantee unique IDs even on rapid double-clicks
  const tempIdCounterRef = useRef(0)

  const addToCartOptimistic = useCallback(
    (input: AddToCartInput) => {
      if (!currentDinerId) return

      // RACE CONDITION FIX: Counter + timestamp + random = guaranteed uniqueness
      // Even if Date.now() and Math.random() coincide, counter ensures uniqueness
      const tempId = `temp-${Date.now()}-${++tempIdCounterRef.current}-${Math.random().toString(36).substring(2, 9)}`

      const optimisticItem: CartItem = {
        id: tempId,
        productId: input.productId,
        name: input.name,
        price: input.price,
        image: input.image || '',
        quantity: input.quantity || 1,
        dinerId: currentDinerId,
        dinerName: currentDinerName,
        notes: input.notes,
      }

      // React 19: Both optimistic update and store sync must be in startTransition
      startTransition(() => {
        addOptimistic({ type: 'add', item: optimisticItem })
        onAddToCart(input)
      })
    },
    [currentDinerId, currentDinerName, addOptimistic, onAddToCart, startTransition]
  )

  const updateQuantityOptimistic = useCallback(
    (itemId: string, delta: number) => {
      const item = cartItems.find((i) => i.id === itemId)
      if (!item) return

      const newQuantity = item.quantity + delta

      // React 19: Both optimistic update and store sync must be in startTransition
      startTransition(() => {
        addOptimistic({ type: 'update_quantity', itemId, quantity: newQuantity })
        if (newQuantity <= 0) {
          onRemoveItem(itemId)
        } else {
          onUpdateQuantity(itemId, newQuantity)
        }
      })
    },
    [cartItems, addOptimistic, onUpdateQuantity, onRemoveItem, startTransition]
  )

  const removeItemOptimistic = useCallback(
    (itemId: string) => {
      // React 19: Both optimistic update and store sync must be in startTransition
      startTransition(() => {
        addOptimistic({ type: 'remove', itemId })
        onRemoveItem(itemId)
      })
    },
    [addOptimistic, onRemoveItem, startTransition]
  )

  return {
    optimisticItems,
    isPending,
    addToCartOptimistic,
    updateQuantityOptimistic,
    removeItemOptimistic,
  }
}
