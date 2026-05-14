# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Restaurant Admin Dashboard ("Buen Sabor") for managing menu items with multi-branch support. Built with React 19, TypeScript, and Vite. The UI is in Spanish.

**Name:** Buen Sabor (formerly "barijho" in old references)

**Data Hierarchy:**
```
Restaurant (1) → Branch (N) → Category (N) → Subcategory (N) → Product (N)
                    ↑                                              ↓
              Promotion (M:N via branch_ids[])              Allergen (M:N)
                    ↓                                              ↓
            PromotionItem (N) → Product ←─────────────── BranchPrice (N)
```

**Branch Selection:** No branch is selected by default. Users must select a branch from the Dashboard to view/edit categories, subcategories, products, and prices.

## Commands

```bash
# Development
npm run dev              # Start dev server on port 5177
npm run build            # Production build
npm run preview          # Preview production build

# Code Quality
npm run lint             # Run ESLint
npm run type-check       # TypeScript type checking (tsc --noEmit)

# Testing
npm test                 # Run Vitest tests
npm run test:ui          # Run tests with UI
npm run test:coverage    # Generate coverage report

# Build Analysis
npm run build:analyze    # Analyze bundle size
```

## Architecture

### Tech Stack
- React 19.2.0 + React Router 7.2.0 (nested routes under Layout)
- TypeScript 5.9 (strict mode)
- Zustand 5.0.9 for state management with localStorage persistence
- Tailwind CSS 4 for styling
- Lucide React for icons
- Vite 7.2.4 with code splitting and PWA support
- babel-plugin-react-compiler 1.0.0 for automatic memoization
- vite-plugin-pwa 1.2.0 for Progressive Web App capabilities
- Vitest for testing (174 tests, ~3.5s execution)
- eslint-plugin-react-hooks 7.0.1 (includes React Compiler rules)

### Directory Structure
- `src/components/layout/` - Layout (with skip links), Sidebar, PageContainer
- `src/components/ui/` - Reusable UI components (Button, Modal, HelpButton, ErrorBoundary, etc.)
- `src/pages/` - 38 page components for each route
- `src/stores/` - 25 Zustand stores with persist middleware and selectors
- `src/types/` - TypeScript interfaces (index.ts for entities, form.ts for form state)
- `src/hooks/` - Custom hooks (useFormModal, useConfirmDialog, usePagination, useFocusTrap, useDocumentTitle, useOptimisticMutation)
- `src/utils/` - Constants, validation, logging, sanitization, form utilities, help content
- `src/services/` - Service layer with cascadeService for delete operations
- `test/` - Vitest setup and test files (co-located with source)

### State Management Pattern
All Zustand stores use selectors for optimized re-renders. Never destructure from store calls:
```typescript
// Store definition with version for migrations
export const useStore = create<State>()(
  persist(
    (set, get) => ({ ... }),
    { name: STORAGE_KEYS.STORE_NAME, version: STORE_VERSIONS.STORE_NAME }
  )
)

// Selectors exported from store files
export const selectItems = (state: State) => state.items

// Usage in components (avoids unnecessary re-renders)
const items = useStore(selectItems)           // ✓ Use selectors
const addItem = useStore((s) => s.addItem)    // ✓ Use inline for actions
// const { items } = useStore()               // ✗ Never destructure
```

**For filtered arrays, use `useShallow` to prevent infinite loops:**
```typescript
import { useShallow } from 'zustand/react/shallow'

// ✓ CORRECT: useShallow prevents infinite re-renders from new array references
const staff = useStaffStore(
  useShallow((state) =>
    selectedBranchId ? state.staff.filter((s) => s.branch_id === selectedBranchId) : []
  )
)

// ✗ WRONG: Creates new array reference on every render → infinite loop
const staff = useStaffStore((state) =>
  selectedBranchId ? state.staff.filter((s) => s.branch_id === selectedBranchId) : []
)
```

For derived/filtered data from already-extracted state, use `useMemo`:
```typescript
const filteredItems = useMemo(() =>
  items.filter(i => i.active),
  [items]
)
```

### Custom Hooks Pattern (CRITICAL - React 19 Modernization)

**Sprints 11-14 introduced reusable hooks to eliminate boilerplate in CRUD pages.**

#### useFormModal Hook

Replaces 3 useState calls with single hook for modal state + form data management:

