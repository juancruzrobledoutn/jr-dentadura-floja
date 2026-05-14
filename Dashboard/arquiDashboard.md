# Arquitectura del Dashboard

Este documento describe en profundidad la arquitectura del panel de administración Buen Sabor, detallando los principios de diseño, patrones implementados, flujos de datos y decisiones técnicas que conforman el sistema.

---

## Tabla de Contenidos

1. [Principios Arquitectónicos](#principios-arquitectónicos)
2. [Arquitectura por Capas](#arquitectura-por-capas)
3. [Patrones de Diseño](#patrones-de-diseño)
4. [Gestión de Estado](#gestión-de-estado)
5. [Arquitectura de Componentes](#arquitectura-de-componentes)
6. [Flujos de Datos](#flujos-de-datos)
7. [Cliente API](#cliente-api)
8. [Integración WebSocket](#integración-websocket)
9. [Sistema de Permisos](#sistema-de-permisos)
10. [Manejo de Formularios](#manejo-de-formularios)
11. [Resiliencia y Manejo de Errores](#resiliencia-y-manejo-de-errores)
12. [Optimización de Rendimiento](#optimización-de-rendimiento)
13. [Arquitectura de Testing](#arquitectura-de-testing)
14. [Configuración de Build](#configuración-de-build)

---

## Principios Arquitectónicos

El Dashboard se construye sobre principios fundamentales que guían cada decisión de diseño:

### Acceso a Estado Basado en Selectores

La compatibilidad con React 19 exige un patrón estricto de selectores para prevenir bucles infinitos de re-renderizado. Nunca se debe desestructurar directamente desde los stores de Zustand:

```typescript
// CORRECTO: Uso de selectores
const products = useProductStore(selectProducts)
const isLoading = useProductStore(selectIsLoading)

// INCORRECTO: Desestructuración directa (causa bucles infinitos)
// const { products, isLoading } = useProductStore()
```

### Inicialización Lazy

Todos los datos de entidades se obtienen del backend API. No existe data mock ni enfoque local-first. Los stores inician vacíos y se pueblan mediante llamadas API autenticadas.

### Separación Estricta de Responsabilidades

Cada capa tiene una responsabilidad única y bien definida. Los componentes UI no realizan llamadas API directamente, los stores no ejecutan lógica de negocio compleja, y los servicios no importan componentes UI.

### Composición sobre Herencia

Los hooks personalizados como `useFormModal` y `useConfirmDialog` eliminan más de 370 líneas de código duplicado mediante composición, sin recurrir a herencia de clases o mixins.

### Operaciones Atómicas con Rollback

El servicio de eliminación en cascada implementa snapshot/restore para garantizar atomicidad. Si cualquier operación falla, el estado completo se restaura a su punto anterior.

---

## Arquitectura por Capas

El sistema se organiza en cinco capas claramente delimitadas:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CAPA DE PRESENTACIÓN                                 │
│                                                                              │
│   Pages (19)  ─────────►  Components  ─────────►  UI Primitives             │
│   Dashboard.tsx           Layout.tsx              Button, Input             │
│   Products.tsx            Sidebar.tsx             Modal, Table              │
│   Tables.tsx              Header.tsx              Card, Badge               │
│                                                                              │
│   Responsabilidad: Renderizado UI + manejo de eventos                       │
│   Tecnología: React 19 + Tailwind CSS + Lucide Icons                        │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CAPA DE ORQUESTACIÓN                                 │
│                                                                              │
│   useFormModal        useAdminWebSocket       useConfirmDialog              │
│   useOptimisticMutation   usePagination       useKeyboardShortcuts          │
│                                                                              │
│   Responsabilidad: Coordinación de lógica sin modificar estado              │
│   Patrones: Throttling, Debouncing, Suscripción a eventos                   │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CAPA DE GESTIÓN DE ESTADO                               │
│                                                                              │
│   authStore          productStore         tableStore                         │
│   branchStore        categoryStore        staffStore                         │
│   promotionStore     allergenStore        orderHistoryStore                  │
│   toastStore         sectorStore          ingredientStore                    │
│                                                                              │
│   15 Stores Zustand con persistencia localStorage                           │
│   Patrón de selectores + migraciones de esquema                             │
│   Mutex para refresh de token en requests concurrentes                       │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CAPA DE SERVICIOS                                   │
│                                                                              │
│   api.ts                    websocket.ts              cascadeService.ts     │
│   Cliente REST              Eventos tiempo real       Eliminación cascada   │
│   Token refresh mutex       Throttling                Snapshot/Restore      │
│   AbortController           Reconexión auto           Inyección deps        │
│                                                                              │
│   validation.ts             sanitization.ts           permissions.ts        │
│   28KB validadores          Prevención XSS            RBAC utilities        │
│                                                                              │
│   Responsabilidad: Lógica de negocio + comunicación externa                 │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CAPA DE BACKEND                                     │
│                                                                              │
│   REST API (FastAPI :8000)          WebSocket Gateway (:8001)               │
│   PostgreSQL + Redis                 Eventos ENTITY_*, ROUND_*, TABLE_*     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Reglas de Frontera entre Capas

1. **Pages nunca importan otras Pages** — Se usa React Router para navegación
2. **Components nunca llaman API directamente** — Usan stores o servicios
3. **Stores no ejecutan lógica de negocio compleja** — Delegan a servicios
4. **Servicios nunca importan componentes UI** — Solo lógica pura
5. **Llamadas API solo a través de fetchAPI** — Manejo centralizado de auth/errores

---

## Patrones de Diseño

### Patrón Selector con Caché

Para selectores parametrizados, se implementa un cache que evita recrear funciones en cada render:

```typescript
// Cache de selectores por ID
const branchByIdCache = new Map<string | null, (state: BranchState) => Branch | undefined>()

export const selectBranchById = (id: string | null) => {
  if (!branchByIdCache.has(id)) {
    branchByIdCache.set(id, (state) =>
      id ? state.branches.find(b => b.id === id) : undefined
    )
  }
  return branchByIdCache.get(id)!
}

// Uso en componente
const branch = useBranchStore(selectBranchById(branchId))
```

### Patrón Mutex para Token Refresh

Previene condiciones de carrera cuando múltiples requests reciben 401 simultáneamente:

```typescript
let refreshPromise: Promise<string | null> | null = null

async function attemptTokenRefresh(): Promise<string | null> {
  if (!refreshToken) return null

  // Si ya hay refresh en progreso, esperar el mismo
  if (refreshPromise) {
    return refreshPromise
  }

  // Crear promesa ANTES del trabajo async para prevenir race condition
  refreshPromise = (async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken })
      })
      const data = await response.json()
      return data.access_token
    } finally {
      refreshPromise = null  // Limpiar para siguiente refresh
    }
  })()

  return refreshPromise
}
```

Este patrón garantiza que aunque 10 requests fallen con 401 simultáneamente, solo se ejecuta una llamada de refresh y todas esperan el mismo resultado.

### Patrón Snapshot/Restore para Operaciones Atómicas

El servicio de eliminación en cascada captura estado antes de modificaciones:

```typescript
export function cascadeDeleteBranch(
  branchId: string,
  stores: StoreCollection
): CascadeDeleteResult {
  // 1. Capturar snapshot completo antes de modificaciones
  const snapshot = captureSnapshotForBranch(stores)

  try {
    // 2. Ejecutar eliminaciones en orden de dependencia
    //    promotions → products → subcategories → categories → tables → branch
    const deletedCounts = {
      products: deleteProductsForBranch(branchId),
      categories: deleteCategoriesForBranch(branchId),
      tables: deleteTablesForBranch(branchId),
      // ...
    }

    return { success: true, deletedCounts }
  } catch (error) {
    // 3. Restaurar estado completo en caso de CUALQUIER error
    restoreSnapshotForBranch(snapshot, stores)
    return { success: false, error: error.message }
  }
}
```

### Patrón Ref para Event Handlers

Previene acumulación de listeners en suscripciones WebSocket:

```typescript
export function useAdminWebSocket() {
  // Usar ref para el handler evita recrear la suscripción
  const handleAdminEventRef = useRef<(event: WSEvent) => void>(() => {})

  // Actualizar ref en cada render (no causa re-suscripción)
  handleAdminEventRef.current = (event: WSEvent) => {
    switch (event.type) {
      case 'ENTITY_CREATED':
        refreshAffectedStore(event.entity_type)
        break
      case 'ENTITY_UPDATED':
        updateStoreItem(event.entity_type, event.entity)
        break
      case 'ENTITY_DELETED':
        removeFromStore(event.entity_type, event.entity_id)
        break
    }
  }

  // Suscribirse UNA VEZ con deps vacíos
  useEffect(() => {
    const unsubscribe = dashboardWS.on('*', (event) => {
      handleAdminEventRef.current(event)
    })
    return unsubscribe
  }, [])  // ¡Deps vacíos! El callback delega al ref
}
```

### Patrón Hook Personalizado para Consolidación de Estado

`useFormModal` consolida 3 llamadas useState en un solo hook reutilizable:

```typescript
interface FormModalState<T, S> {
  isOpen: boolean
  formData: T
  selectedItem: S | null
}

export function useFormModal<T, S = T>(initialFormData: T) {
  const [state, setState] = useState<FormModalState<T, S>>({
    isOpen: false,
    formData: initialFormData,
    selectedItem: null
  })

  const openCreate = useCallback((overrides?: Partial<T>) => {
    setState({
      isOpen: true,
      formData: { ...initialFormData, ...overrides },
      selectedItem: null
    })
  }, [initialFormData])

  const openEdit = useCallback((item: S, formData?: Partial<T>) => {
    setState({
      isOpen: true,
      formData: { ...initialFormData, ...formData },
      selectedItem: item
    })
  }, [initialFormData])

  const close = useCallback(() => {
    // Delay para animación de modal
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        isOpen: false,
        selectedItem: null
      }))
    }, 200)
  }, [])

  const setFormData = useCallback((
    updater: T | ((prev: T) => T)
  ) => {
    setState(prev => ({
      ...prev,
      formData: typeof updater === 'function' ? updater(prev.formData) : updater
    }))
  }, [])

  return {
    isOpen: state.isOpen,
    formData: state.formData,
    selectedItem: state.selectedItem,
    openCreate,
    openEdit,
    close,
    setFormData
  }
}
```

---

## Gestión de Estado

### Arquitectura de Stores Zustand

El sistema implementa 15 stores especializados con persistencia y migraciones:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           STORES ZUSTAND                                    │
│                                                                             │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                    │
│   │ authStore   │    │ branchStore │    │productStore │                    │
│   │ v2          │    │ v5          │    │ v6          │                    │
│   │ user,token  │    │ branches[]  │    │ products[]  │                    │
│   │ refreshToken│    │ selectedId  │    │ branchPrices│                    │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                    │
│          │                  │                  │                            │
│          └──────────────────┼──────────────────┘                            │
│                             │                                               │
│                             ▼                                               │
│   ┌─────────────────────────────────────────────────────────┐              │
│   │               localStorage (persist)                     │              │
│   │                                                          │              │
│   │  "auth-store":    { user, token, refreshToken }         │              │
│   │  "branch-store":  { branches, selectedBranchId }        │              │
│   │  "product-store": { products }                          │              │
│   │  ...                                                     │              │
│   └─────────────────────────────────────────────────────────┘              │
│                                                                             │
│   Stores con Persistencia:              Stores sin Persistencia:           │
│   • authStore (v2)                      • roleStore (sistema)              │
│   • branchStore (v5)                    • badgeStore (sistema)             │
│   • categoryStore (v4)                  • sealStore (sistema)              │
│   • subcategoryStore (v4)               • toastStore (efímero)             │
│   • productStore (v6)                                                       │
│   • allergenStore (v2)                                                      │
│   • promotionStore (v4)                                                     │
│   • tableStore (v7)                                                         │
│   • staffStore (v3)                                                         │
│   • orderHistoryStore (v1)                                                  │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

### Estructura de un Store

Cada store sigue un patrón consistente:

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { STORAGE_KEYS, STORE_VERSIONS } from '../utils/constants'

interface ProductState {
  // Estado
  products: Product[]
  isLoading: boolean
  error: string | null

  // Acciones
  fetchProducts: (branchId?: string) => Promise<void>
  addProduct: (product: Product) => void
  updateProduct: (id: string, updates: Partial<Product>) => void
  deleteProduct: (id: string) => void
  clearError: () => void
}

export const useProductStore = create<ProductState>()(
  persist(
    (set, get) => ({
      // Estado inicial
      products: [],
      isLoading: false,
      error: null,

      // Acciones
      fetchProducts: async (branchId) => {
        set({ isLoading: true, error: null })
        try {
          const data = await productAPI.list(branchId)
          set({ products: data, isLoading: false })
        } catch (err) {
          set({
            error: handleError(err, 'productStore.fetchProducts'),
            isLoading: false
          })
        }
      },

      addProduct: (product) => set(state => ({
        products: [...state.products, product]
      })),

      updateProduct: (id, updates) => set(state => ({
        products: state.products.map(p =>
          p.id === id ? { ...p, ...updates } : p
        )
      })),

      deleteProduct: (id) => set(state => ({
        products: state.products.filter(p => p.id !== id)
      })),

      clearError: () => set({ error: null })
    }),
    {
      name: STORAGE_KEYS.PRODUCT,
      version: STORE_VERSIONS.PRODUCT,

      // Solo persistir campos específicos
      partialize: (state) => ({
        products: state.products
      }),

      // Manejar evolución de esquema
      migrate: (persistedState: any, version: number) => {
        if (version < 5) {
          // Migrar formato de precios antiguo
          return {
            ...persistedState,
            products: persistedState.products.map((p: any) => ({
              ...p,
              price_cents: p.price * 100  // Convertir a centavos
            }))
          }
        }
        return persistedState
      }
    }
  )
)

// Selectores exportados (OBLIGATORIO)
const EMPTY_PRODUCTS: Product[] = []

export const selectProducts = (state: ProductState) =>
  state.products.length > 0 ? state.products : EMPTY_PRODUCTS

export const selectProductById = (id: string) => (state: ProductState) =>
  state.products.find(p => p.id === id)

export const selectIsLoading = (state: ProductState) => state.isLoading

export const selectError = (state: ProductState) => state.error
```

### Reglas Críticas de Selectores

1. **Retornar referencias estables** — El mismo objeto = sin re-render
2. **Usar constante EMPTY_ARRAY** — Nunca `[]` inline como fallback
3. **Cachear factory selectors** — Para selectores parametrizados
4. **Usar useShallow** — Para arrays filtrados
5. **Usar useMemo** — Para computaciones derivadas en componentes

```typescript
// CORRECTO: Constante para array vacío
const EMPTY_ARRAY: Product[] = []
export const selectProducts = (s) => s.products.length > 0 ? s.products : EMPTY_ARRAY

// CORRECTO: useShallow para arrays filtrados
import { useShallow } from 'zustand/react/shallow'
const activeProducts = useProductStore(
  useShallow((state) => state.products.filter(p => p.is_active))
)

// CORRECTO: useMemo para computaciones en componente
const ProductStats = () => {
  const products = useProductStore(selectProducts)
  const stats = useMemo(() => ({
    total: products.length,
    active: products.filter(p => p.is_active).length,
    avgPrice: products.reduce((sum, p) => sum + p.price, 0) / products.length
  }), [products])
  // ...
}
```

---

## Arquitectura de Componentes

### Jerarquía de Componentes

```
App.tsx (ErrorBoundary wrapper)
│
├── BrowserRouter
│   └── Routes
│       │
│       ├── /login ─────────────────────────► LoginPage
│       │                                      (Suspense + lazy)
│       │
│       └── / ──────────────────────────────► ProtectedRoute
│                                              │
│                                              └── Layout
│                                                  │
│                                                  ├── Sidebar
│                                                  │   ├── Logo
│                                                  │   ├── NavGroups
│                                                  │   │   ├── NavItem (Dashboard)
│                                                  │   │   ├── NavItem (Sucursales)
│                                                  │   │   ├── NavItem (Mesas)
│                                                  │   │   └── ...16 más
│                                                  │   └── LogoutButton
│                                                  │
│                                                  ├── Header
│                                                  │   ├── PageTitle
│                                                  │   └── UserMenu
│                                                  │
│                                                  └── PageContainer
│                                                      └── Outlet (página dinámica)
│                                                          │
│                                                          ├── Dashboard
│                                                          ├── Branches
│                                                          ├── Categories
│                                                          ├── Products
│                                                          ├── Tables
│                                                          ├── Staff
│                                                          └── ...13 más
```

### Composición de Componentes por Tipo

**Componentes de Página (19):**
- Componentes funcionales con lazy loading
- Orquestan stores + renderizan layout
- Patrón: useFormModal + useConfirmDialog + suscripciones store

```typescript
// Estructura típica de página CRUD
const CategoriesPage = () => {
  // Hooks de estado
  const modal = useFormModal<CategoryFormData>({ name: '', order: 0 })
  const deleteDialog = useConfirmDialog<Category>()

  // Selectores de store
  const categories = useCategoryStore(selectCategories)
  const isLoading = useCategoryStore(selectIsLoading)

  // Acciones de store
  const addCategory = useCategoryStore(s => s.addCategory)
  const updateCategory = useCategoryStore(s => s.updateCategory)
  const deleteCategory = useCategoryStore(s => s.deleteCategory)

  // Render
  return (
    <PageContainer title="Categorías">
      <Table
        data={categories}
        columns={columns}
        onEdit={(item) => modal.openEdit(item, toFormData(item))}
        onDelete={(item) => deleteDialog.open(item)}
      />

      <CategoryFormModal
        isOpen={modal.isOpen}
        formData={modal.formData}
        selectedItem={modal.selectedItem}
        onClose={modal.close}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        item={deleteDialog.item}
        onConfirm={handleDelete}
        onCancel={deleteDialog.close}
      />
    </PageContainer>
  )
}
```

**Componentes UI Base (23):**

| Componente | Propósito | Props Principales |
|------------|-----------|-------------------|
| `Button` | Acción primaria/secundaria | variant, isLoading, disabled |
| `Input` | Campo de texto | type, error, placeholder |
| `Textarea` | Texto multilínea | rows, maxLength |
| `Select` | Dropdown selección | options, value, onChange |
| `Toggle` | Switch on/off | checked, onChange |
| `Modal` | Contenedor modal | isOpen, onClose, title |
| `LazyModal` | Modal con carga diferida | fallback, children |
| `ConfirmDialog` | Confirmación destructiva | message, onConfirm |
| `Card` | Contenedor con sombra | padding, className |
| `Badge` | Etiqueta decorativa | text, color, size |
| `Table` | Tabla de datos | columns, data, actions |
| `TableSkeleton` | Placeholder carga | rows, columns |
| `Pagination` | Navegación páginas | total, page, onChange |
| `Toast` | Notificación temporal | type, message, duration |
| `ErrorBoundary` | Captura errores | fallback, onReset |

**Componentes Especializados:**

| Componente | Propósito |
|------------|-----------|
| `AllergenSelect` | Multi-select alérgenos con tipo presencia |
| `ProductSelect` | Multi-select productos con búsqueda |
| `BranchCheckboxes` | Checkboxes sucursales con conteo |
| `BranchPriceInput` | Editor matriz precios por sucursal |
| `CascadePreviewList` | Preview items afectados por cascade delete |
| `HelpButton` | Ayuda contextual con contenido formateado |

---

## Flujos de Datos

### Flujo de Creación de Entidad

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Usuario hace clic en "Crear Categoría"                                      │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ modal.openCreate()                                                          │
│ → setState({ isOpen: true, selectedItem: null, formData: defaults })       │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ <Modal isOpen={modal.isOpen}>                                               │
│   Usuario completa formulario                                               │
│   Clic en "Crear"                                                           │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ formAction (useActionState)                                                 │
│   1. validateCategory(formData)                                             │
│   2. Si errores → return { isSuccess: false, errors }                       │
│   3. Si válido → categoryAPI.create(formData)                               │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ HTTP POST /api/admin/categories                                             │
│   Headers: { Authorization: Bearer {token} }                                │
│   Body: { name, order, branch_id }                                          │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Backend persiste en PostgreSQL                                              │
│ Retorna categoría creada con ID                                             │
│ Emite evento ENTITY_CREATED a WebSocket                                     │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ categoryStore.addCategory(response)                                         │
│ → set(state => ({ categories: [...state.categories, response] }))          │
│                                                                              │
│ Componentes re-renderizan vía selectores                                    │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ toast.success("Categoría creada correctamente")                             │
│ modal.close() (después de state.isSuccess = true)                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Flujo de Actualización con WebSocket

```
┌───────────────────────────────────────────────────────────────────────────┐
│                              ADMIN 1                                       │
│                                                                            │
│   Actualiza producto en Dashboard                                          │
│   productStore.updateProduct(id, data)                                     │
│   → productAPI.update(id, data)                                            │
└─────────────────────────────┬─────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                           BACKEND                                          │
│                                                                            │
│   1. Valida datos                                                          │
│   2. Actualiza en PostgreSQL                                               │
│   3. Publica evento a Redis                                                │
│      channel: "branch:{branch_id}:admin"                                   │
│      payload: { type: "ENTITY_UPDATED", entity_type: "Product", ... }     │
└─────────────────────────────┬─────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                      WEBSOCKET GATEWAY                                     │
│                                                                            │
│   redis_subscriber recibe evento                                           │
│   Broadcast a conexiones admin del branch                                  │
└────────────────┬─────────────────────────────────┬────────────────────────┘
                 │                                 │
                 ▼                                 ▼
┌────────────────────────────────┐  ┌────────────────────────────────┐
│           ADMIN 1              │  │           ADMIN 2              │
│                                │  │                                │
│  (ya actualizó localmente)     │  │  dashboardWS.on('*', handler)  │
│  Ignora evento propio          │  │                                │
│                                │  │  useAdminWebSocket hook:       │
│                                │  │  → productStore.fetchProducts()│
│                                │  │                                │
│                                │  │  Componentes re-renderizan     │
│                                │  │  con datos actualizados        │
└────────────────────────────────┘  └────────────────────────────────┘
```

### Flujo de Eliminación en Cascada

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Usuario solicita eliminar sucursal                                          │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ deleteDialog.open(branch)                                                   │
│                                                                              │
│ <CascadePreviewList>                                                        │
│   Se mostrarán afectados:                                                   │
│   - 15 productos                                                            │
│   - 8 categorías                                                            │
│   - 12 mesas                                                                │
│   - 3 promociones                                                           │
│ </CascadePreviewList>                                                       │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼ Usuario confirma
┌─────────────────────────────────────────────────────────────────────────────┐
│ cascadeService.cascadeDeleteBranch(branchId, stores)                        │
│                                                                              │
│   1. snapshot = captureSnapshotForBranch(stores)                            │
│      {                                                                       │
│        products: [...],                                                      │
│        categories: [...],                                                    │
│        tables: [...],                                                        │
│        promotions: [...],                                                    │
│        branch: {...}                                                         │
│      }                                                                       │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│   try {                                                                     │
│     2. Eliminar productos de promociones                                    │
│     3. Eliminar productos                                                   │
│     4. Eliminar subcategorías                                               │
│     5. Eliminar categorías                                                  │
│     6. Eliminar mesas                                                       │
│     7. Eliminar historial pedidos                                           │
│     8. Eliminar sucursal                                                    │
│                                                                              │
│     return { success: true, deletedCounts: {...} }                          │
│   }                                                                          │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
              ┌──────────────────────┴──────────────────────┐
              │                                             │
              ▼ Error en paso 5                             ▼ Éxito
┌─────────────────────────────────┐      ┌─────────────────────────────────┐
│ catch (error) {                 │      │ toast.success(                  │
│   restoreSnapshotForBranch(     │      │   "Sucursal eliminada con:"    │
│     snapshot,                   │      │   "- 15 productos"             │
│     stores                      │      │   "- 8 categorías"             │
│   )                             │      │   "- 12 mesas"                 │
│                                 │      │ )                               │
│   return { success: false }     │      │                                 │
│ }                               │      │ Navegar a lista sucursales     │
│                                 │      │                                 │
│ toast.error(                    │      │                                 │
│   "Error eliminando mesas.      │      │                                 │
│    Cambios revertidos."         │      │                                 │
│ )                               │      │                                 │
└─────────────────────────────────┘      └─────────────────────────────────┘
```

---

## Cliente API

### Arquitectura del Cliente REST

El archivo `api.ts` (54KB) implementa un cliente REST completo con características enterprise:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API CLIENT                                      │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         fetchAPI (core)                              │   │
│   │                                                                      │   │
│   │   ┌────────────────┐  ┌────────────────┐  ┌────────────────┐        │   │
│   │   │ Token Manager  │  │ AbortController│  │ Error Handler  │        │   │
│   │   │                │  │                │  │                │        │   │
│   │   │ • Auto-attach  │  │ • 30s timeout  │  │ • 401 → refresh│        │   │
│   │   │ • Mutex refresh│  │ • Cancelation  │  │ • 404 mapping  │        │   │
│   │   │ • Retry logic  │  │ • Network err  │  │ • Log context  │        │   │
│   │   └────────────────┘  └────────────────┘  └────────────────┘        │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      API Namespaces (50+)                            │   │
│   │                                                                      │   │
│   │   authAPI        branchAPI       categoryAPI      productAPI        │   │
│   │   • login        • list          • list           • list            │   │
│   │   • logout       • create        • create         • create          │   │
│   │   • refresh      • update        • update         • update          │   │
│   │   • getMe        • delete        • delete         • delete          │   │
│   │                  • restore       • restore        • restore         │   │
│   │                                                                      │   │
│   │   allergenAPI    promotionAPI    staffAPI         tableAPI          │   │
│   │   ingredientAPI  recipeAPI       sectorAPI        orderAPI          │   │
│   │   ...                                                                │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementación del Wrapper fetchAPI

```typescript
const DEFAULT_TIMEOUT_MS = 30000

async function fetchAPI<T>(
  endpoint: string,
  options: FetchAPIOptions = {},
  retryOnUnauthorized = true
): Promise<T> {
  const token = useAuthStore.getState().token

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers
  }

  // Configurar timeout con AbortController
  const controller = new AbortController()
  const timeoutId = setTimeout(
    () => controller.abort(),
    options.timeout ?? DEFAULT_TIMEOUT_MS
  )

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    // Manejar 401 con refresh automático
    if (response.status === 401 && retryOnUnauthorized) {
      const newToken = await attemptTokenRefresh()
      if (newToken) {
        // Reintentar con nuevo token (sin retry recursivo)
        return fetchAPI<T>(endpoint, options, false)
      } else {
        // Token refresh falló → logout
        useAuthStore.getState().logout()
        throw new Error('Sesión expirada. Por favor inicia sesión nuevamente.')
      }
    }

    // Manejar otros errores HTTP
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        errorData.detail ||
        errorData.message ||
        `Error ${response.status}: ${response.statusText}`
      )
    }

    // Parsear respuesta (manejar 204 No Content)
    if (response.status === 204) {
      return undefined as T
    }

    return response.json()

  } catch (error) {
    clearTimeout(timeoutId)

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('La solicitud fue cancelada o excedió el tiempo límite')
    }

    throw error
  }
}
```

### Patrón de Namespace API

```typescript
export const categoryAPI = {
  async list(branchId?: string, includeDeleted = false): Promise<Category[]> {
    const params = new URLSearchParams()
    if (branchId) params.set('branch_id', branchId)
    if (includeDeleted) params.set('include_deleted', 'true')

    return fetchAPI<Category[]>(`/api/admin/categories?${params}`)
  },

  async create(data: CategoryCreate): Promise<Category> {
    return fetchAPI<Category>('/api/admin/categories', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  },

  async update(id: string, data: CategoryUpdate): Promise<Category> {
    return fetchAPI<Category>(`/api/admin/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  },

  async delete(id: string): Promise<void> {
    return fetchAPI<void>(`/api/admin/categories/${id}`, {
      method: 'DELETE'
    })
  },

  async restore(id: string): Promise<RestoreResponse> {
    return fetchAPI<RestoreResponse>(`/api/admin/categories/${id}/restore`, {
      method: 'POST'
    })
  }
}
```

---

## Integración WebSocket

### Servicio DashboardWebSocket

El servicio WebSocket implementa conexión persistente con características enterprise:

```typescript
class DashboardWebSocket {
  private ws: WebSocket | null = null
  private listeners: Map<WSEventType | '*', Set<EventCallback>> = new Map()
  private reconnectAttempts = 0
  private reconnectTimeout: number | null = null

  // Configuración de reconexión
  private readonly MAX_RECONNECT_ATTEMPTS = 50
  private readonly BASE_RECONNECT_DELAY = 1000  // 1 segundo
  private readonly MAX_RECONNECT_DELAY = 30000  // 30 segundos
  private readonly JITTER_FACTOR = 0.3

  connect(endpoint: 'admin' | 'kitchen' = 'admin'): void {
    const token = useAuthStore.getState().token
    if (!token) {
      console.warn('No token available for WebSocket connection')
      return
    }

    const wsUrl = `${WS_BASE_URL}/ws/${endpoint}?token=${token}`
    this.ws = new WebSocket(wsUrl)

    this.ws.onopen = () => {
      console.log(`WebSocket connected to ${endpoint}`)
      this.reconnectAttempts = 0
      this.notifyConnectionChange(true)
    }

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WSEvent
        this.dispatchEvent(data)
      } catch (e) {
        console.error('Failed to parse WebSocket message', e)
      }
    }

    this.ws.onclose = (event) => {
      this.notifyConnectionChange(false)

      // Códigos de cierre que no deben reconectar
      if ([4001, 4003].includes(event.code)) {
        console.error('WebSocket closed due to auth error, not reconnecting')
        return
      }

      this.scheduleReconnect(endpoint)
    }

    this.ws.onerror = (error) => {
      console.error('WebSocket error', error)
    }
  }

  // Suscripción con filtro por branch
  onFiltered(
    branchId: string,
    eventType: WSEventType,
    callback: EventCallback
  ): () => void {
    const filteredCallback = (event: WSEvent) => {
      if (event.branch_id === branchId) {
        callback(event)
      }
    }
    return this.on(eventType, filteredCallback)
  }

  // Suscripción con throttling
  onThrottled(
    eventType: WSEventType,
    callback: EventCallback,
    delay = 100
  ): () => void {
    let lastCall = 0
    let pendingEvent: WSEvent | null = null
    let timeoutId: number | null = null

    const throttledCallback = (event: WSEvent) => {
      const now = Date.now()

      if (now - lastCall >= delay) {
        lastCall = now
        callback(event)
      } else {
        pendingEvent = event
        if (!timeoutId) {
          timeoutId = window.setTimeout(() => {
            if (pendingEvent) {
              callback(pendingEvent)
              lastCall = Date.now()
              pendingEvent = null
            }
            timeoutId = null
          }, delay - (now - lastCall))
        }
      }
    }

    return this.on(eventType, throttledCallback)
  }

  // Reconexión con backoff exponencial + jitter
  private scheduleReconnect(endpoint: 'admin' | 'kitchen'): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error('Max reconnect attempts reached')
      return
    }

    const baseDelay = Math.min(
      this.BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      this.MAX_RECONNECT_DELAY
    )

    // Agregar jitter para evitar thundering herd
    const jitter = baseDelay * this.JITTER_FACTOR * (Math.random() * 2 - 1)
    const delay = baseDelay + jitter

    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectAttempts++
      this.connect(endpoint)
    }, delay)
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }

    // Limpiar todos los listeners para prevenir memory leaks
    this.listeners.clear()
  }
}

// Singleton export
export const dashboardWS = new DashboardWebSocket()
```

### Tipos de Eventos WebSocket

```typescript
type WSEventType =
  // Lifecycle de pedidos
  | 'ROUND_SUBMITTED'
  | 'ROUND_IN_KITCHEN'
  | 'ROUND_READY'
  | 'ROUND_SERVED'
  | 'ROUND_CANCELED'

  // Llamadas de servicio
  | 'SERVICE_CALL_CREATED'
  | 'SERVICE_CALL_ACKED'
  | 'SERVICE_CALL_CLOSED'

  // Sesiones de mesa
  | 'TABLE_SESSION_STARTED'
  | 'TABLE_CLEARED'
  | 'TABLE_STATUS_CHANGED'

  // Pagos
  | 'CHECK_REQUESTED'
  | 'CHECK_PAID'
  | 'PAYMENT_APPROVED'
  | 'PAYMENT_REJECTED'
  | 'PAYMENT_FAILED'

  // Tickets de cocina
  | 'TICKET_IN_PROGRESS'
  | 'TICKET_READY'
  | 'TICKET_DELIVERED'

  // Eventos administrativos (Dashboard)
  | 'ENTITY_CREATED'
  | 'ENTITY_UPDATED'
  | 'ENTITY_DELETED'
  | 'CASCADE_DELETE'

interface WSEvent {
  type: WSEventType
  tenant_id: number
  branch_id: number
  entity_type?: string
  entity_id?: string
  entity?: Record<string, any>
  timestamp: string
  [key: string]: any
}
```

---

## Sistema de Permisos

### Arquitectura RBAC

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         JERARQUÍA DE ROLES                                   │
│                                                                              │
│   ADMIN ────────────────────────────────────────────────────────────────►   │
│   │                                                                          │
│   │   • Acceso total a todas las entidades                                  │
│   │   • CRUD completo (Crear, Leer, Actualizar, Eliminar)                   │
│   │   • Gestión de cualquier sucursal                                       │
│   │   • Configuración del sistema                                           │
│   │                                                                          │
│   ▼                                                                          │
│   MANAGER ──────────────────────────────────────────────────────────────►   │
│   │                                                                          │
│   │   • Acceso limitado a sucursales asignadas                              │
│   │   • Crear/Editar: Staff, Mesas, Alérgenos, Promociones                  │
│   │   • NO puede eliminar entidades (solo soft-delete via cascade)         │
│   │   • Ver reportes de sus sucursales                                      │
│   │                                                                          │
│   ├───────────────────────────┬─────────────────────────────────────────►   │
│   ▼                           ▼                                              │
│   KITCHEN                     WAITER                                         │
│   │                           │                                              │
│   │   • Solo lectura de       │   • Solo lectura de mesas asignadas         │
│   │     productos/recetas     │   • Ver pedidos de sus sectores             │
│   │   • Actualizar estado     │   • Actualizar estado de rounds             │
│   │     de tickets/rounds     │     (READY → SERVED)                        │
│   │   • Ver tickets cocina    │                                              │
│   │                           │                                              │
└───┴───────────────────────────┴─────────────────────────────────────────────┘
```

### Funciones de Permisos

```typescript
// utils/permissions.ts

import type { Role } from '../types'

// Verificaciones atómicas de rol
export function isAdmin(roles: string[]): boolean {
  return roles.includes('ADMIN')
}

export function isManager(roles: string[]): boolean {
  return roles.includes('MANAGER')
}

export function isKitchen(roles: string[]): boolean {
  return roles.includes('KITCHEN')
}

export function isWaiter(roles: string[]): boolean {
  return roles.includes('WAITER')
}

export function isAdminOrManager(roles: string[]): boolean {
  return isAdmin(roles) || isManager(roles)
}

// Permisos granulares por entidad

// Productos
export function canCreateProduct(roles: string[]): boolean {
  return isAdmin(roles)
}

export function canEditProduct(roles: string[]): boolean {
  return isAdmin(roles)
}

export function canDeleteProduct(roles: string[]): boolean {
  return isAdmin(roles)
}

// Staff
export function canCreateStaff(roles: string[]): boolean {
  return isAdminOrManager(roles)
}

export function canEditStaff(roles: string[]): boolean {
  return isAdminOrManager(roles)
}

export function canDeleteStaff(roles: string[]): boolean {
  return isAdmin(roles)
}

// Sucursales
export function canCreateBranch(roles: string[]): boolean {
  return isAdmin(roles)
}

export function canEditBranch(roles: string[]): boolean {
  return isAdminOrManager(roles)
}

export function canDeleteBranch(roles: string[]): boolean {
  return isAdmin(roles)
}

// Acceso a páginas
export function canAccessStaffPage(roles: string[]): boolean {
  return isAdminOrManager(roles)
}

export function canAccessRecipesPage(roles: string[]): boolean {
  return isAdmin(roles) || isManager(roles) || isKitchen(roles)
}

export function canAccessBranchesPage(roles: string[]): boolean {
  return isAdminOrManager(roles)
}

export function canAccessReportsPage(roles: string[]): boolean {
  return isAdminOrManager(roles)
}

// Permisos con contexto de sucursal
export function canManageStaffInBranch(
  roles: string[],
  userBranchIds: string[],
  targetBranchId: string
): boolean {
  if (isAdmin(roles)) return true
  if (isManager(roles)) {
    return userBranchIds.includes(targetBranchId)
  }
  return false
}
```

### Selectores de Permisos en authStore

```typescript
// stores/authStore.ts

const EMPTY_ROLES: string[] = []

export const selectUserRoles = (state: AuthState) =>
  state.user?.roles ?? EMPTY_ROLES

export const selectIsAdmin = (state: AuthState) =>
  isAdmin(state.user?.roles ?? EMPTY_ROLES)

export const selectIsManager = (state: AuthState) =>
  isManager(state.user?.roles ?? EMPTY_ROLES)

export const selectIsAdminOrManager = (state: AuthState) =>
  isAdminOrManager(state.user?.roles ?? EMPTY_ROLES)

export const selectCanDeleteProducts = (state: AuthState) =>
  canDeleteProduct(state.user?.roles ?? EMPTY_ROLES)

export const selectCanAccessStaff = (state: AuthState) =>
  canAccessStaffPage(state.user?.roles ?? EMPTY_ROLES)
```

### Uso en Componentes

```typescript
// Verificación en render
const CategoriesPage = () => {
  const canDelete = useAuthStore(selectCanDeleteProducts)
  const roles = useAuthStore(selectUserRoles)

  return (
    <Table
      columns={columns}
      data={categories}
      actions={{
        onEdit: (item) => modal.openEdit(item),
        // Solo mostrar botón delete si tiene permisos
        ...(canDelete && {
          onDelete: (item) => deleteDialog.open(item)
        })
      }}
    />
  )
}

// Protección de rutas
<Route
  path="/staff"
  element={
    <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
      <StaffPage />
    </ProtectedRoute>
  }
/>
```

---

## Manejo de Formularios

### Patrón useActionState (React 19)

```typescript
interface FormState<T> {
  isSuccess: boolean
  errors?: ValidationErrors<T>
  message?: string
}

const CategoryForm = () => {
  const modal = useFormModal<CategoryFormData>({ name: '', order: 0 })
  const addCategory = useCategoryStore(s => s.addCategory)
  const updateCategory = useCategoryStore(s => s.updateCategory)

  const submitAction = useCallback(
    async (
      _prevState: FormState<CategoryFormData>,
      formData: FormData
    ): Promise<FormState<CategoryFormData>> => {
      // 1. Extraer datos del FormData
      const data: CategoryFormData = {
        name: formData.get('name') as string,
        order: parseInt(formData.get('order') as string, 10) || 0
      }

      // 2. Validar
      const validation = validateCategory(data)
      if (!validation.isValid) {
        return { isSuccess: false, errors: validation.errors }
      }

      // 3. Llamar API
      try {
        if (modal.selectedItem) {
          const updated = await categoryAPI.update(modal.selectedItem.id, data)
          updateCategory(modal.selectedItem.id, updated)
          toast.success('Categoría actualizada')
        } else {
          const created = await categoryAPI.create(data)
          addCategory(created)
          toast.success('Categoría creada')
        }
        return { isSuccess: true }
      } catch (error) {
        return {
          isSuccess: false,
          message: handleError(error, 'CategoryForm.submit')
        }
      }
    },
    [modal.selectedItem, addCategory, updateCategory]
  )

  const [state, formAction, isPending] = useActionState<
    FormState<CategoryFormData>,
    FormData
  >(submitAction, { isSuccess: false })

  // Cerrar modal en éxito
  useEffect(() => {
    if (state.isSuccess && modal.isOpen) {
      modal.close()
    }
  }, [state.isSuccess, modal.isOpen])

  return (
    <Modal isOpen={modal.isOpen} onClose={modal.close} title="Categoría">
      <form action={formAction}>
        <Input
          name="name"
          label="Nombre"
          defaultValue={modal.formData.name}
          error={state.errors?.name}
        />

        <Input
          name="order"
          type="number"
          label="Orden"
          defaultValue={modal.formData.order}
          error={state.errors?.order}
        />

        {state.message && (
          <Alert type="error">{state.message}</Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={modal.close}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isPending}>
            {modal.selectedItem ? 'Guardar' : 'Crear'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
```

### Biblioteca de Validación

```typescript
// utils/validation.ts

interface ValidationResult<T> {
  isValid: boolean
  errors: ValidationErrors<T>
}

type ValidationErrors<T> = Partial<Record<keyof T, string>>

// Constantes de validación
const VALIDATION_LIMITS = {
  MIN_NAME_LENGTH: 2,
  MAX_NAME_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 500,
  MAX_ADDRESS_LENGTH: 200,
  MAX_PRICE: 99999999,  // 999,999.99 en centavos
  MIN_PRICE: 0,
  MAX_ORDER: 9999
}

// Validador de categoría
export function validateCategory(
  data: Partial<CategoryFormData>
): ValidationResult<CategoryFormData> {
  const errors: ValidationErrors<CategoryFormData> = {}

  // Nombre requerido
  if (!data.name?.trim()) {
    errors.name = 'El nombre es requerido'
  } else if (data.name.length < VALIDATION_LIMITS.MIN_NAME_LENGTH) {
    errors.name = `Mínimo ${VALIDATION_LIMITS.MIN_NAME_LENGTH} caracteres`
  } else if (data.name.length > VALIDATION_LIMITS.MAX_NAME_LENGTH) {
    errors.name = `Máximo ${VALIDATION_LIMITS.MAX_NAME_LENGTH} caracteres`
  }

  // Orden debe ser número positivo
  if (data.order !== undefined && data.order !== null) {
    if (typeof data.order !== 'number' || isNaN(data.order)) {
      errors.order = 'Debe ser un número'
    } else if (data.order < 0) {
      errors.order = 'Debe ser positivo'
    } else if (data.order > VALIDATION_LIMITS.MAX_ORDER) {
      errors.order = `Máximo ${VALIDATION_LIMITS.MAX_ORDER}`
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}

// Validador de producto (más complejo)
export function validateProduct(
  data: Partial<ProductFormData>
): ValidationResult<ProductFormData> {
  const errors: ValidationErrors<ProductFormData> = {}

  // Nombre
  if (!data.name?.trim()) {
    errors.name = 'El nombre es requerido'
  }

  // Precio base
  if (data.price === undefined || data.price === null) {
    errors.price = 'El precio es requerido'
  } else if (data.price < VALIDATION_LIMITS.MIN_PRICE) {
    errors.price = 'El precio no puede ser negativo'
  } else if (data.price > VALIDATION_LIMITS.MAX_PRICE) {
    errors.price = 'El precio excede el máximo permitido'
  }

  // Categoría
  if (!data.category_id) {
    errors.category_id = 'Selecciona una categoría'
  }

  // URL de imagen (si se proporciona)
  if (data.image_url && !isValidImageUrl(data.image_url)) {
    errors.image_url = 'URL de imagen inválida'
  }

  // Precios por sucursal
  if (data.branch_prices) {
    const priceErrors = validateBranchPrices(data.branch_prices)
    if (priceErrors) {
      errors.branch_prices = priceErrors
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}

// Validación de URL de imagen (prevención SSRF)
function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)

    // Solo HTTPS
    if (parsed.protocol !== 'https:') {
      return false
    }

    // Bloquear IPs internas
    const blockedHosts = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '169.254.169.254',  // AWS metadata
      'metadata.google.internal'  // GCP metadata
    ]

    if (blockedHosts.some(h => parsed.hostname.includes(h))) {
      return false
    }

    // Bloquear rangos privados
    if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(parsed.hostname)) {
      return false
    }

    return true
  } catch {
    return false
  }
}
```

---

## Resiliencia y Manejo de Errores

### Error Boundary (Componente de Clase)

```typescript
// components/ui/ErrorBoundary.tsx

interface Props {
  children: React.ReactNode
  name?: string
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log estructurado para debugging
    logError(`Error caught in boundary [${this.props.name || 'unknown'}]`, 'ErrorBoundary', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString()
    })
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold mb-2">Algo salió mal</h2>
          <p className="text-gray-600 mb-4 text-center max-w-md">
            Ha ocurrido un error inesperado. Por favor recarga la página o intenta nuevamente.
          </p>

          {import.meta.env.DEV && this.state.error && (
            <details className="mb-4 p-4 bg-gray-100 rounded max-w-lg">
              <summary className="cursor-pointer font-medium">
                Detalles del error (solo desarrollo)
              </summary>
              <pre className="mt-2 text-xs overflow-auto">
                {this.state.error.message}
                {'\n\n'}
                {this.state.error.stack}
              </pre>
            </details>
          )}

          <div className="flex gap-2">
            <Button onClick={() => window.location.reload()}>
              Recargar página
            </Button>
            <Button variant="secondary" onClick={this.handleReset}>
              Intentar de nuevo
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
```

### Manejo Centralizado de Errores

```typescript
// utils/logger.ts

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  [key: string]: any
}

export function logError(
  message: string,
  source: string,
  context?: LogContext
): void {
  const timestamp = new Date().toISOString()

  // En desarrollo, log a consola
  if (import.meta.env.DEV) {
    console.error(`[${timestamp}] [ERROR] [${source}] ${message}`, context)
  }

  // En producción, enviar a servicio de monitoreo
  if (import.meta.env.PROD && window.Sentry) {
    window.Sentry.captureException(new Error(message), {
      tags: { source },
      extra: context
    })
  }
}

export function handleError(error: unknown, context: string): string {
  // Errores de red
  if (error instanceof TypeError && error.message.includes('fetch')) {
    logError('Network error', context, { error })
    return 'Error de conexión. Verifica tu internet.'
  }

  // Errores de timeout
  if (error instanceof Error && error.name === 'AbortError') {
    logError('Request timeout', context)
    return 'La solicitud tardó demasiado. Intenta nuevamente.'
  }

  // Errores de autenticación
  if (error instanceof Error && error.message.includes('401')) {
    logError('Authentication error', context)
    return 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.'
  }

  // Errores de autorización
  if (error instanceof Error && error.message.includes('403')) {
    logError('Authorization error', context)
    return 'No tienes permisos para realizar esta acción.'
  }

  // Errores de validación del servidor
  if (error instanceof Error && error.message.includes('422')) {
    logError('Validation error', context, { message: error.message })
    return error.message.replace('422:', '').trim() || 'Datos inválidos.'
  }

  // Errores genéricos
  if (error instanceof Error) {
    logError(error.message, context, { stack: error.stack })
    return error.message
  }

  // Fallback seguro (nunca exponer detalles internos)
  logError('Unknown error', context, { error })
  return 'Ocurrió un error inesperado. Intenta nuevamente.'
}
```

### Patrones de Resiliencia

1. **Timeout Protection**: 30s por defecto para todas las llamadas API
2. **Retry Logic**: Refresh de token con mutex previene duplicados
3. **Fallback UI**: Estados de error en componentes
4. **Snapshot/Restore**: Operaciones atómicas con rollback
5. **Graceful Degradation**: Stores mantienen datos previos en caso de fallo

---

## Optimización de Rendimiento

### React Compiler (Memoización Automática)

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          ['babel-plugin-react-compiler', { target: '19' }]
        ]
      }
    })
  ]
})
```

El React Compiler analiza el código y aplica memoización automáticamente, reduciendo ~30-40% de re-renders sin necesidad de `React.memo`, `useMemo` o `useCallback` manuales.

### Memoización Manual para Componentes Críticos

```typescript
// Componentes con 100+ usos reciben memo manual
export const Badge = React.memo(
  function Badge({ text, color, size = 'md' }: BadgeProps) {
    return (
      <span className={`badge badge-${color} badge-${size}`}>
        {text}
      </span>
    )
  },
  (prevProps, nextProps) => {
    return (
      prevProps.text === nextProps.text &&
      prevProps.color === nextProps.color &&
      prevProps.size === nextProps.size
    )
  }
)
```

### useShallow para Arrays Filtrados

```typescript
import { useShallow } from 'zustand/react/shallow'

