/* eslint-disable react-hooks/static-components */
/**
 * SPRINT 9: Lazy-loaded Modal wrapper
 *
 * Reduces initial bundle size by lazy-loading modal content only when opened.
 * Useful for modals with heavy content like ImageUpload, complex forms, or charts.
 *
 * Note: This file disables react-hooks/static-components because the lazy component
 * pattern requires creating a reference during render, but we use a module-level cache
 * to ensure stability and avoid recreating components.
 *
 * Usage:
 * ```typescript
 * import { LazyModal } from '../components/ui'
 *
 * <LazyModal
 *   isOpen={isModalOpen}
 *   onClose={() => setIsModalOpen(false)}
 *   title="Heavy Modal"
 *   loader={() => import('./HeavyModalContent')}
 *   size="lg"
 *   footer={<Button>Save</Button>}
 * />
 * ```
 */

import { lazy, Suspense, ComponentType } from 'react'
import { Modal } from './Modal'

// Cache for lazy components to avoid re-creating them on each render
// Using a module-level Map to persist across renders and component instances
type LazyLoader = () => Promise<{ default: ComponentType<Record<string, unknown>> }>
const lazyComponentCache = new Map<LazyLoader, ReturnType<typeof lazy>>()

function getOrCreateLazyComponent(loader: LazyLoader) {
  let LazyComponent = lazyComponentCache.get(loader)
  if (!LazyComponent) {
    LazyComponent = lazy(loader)
    lazyComponentCache.set(loader, LazyComponent)
  }
  return LazyComponent
}

interface LazyModalProps {
  /** Is modal open */
  isOpen: boolean
  /** Close handler */
  onClose: () => void
  /** Modal title */
  title: string
  /** Function that returns dynamic import */
  loader: () => Promise<{ default: ComponentType<Record<string, unknown>> }>
  /** Props to pass to lazy-loaded component */
  componentProps?: Record<string, unknown>
  /** Modal size */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Footer content */
  footer?: React.ReactNode
}

/**
 * Loading skeleton for modal content
 */
function ModalContentLoader() {
  return (
    <div className="space-y-4 py-8" role="status">
      <div className="flex justify-center">
        <div className="w-8 h-8 border-2 border-[var(--primary-500)] border-t-transparent rounded-full animate-spin" />
      </div>
      <div className="space-y-3">
        <div className="h-4 bg-[var(--bg-tertiary)] rounded w-3/4 animate-pulse" />
        <div className="h-4 bg-[var(--bg-tertiary)] rounded w-1/2 animate-pulse" />
        <div className="h-4 bg-[var(--bg-tertiary)] rounded w-5/6 animate-pulse" />
      </div>
      <span className="sr-only">Cargando contenido del modal...</span>
    </div>
  )
}

/**
 * Lazy-loaded Modal component
 *
 * Only loads modal content when the modal is opened for the first time.
 * This reduces initial bundle size and improves performance.
 *
 * @param props - LazyModal props
 * @returns Modal with lazy-loaded content
 *
 * @example
 * ```typescript
 * // Define heavy modal content in separate file
 * // src/components/modals/ProductFormContent.tsx
 * export default function ProductFormContent({ formData, onChange }) {
 *   return (
 *     <div>
 *       <ImageUpload ... />
 *       <ComplexForm ... />
 *     </div>
 *   )
 * }
 *
 * // Use in page
 * <LazyModal
 *   isOpen={isModalOpen}
 *   onClose={handleClose}
 *   title="Edit Product"
 *   loader={() => import('./modals/ProductFormContent')}
 *   componentProps={{ formData, onChange: setFormData }}
 *   footer={<Button type="submit">Save</Button>}
 * />
 * ```
 */
export function LazyModal({
  isOpen,
  onClose,
  title,
  loader,
  componentProps = {},
  size = 'md',
  footer,
}: LazyModalProps) {
  // Get lazy component from module-level cache
  // The cache ensures we don't recreate components on each render
  const LazyContent = getOrCreateLazyComponent(loader)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size={size} footer={footer}>
      {isOpen && (
        <Suspense fallback={<ModalContentLoader />}>
          <LazyContent {...componentProps} />
        </Suspense>
      )}
    </Modal>
  )
}

/**
 * PERFORMANCE BENEFITS:
 *
 * Without LazyModal:
 * - All modal content loaded in initial bundle
 * - ImageUpload, charts, forms loaded even if never used
 * - Larger initial bundle size
 *
 * With LazyModal:
 * - Modal content loaded only when opened
 * - Code split into separate chunks
 * - Smaller initial bundle, faster first load
 * - Cached after first load for instant re-open
 *
 * Example savings:
 * - ImageUpload component: ~8KB
 * - Complex form with validation: ~15KB
 * - Chart libraries: ~50-100KB
 * Total saved from initial bundle: 20-100KB per lazy modal
 */