```typescript
// BEFORE (old pattern - 3 useState calls):
const [isModalOpen, setIsModalOpen] = useState(false)
const [editingItem, setEditingItem] = useState<Item | null>(null)
const [formData, setFormData] = useState<FormData>({ ... })

// AFTER (new pattern - 1 hook call):
import { useFormModal } from '../hooks'

const modal = useFormModal<FormData>({
  name: '',
  description: '',
  is_active: true,
})

// Usage:
modal.openCreate({ ...initialFormData })          // Create mode
modal.openEdit(item, { ...itemFormData })         // Edit mode
modal.close()                                     // Close modal
modal.setFormData(prev => ({ ...prev, name: 'New' })) // Update form
modal.isOpen                                      // Boolean state
modal.selectedItem                                // Current item being edited
modal.formData                                    // Current form data
```

#### useConfirmDialog Hook

Replaces 2 useState calls for delete confirmation dialogs:

```typescript
// BEFORE (old pattern):
const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
const [deleteItem, setDeleteItem] = useState<Item | null>(null)

// AFTER (new pattern):
import { useConfirmDialog } from '../hooks'

const deleteDialog = useConfirmDialog<Item>()

// Usage:
deleteDialog.open(item)   // Open with item
deleteDialog.close()      // Close dialog
deleteDialog.isOpen       // Boolean state
deleteDialog.item         // Current item to delete
```

**Migration status:** 9/11 simple CRUD pages use `useFormModal`/`useConfirmDialog`. Not yet migrated: Products, Promotions (complex pages). Tables/Settings/Restaurant use different patterns.

### React 19 Form Pattern with useActionState

All CRUD pages use React 19's useActionState hook for form handling:

```typescript
import { useActionState, useCallback } from 'react'
import type { FormState } from '../types/form'

const submitAction = useCallback(
  async (_prevState: FormState<T>, formData: FormData): Promise<FormState<T>> => {
    const data: T = {
      field1: formData.get('field1') as string,
      field2: parseInt(formData.get('field2') as string, 10) || 0,
      is_active: formData.get('is_active') === 'on',
    }

    const validation = validateData(data)
    if (!validation.isValid) {
      return { errors: validation.errors, isSuccess: false }
    }

    try {
      if (modal.selectedItem) {
        updateItem(modal.selectedItem.id, data)
        toast.success('Actualizado correctamente')
      } else {
        addItem(data)
        toast.success('Creado correctamente')
      }
      return { isSuccess: true, message: 'Guardado correctamente' }
    } catch (error) {
      const message = handleError(error, 'Component.submitAction')
      toast.error(`Error: ${message}`)
      return { isSuccess: false, message: `Error: ${message}` }
    }
  },
  [modal.selectedItem, updateItem, addItem]
)

const [state, formAction, isPending] = useActionState<FormState<T>, FormData>(
  submitAction,
  { isSuccess: false }
)

// Close modal on success
if (state.isSuccess && modal.isOpen) {
  modal.close()
}

// In JSX:
<form id="item-form" action={formAction}>
  {/* form fields */}
</form>
<Button type="submit" form="item-form" isLoading={isPending}>
  {modal.selectedItem ? 'Guardar' : 'Crear'}
</Button>
```

### Branch-Scoped Data
Categories, subcategories, and products are scoped by branch. Use `selectedBranchId` from branchStore:
```typescript
const selectedBranchId = useBranchStore(selectSelectedBranchId)
const selectedBranch = useBranchStore(selectBranchById(selectedBranchId))  // Pass null directly, not ''
const categories = useCategoryStore(selectCategories)

// Filter by branch in useMemo - use HOME_CATEGORY_NAME, never id '0'
const branchCategories = useMemo(() => {
  if (!selectedBranchId) return []
  return categories.filter(
    (c) => c.branch_id === selectedBranchId && c.name !== HOME_CATEGORY_NAME
  )
}, [categories, selectedBranchId])
```

**Important:** The `selectBranchById` selector accepts `string | null`. Pass `selectedBranchId` directly without fallback to empty string.

### Cascade Delete Service
All cascade delete operations are centralized in `src/services/cascadeService.ts` using dependency injection for testability. Use wrapper functions for convenience:

```typescript
import {
  deleteBranchWithCascade,
  deleteCategoryWithCascade,
  deleteSubcategoryWithCascade,
  deleteProductWithCascade,
  deleteAllergenWithCascade,
  deletePromotionTypeWithCascade
} from '../services/cascadeService'

// Usage in handleDelete callbacks:
const handleDelete = useCallback(() => {
  if (!selectedBranch) return

  const result = deleteBranchWithCascade(selectedBranch.id)

  if (!result.success) {
    toast.error(result.error || 'Error al eliminar')
    return
  }

  toast.success('Eliminado correctamente')
}, [selectedBranch])
```

**Wrapper functions** (convenience, auto-inject stores):
- `deleteBranchWithCascade(id)` - Deletes promotions → products → subcategories → categories → tables → orderHistory → branch
- `deleteCategoryWithCascade(id)` - Deletes products → subcategories → category (cleans promotions first)
- `deleteSubcategoryWithCascade(id)` - Deletes products → subcategory (cleans promotions first)
- `deleteProductWithCascade(id)` - Cleans product from promotions → deletes product
- `deleteAllergenWithCascade(id)` - Cleans allergen from products → deletes allergen
- `deleteBadgeWithCascade(id)` - Removes badge references from products → deletes badge
- `deleteSealWithCascade(id)` - Removes seal references from products → deletes seal
- `deletePromotionTypeWithCascade(id)` - Deletes related promotions → deletes type

**Core functions** (for testing with injected stores):
- `cascadeDeleteBranch(id, stores)` - accepts store actions as parameter
- `cascadeDeleteCategory(id, stores)` - etc.

All functions return `CascadeDeleteResult`:
```typescript
interface CascadeDeleteResult {
  success: boolean
  deletedCounts: { categories?: number; products?: number; ... }
  error?: string
}
```

### Code Splitting
All pages use React.lazy() for code splitting. See `App.tsx`:
```typescript
import { lazy, Suspense } from 'react'

const DashboardPage = lazy(() => import('./pages/Dashboard'))
// ... all 17 pages

// In routes:
<Suspense fallback={<PageLoader />}>
  <Route path="/" element={<DashboardPage />} />
</Suspense>
```

### Constants and Configuration
All magic strings and configuration live in `src/utils/constants.ts`:
- `HOME_CATEGORY_NAME` - Special category name filter ('Home')
- `STORAGE_KEYS` - localStorage persistence keys (branches, categories, subcategories, products, allergens, promotion-types, promotions, restaurant)
- `STORE_VERSIONS` - For Zustand persist migrations (increment when changing data structure)
- `VALIDATION_LIMITS` - Centralized validation limits (MIN_NAME_LENGTH, MAX_NAME_LENGTH, MAX_DESCRIPTION_LENGTH, MAX_PRICE, MAX_TOASTS, etc.)
- `LOCALE` - Currency (ARS) and language (es-AR)
- `PATTERNS` - Validation regex patterns
- `generateId()` - Centralized UUID generator using `crypto.randomUUID()`
- `formatPrice(price)` - Centralized price formatter with edge case handling

### Validation
Centralized validation in `src/utils/validation.ts`. Always use these validators instead of inline validation:
```typescript
const { isValid, errors } = validateCategory(formData)
// errors is typed as ValidationErrors<CategoryFormData>

// In state declaration:
const [errors, setErrors] = useState<ValidationErrors<CategoryFormData>>({})
```

**Number validation helpers** (exported from validation.ts):
```typescript
import { isValidNumber, isPositiveNumber, isNonNegativeNumber } from '../utils/validation'

// isValidNumber(value) - true if finite, non-NaN number
// isPositiveNumber(value) - true if > 0
// isNonNegativeNumber(value) - true if >= 0

// Usage in custom validation:
if (!isPositiveNumber(data.price)) {
  errors.price = 'El precio debe ser mayor a 0'
}
```

### Error Handling and Logging
Use centralized logging utilities from `src/utils/logger.ts`:
```typescript
import { handleError, logWarning, logInfo } from '../utils/logger'

// In catch blocks - returns user-friendly message
catch (error) {
  const message = handleError(error, 'ComponentName.functionName')
  toast.error(message)
}

// For non-critical warnings (always logged)
logWarning('Invalid array structure', 'componentName', dataObject)

// For development info (only logged in DEV mode)
logInfo('Processing items', 'componentName', { count: items.length })
```

**Important:** Never use `console.log/warn/error` directly. Always use logger utilities for consistent, production-safe logging.