// CORRECTO: useShallow preserva referencia si contenido es igual
const activeProducts = useProductStore(
  useShallow((state) => state.products.filter(p => p.is_active))
)

// INCORRECTO: Crea nueva referencia en cada render
// const activeProducts = useProductStore(state => state.products.filter(...))
```

### Code Splitting

```typescript
// Todas las páginas lazy-loaded
const DashboardPage = lazy(() => import('./pages/Dashboard'))
const ProductsPage = lazy(() => import('./pages/Products'))
const TablesPage = lazy(() => import('./pages/Tables'))
// ... 16 páginas más

// Manual chunks en vite.config.ts
rollupOptions: {
  output: {
    manualChunks: {
      'react-vendor': ['react', 'react-dom', 'react-router-dom'],
      'icons': ['lucide-react'],
      'state': ['zustand']
    }
  }
}
```

### Métricas de Build

```
Chunk                    │ Size      │ Gzipped
─────────────────────────┼───────────┼──────────
react-vendor             │ 60 kB     │ 19 kB
icons (lucide)           │ 40 kB     │ 12 kB
state (zustand)          │ 8 kB      │ 3 kB
main (app + utils)       │ 40 kB     │ 13 kB
pages (19 chunks)        │ 120 kB    │ 38 kB
─────────────────────────┼───────────┼──────────
TOTAL                    │ ~268 kB   │ ~85 kB
```

---

## Arquitectura de Testing

### Configuración Vitest

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**']
    }
  }
})
```

