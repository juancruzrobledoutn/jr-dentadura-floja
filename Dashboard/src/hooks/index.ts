/**
 * @deprecated VERCEL-APP-FIX (bundle-barrel-imports): Avoid importing from this barrel file.
 * Import hooks directly from their source files for better tree-shaking.
 * Example: import { useFocusTrap } from './useFocusTrap'
 */

export { useFocusTrap } from './useFocusTrap'
export { usePagination } from './usePagination'
export { useFormModal } from './useFormModal'
export { useConfirmDialog } from './useConfirmDialog'
export { useOptimisticMutation, useOptimisticDelete, optimisticReducer } from './useOptimisticMutation'
export type { OptimisticAction, UseOptimisticMutationOptions, UseOptimisticMutationReturn } from './useOptimisticMutation'