### Routing
Routes nested under Layout component (includes skip link for accessibility):
- `/` - Dashboard (branch selection)
- `/restaurant` - Restaurant settings
- **Gestión > Sucursales:**
  - `/branches` - Branch management (CRUD)
  - `/branches/tables` - Tables management (full CRUD with status workflow)
  - `/branches/staff` - Staff management (placeholder)
  - `/branches/staff/roles` - Staff roles management (full CRUD)
  - `/branches/orders` - Orders management (placeholder)
- **Gestión > Productos:**
  - `/categories` - Category management (branch-scoped)
  - `/subcategories` - Subcategory management (branch-scoped)
  - `/products` - Product/Platos management (branch-scoped)
  - `/allergens` - Allergen management (global)
  - `/badges` - Badge/Insignia management (global)
  - `/seals` - Seal/Sellos management (global)
- **Marketing:**
  - `/prices` - Price management (branch-scoped, bulk updates)
  - `/promotion-types` - Promotion types management (global)
  - `/promotions` - Promotions management (multi-branch)
- **Estadísticas:**
  - `/statistics/sales` - Sales statistics (placeholder)
  - `/statistics/history/branches` - Order history by branch (placeholder)
  - `/statistics/history/customers` - Order history by customer (placeholder)
- `/settings` - App settings

### Sidebar Navigation Structure
The sidebar uses a hierarchical collapsible navigation defined in `src/components/layout/Sidebar.tsx`:
```
Dashboard
Restaurante
▸ Gestión (collapsible group)
  ▸ Sucursales (collapsible subgroup)
    - Todas → /branches
    - Mesas → /branches/tables
    ▸ Personal (collapsible subgroup)
      - Gestión → /branches/staff
      - Roles → /branches/staff/roles
    - Pedidos → /branches/orders
  ▸ Productos (collapsible subgroup)
    - Categorías → /categories
    - Subcategorías → /subcategories
    - Platos y Bebidas → /products
    - Alérgenos → /allergens
    - Insignia → /badges
    - Sellos → /seals
▸ Marketing (collapsible group)
  - Precios → /prices
  - Tipos de Promo → /promotion-types
  - Promociones → /promotions
▸ Estadísticas (collapsible group)
  - Ventas → /statistics/sales
  ▸ Historial (collapsible subgroup)
    - Sucursales → /statistics/history/branches
    - Clientes → /statistics/history/customers
Configuración (bottom)
```

Groups auto-expand when navigating to a child route. State is managed with `openGroups: Record<string, boolean>`.

### Type System
Types centralized in `src/types/index.ts`. Data models (Restaurant, Branch, Category, Product, Allergen, PromotionType, Promotion) are separate from form data types (RestaurantFormData, etc.).

### Per-Branch Pricing
Products support per-branch pricing with the `BranchPrice` type:
```typescript
interface BranchPrice {
  branch_id: string
  price: number
  is_active: boolean  // false = product not sold at this branch
}

interface Product {
  price: number                   // Base price (used when use_branch_prices is false)
  branch_prices?: BranchPrice[]   // Per-branch pricing (optional, defaults to [])
  use_branch_prices: boolean      // Toggle for per-branch mode
  allergen_ids?: string[]         // Optional, defaults to []
  // ...other fields
}
```

Use `BranchPriceInput` component for the UI. Validation returns both `errors` and `branchPriceErrors`:
```typescript
const validation = validateProduct(formData)
if (!validation.isValid) {
  setErrors(validation.errors)
  setBranchPriceErrors(validation.branchPriceErrors)  // Record<branch_id, string>
  return
}
```

**Important:** Always use null-safe access for arrays that may be undefined:
```typescript
// branch_prices
const branchPrices = item.branch_prices ?? []
if (!item.use_branch_prices || branchPrices.length === 0) {
  // Show base price
}

// allergen_ids in store operations
allergen_ids: (prod.allergen_ids ?? []).filter((id) => id !== allergenId)
```

### Master-Detail Relationships
Products have a many-to-many relationship with Allergens via `allergen_ids: string[]`. Use the `AllergenSelect` component for multi-select in forms:
```typescript
<AllergenSelect
  label="Alergenos"
  value={formData.allergen_ids}
  onChange={(ids) => setFormData(prev => ({ ...prev, allergen_ids: ids }))}
/>
```

