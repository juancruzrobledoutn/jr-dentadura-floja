# Arquitectura de pwaMenu (Sabor)

## Índice

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Stack Tecnológico](#stack-tecnológico)
3. [Estructura de Directorios](#estructura-de-directorios)
4. [Sistema de Estado Zustand](#sistema-de-estado-zustand)
5. [Componentes Principales](#componentes-principales)
6. [Hooks Personalizados](#hooks-personalizados)
7. [Sistema de API](#sistema-de-api)
8. [Integración WebSocket](#integración-websocket)
9. [Sistema de Filtrado Avanzado](#sistema-de-filtrado-avanzado)
10. [Carrito Compartido](#carrito-compartido)
11. [Confirmación Grupal](#confirmación-grupal)
12. [Sistema de Fidelización](#sistema-de-fidelización)
13. [Configuración PWA](#configuración-pwa)
14. [Internacionalización](#internacionalización)
15. [Tipos TypeScript](#tipos-typescript)
16. [Patrones de React 19](#patrones-de-react-19)
17. [Flujos de Datos](#flujos-de-datos)
18. [Seguridad y Validación](#seguridad-y-validación)

---

## Resumen Ejecutivo

**pwaMenu** ("Sabor") es una Progressive Web App para menús digitales compartidos en restaurantes. Los comensales en una mesa colaboran para hacer pedidos desde un carrito compartido, dividen cuentas, pagan mediante Mercado Pago y pueden ser reconocidos en futuras visitas mediante el sistema de fidelización.

### Características Arquitectónicas Clave

- **React 19 + TypeScript** con tipado estricto y nuevos hooks (useActionState, useOptimistic)
- **Zustand** para gestión de estado con persistencia en localStorage y sincronización multi-tab
- **PWA** con estrategia offline-first mediante Workbox y Service Workers
- **i18n** trilingüe (español, inglés, portugués) con fallback inteligente
- **WebSocket** para actualizaciones en tiempo real del estado de pedidos
- **Fidelización** en 4 fases: device tracking, preferencias implícitas, reconocimiento, customer opt-in
- **Mercado Pago** integrado para checkout de pagos
- **Filtrado avanzado** de alérgenos con reacciones cruzadas, opciones dietéticas y métodos de cocción

---

## Stack Tecnológico

```
┌─────────────────────────────────────────────────────────────┐
│                         FRONTEND                             │
├─────────────────────────────────────────────────────────────┤
│  Framework:     React 19 + TypeScript 5.9                   │
│  Bundler:       Vite 7                                       │
│  Styling:       Tailwind CSS 4                               │
│  State:         Zustand 5 (con persistencia)                │
│  i18n:          i18next + react-i18next                     │
│  PWA:           vite-plugin-pwa + Workbox                   │
│  Payments:      Mercado Pago SDK                            │
│  Testing:       Vitest + Testing Library                    │
└─────────────────────────────────────────────────────────────┘
```

### Dependencias Principales

```json
{
  "react": "^19.0.0",
  "zustand": "^5.0.0",
  "i18next": "^24.0.0",
  "vite-plugin-pwa": "^0.21.0",
  "@mercadopago/sdk-react": "^0.0.19",
  "tailwindcss": "^4.0.0"
}
```

---

## Estructura de Directorios

```
pwaMenu/
├── public/
│   ├── pwa-192x192.png, pwa-512x512.png    # PWA icons
│   ├── fallback-product.svg                 # Fallback images
│   └── screenshots/                         # PWA screenshots
│
├── src/
│   ├── main.tsx                    # Entry point + device fingerprint init
│   ├── App.tsx                     # Root con SW registration + routing
│   ├── index.css                   # Tailwind + custom globals
│   │
│   ├── pages/                      # Rutas principales
│   │   ├── Home.tsx                # Menú principal (lazy components)
│   │   ├── CloseTable.tsx          # División de cuenta
│   │   └── PaymentResult.tsx       # Resultado pago Mercado Pago
│   │
│   ├── components/                 # Componentes reutilizables
│   │   ├── Header.tsx              # Barra superior
│   │   ├── BottomNav.tsx           # Navegación inferior
│   │   ├── CategoryTabs.tsx        # Tabs de categorías
│   │   ├── ProductCard.tsx         # Card de producto
│   │   ├── ProductDetailModal.tsx  # Modal detalle (useActionState)
│   │   ├── SharedCart.tsx          # Carrito compartido
│   │   ├── AdvancedFiltersModal.tsx # Filtros avanzados
│   │   ├── JoinTable/              # Wizard de entrada a mesa
│   │   ├── AIChat/                 # Chat IA recomendaciones
│   │   ├── cart/                   # Subcomponentes carrito
│   │   │   ├── CartItemCard.tsx
│   │   │   ├── RoundConfirmationPanel.tsx
│   │   │   └── OrderSuccess.tsx
│   │   ├── close-table/            # Subcomponentes cierre
│   │   └── ui/                     # Primitivas UI
│   │
│   ├── stores/                     # Zustand stores
│   │   ├── tableStore/             # Store modular principal
│   │   │   ├── store.ts            # Actions + state (800+ líneas)
│   │   │   ├── types.ts            # TableState interface
│   │   │   ├── selectors.ts        # Hooks con useMemo
│   │   │   └── helpers.ts          # Funciones puras
│   │   ├── menuStore.ts            # Menú desde backend
│   │   └── serviceCallStore.ts     # Llamadas de servicio
│   │
│   ├── hooks/                      # Hooks personalizados
│   │   ├── useOptimisticCart.ts    # React 19 optimistic updates
│   │   ├── useAsync.ts             # Async con AbortController
│   │   ├── useDebounce.ts          # Debounce con race fix
│   │   ├── useAllergenFilter.ts    # Filtrado alérgenos
│   │   ├── useDietaryFilter.ts     # Filtrado dietético
│   │   ├── useOrderUpdates.ts      # WebSocket listener
│   │   ├── useImplicitPreferences.ts # Sync preferencias
│   │   └── useCustomerRecognition.ts # Reconocimiento cliente
│   │
│   ├── services/                   # Integraciones externas
│   │   ├── api.ts                  # REST client + SSRF prevention
│   │   ├── websocket.ts            # WebSocket diner
│   │   └── mercadoPago.ts          # Integración MP
│   │
│   ├── types/                      # Tipos TypeScript
│   │   ├── backend.ts              # Tipos API (snake_case)
│   │   ├── session.ts              # Tipos frontend (camelCase)
│   │   └── catalog.ts              # Categorías/productos
│   │
│   ├── i18n/                       # Internacionalización
│   │   ├── index.ts                # Config i18next
│   │   └── locales/{es,en,pt}.json # Traducciones
│   │
│   ├── constants/                  # Constantes globales
│   │   ├── index.ts                # Config UI/API
│   │   └── timing.ts               # Timing constants
│   │
│   └── utils/                      # Utilidades
│       ├── logger.ts               # Logger centralizado
│       ├── errors.ts               # AppError/ApiError
│       ├── validation.ts           # Validación input
│       └── deviceId.ts             # Device fingerprint
│
├── vite.config.ts                  # Vite + PWA config
└── tsconfig.json                   # TypeScript strict
```

---

## Sistema de Estado Zustand

### Arquitectura del Store Principal

El `tableStore` es un store modular con persistencia en localStorage y TTL de 8 horas de inactividad:

```
tableStore/
├── store.ts      # State + Actions (800+ líneas)
├── types.ts      # TableState interface
├── selectors.ts  # React hooks con useMemo/useShallow
├── helpers.ts    # Funciones puras (cálculos, validaciones)
└── index.ts      # Re-exports públicos
```

### Estado Principal (types.ts)

```typescript
interface TableState {
  // Core Session
  session: TableSession | null
  currentDiner: Diner | null

  // Loading States
  isLoading: boolean
  isSubmitting: boolean      // Race condition prevention

  // Order History
  orders: OrderRecord[]
  currentRound: number
  lastOrderId: string | null
  submitSuccess: boolean

  // Payment
  dinerPayments: DinerPayment[]

  // Flags
  isStale: boolean
}

interface TableSession {
  id: string
  tableNumber: string
  diners: Diner[]
  sharedCart: CartItem[]
  roundConfirmation: RoundConfirmation | null
  backendSessionId?: number
  lastActivity?: string      // TTL tracking
}
```

### Patrón Crítico: Selectores Estables

Para evitar re-renders infinitos en React 19, todos los selectores usan referencias estables:

```typescript
// ❌ INCORRECTO - Causa infinite loops
const items = useTableStore()  // Re-obtiene TODO el store

// ✅ CORRECTO - Subscribe solo a lo necesario
const EMPTY_CART_ITEMS: CartItem[] = []

export const useCartItems = () =>
  useTableStore((state) => state.session?.sharedCart ?? EMPTY_CART_ITEMS)

// ✅ Para objetos, usar useShallow
export const useCartActions = () =>
  useTableStore(
    useShallow((state) => ({
      updateQuantity: state.updateQuantity,
      removeItem: state.removeItem,
    }))
  )

// ✅ Para valores derivados, usar useMemo externo
export const useHeaderData = () => {
  const session = useTableStore((state) => state.session)
  const diners = useMemo(() => session?.diners ?? EMPTY_DINERS, [session?.diners])
  return { session, diners }
}
```

### Session TTL Pattern

```typescript
// Verificar contra last_activity, no created_at
// Permite sesiones indefinidas mientras haya actividad
export const isSessionExpired = (createdAt: string, lastActivity?: string): boolean => {
  const activity = lastActivity
    ? new Date(lastActivity).getTime()
    : new Date(createdAt).getTime()
  return Date.now() - activity > SESSION_EXPIRY_MS  // 8 horas
}
```

### Sincronización Multi-Tab

```typescript
// En App.tsx - escuchar storage events de otras tabs
useEffect(() => {
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === 'pwamenu-table-storage') {
      syncFromStorage()  // Merge con estado local
    }
  }
  window.addEventListener('storage', handleStorageChange)
  return () => window.removeEventListener('storage', handleStorageChange)
}, [syncFromStorage])
```

---

## Componentes Principales

### Jerarquía de Componentes

```
App.tsx
├── ErrorBoundary
├── Header (si hay sesión)
├── Routes
│   ├── Home
│   │   ├── JoinTable (si no hay sesión)
│   │   ├── CategoryTabs
│   │   ├── ProductCard[] (lazy)
│   │   ├── ProductDetailModal (lazy, Suspense)
│   │   └── SharedCart (lazy, Suspense)
│   ├── CloseTable
│   │   ├── TabSelector
│   │   ├── SummaryTab / OrdersList / DinersList
│   │   └── CloseStatusView
│   └── PaymentResult
├── BottomNav (si hay sesión)
└── Modals (AIChat, CallWaiter, Filters, etc.)
```

### ProductDetailModal - useActionState

```typescript
// React 19 pattern para form submission
const [formState, formAction, isPending] = useActionState(
  async (prevState, formData) => {
    const quantity = Number(formData.get('quantity'))

    // Validaciones
    if (quantity < 1 || quantity > 99) {
      return { error: 'validation.invalidQuantity' }
    }

    // Optimistic update + submit
    addToCartOptimistic({ productId, quantity, ... })

    return { success: true }
  },
  { error: null, success: false }
)
```

### SharedCart - Suspense Boundary

```typescript
<Suspense fallback={<CartSkeleton />}>
  <SharedCart isOpen={isCartOpen} onClose={handleClose} />
</Suspense>
```

Internamente maneja:
- Deduplicación por `productId + dinerId`
- `RoundConfirmationPanel` para confirmación grupal
- Auto-close después de orden exitosa

---

## Hooks Personalizados

### useOptimisticCart - React 19

```typescript
const { optimisticItems, isPending, addToCartOptimistic } = useOptimisticCart({
  cartItems,
  currentDinerId,
  onAddToCart: addToCart,
})

// Patrón interno:
// 1. useOptimistic actualiza UI al instante
// 2. useTransition marca como pending
// 3. Store syncs en background
// 4. Si falla, revierte automáticamente
```

### useAsync - Operaciones Asincrónicas

```typescript
const { status, data, error, execute, cancel } = useAsync<OrderResult>()

// Características:
// - AbortController para cancelación
// - useIsMounted para memory leak prevention
// - Cleanup automático en unmount
```

### useDebounce - Con Race Condition Fix

```typescript
const { debouncedValue } = useDebounce(searchQuery, 300)

// Efecto separado para setup/cleanup vs value change
useEffect(() => {
  const timer = setTimeout(() => setDebouncedValue(value), delayMs)
  return () => clearTimeout(timer)
}, [value, delayMs])
```

### useAllergenFilter - Filtrado Avanzado

```typescript
const {
  excludedAllergenIds,
  strictness,              // 'strict' | 'very_strict'
  crossReactionsEnabled,
  toggleAllergen,
  filterProducts,
} = useAllergenFilter(branchSlug)

// Cross-reactions cache en sessionStorage (5 min TTL)
// Sync automático con backend via PATCH /api/diner/preferences
```

### useOrderUpdates - WebSocket Listener

```typescript
useOrderUpdates()  // Subscribe a eventos de ronda

// Eventos manejados:
// ROUND_IN_KITCHEN → status = 'confirmed'
// ROUND_READY → status = 'ready'
// ROUND_SERVED → status = 'delivered'
```

---

## Sistema de API

### Arquitectura del Cliente

```typescript
// Diseño defensivo con:
// - Table token auth (X-Table-Token header)
// - Request deduplication
// - SSRF prevention
// - Timeouts configurables

export const sessionAPI = {
  createOrGetSession: (tableId: number) => {...},
  createOrGetSessionByCode: (code: string, branchSlug?: string) => {...},
}

export const dinerAPI = {
  registerDiner: (data) => {...},
  submitRound: (data) => {...},
  getSession: (sessionId) => {...},
}

export const billingAPI = {
  requestCheck: () => {...},
  createMercadoPagoPreference: (checkId) => {...},
}

export const menuAPI = {
  getMenu: (branchSlug) => {...},      // Public, sin auth
  getAllergens: (branchSlug) => {...},
}
```

### SSRF Prevention

```typescript
function isValidApiBase(url: string): boolean {
  if (url.startsWith('/') && !url.startsWith('//')) return true

  const parsed = new URL(url)

  // Block IP addresses
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
  if (ipv4Regex.test(parsed.hostname)) {
    throw new ApiError('IP addresses not allowed', 0, ERROR_CODES.VALIDATION)
  }

  // Block URL credentials
  if (parsed.username || parsed.password) {
    throw new ApiError('Credentials not allowed', 0, ERROR_CODES.VALIDATION)
  }

  return ALLOWED_HOSTS.has(parsed.hostname)
}
```

### Request Deduplication

```typescript
const pendingRequests = new Map<string, Promise<unknown>>()

// Si ya hay request idéntico en vuelo, retornar ese
if (pendingRequests.has(key)) {
  return pendingRequests.get(key)!
}

pendingRequests.set(key, promise)
promise.finally(() => pendingRequests.delete(key))
```

---

## Integración WebSocket

### DinerWebSocket Service

```typescript
class DinerWebSocket {
  private ws: WebSocket | null = null
  private listeners: Map<WSEventType | '*', Set<EventCallback>> = new Map()
  private reconnectAttempts = 0

  connect(): void {
    const delay = this.calculateBackoffDelay()
    setTimeout(() => {
      this.ws = new WebSocket(`${WS_BASE}/ws/diner?token=${getTableToken()}`)
      this.setupListeners()
      this.setupHeartbeat()  // 30s interval
    }, delay)
  }

  // Exponential backoff con jitter
  private calculateBackoffDelay(): number {
    const delay = Math.min(
      BASE_DELAY * Math.pow(2, this.reconnectAttempts),
      MAX_DELAY
    )
    return delay + (delay * Math.random() * JITTER_FACTOR)
  }

  on(eventType: WSEventType | '*', callback: EventCallback): () => void {
    // Retorna unsubscribe function
  }
}

export const dinerWS = new DinerWebSocket()
```

### Eventos Soportados

```typescript
type WSEventType =
  | 'ROUND_SUBMITTED'
  | 'ROUND_IN_KITCHEN'
  | 'ROUND_READY'
  | 'ROUND_SERVED'
  | 'SERVICE_CALL_CREATED'
  | 'SERVICE_CALL_ACKED'
  | 'CHECK_REQUESTED'
  | 'PAYMENT_APPROVED'
  | 'PAYMENT_REJECTED'
  | 'CHECK_PAID'
  | 'TABLE_CLEARED'
```

### Reconnection en Visibility Change

```typescript
// Reconectar cuando página vuelve visible (después de sleep)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (!this.isConnected()) {
      this.reconnectAttempts = 0
      this.connect()
    }
  }
})
```

---

## Sistema de Filtrado Avanzado

### Tres Sistemas de Filtros

#### 1. Alérgenos (useAllergenFilter)

```typescript
interface AllergenFilter {
  excludedAllergenIds: number[]
  strictness: 'strict' | 'very_strict'
  crossReactionsEnabled: boolean
}

// 'strict': Excluir productos que CONTIENEN el alérgeno
// 'very_strict': Excluir CONTAINS + MAY_CONTAIN

// Cross-reactions: ej. síndrome látex-frutas
// Si excluyo látex, también excluir kiwi, banana, aguacate
```

#### 2. Dietético (useDietaryFilter)

```typescript
type DietaryOption =
  | 'vegetarian' | 'vegan' | 'glutenFree'
  | 'dairyFree' | 'celiacSafe' | 'keto' | 'lowSodium'

// Lógica OR: mostrar productos que cumplan CUALQUIERA de las opciones
```

#### 3. Métodos de Cocción (useCookingMethodFilter)

```typescript
interface CookingFilter {
  excludedMethods: CookingMethod[]  // Ej: excluir 'fried'
  requireMethods: CookingMethod[]   // Ej: requerir 'grilled'
}
```

### Orquestación (useAdvancedFilters)

```typescript
const { combinedFilteredProducts, hasActiveFilters, resetAllFilters } =
  useAdvancedFilters(allProducts)

// Aplica los 3 filtros en cascada:
// allProducts → allergenFilter → dietaryFilter → cookingFilter
```

---

## Carrito Compartido

### Modelo de Datos

```typescript
interface CartItem {
  id: string              // UUID temp o backend ID
  productId: string
  name: string
  price: number           // En pesos (no centavos)
  quantity: number
  dinerId: string         // Quién lo agregó
  dinerName: string
  notes?: string
  _submitting?: boolean   // Flag para race condition
}
```

### Permisos de Modificación

```typescript
// Solo el diner que agregó puede modificar
canModifyItem: (item: CartItem): boolean => {
  return item.dinerId === currentDiner?.id
}
```

### Optimistic Updates

El hook `useOptimisticCart` proporciona:
1. UI instant feedback via `useOptimistic`
2. Pending state via `useTransition`
3. Auto-revert si falla el backend

---

## Confirmación Grupal

### Flujo de Confirmación

```
1. Diner propone enviar → proposeRound()
   └── Crea RoundConfirmation con 5 min timeout

2. Todos ven RoundConfirmationPanel
   └── Estado de cada diner: listo/esperando

3. Cada diner confirma → confirmReady()
   └── Marca isReady=true

4. Cuando todos confirman
   └── Auto-submit después de 1.5s delay

5. Si expira (5 min)
   └── cancelRoundProposal()
```

### Estado de Confirmación

```typescript
interface RoundConfirmation {
  id: string
  proposedBy: string           // dinerId
  proposedByName: string
  proposedAt: string           // ISO timestamp
  dinerStatuses: DinerReadyStatus[]
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired'
  expiresAt: string            // now + 5 min
}

interface DinerReadyStatus {
  dinerId: string
  dinerName: string
  isReady: boolean
  readyAt?: string
}
```

---

## Sistema de Fidelización

### Fase 1: Device Tracking

```typescript
// UUID persistido en localStorage
const deviceId = crypto.randomUUID()
localStorage.setItem('device_id', deviceId)

// Fingerprint del navegador para cross-session
const fingerprint = generateDeviceFingerprint()

// GET /api/diner/device/{device_id}/history
// → Historial de visitas del device
```

### Fase 2: Preferencias Implícitas

```typescript
// Auto-sync de filtros con backend
const { loadPreferences, syncPreferences } = useImplicitPreferences(branchSlug)

// PATCH /api/diner/preferences
{
  excluded_allergen_ids: [1, 3],
  dietary_preferences: ['vegetarian'],
  excluded_cooking_methods: ['fried'],
  cross_reactions_enabled: true,
  strictness: 'strict'
}
```

### Fase 4: Customer Opt-in

```typescript
// Registro opcional con consentimiento GDPR
POST /api/customer/register
{
  name: string,
  email?: string,
  device_id: string,
  data_consent: boolean,
  marketing_consent?: boolean,
  ai_personalization_enabled?: boolean
}

// Reconocimiento en próximas visitas
GET /api/customer/recognize
→ { recognized: true, customer_name: "Juan", visit_count: 5 }

// Sugerencias personalizadas
GET /api/customer/suggestions
→ { favorites: [...], recommendations: [...] }
```

---

## Configuración PWA

### Manifest y Icons

```typescript
// vite.config.ts
VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name: 'Sabor - Menú Digital',
    short_name: 'Sabor',
    theme_color: '#f97316',
    display: 'standalone',
    icons: [
      { src: 'pwa-192x192.png', sizes: '192x192' },
      { src: 'pwa-512x512.png', sizes: '512x512', purpose: 'maskable' },
    ],
  },
})
```

### Estrategias de Caching

| Recurso | Estrategia | TTL |
|---------|------------|-----|
| Product images | CacheFirst | 30 días |
| External APIs | NetworkFirst (10s timeout) | 24 horas |
| Local APIs | NetworkFirst (5s timeout) | 1 hora |
| Google Fonts | CacheFirst | 1 año |
| App shell | Precache | Build-time |

### Service Worker Lifecycle

```typescript
// Check updates cada hora
const sw = registerSW({
  onNeedRefresh() {
    setNeedRefresh(true)  // Mostrar botón de update
  },
  onRegistered(registration) {
    setInterval(() => registration.update(), 60 * 60 * 1000)
  },
})
```

---

## Internacionalización

### Configuración

```typescript
i18n
  .use(validatedLanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { es, en, pt },
    fallbackLng: {
      en: ['es'],
      pt: ['es'],
      default: ['es'],  // Spanish es el más completo
    },
    supportedLngs: ['es', 'en', 'pt'],
  })
```

### Detector Validado

```typescript
// Prevenir injection de lenguajes inválidos
const validatedLanguageDetector = {
  lookup() {
    const stored = localStorage.getItem('pwamenu-language')
    if (stored && SUPPORTED_LANGUAGES.includes(stored)) {
      return stored
    }
    return undefined
  },
}
```

### Estructura de Traducciones

```json
{
  "header": { "cartButton": "Carrito" },
  "bottomNav": {
    "callWaiter": "Mozo",
    "roundLabel": "Ronda {{roundNumber}}"
  },
  "roundConfirmation": {
    "propose": "Proponer enviar pedido",
    "waiting": "Esperando..."
  },
  "errors": {
    "timeout": "Operación tardó demasiado",
    "networkError": "Error de conexión"
  }
}
```

---

## Tipos TypeScript

### Convención de Naming

```
Backend Types (snake_case)    →    Frontend Types (camelCase)
TableSessionResponse                TableSession
ProductAPI                          Product
DinerOutput                         Diner
RegisterDinerRequest                AddToCartInput
```

### Tipos Core

```typescript
// Session
type SessionStatus = 'active' | 'closed' | 'paying'
type OrderStatus = 'submitted' | 'confirmed' | 'preparing' | 'ready' | 'delivered'
type PaymentMethod = 'cash' | 'card' | 'transfer' | 'mixed'
type SplitMethod = 'equal' | 'byConsumption' | 'custom'

// Entities
interface Diner {
  id: string
  name: string
  avatarColor: string
  joinedAt: string
  isCurrentUser: boolean
  backendDinerId?: number
}

interface CartItem {
  id: string
  productId: string
  name: string
  price: number
  quantity: number
  dinerId: string
  dinerName: string
  notes?: string
}
```

---

## Patrones de React 19

### 1. useActionState - Forms

```typescript
const [formState, formAction, isPending] = useActionState(
  async (prevState, formData) => {
    // Procesar form
    return { success: true }
  },
  initialState
)

<form action={formAction}>
  <button disabled={isPending}>Submit</button>
</form>
```

### 2. useOptimistic - Instant UI

```typescript
const [optimisticItems, addOptimistic] = useOptimistic(
  items,
  (state, newItem) => [...state, newItem]
)

// UI se actualiza inmediatamente
// Si server falla, revierte automáticamente
```

### 3. useTransition - Non-Blocking

```typescript
const [isPending, startTransition] = useTransition()

startTransition(() => {
  setSearchQuery(value)  // No bloquea UI
})

{isPending && <Spinner />}
```

---

## Flujos de Datos

### Flujo: QR Scan → Join Table

```
QRSimulator.scan(tableNumber)
  ↓
JoinTable (useActionState)
  ├─ Paso 1: Validar número mesa
  └─ Paso 2: Nombre diner (opcional)
  ↓
tableStore.joinTable()
  ├─ GET /api/tables/code/{code}/session
  ├─ setTableToken(response.table_token)
  ├─ dinerWS.connect()
  └─ POST /api/diner/register
  ↓
Home (menú visible)
```

### Flujo: Add to Cart → Submit Order

```
ProductCard.click()
  ↓
ProductDetailModal (lazy)
  ├─ Select quantity (1-99)
  └─ useActionState submit
  ↓
addToCartOptimistic() → UI instant
  ↓
tableStore.addToCart()
  ├─ Crear CartItem
  ├─ Update lastActivity (TTL)
  └─ Persist localStorage
  ↓
proposeRound()
  ├─ Crear RoundConfirmation
  └─ 5 min timeout
  ↓
Diners confirman (confirmReady)
  ↓
submitOrder() (auto after all ready)
  ├─ POST /api/diner/rounds/submit
  ├─ Clear cart + confirmation
  └─ Show success animation
  ↓
useOrderUpdates() (WebSocket)
  └─ Update order status en tiempo real
```

---

## Seguridad y Validación

### Input Validation

```typescript
// Table number: alfanumérico, 1-10 chars
function validateTableNumber(value: string): ValidationResult {
  if (!/^[0-9a-zA-Z\-]{1,10}$/.test(value.trim())) {
    return { isValid: false, error: 'validation.tableInvalid' }
  }
  return { isValid: true }
}

// Diner name: max 50 chars
function validateDinerName(value: string): ValidationResult {
  if (value.trim().length > 50) {
    return { isValid: false, error: 'validation.dinerNameTooLong' }
  }
  return { isValid: true }
}

// Image URLs: block localhost, IPs
function validateImageUrl(url: string): string | null {
  const parsed = new URL(url)
  if (['localhost', '127.0.0.1'].includes(parsed.hostname)) {
    return null
  }
  return url
}
```

### Authentication

```typescript
// Table Token en localStorage
export function setTableToken(token: string | null): void {
  if (token) {
    localStorage.setItem('table_token', token)
  } else {
    localStorage.removeItem('table_token')
  }
}

// Header X-Table-Token en requests
if (tableToken) {
  headers['X-Table-Token'] = tableToken
}
```

### Session Expiry

```typescript
if (session && isSessionExpired(session.createdAt, session.lastActivity)) {
  // Mostrar SessionExpiredModal
  // Limpiar session
  leaveTable()
}
```

---

## Patrones y Best Practices

### 1. Stable Empty References

```typescript
const EMPTY_CART_ITEMS: CartItem[] = []
const EMPTY_DINERS: Diner[] = []

// Previene re-renders cuando array está vacío
```

### 2. useShallow para Objects

```typescript
import { useShallow } from 'zustand/react/shallow'

export const useCartActions = () =>
  useTableStore(useShallow((s) => ({
    addToCart: s.addToCart,
    removeItem: s.removeItem,
  })))
```

### 3. useRef para Callbacks Estables

```typescript
const onCloseRef = useRef(onClose)
useEffect(() => { onCloseRef.current = onClose }, [onClose])

// Timer usa ref para evitar stale closure
setTimeout(() => onCloseRef.current(), 2000)
```

### 4. Centralized Logger

```typescript
// Nunca console.* directo
import { logger } from '@/utils/logger'

logger.info('Order submitted', { orderId })
logger.error('API failed', error)

// Módulos pre-configurados
export const tableStoreLogger = logger.module('TableStore')
```

### 5. Lazy Loading

```typescript
const ProductDetailModal = lazy(() => import('./ProductDetailModal'))

<Suspense fallback={<Skeleton />}>
  <ProductDetailModal />
</Suspense>
```

---

## Testing

### Configuración

- **Framework**: Vitest + Testing Library
- **Coverage**: 108 tests
- **Setup**: `src/test/setup.ts` con JSDOM

### Ejecutar Tests

```bash
npm run test          # Watch mode
npm run test -- --run # CI mode
npm test -- src/stores/tableStore/store.test.ts  # Single file
```

---

## Variables de Entorno

```bash
# .env.example
VITE_API_URL=http://localhost:8000/api
VITE_WS_URL=ws://localhost:8001
VITE_BRANCH_SLUG=demo-branch
VITE_MP_PUBLIC_KEY=TEST-xxx
```

---

*Documentación arquitectónica de pwaMenu — Versión 2026.01*
