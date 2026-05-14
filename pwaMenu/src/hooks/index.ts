/**
 * @deprecated VERCEL-APP-FIX (bundle-barrel-imports): Avoid importing from this barrel file.
 * Import hooks directly from their source files for better tree-shaking.
 * Example: import { useIsMounted } from './useIsMounted'
 */

// Custom hooks for pwamenu
export { useIsMounted } from './useIsMounted'
export { useAsync } from './useAsync'
export type { AsyncStatus, AsyncState, UseAsyncOptions, UseAsyncReturn } from './useAsync'
export { useModal } from './useModal'
export type { UseModalReturn } from './useModal'
export { useDebounce } from './useDebounce'
export { useOnlineStatus } from './useOnlineStatus'
export { useCloseTableFlow } from './useCloseTableFlow'
export type { CloseStatus } from './useCloseTableFlow'
export { useOptimisticCart } from './useOptimisticCart'
export { useProductTranslation } from './useProductTranslation'
export { useAutoCloseTimer } from './useAutoCloseTimer'
export { useEscapeKey } from './useEscapeKey'
export { useAriaAnnounce } from './useAriaAnnounce'
export { useAllergenFilter } from './useAllergenFilter'
export type {
  AllergenPresenceType,
  AllergenStrictness,
  AllergenWithPresence,
  ProductAllergens,
  CrossReactionSensitivity,
} from './useAllergenFilter'
export { useDietaryFilter, DIETARY_LABELS, DIETARY_ICONS } from './useDietaryFilter'
export type { DietaryOption, DietaryProfile } from './useDietaryFilter'
export { useCookingMethodFilter, COOKING_METHOD_LABELS, COOKING_METHOD_ICONS } from './useCookingMethodFilter'
export type { CookingMethod, CookingFilterState } from './useCookingMethodFilter'
export { useAdvancedFilters } from './useAdvancedFilters'
export type { ProductFilterData } from './useAdvancedFilters'
export { useServiceCallUpdates } from './useServiceCallUpdates'
export type { ServiceCallStatus } from './useServiceCallUpdates'
export { useInstallPrompt } from './useInstallPrompt'
export { useOfflineQueue } from './useOfflineQueue'
export { useCartSync } from './useCartSync'