### Promotions System
Promotions are combos of products with time-based scheduling. Use `ProductSelect` for products, `BranchCheckboxes` for branches:
```typescript
interface Promotion {
  id: string
  name: string
  price: number
  start_date: string        // YYYY-MM-DD
  end_date: string          // YYYY-MM-DD
  start_time: string        // HH:mm (e.g., "17:00")
  end_time: string          // HH:mm (e.g., "20:00")
  promotion_type_id: string // Reference to PromotionType
  branch_ids: string[]      // Explicit list of branch IDs
  items: PromotionItem[]    // Products in the combo
  is_active: boolean
}

// Validation with context:
const validation = validatePromotion(formData, { isEditing: !!selectedPromotion })
```

**Promotion Validation Rules:**
- New promotions: `start_date` and `start_time` must be in the future
- Editing: start date/time validation is skipped (allows editing past promotions)
- `end_date` must be >= `start_date`
- Cannot activate a promotion with `end_date` in the past
- Same-day promotions: `end_time` must be > `start_time`

Note: `branch_ids` always contains explicit IDs. All branches selected by default when creating.

### Tables Management
Tables have a 5-state workflow with specific time rules. Store is in `src/stores/tableStore.ts`, page in `src/pages/Tables.tsx`:
```typescript
type TableStatus = 'libre' | 'ocupada' | 'solicito_pedido' | 'pedido_cumplido' | 'cuenta_solicitada'

interface RestaurantTable {
  id: string
  branch_id: string
  number: number
  capacity: number
  sector: string
  status: TableStatus
  order_time: string  // HH:mm format
  close_time: string  // HH:mm format
  is_active: boolean
}
```

**Visual Grid UI:** Tables are displayed as a responsive grid of colored cards (8 columns on xl screens, scrollable container). Each card shows table number, status with color coding, capacity, and order time. Status colors:
- `libre` → green
- `ocupada` → red
- `solicito_pedido` → yellow
- `pedido_cumplido` → blue
- `cuenta_solicitada` → purple
- inactive → gray

**Time Rules by Status:**
| Status | order_time | close_time |
|--------|------------|------------|
| libre | 00:00 | 00:00 |
| ocupada | 00:00 | 00:00 |
| solicito_pedido | HH:mm (hora del pedido) | 00:00 |
| pedido_cumplido | HH:mm (mantiene hora del pedido) | 00:00 |
| cuenta_solicitada | HH:mm | HH:mm (close >= order) |

**Status Transitions:**
- When changing to `solicito_pedido`: set `order_time` to current time if coming from libre/ocupada
- When changing to `pedido_cumplido`: **preserve** `order_time` from previous state (never reset)
- When changing to `cuenta_solicitada`: preserve `order_time`, set `close_time` to current time
- When changing to `libre` or `ocupada`: reset both times to 00:00

**Archive Feature:**
Tables in `cuenta_solicitada` status show an archive button that:
1. Creates an `OrderHistory` record with branch_id, table_id, table_number
2. Resets table to `libre` status with both times at 00:00
```typescript
const handleArchive = useCallback((table: RestaurantTable) => {
  createOrderHistory({
    branch_id: table.branch_id,
    table_id: table.id,
    table_number: table.number,
  })
  updateTable(table.id, {
    status: 'libre',
    order_time: TABLE_DEFAULT_TIME,
    close_time: TABLE_DEFAULT_TIME,
  })
}, [createOrderHistory, updateTable])
```

**Sorting:** Tables are sorted by status priority (most urgent first), then by table number within each status group:
1. `cuenta_solicitada` (need to close)
2. `solicito_pedido` (waiting for order)
3. `pedido_cumplido` (order delivered)
4. `ocupada` (seated, no activity)
5. `libre` (available)

**Filter Behavior:**
- Branch filter defaults to first branch (no "all branches" option)
- Status filter shows all statuses by default

### Styling
- Dark theme with zinc backgrounds (bg-zinc-950)
- Orange-500 as primary accent color
- Custom animations in index.css (fade-in, zoom-in-95, slide-in-from-right)

### Help System
Each page includes a centered red help button (`HelpButton`) that opens a modal with detailed page functionality:
```typescript
import { helpContent } from '../utils/helpContent'

<PageContainer
  title="Productos"
  description="..."
  helpContent={helpContent.products}  // ReactNode with Spanish help text
>
```

Help content is centralized in `src/utils/helpContent.tsx` with entries for: dashboard, restaurant, branches, categories, subcategories, products, prices, allergens, promotionTypes, promotions, settings.

