/**
 * @deprecated BARREL FILE
 * Vercel React Best Practice: bundle-barrel-imports
 * 
 * Avoid importing from this file. It prevents effective tree-shaking and increases bundle size.
 * Instead, import components directly from their specific files.
 * 
 * Example:
 * import { Button } from './Button' (Correct)
 * import { Button } from './index' (Incorrect)
 */

export { Button } from './Button'
export { Input } from './Input'
export { Select } from './Select'
export { Textarea } from './Textarea'
export { Toggle } from './Toggle'
export { Modal } from './Modal'
export { LazyModal } from './LazyModal'
export { Table } from './Table'
export { Card, CardHeader } from './Card'
export { Badge } from './Badge'
export { ToastContainer } from './Toast'
export { ConfirmDialog } from './ConfirmDialog'
export { ImageUpload } from './ImageUpload'
export { ErrorBoundary } from './ErrorBoundary'
export { AllergenSelect } from './AllergenSelect'
export { AllergenPresenceEditor, convertLegacyAllergenIds, extractLegacyAllergenIds } from './AllergenPresenceEditor'
export { Pagination } from './Pagination'
export { ProductSelect } from './ProductSelect'
export { BranchCheckboxes } from './BranchCheckboxes'
export { BranchPriceInput } from './BranchPriceInput'
export { HelpButton } from './HelpButton'
export { TableSkeleton } from './TableSkeleton'