### Setup de Tests

```typescript
// src/test/setup.ts
import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock window.matchMedia (responsive design)
Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
})

// Mock IntersectionObserver (lazy loading)
const mockIntersectionObserver = vi.fn()
mockIntersectionObserver.mockReturnValue({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
})
window.IntersectionObserver = mockIntersectionObserver
```

### Patrones de Test

```typescript
// Test de hook
describe('useFormModal', () => {
  it('should open modal in create mode', () => {
    const { result } = renderHook(() =>
      useFormModal({ name: '', price: 0 })
    )

    act(() => {
      result.current.openCreate({ name: 'Producto Nuevo' })
    })

    expect(result.current.isOpen).toBe(true)
    expect(result.current.selectedItem).toBeNull()
    expect(result.current.formData.name).toBe('Producto Nuevo')
  })

  it('should open modal in edit mode with existing item', () => {
    const existingProduct = { id: '1', name: 'Pizza', price: 1500 }
    const { result } = renderHook(() =>
      useFormModal({ name: '', price: 0 })
    )

    act(() => {
      result.current.openEdit(existingProduct, {
        name: existingProduct.name,
        price: existingProduct.price
      })
    })

    expect(result.current.isOpen).toBe(true)
    expect(result.current.selectedItem).toEqual(existingProduct)
    expect(result.current.formData.name).toBe('Pizza')
  })
})

// Test de validación
describe('validateProduct', () => {
  it('should require name', () => {
    const result = validateProduct({ price: 1000 })

    expect(result.isValid).toBe(false)
    expect(result.errors.name).toBe('El nombre es requerido')
  })

  it('should reject negative price', () => {
    const result = validateProduct({ name: 'Pizza', price: -100 })

    expect(result.isValid).toBe(false)
    expect(result.errors.price).toBe('El precio no puede ser negativo')
  })

  it('should accept valid product', () => {
    const result = validateProduct({
      name: 'Pizza Margherita',
      price: 1500,
      category_id: '1'
    })

    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual({})
  })
})
```