**Form Modal Help:** Each create/edit modal includes a small HelpButton (`size="sm"`) at the top of the form that explains all fields:
```typescript
<Modal isOpen={isModalOpen} onClose={...} title="..." footer={...}>
  <div className="space-y-4">
    <div className="flex items-center gap-2 mb-2">
      <HelpButton
        title="Formulario de Categoria"
        size="sm"
        content={
          <div className="space-y-3">
            <p><strong>Completa los siguientes campos</strong>...</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Nombre:</strong> ...</li>
            </ul>
            <div className="bg-zinc-800 p-3 rounded-lg mt-3">
              <p className="text-orange-400 font-medium text-sm">Consejo:</p>
              <p className="text-sm mt-1">...</p>
            </div>
          </div>
        }
      />
      <span className="text-sm text-zinc-400">Ayuda sobre el formulario</span>
    </div>
    {/* Form fields */}
  </div>
</Modal>
```

### Accessibility
- Modal component includes focus trap via `useFocusTrap` hook (uses AbortController for cleanup)
- Skip link in Layout for keyboard navigation
- aria-labels on icon-only buttons (use proper Spanish accents: "página", "notificación")
- Screen reader text (`sr-only`) in Badge components for status context
- Table component supports keyboard navigation (Enter/Space) for clickable rows; has default `ariaLabel="Tabla de datos"`
- Button component has `aria-busy` and sr-only "Cargando" text when `isLoading=true`
- Loading states include `role="status"` and sr-only text
- Icons use `aria-hidden="true"` when decorative, `aria-label` when meaningful
- HelpButton provides contextual help for each page
- Toast notifications use `role="alert"` and `aria-live` (assertive for errors, polite for others); ToastItem is memoized
- Form inputs use `useId()` hook for unique IDs (never hardcode IDs)
- Input component automatically links errors via `aria-describedby`

### Store Migrations
When modifying data structure, increment version in `STORE_VERSIONS` and add migrate function. **Always use TypeScript strict mode with type guards**:
```typescript
persist(
  (set, get) => ({ ... }),
  {
    name: STORAGE_KEYS.PRODUCTS,
    version: STORE_VERSIONS.PRODUCTS,
    migrate: (persistedState: unknown, version: number) => {
      // ✓ CORRECT: Type guard with unknown, validate structure
      if (!persistedState || typeof persistedState !== 'object') {
        return { products: initialProducts }
      }

      const state = persistedState as { products?: unknown }

      // Validate array exists
      if (!Array.isArray(state.products)) {
        return { products: initialProducts }
      }

      // Use local variable for transformations
      let products = state.products

      // Non-destructive merge: only add missing initial items
      if (version < 4) {
        const existingIds = new Set(products.map(p => p.id))
        const missing = initialProducts.filter(p => !existingIds.has(p.id))
        products = [...products, ...missing]
      }

      // Add new fields with defaults
      if (version < 5) {
        products = products.map(p => ({
          ...p,
          newField: p.newField ?? defaultValue,
        }))
      }

      // Return new object, typed correctly
      return { products } as State
    },
  }
)
```

**Migration Type Safety:**
- Always use `unknown` for `persistedState` parameter (never `any`)
- Add type guards to validate structure before casting
- Return early with safe defaults if validation fails
- Cast return value to State type for type safety

### Toast Notifications
Use the `toast` helper from `src/stores/toastStore.ts`:
```typescript
import { toast } from '../stores/toastStore'

toast.success('Operacion exitosa')
toast.error('Error al guardar')
toast.warning('Advertencia')
toast.info('Informacion')
```
**Limits:** Maximum 5 toasts displayed simultaneously to prevent memory issues. Oldest toast is removed when limit is reached.

### Pagination
All listing pages use the `usePagination` hook with 10 items per page:
```typescript
import { usePagination } from '../hooks/usePagination'
import { Pagination } from '../components/ui'

const {
  paginatedItems,
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  setCurrentPage,
} = usePagination(sortedItems)

// In JSX:
<Table data={paginatedItems} columns={columns} ... />
<Pagination
  currentPage={currentPage}
  totalPages={totalPages}
  totalItems={totalItems}
  itemsPerPage={itemsPerPage}
  onPageChange={setCurrentPage}
/>
```
The hook auto-resets to page 1 when `currentPage > totalPages` (e.g., after filtering reduces items). Uses `useLayoutEffect` with a ref flag to prevent infinite loops.

