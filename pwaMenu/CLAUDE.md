# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Sabor** is a Progressive Web App for shared digital restaurant menus. Diners at a table collaboratively order from a shared cart, split bills, pay via Mercado Pago, and manage table sessions. Built for offline-first mobile use.

## Build & Development Commands

```bash
npm run dev      # Start Vite dev server (port 5176)
npm run build    # Production build
npm run lint     # Run ESLint
npx tsc --noEmit # Type check without emitting
npm run preview  # Preview production build
```

```bash
npm run test      # Vitest watch mode
npm run test:run  # Vitest single run (CI)
npm run test:coverage  # Coverage report
```

Deployment: Vercel (configured via `vercel.json`)

## Technology Stack

- **React 19** with TypeScript 5.9 (strict mode)
- **Vite 7** with Tailwind CSS v4
- **Zustand 5** for state management (with localStorage persistence)
- **i18next** for internationalization (es, en, pt)
- **vite-plugin-pwa** with Workbox service workers
- **Mercado Pago** Checkout Pro integration for payments (mock mode in dev without credentials)

## Architecture

### Data Model

Menu structure uses a three-level hierarchy:
- **Categories** (Food, Drinks, Desserts) → **Subcategories** (Burgers, Pasta, Beer, etc.) → **Products**
- Products link to subcategories via `subcategory_id` and categories via `category_id`
- Navigation: Category tabs → Subcategory grid → Product list

### State Management

One Zustand store with persistence:

- **tableStore/** (modular) - Session, cart, orders, payment calculations, group confirmation. Uses localStorage with 8-hour expiry.
  - `store.ts` - Main Zustand store with optimistic rollback on `submitOrder()` failure, group confirmation actions
  - `selectors.ts` - React hooks with `useMemo` for derived values, `useShallow` for object selectors, and stable empty array constants (`EMPTY_CART_ITEMS`, `EMPTY_DINERS`). Includes `useRoundConfirmation`, `useRoundConfirmationActions`, `useRoundConfirmationData` for group confirmation
  - `helpers.ts` - Pure utility functions (`calculatePaymentShares`, `withRetry`, `shouldExecute` for throttling)
  - `types.ts` - TypeScript interfaces including `RoundConfirmation` actions

**Critical Zustand patterns to avoid infinite re-renders:**
- Selectors returning objects must use `useShallow` from `zustand/react/shallow`
- Derived values (reduce, filter, map) must be computed with `useMemo` inside the hook, NOT inside the selector
- For frequently changing derived values (like counts), create dedicated selectors that compute the value directly (e.g., `useCartCount`)
- See `useHeaderData`, `useSharedCartData`, `useOrderHistoryData`, `useCartCount` for correct patterns

### React 19 Patterns

This project leverages React 19 features:

- **useActionState** - Form handling with automatic pending state (`ProductDetailModal`, `CallWaiterModal`, `JoinTable`, `AIChat`)
- **useOptimistic** - Instant UI feedback with automatic rollback (`useOptimisticCart` hook)
- **useTransition** - Non-blocking UI updates for cart operations
- **useId** - Unique IDs for accessibility (`SearchBar`, `SharedCart`)
- **`<form action>`** - Declarative form submission pattern
- **Document metadata** - `<title>` and `<meta>` in component JSX (`Home.tsx`)

**useActionState pattern:**
```typescript
const [formState, formAction, isPending] = useActionState(
  async (prevState, formData) => {
    const value = formData.get('field')
    // Process and return new state
    return { ...prevState, result }
  },
  { status: 'idle', error: null }
)

// In JSX:
<form action={formAction}>
  <input name="field" disabled={isPending} />
</form>
```

### Key Patterns

- **Lazy loading** - Components below the fold use `React.lazy()` with Suspense
- **Optimistic updates** - `useOptimisticCart` hook uses React 19's `useOptimistic` for instant cart feedback
- **Request deduplication** - API client deduplicates identical in-flight requests
- **Mount guards** - Use `useIsMounted` hook in async operations to prevent state updates after unmount
- **Ref pattern for callbacks** - Use `useRef` + `useEffect` to avoid stale closures in timeouts and async operations (see `ProductDetailModal`, `CallWaiterModal`, `SharedCart`). Keep ref updated and use ref.current in callbacks.
- **Functional state updates** - Async store actions use `set((state) => ...)` to avoid stale state after `await`
- **Retry with backoff** - Use `withRetry` from `tableStore/helpers.ts` for API calls with exponential backoff
- **Throttling** - Use `shouldExecute(key, delayMs)` from helpers.ts to prevent rapid successive calls (cart actions use 100-200ms)
- **Secure ID generation** - Use `crypto.randomUUID()` via `generateId()` helper
- **Module loggers** - Use `utils/logger.ts` with module prefixes (e.g., `tableStoreLogger`)
- **Modular components** - Complex components use folder structure with `index.tsx` and subcomponents (JoinTable/, AIChat/, tableStore/)

### Custom Hooks

Located in `src/hooks/`:

| Hook | Purpose |
|------|---------|
| `useOptimisticCart` | React 19 optimistic updates for cart with rollback |
| `useAsync` | Async operation state management (loading, error, success) |
| `useAutoCloseTimer` | Auto-close modals after delay with mount safety |
| `useEscapeKey` | Keyboard escape handler with disabled state |
| `useDebounce` | Value debouncing for search inputs |
| `useIsMounted` | Mount state check for async operations |
| `useModal` | Modal open/close state with data |
| `useOnlineStatus` | Network connectivity detection |
| `useCloseTableFlow` | Multi-step table closing flow state |
| `useProductTranslation` | Product name/description i18n |
| `useAriaAnnounce` | ARIA live region announcements for screen readers |

### Centralized Constants

All timing values are in `src/constants/timing.ts`:

- `ANIMATION` - Modal durations, auto-close delays
- `SESSION` - Expiry hours, stale threshold
- `THROTTLE` - Cart action delays, cleanup intervals
- `AUTH` - Token buffer, retry delays
- `QUANTITY` - Min/max product quantities

**Always import from constants instead of using magic numbers.**

### Security

- **SSRF prevention** - API base URL validated against allowed hosts from `constants/index.ts` (`API_CONFIG.ALLOWED_HOSTS`). Blocks IPv4/IPv6 addresses and URL credentials.
- **CSRF protection** - `X-Requested-With` header on all API calls
- **Session expiry validation** - Checked on page load and during critical operations (submitOrder)

### Service Worker Caching

Three strategies in `vite.config.ts`:
1. **CacheFirst** - Images (30d), fonts (1y)
2. **NetworkFirst** - APIs with timeout fallback
3. **SPA fallback** - Navigates to index.html offline

## Key Directories

```
src/
├── pages/           # Home.tsx (menu), CloseTable.tsx (bill splitting), PaymentResult.tsx (MP return)
├── components/      # UI components, ui/ subdirectory for primitives
│   ├── JoinTable/   # Modular - TableNumberStep, NameStep
│   ├── AIChat/      # Modular - responseHandlers.ts with strategy pattern
│   ├── cart/        # Cart components (CartEmpty, CartItemCard, OrderSuccess)
│   ├── close-table/ # Bill splitting (modular: CloseTableHeader, TotalCard, SummaryTab, OrdersList)
│   └── ui/          # Primitives (Modal, LoadingSpinner, SectionErrorBoundary, ErrorAlert)
├── stores/          # Zustand stores
│   ├── tableStore/  # Modular store structure (main session/cart store)
│   ├── menuStore.ts # Backend menu with caching (Phase 9)
│   └── sessionStore.ts # Backend session management (Phase 9)
├── hooks/           # Custom hooks (useOptimisticCart, useAsync, useEscapeKey, etc.)
├── services/        # API client, mock data, Mercado Pago
│   ├── api.ts       # REST API with table token auth (Phase 9)
│   ├── websocket.ts # WebSocket for diner real-time updates (Phase 9)
│   ├── mockData.ts  # Fallback mock data
│   └── mercadoPago.ts # Payment integration
├── types/           # TypeScript interfaces
│   ├── backend.ts   # Backend API types (Phase 9)
│   ├── catalog.ts   # Categories, products, allergens
│   ├── session.ts   # Diners, cart, orders, payments
│   └── ui.ts        # UI component types
├── i18n/            # i18next config and locale JSON files
├── constants/       # App constants and timing values
└── utils/           # Logger, validation helpers, unified errors (AppError, ApiError, AuthError)
```

## Core Conventions

### TypeScript

- Strict mode enabled with noUnusedLocals/noUnusedParameters
- Unused variables prefixed with underscore are allowed
- All imports use relative paths (no aliases)
- Use explicit generics when TypeScript inference fails with literal constants: `useState<number>(CONSTANT)`

### Styling

- Tailwind utilities with dark mode classes (`dark-bg`, `dark-card`, `dark-muted`, `dark-border`, `dark-elevated`)
- Primary color: Orange (`#f97316`)
- Safe area classes for mobile notch support (`safe-area-top`, `safe-area-bottom`)

### Mobile Viewport

All page/view containers must include `overflow-x-hidden w-full max-w-full` to prevent horizontal scroll on mobile:

```tsx
<div className="min-h-screen bg-dark-bg overflow-x-hidden w-full max-w-full">
```

Global overflow prevention is also applied in `index.css` on `html`, `body`, and `#root`.

### Internationalization

- Always use `useTranslation` hook, never hardcode strings
- Add keys to all three locales (es.json, en.json, pt.json)
- Spanish is the most complete, English/Portuguese fall back to it
- Error messages use i18n keys (e.g., `errors.timeout`, `errors.authGoogleInvalid`) - store the key, display via `t(errorKey)`

### State Updates

- Use Zustand selectors, not direct store access in components
- Selectors prevent unnecessary re-renders on unrelated state changes

### Error Handling

- Use unified error classes from `utils/errors.ts`: `AppError` (base), `ApiError`, `AuthError`, `ValidationError`
- All errors have `code`, `i18nKey`, and `isRetryable` properties
- API errors map legacy codes via `API_ERROR_CODES` for backwards compatibility
- Use `SectionErrorBoundary` for granular error recovery (allows retry without full page crash)

### Logging

- Always use centralized logger from `utils/logger.ts`, never `console.log/warn/error`
- Pre-configured module loggers: `tableStoreLogger`, `apiLogger`, `i18nLogger`, `errorBoundaryLogger`, `joinTableLogger`
- Create new module loggers: `const myLogger = logger.module('ModuleName')`

### Code Comments

- All comments must be in English

### Input Validation

- Use validation helpers from `utils/validation.ts`: `validateTableNumber`, `validateDinerName`, `validateImageUrl`, `sanitizeText`
- Validation functions return i18n keys (e.g., `validation.tableRequired`) - use `t(error, errorParams)` to translate
- Cart operations validate price (positive finite number) and quantity (integer 1-99)
- Local fallback images in `public/` for offline support (`fallback-product.svg`, `default-avatar.svg`)

### Accessibility

- Modals must have `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing to the title
- Add `aria-hidden="true"` to decorative SVG icons inside buttons with `aria-label`
- Use `useEscapeKey` hook for keyboard dismissal (supports `disabled` state during async operations)
- Use `useId()` for form label/input associations
- Tooltips on interactive elements use `title` attribute (e.g., cart button has `title="Tus pedidos"`)
- Use `useAriaAnnounce` hook to announce important state changes to screen readers (e.g., items added to cart)

### UI Component Architecture

**Header.tsx:**
- Hamburger menu (mobile language selector) appears ONLY when session exists
- Language flags visible on desktop only (`hidden md:flex`)
- Cart button positioned before hamburger menu
- Call waiter functionality removed from header (now in BottomNav)

**BottomNav.tsx:**
- AI star button floats above nav bar (centered, with negative margin `-mb-6 sm:-mb-7`)
- Three buttons below in horizontal row: Mozo (call waiter), Pedidos (order history), Cuenta (request bill)
- All buttons have `max-w-[120px]` for consistent sizing
- Buttons disabled when no session (`disabled={!session}`)
- Order history button displays "Ronda {currentRound}" when orders exist (e.g., "Ronda 1", "Ronda 2")

**ProductDetailModal.tsx:**
- Uses bell icon for "Call Waiter" button (same as BottomNav) - consistent iconography across app

**HamburgerMenu.tsx:**
- Slide-in panel from right with backdrop
- Z-index: backdrop `z-30`, panel `z-40` (lower than SharedCart's `z-50`)
- Uses `useEscapeKey` for keyboard dismissal
- Prevents body scroll when open via `useEffect`

## Environment Variables

```bash
VITE_API_URL=          # Backend API endpoint
VITE_RESTAURANT_ID=    # Restaurant identifier (default: "default")
VITE_MP_PUBLIC_KEY=    # Mercado Pago public key (TEST-xxx for sandbox, APP_USR-xxx for production)
```

## Table Session Flow

1. QR scan → JoinTable → enter table number & name
2. Home → browse products, manage shared cart
3. **Group Confirmation** → diner proposes to send, all must confirm
4. Submit orders → creates OrderRecord (rounds)
5. CloseTable → split bill (equal, by consumption, custom)
6. Payment → choose method (Mercado Pago, card, cash) → PaymentResult page handles MP redirect
7. Leave → session reset

### Round Confirmation (Confirmación Grupal)

Prevents accidental order submission by requiring all diners to confirm:

```typescript
// Selectors for confirmation state
import { useRoundConfirmation, useRoundConfirmationActions, useRoundConfirmationData } from './stores/tableStore'

// Get current confirmation state
const confirmation = useRoundConfirmation()  // RoundConfirmation | null

// Get actions
const { proposeRound, confirmReady, cancelReady, cancelRoundProposal } = useRoundConfirmationActions()

// Get computed data
const { confirmationCount, allReady, hasCurrentDinerConfirmed, isProposer } = useRoundConfirmationData()
```

**Flow:**
1. Diner clicks "Proponer enviar pedido" → `proposeRound()`
2. All diners see `RoundConfirmationPanel` with status
3. Each diner clicks "Estoy listo" → `confirmReady()`
4. When `allReady` → auto-submits after 1.5s delay
5. Expires after 5 minutes or proposer cancels

**Key types** (`src/types/session.ts`):
- `RoundConfirmation`: Proposal state with diner statuses
- `DinerReadyStatus`: Per-diner ready/waiting status
- `RoundConfirmationStatus`: 'pending' | 'confirmed' | 'cancelled' | 'expired'

**i18n keys**: `roundConfirmation.*` namespace in es.json/en.json

### Mercado Pago Payment Flow

1. User selects Mercado Pago in `CloseStatusView` (bill_ready state)
2. `mercadoPago.ts` creates preference via backend API (or mock in dev)
3. Redirect to MP checkout (`sandbox_init_point` for test, `init_point` for prod)
4. MP redirects back to `/payment/success` with query params
5. `PaymentResult.tsx` parses params and shows approved/pending/rejected state
6. User leaves table or retries

## Backend Integration (Phase 9)

pwaMenu now integrates with the backend API with automatic fallback to mock data when backend is unavailable.

### API Service (`src/services/api.ts`)

Table token authentication for diner operations:

```typescript
import { sessionAPI, dinerAPI, billingAPI, menuAPI, setTableToken, getTableToken } from './api'

// On table join - stores token in localStorage
setTableToken(response.table_token)

// All diner API calls use tableAuth: true to add X-Table-Token header
dinerAPI.submitRound({ items })  // Auto-adds header
```

### New Stores

| Store | Purpose |
|-------|---------|
| `menuStore.ts` | Loads menu from `/api/public/menu/{slug}` with 5min cache, converts backend types to frontend |
| `sessionStore.ts` | Backend session management (alternative to tableStore for pure backend flow) |

### WebSocket Service (`src/services/websocket.ts`)

```typescript
import { dinerWS } from './websocket'

// Auto-connects on table join
dinerWS.connect()  // Uses table token from localStorage

// Listen for events
const unsubscribe = dinerWS.on('ROUND_SERVED', (event) => {
  // Handle round served
})

// Cleanup
dinerWS.disconnect()
```

### Backend-Aware tableStore

The existing tableStore now detects backend sessions and uses appropriate APIs:

```typescript
// joinTable() is now async
await joinTable(tableId, tableName, dinerName)
// If tableId is numeric → calls backend /api/tables/{id}/session
// Stores backend_session_id and backend_table_id in session

// submitOrder() checks for backend session
if (session.backend_session_id) {
  // Calls /api/diner/rounds/submit with table token
  // Includes diner name in notes: "[DinerName] special instructions"
}

// closeTable() requests check from backend
if (session.backend_session_id) {
  // Calls /api/billing/check/request
}
```

### Type Conversions

Backend uses different formats than frontend:

| Field | Backend | Frontend | Conversion |
|-------|---------|----------|------------|
| IDs | `number` | `string` | `String(id)` / `parseInt(id, 10)` |
| Prices | cents (`12550`) | pesos (`125.50`) | `/ 100` / `* 100` |
| Session status | `OPEN`/`PAYING` | `active`/`paying` | lowercase |

Conversion helpers in `Home.tsx`:
```typescript
function convertBackendProduct(prod: ProductFrontend): Product
function convertBackendCategory(cat: CategoryFrontend): Category
function convertBackendSubcategory(sub, categoryId): Subcategory
```

### Environment Variables (Backend)

```bash
VITE_API_URL=http://localhost:8000/api   # Backend REST API
VITE_WS_URL=ws://localhost:8001          # Backend WebSocket gateway
VITE_BRANCH_SLUG=demo-branch             # Branch slug for menu loading
```

## Known Architectural Limitations

See `AUDITORIA_CODIGO.md` for detailed analysis. Key points:

- **Shared cart sync** - Cart is local-only; WebSocket events can update round status but cart remains per-device
- **Diner identity** - Backend has no Diner model; diner names are embedded in RoundItem.notes field

### Key Architectural Decisions

- **No Google OAuth** - Authentication relies only on table sessions (table token), no user auth
- **Session expiry** - 8h inactivity-based (uses `last_activity` field, not `created_at`)
- **Multi-tab sync** - Storage event listener syncs cart across tabs; other tab is source of truth
- **Race condition guards** - `_submitting` flag in submitOrder, throttled quantity buttons (50ms), triple-validation on session expiry
- **Memory leak patterns** - Throttle map capped at 1000 entries, pendingRequests Map capped at 100, useAriaAnnounce creates DOM node once on mount
- **SSRF prevention** - API base URL validated against allowed hosts, blocks IPv4/IPv6 addresses and URL credentials
