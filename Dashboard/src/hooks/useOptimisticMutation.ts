/**
 * SPRINT 9: useOptimisticMutation hook
 *
 * Provides optimistic UI updates for mutations, improving perceived performance.
 * Uses React 19's useOptimistic hook to show instant feedback while mutations complete.
 *
 * Usage:
 * ```typescript
 * const { mutate, isPending, optimisticData } = useOptimisticMutation({
 *   currentData: categories,
 *   mutationFn: (newCategory) => addCategory(newCategory),
 *   onSuccess: () => toast.success('Created!'),
 *   onError: (error) => toast.error(error.message)
 * })
 *
 * // Add item with instant UI update
 * mutate({
 *   type: 'add',
 *   item: newCategory
 * })
 * ```
 */

import React, { useOptimistic, useCallback, useTransition } from 'react'
import { handleError } from '../utils/logger'

/**
 * Optimistic update actions
 */
export type OptimisticAction<T> =
  | { type: 'add'; item: T }
  | { type: 'update'; id: string; item: Partial<T> }
  | { type: 'delete'; id: string }
  | { type: 'reorder'; items: T[] }

/**
 * Reducer for optimistic state updates
 */
export function optimisticReducer<T extends { id: string }>(
  state: T[],
  action: OptimisticAction<T>
): T[] {
  switch (action.type) {
    case 'add':
      return [...state, action.item]

    case 'update':
      return state.map((item) =>
        item.id === action.id ? { ...item, ...action.item } : item
      )

    case 'delete':
      return state.filter((item) => item.id !== action.id)

    case 'reorder':
      return action.items

    default:
      return state
  }
}

/**
 * Options for useOptimisticMutation
 */
export interface UseOptimisticMutationOptions<T, TData = unknown> {
  /** Current data from store */
  currentData: T[]
  /** Mutation function to execute */
  mutationFn: (data: TData) => void | Promise<void>
  /** Success callback */
  onSuccess?: () => void
  /** Error callback */
  onError?: (error: Error) => void
  /** Context name for error logging */
  context?: string
}

/**
 * Return type for useOptimisticMutation
 */
export interface UseOptimisticMutationReturn<T, TData = unknown> {
  /** Optimistically updated data */
  optimisticData: T[]
  /** Execute mutation with optimistic update */
  mutate: (action: OptimisticAction<T>, data?: TData) => Promise<void>
  /** Is mutation pending */
  isPending: boolean
}

/**
 * Hook for executing mutations with optimistic updates
 *
 * Provides instant UI feedback by optimistically updating the UI before
 * the mutation completes. If the mutation fails, the UI reverts automatically.
 *
 * @param options - Configuration options
 * @returns Mutation state and control functions
 *
 * @example
 * ```typescript
 * // In a CRUD page
 * const categories = useCategoryStore(selectCategories)
 * const addCategory = useCategoryStore((s) => s.addCategory)
 * const updateCategory = useCategoryStore((s) => s.updateCategory)
 * const deleteCategory = useCategoryStore((s) => s.deleteCategory)
 *
 * const { optimisticData, mutate, isPending } = useOptimisticMutation({
 *   currentData: categories,
 *   mutationFn: (data) => {
 *     // Execute the actual mutation
 *     if (data.type === 'add') addCategory(data.item)
 *     if (data.type === 'update') updateCategory(data.id, data.item)
 *     if (data.type === 'delete') deleteCategory(data.id)
 *   },
 *   onSuccess: () => toast.success('Success!'),
 *   onError: (error) => toast.error(error.message),
 *   context: 'CategoriesPage'
 * })
 *
 * // Use optimisticData instead of categories in your UI
 * <Table data={optimisticData} columns={columns} />
 *
 * // Execute mutation with instant UI update
 * await mutate({ type: 'add', item: newCategory })
 * ```
 */
export function useOptimisticMutation<T extends { id: string }, TData = unknown>({
  currentData,
  mutationFn,
  onSuccess,
  onError,
  context = 'useOptimisticMutation',
}: UseOptimisticMutationOptions<T, TData>): UseOptimisticMutationReturn<T, TData> {
  const [isPending, startTransition] = useTransition()
  const [optimisticData, setOptimisticData] = useOptimistic(currentData, optimisticReducer<T>)

  // HIGH-05 FIX: Mutex ref to prevent concurrent mutations causing race conditions
  const isMutatingRef = React.useRef(false)

  const mutate = useCallback(
    async (action: OptimisticAction<T>, _data?: TData) => {
      // HIGH-05 FIX: Prevent concurrent mutations
      if (isMutatingRef.current) {
        return // Silently skip if another mutation is in progress
      }

      isMutatingRef.current = true

      startTransition(async () => {
        // Apply optimistic update immediately
        setOptimisticData(action)

        try {
          // Execute the actual mutation
          await mutationFn(_data ?? (action as unknown as TData))

          // Success callback
          onSuccess?.()
        } catch (error) {
          // Error will be auto-reverted by React
          const errorMessage = handleError(error, context)
          onError?.(new Error(errorMessage))
        } finally {
          // HIGH-05 FIX: Release mutex after mutation completes
          isMutatingRef.current = false
        }
      })
    },
    // HIGH-04 FIX: Remove setOptimisticData from deps - it's a React stable function
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutationFn, onSuccess, onError, context]
  )

  return {
    optimisticData,
    mutate,
    isPending,
  }
}

/**
 * Specialized hook for delete mutations with cascade support
 *
 * @example
 * ```typescript
 * const { mutate: deleteWithOptimistic } = useOptimisticDelete({
 *   currentData: categories,
 *   deleteFn: cascadeDeleteCategory,
 *   onSuccess: () => toast.success('Deleted!'),
 *   onError: (error) => toast.error(error.message)
 * })
 *
 * // Delete with instant UI update
 * await deleteWithOptimistic(categoryId)
 * ```
 */
export function useOptimisticDelete<T extends { id: string }>({
  currentData,
  deleteFn,
  onSuccess,
  onError,
  context = 'useOptimisticDelete',
}: {
  currentData: T[]
  deleteFn: (id: string) => { success: boolean; error?: string } | void
  onSuccess?: () => void
  onError?: (error: Error) => void
  context?: string
}) {
  const { optimisticData, mutate, isPending } = useOptimisticMutation<T, string>({
    currentData,
    mutationFn: (id: string) => {
      const result = deleteFn(id)
      // Handle cascade service return type
      if (result && !result.success) {
        throw new Error(result.error || 'Delete failed')
      }
    },
    onSuccess,
    onError,
    context,
  })

  const deleteItem = useCallback(
    async (id: string) => {
      await mutate({ type: 'delete', id }, id)
    },
    [mutate]
  )

  return {
    optimisticData,
    mutate: deleteItem,
    isPending,
  }
}