### Price Formatting
Use the centralized `formatPrice` function from `src/utils/constants.ts`:
```typescript
import { formatPrice } from '../utils/constants'

// Usage: {formatPrice(item.price)} → "$ 5.000,00"
// Handles edge cases like NaN and Infinity
```

### Event Listener Pattern in Modals
When registering event listeners in useEffect that depend on callback props, use `useRef` and update in a separate effect to avoid setting refs during render:
```typescript
// Use ref to avoid re-registering listeners when onClose changes
const onCloseRef = useRef(onClose)

// Update ref in effect (NOT during render - causes linter error)
useEffect(() => {
  onCloseRef.current = onClose
}, [onClose])

useEffect(() => {
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onCloseRef.current()
  }

  if (isOpen) {
    document.addEventListener('keydown', handleEscape)
  }

  return () => {
    document.removeEventListener('keydown', handleEscape)
  }
}, [isOpen])  // Only depend on isOpen, not onClose
```

### Nested Modals
The Modal component tracks open modal count via `document.body.dataset.modalCount`. This ensures:
- Body overflow is only restored when the **last** modal closes
- Nested modals (e.g., confirm dialog inside edit modal) work correctly
- No scroll restoration bugs when closing inner modals

### React Compiler Lint Rules (eslint-plugin-react-hooks 7.x)

The React Compiler enforces stricter rules than traditional React. Key patterns:

**1. Hooks must be called unconditionally:**
```typescript
// WRONG: Conditional hook call
if (type === 'submit') {
  const formStatus = useFormStatus()
}

// CORRECT: Always call, conditionally use result
const formStatus = useFormStatus()
const isPending = type === 'submit' && formStatus.pending
```

**2. Avoid setState in useEffect (use derived state):**
```typescript
// WRONG: setState in effect causes cascading renders
useEffect(() => {
  if (branches.length > 0 && !branches.includes(selectedId)) {
    setSelectedId(branches[0].id)
  }
}, [branches, selectedId])

// CORRECT: Compute derived state with useMemo
const effectiveId = useMemo(() => {
  if (branches.some(b => b.id === selectedId)) return selectedId
  return branches[0]?.id ?? ''
}, [branches, selectedId])
```

**3. Use `deleteDialog` instead of `deleteDialog.open` in useMemo deps:**
```typescript
// WRONG: Property access causes memoization warning
useMemo(() => [...], [openEditModal, deleteDialog.open])

// CORRECT: Use the whole object
useMemo(() => [...], [openEditModal, deleteDialog])
```

**4. Lazy component caching for dynamic imports:**
```typescript
// LazyModal.tsx uses module-level cache and eslint-disable
// because lazy() in render is unavoidable for dynamic loaders
/* eslint-disable react-hooks/static-components */
const lazyComponentCache = new Map<LazyLoader, ReturnType<typeof lazy>>()
```

**5. Use `unknown` instead of `any` in generic defaults:**
```typescript
// WRONG: Triggers @typescript-eslint/no-explicit-any
export interface Options<T, TData = any> { ... }

// CORRECT: Use unknown for type safety
export interface Options<T, TData = unknown> { ... }
```

## Backend Integration

All entity stores start with empty arrays and fetch from backend API. System data (Roles, Allergens, Badges, Seals, PromotionTypes) is predefined.

**Store Versions:** BRANCHES=5, CATEGORIES=4, SUBCATEGORIES=4, PRODUCTS=6, ALLERGENS=2, BADGES=1, SEALS=1, ROLES=1, STAFF=3, PROMOTIONS=4, PROMOTION_TYPES=2, TABLES=7, ORDER_HISTORY=1

**38 pages** total. 25 Zustand stores. 174 automated tests.

## Dashboard-Specific Security

- **File imports** (`Settings.tsx`): Max 5MB, `.json` only, deep structure validation before importing
- **Input sanitization** (`utils/sanitization.ts`): `sanitizeImageUrl`, `sanitizeHtml`, `isSafeFilename`, `stripDangerousChars`
- **Validation** (`utils/validation.ts`): Centralized validators with `VALIDATION_LIMITS` constants. Use `isValidNumber`, `isPositiveNumber` helpers. Always `parseInt(value, 10)` with radix.
- **Error messages**: `handleError()` in `logger.ts` maps internal errors to safe Spanish messages

See root `CLAUDE.md` for shared patterns (Zustand selectors, logging, type conversions, security).