### Cobertura

| Área | Tests | Cobertura |
|------|-------|-----------|
| Hooks | 40+ | ~95% |
| Validación | 17 | 100% |
| Componentes | 30+ | ~80% |
| Stores | 20+ | ~75% |
| **Total** | **100** | **~85%** |

---

## Configuración de Build

### Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          ['babel-plugin-react-compiler', { target: '19' }]
        ]
      }
    }),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Buen Sabor Dashboard',
        short_name: 'Dashboard',
        description: 'Panel de administración de restaurantes',
        theme_color: '#f97316',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365  // 1 año
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],

  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'icons': ['lucide-react'],
          'state': ['zustand']
        }
      }
    }
  },

  server: {
    port: 5177,
    strictPort: true
  }
})
```

### TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    // Strict mode
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,

    // Path aliases
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"]
}
```

---

## Resumen de Arquitectura

| Aspecto | Implementación |
|---------|----------------|
| **Framework** | React 19 + React Router 7 |
| **Estado** | Zustand 5 + localStorage persist |
| **API** | REST con fetchAPI wrapper + mutex refresh |
| **WebSocket** | Singleton con throttling + reconnect |
| **Estilos** | Tailwind CSS 4 + Lucide Icons |
| **Build** | Vite 7 + React Compiler |
| **Testing** | Vitest + RTL (100 tests) |
| **PWA** | Workbox + manifest |
| **Patrones** | Selectores, Mutex, Snapshot/Restore, Ref Handler |

### Métricas Clave

| Métrica | Valor |
|---------|-------|
| Páginas | 19 |
| Stores | 15 |
| Componentes UI | 23 |
| Hooks | 13 |
| Tests | 100 |
| Bundle gzipped | ~85 kB |
| LCP | ~1.2s |
| CLS | <0.1 |

Esta arquitectura proporciona una base escalable y mantenible para interfaces administrativas enterprise, con patrones probados para manejo de estado, comunicación en tiempo real y resiliencia ante errores.
