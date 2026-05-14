# Dashboard

Panel de administración para el sistema de gestión gastronómica multi-sucursal. Esta aplicación React representa el centro de operaciones desde el cual administradores y gerentes controlan el catálogo de productos, gestionan personal, configuran sucursales, monitorean pedidos en tiempo real y analizan el rendimiento del negocio.

---

## Visión General

El Dashboard nace de la necesidad de centralizar la administración de operaciones gastronómicas complejas donde múltiples sucursales comparten un catálogo base pero requieren personalización individual. Un restaurante con cinco sucursales necesita que la Milanesa Napolitana exista una sola vez en el sistema, pero cada sucursal debe poder definir su propio precio, decidir si la ofrece o no, y gestionar su propio personal de cocina y salón.

La arquitectura del Dashboard refleja esta realidad mediante un modelo de datos jerárquico donde el tenant (restaurante) contiene sucursales, las sucursales contienen sectores y mesas, y los productos pueden tener precios diferenciados por ubicación. El sistema de permisos garantiza que un gerente de sucursal pueda administrar únicamente los recursos bajo su responsabilidad, mientras que el administrador general mantiene control total sobre todas las operaciones.

La aplicación está construida sobre React 19 con TypeScript en modo estricto, aprovechando las capacidades del React Compiler para optimización automática de re-renders. Zustand gestiona el estado global con persistencia en localStorage, mientras que una conexión WebSocket al gateway proporciona actualizaciones en tiempo real cuando un cliente escanea un código QR, un mozo toma un pedido o la cocina marca un plato como listo.

---

## Arquitectura Técnica

### La Decisión de React 19 y el Compilador

La elección de React 19 no fue casual. El React Compiler, habilitado mediante babel-plugin-react-compiler en la configuración de Vite, analiza el código durante la compilación y genera automáticamente las memoizaciones necesarias. En versiones anteriores de React, el desarrollador debía decidir manualmente cuándo usar `useMemo` para cálculos costosos o `useCallback` para funciones pasadas como props. Esta responsabilidad manual conducía inevitablemente a dos problemas: memoización excesiva que añadía complejidad sin beneficio, o memoización insuficiente que causaba re-renders innecesarios.

El compilador resuelve ambos problemas analizando las dependencias reales de cada expresión. Cuando detecta que un valor calculado depende únicamente de props que no han cambiado, genera código que reutiliza el valor anterior. Cuando detecta que una función callback solo captura variables estables, evita recrearla en cada render. El resultado es código más limpio donde el desarrollador escribe la lógica natural y el compilador optimiza la ejecución.

Sin embargo, el compilador no puede resolver todos los problemas de rendimiento. El patrón de selectores de Zustand sigue siendo crítico porque el problema que resuelve ocurre en la capa de suscripción al store, no en la capa de rendering. Cuando un componente se suscribe a un store completo mediante desestructuración, cualquier cambio en cualquier propiedad del store dispara una actualización. El compilador puede optimizar qué hace el componente con los datos, pero no puede evitar que el componente reciba notificaciones innecesarias.

### El Patrón de Selectores de Zustand

Cada store del Dashboard exporta selectores dedicados que los componentes utilizan para suscribirse únicamente a las porciones de estado que necesitan. Este patrón requiere disciplina pero genera beneficios significativos en aplicaciones con estado complejo.

Consideremos el productStore que gestiona cientos de productos. Un componente que muestra únicamente el contador de productos activos no necesita re-renderizarse cuando cambia el nombre de un producto individual. Sin selectores, cualquier modificación al array de productos dispararía una actualización:

```typescript
// Implementación incorrecta que causa re-renders excesivos
function ProductCounter() {
  const { products } = useProductStore() // Suscripción al store completo
  const activeCount = products.filter(p => p.is_active).length
  return <span>{activeCount} productos activos</span>
}
```

La versión correcta utiliza un selector que calcula el valor derivado dentro del proceso de suscripción:

```typescript
// Implementación correcta con selector memoizado
const selectActiveProductCount = (state: ProductState) =>
  state.products.filter(p => p.is_active).length

function ProductCounter() {
  const activeCount = useProductStore(selectActiveProductCount)
  return <span>{activeCount} productos activos</span>
}
```

Zustand compara el resultado del selector antes y después de cada cambio de estado. Si el selector retorna el mismo valor (determinado por igualdad referencial para objetos o igualdad de valor para primitivos), el componente no se actualiza. El filtrado ocurre dentro del selector, y si el conteo resultante es idéntico al anterior, no hay re-render.

Para selectores que retornan arrays filtrados, el Dashboard implementa un patrón de cache externo que garantiza estabilidad referencial:

```typescript
const EMPTY_PRODUCTS: Product[] = []
const cache = { source: null as Product[] | null, result: EMPTY_PRODUCTS }

export const selectActiveProducts = (state: ProductState) => {
  if (state.products === cache.source) {
    return cache.result
  }

  const filtered = state.products.filter(p => p.is_active)
  cache.source = state.products
  cache.result = filtered.length > 0 ? filtered : EMPTY_PRODUCTS
  return cache.result
}
```

Este patrón utiliza un objeto de cache fuera del selector. Cuando el array fuente no ha cambiado (comparación referencial rápida), retorna inmediatamente el resultado cacheado. Cuando el array fuente cambia, ejecuta el filtrado y actualiza el cache. La constante EMPTY_PRODUCTS garantiza que un array vacío siempre tenga la misma referencia, evitando re-renders cuando no hay productos activos.

### Persistencia de Estado y Migraciones

Los stores del Dashboard persisten automáticamente su estado en localStorage mediante el middleware `persist` de Zustand. Esta persistencia permite que un usuario cierre el navegador, regrese horas después, y encuentre su sesión exactamente como la dejó: la sucursal seleccionada, los filtros aplicados, el scroll en las listas.

Cada store define un número de versión que habilita migraciones controladas cuando el esquema de datos evoluciona:

```typescript
export const useProductStore = create<ProductState>()(
  persist(
    (set, get) => ({
      products: [],
      selectedBranchId: null,
      viewMode: 'grid',

      // Acciones del store...
    }),
    {
      name: 'dashboard-products-v2',
      version: 2,

      migrate: (persistedState, version) => {
        if (version === 1) {
          // Migración de v1 a v2: renombrar campo
          return {
            ...persistedState,
            viewMode: persistedState.displayMode ?? 'grid',
          }
        }
        return persistedState
      },

      partialize: (state) => ({
        selectedBranchId: state.selectedBranchId,
        viewMode: state.viewMode,
        // Los productos no se persisten - se cargan del servidor
      }),
    }
  )
)
```

La función `partialize` es crucial para evitar inconsistencias. Los productos reales se cargan siempre del servidor para garantizar datos actualizados, pero las preferencias del usuario (sucursal seleccionada, modo de visualización) se persisten localmente. Esta distinción entre "datos del servidor" y "preferencias del usuario" guía qué propiedades incluir en la persistencia.

---

## Estructura del Proyecto

La organización del código sigue el principio de separación por responsabilidad, donde cada directorio agrupa archivos que comparten un propósito común:

```
Dashboard/
├── src/
│   ├── components/
│   │   ├── ui/               # Primitivos de interfaz reutilizables
│   │   ├── layout/           # Estructura visual de la aplicación
│   │   ├── tables/           # Componentes específicos de gestión de mesas
│   │   └── auth/             # Protección de rutas autenticadas
│   │
│   ├── pages/                # Componentes de página (rutas principales)
│   ├── stores/               # Estados globales con Zustand
│   ├── hooks/                # Lógica reutilizable extraída en hooks
│   ├── services/             # Integración con APIs externas
│   ├── types/                # Definiciones TypeScript del dominio
│   ├── utils/                # Funciones utilitarias puras
│   └── config/               # Configuración de entorno
```

### Componentes: La Interfaz Visual

El directorio `components/ui` contiene más de cuarenta componentes primitivos que forman el vocabulario visual de la aplicación. Estos componentes no conocen el dominio del negocio; un Button no sabe si confirma una eliminación de producto o inicia sesión. Su responsabilidad se limita a presentación y comportamiento genérico.

Los componentes de layout definen la estructura espacial: el Sidebar que navega entre secciones, el Header que muestra el usuario actual y permite cambiar de sucursal, el PageContainer que envuelve cada página con título y descripción contextual. Esta separación permite que cambios en la navegación no afecten a los componentes de contenido.

Los componentes específicos de dominio, como los que gestionan mesas, viven en directorios dedicados. El TableSessionModal, por ejemplo, muestra el detalle de una mesa ocupada con sus comensales y pedidos. Este componente conoce el dominio: sabe qué es un Round, qué significa que un item esté en estado PENDING versus IN_KITCHEN. Esta especialización lo hace inadecuado para reutilización general, pero altamente efectivo para su propósito específico.

### Páginas: Puntos de Entrada de Rutas

Cada archivo en `pages` corresponde a una ruta de la aplicación. ProductsPage se monta cuando el usuario navega a `/products`, TablesPage cuando navega a `/branches/tables`. Las páginas orquestan componentes, conectan con stores, y definen la experiencia completa de una sección.

Las páginas del Dashboard siguen un patrón consistente. La mayoría implementa un CRUD completo: listado con filtros y paginación, modal de creación, modal de edición, diálogo de confirmación de eliminación. Este patrón repetitivo motivó la creación del hook useFormModal que encapsula el estado compartido entre estos flujos.

```typescript
// Patrón típico de página CRUD
function CategoriesPage() {
  const categories = useCategoryStore(selectCategories)
  const { createCategory, updateCategory, deleteCategory } = useCategoryStore.getState()

  const modal = useFormModal<CategoryFormData>({
    name: '',
    icon: '',
    order: 0,
  })

  const confirmDialog = useConfirmDialog<Category>()

  const handleCreate = async (data: CategoryFormData) => {
    await createCategory(data)
    modal.close()
  }

  const handleDelete = async (category: Category) => {
    await deleteCategory(category.id)
    confirmDialog.close()
  }

  return (
    <PageContainer title="Categorías" description="Gestión del catálogo">
      <Button onClick={modal.openCreate}>Nueva Categoría</Button>

      <CategoryList
        categories={categories}
        onEdit={(cat) => modal.openEdit(cat)}
        onDelete={(cat) => confirmDialog.open(cat)}
      />

      <CategoryFormModal
        isOpen={modal.isOpen}
        mode={modal.mode}
        formData={modal.formData}
        onChange={modal.setFormData}
        onSubmit={modal.mode === 'create' ? handleCreate : handleUpdate}
        onClose={modal.close}
      />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title="Eliminar categoría"
        message={`¿Eliminar "${confirmDialog.item?.name}"?`}
        onConfirm={() => handleDelete(confirmDialog.item!)}
        onCancel={confirmDialog.close}
      />
    </PageContainer>
  )
}
```

Este patrón se repite con variaciones en quince páginas diferentes. La consistencia beneficia tanto a usuarios (interfaz predecible) como a desarrolladores (código familiar).

### Services: Comunicación con el Exterior

El archivo `api.ts` centraliza toda comunicación HTTP con el backend. Con casi dos mil líneas, define wrappers tipados para más de ochenta endpoints organizados por dominio: authAPI para autenticación, productAPI para productos, tableAPI para mesas.

La decisión de centralizar en un solo archivo en lugar de distribuir en múltiples módulos responde a la necesidad de compartir estado de autenticación. El token JWT y el refresh token son globales al módulo, accesibles por todas las funciones sin necesidad de pasarlos como parámetros:

```typescript
let authToken: string | null = null
let refreshToken: string | null = null

export function setAuthTokens(access: string, refresh: string) {
  authToken = access
  refreshToken = refresh
}

export function clearAuthTokens() {
  authToken = null
  refreshToken = null
}

async function fetchAPI<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers },
    credentials: 'include',
  })

  if (response.status === 401 && refreshToken) {
    const newToken = await attemptTokenRefresh()
    if (newToken) {
      return fetchAPI(endpoint, options) // Reintentar con nuevo token
    }
  }

  if (!response.ok) {
    throw new APIError(response.status, await response.text())
  }

  return response.json()
}
```

El patrón de refresh de token utiliza una técnica de mutex mediante promesa compartida. Cuando múltiples requests simultáneos reciben un 401, solo el primero ejecuta el refresh; los demás esperan la misma promesa:

```typescript
let refreshPromise: Promise<string | null> | null = null

async function attemptTokenRefresh(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise // Reutilizar refresh en progreso
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })

      if (!response.ok) return null

      const data = await response.json()
      authToken = data.access_token
      refreshToken = data.refresh_token
      return data.access_token
    } finally {
      refreshPromise = null // Liberar mutex
    }
  })()

  return refreshPromise
}
```

Sin este mutex, diez requests fallidos dispararían diez refreshes simultáneos, potencialmente invalidando tokens mientras otros requests los utilizan.

### WebSocket: Tiempo Real sin Polling

El servicio websocket.ts mantiene una conexión persistente con el gateway que emite eventos cuando el estado del sistema cambia. Un nuevo pedido, un cambio de estado de mesa, un pago aprobado: todos estos eventos fluyen por el WebSocket hasta el Dashboard, que actualiza la interfaz inmediatamente.

La conexión se establece tras el login exitoso y se mantiene mientras el usuario permanece autenticado. El servicio implementa reconexión automática con backoff exponencial cuando la conexión se pierde:

```typescript
class DashboardWebSocketService {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private listeners = new Map<string, Set<(data: any) => void>>()

  async connect(endpoint: 'admin' | 'kitchen') {
    const token = getAuthToken()
    if (!token) return

    const url = `${WS_BASE_URL}/ws/${endpoint}?token=${token}`
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.startHeartbeat()
    }

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      this.notifyListeners(data.type, data)
    }

    this.ws.onclose = (event) => {
      if (event.code !== 1000) { // Cierre no intencional
        this.scheduleReconnect()
      }
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
    this.reconnectAttempts++

    setTimeout(() => this.connect('admin'), delay)
  }

  on(eventType: string, callback: (data: any) => void): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType)!.add(callback)

    return () => {
      this.listeners.get(eventType)?.delete(callback)
    }
  }
}
```

Los componentes se suscriben a eventos específicos mediante el método `on`, que retorna una función de cleanup compatible con el patrón de useEffect:

```typescript
useEffect(() => {
  const unsubscribe = dashboardWS.on('ROUND_SUBMITTED', (data) => {
    tableStore.markTableWithNewOrder(data.table_id)
    toastStore.show('Nuevo pedido recibido', 'info')
  })

  return unsubscribe
}, [])
```

---

## Sistema de Autenticación

La autenticación del Dashboard implementa el flujo estándar de JWT con access token de corta duración (15 minutos) y refresh token de larga duración (7 días). Esta separación permite revocar sesiones comprometidas en minutos mientras mantiene una experiencia de usuario fluida sin reautenticaciones frecuentes.

El flujo comienza en la página de login donde el usuario ingresa credenciales. El authStore envía estas credenciales al backend y recibe el par de tokens:

```typescript
interface AuthState {
  user: AuthUser | null
  token: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean

  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
  checkAuth: () => Promise<boolean>
}

// Acción de login en el store
login: async (email, password) => {
  set({ isLoading: true, error: null })

  try {
    const response = await authAPI.login(email, password)

    setAuthTokens(response.access_token, response.refresh_token)

    set({
      user: response.user,
      token: response.access_token,
      refreshToken: response.refresh_token,
      isAuthenticated: true,
      isLoading: false,
    })

    // Conectar WebSocket tras login exitoso
    dashboardWS.connect(response.user.roles.includes('KITCHEN') ? 'kitchen' : 'admin')

    return true
  } catch (error) {
    set({ error: error.message, isLoading: false })
    return false
  }
}
```

El componente ProtectedRoute envuelve todas las rutas que requieren autenticación. En cada montaje, verifica la validez del token actual llamando al endpoint `/api/auth/me`:

```typescript
function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  const userRoles = useAuthStore(selectUserRoles)
  const checkAuth = useAuthStore((s) => s.checkAuth)

  const [isChecking, setIsChecking] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    checkAuth().then((valid) => {
      setIsChecking(false)
      if (!valid) {
        navigate('/login', { replace: true })
      }
    })
  }, [])

  if (isChecking) {
    return <LoadingSpinner />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (requiredRoles && !requiredRoles.some(role => userRoles.includes(role))) {
    return <Navigate to="/" replace />
  }

  return children
}
```

La verificación en montaje, aunque genera un request adicional, garantiza que tokens expirados o revocados se detecten inmediatamente. Un usuario que dejó el navegador abierto durante la noche no verá datos obsoletos: la aplicación verificará el token al activarse y redirigirá al login si es necesario.

---

## Control de Acceso Basado en Roles

El sistema de permisos del Dashboard implementa cuatro roles con capacidades diferenciadas. La jerarquía no es estrictamente lineal; cada rol posee capacidades específicas para su función.

El rol ADMIN representa al propietario o administrador general del restaurante. Puede crear y eliminar sucursales, gestionar todo el personal, modificar configuraciones críticas. No existe operación vedada para un administrador.

El rol MANAGER representa al gerente de una o más sucursales. Puede gestionar el catálogo y personal de sus sucursales asignadas, pero no puede crear nuevas sucursales ni acceder a datos de sucursales ajenas. Crucialmente, un manager no puede eliminar entidades: puede desactivarlas (soft delete) pero la eliminación permanente requiere intervención de administrador.

El rol KITCHEN representa al personal de cocina. Su acceso se limita a la página de cocina donde visualiza tickets pendientes y actualiza estados de preparación. No accede a configuración, personal ni datos financieros.

El rol WAITER representa al personal de salón. En el Dashboard, los mozos tienen acceso mínimo: pueden ver las mesas de sus sectores asignados pero no modificar configuraciones. La aplicación principal para mozos es pwaWaiter, no el Dashboard.

La implementación de permisos utiliza funciones puras que evalúan capacidades:

```typescript
// Verificaciones de rol básicas
export function isAdmin(roles: string[]): boolean {
  return roles.includes('ADMIN')
}

export function isManager(roles: string[]): boolean {
  return roles.includes('MANAGER')
}

export function isManagement(roles: string[]): boolean {
  return roles.includes('ADMIN') || roles.includes('MANAGER')
}

// Permisos por operación
export function canCreateBranch(roles: string[]): boolean {
  return isAdmin(roles)
}

export function canDeleteEntity(roles: string[]): boolean {
  return isAdmin(roles)
}

export function canEditBranch(roles: string[], userBranchIds: string[], branchId: string): boolean {
  if (isAdmin(roles)) return true
  if (isManager(roles) && userBranchIds.includes(branchId)) return true
  return false
}

export function canAccessKitchenPage(roles: string[]): boolean {
  return roles.some(r => ['ADMIN', 'MANAGER', 'KITCHEN'].includes(r))
}

export function canAccessStaffPage(roles: string[]): boolean {
  return isManagement(roles)
}
```

Los componentes utilizan estas funciones para renderizado condicional de controles:

```typescript
function ProductActions({ product }: { product: Product }) {
  const roles = useAuthStore(selectUserRoles)

  return (
    <div className="flex gap-2">
      {canEditProduct(roles) && (
        <Button onClick={() => handleEdit(product)}>Editar</Button>
      )}

      {canDeleteEntity(roles) && (
        <Button variant="danger" onClick={() => handleDelete(product)}>
          Eliminar
        </Button>
      )}
    </div>
  )
}
```

Aunque la UI oculta controles según permisos, el backend valida independientemente cada operación. Un usuario que manipule el frontend para enviar requests no autorizados recibirá errores 403 Forbidden.

---

## Validación de Formularios

La biblioteca de validación en `utils/validation.ts` proporciona funciones puras que evalúan datos de formulario y retornan errores estructurados. Cada validador recibe los datos a evaluar y opcionalmente contexto adicional (como listas de entidades existentes para validar unicidad):

```typescript
interface ValidationResult<T> {
  isValid: boolean
  errors: Partial<Record<keyof T, string>>
}

export function validateProduct(
  data: ProductFormData,
  options?: {
    existingProducts?: Product[]
    isEditing?: boolean
    editingId?: string
  }
): ValidationResult<ProductFormData> & { branchPriceErrors: Record<string, string> } {
  const errors: Partial<Record<keyof ProductFormData, string>> = {}
  const branchPriceErrors: Record<string, string> = {}

  // Nombre: requerido, 2-100 caracteres
  if (!data.name?.trim()) {
    errors.name = 'El nombre es requerido'
  } else if (data.name.length < 2) {
    errors.name = 'El nombre debe tener al menos 2 caracteres'
  } else if (data.name.length > 100) {
    errors.name = 'El nombre no puede exceder 100 caracteres'
  }

  // Unicidad de nombre por subcategoría
  if (data.name && data.subcategory_id && options?.existingProducts) {
    const duplicate = options.existingProducts.find(
      p => p.name.toLowerCase() === data.name.toLowerCase() &&
           p.subcategory_id === data.subcategory_id &&
           p.id !== options.editingId
    )
    if (duplicate) {
      errors.name = 'Ya existe un producto con este nombre en la subcategoría'
    }
  }

  // Precio base: positivo y finito
  if (data.price === undefined || data.price === null) {
    errors.price = 'El precio es requerido'
  } else if (!isFinite(data.price) || data.price <= 0) {
    errors.price = 'El precio debe ser un número positivo'
  }

  // Precios por sucursal
  if (data.use_branch_prices && data.branch_prices) {
    const hasActivePrice = data.branch_prices.some(bp => bp.is_active && bp.price > 0)
    if (!hasActivePrice) {
      errors.branch_prices = 'Debe haber al menos un precio de sucursal activo'
    }

    data.branch_prices.forEach(bp => {
      if (bp.is_active && (!isFinite(bp.price) || bp.price <= 0)) {
        branchPriceErrors[bp.branch_id] = 'Precio inválido'
      }
    })
  }

  // Categoría y subcategoría: requeridas
  if (!data.category_id) {
    errors.category_id = 'La categoría es requerida'
  }
  if (!data.subcategory_id) {
    errors.subcategory_id = 'La subcategoría es requerida'
  }

  return {
    isValid: Object.keys(errors).length === 0 && Object.keys(branchPriceErrors).length === 0,
    errors,
    branchPriceErrors,
  }
}
```

Los validadores retornan objetos donde las claves son nombres de campos y los valores son mensajes de error en español. Un formulario sin errores recibe un objeto `errors` vacío e `isValid: true`.

La validación de productos incluye un objeto separado `branchPriceErrors` porque los precios por sucursal forman una colección indexada por branch_id, no un campo simple. Esta estructura permite mostrar errores junto al input específico de cada sucursal.

Los componentes de formulario consumen estos resultados para mostrar feedback visual:

```typescript
function ProductForm({ onSubmit }: { onSubmit: (data: ProductFormData) => void }) {
  const [formData, setFormData] = useState<ProductFormData>(initialData)
  const [errors, setErrors] = useState<ValidationResult<ProductFormData>>({ isValid: true, errors: {} })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const validation = validateProduct(formData, { existingProducts })
    setErrors(validation)

    if (validation.isValid) {
      onSubmit(formData)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Input
        label="Nombre"
        value={formData.name}
        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
        error={errors.errors.name}
      />

      <Input
        label="Precio"
        type="number"
        value={formData.price}
        onChange={(e) => setFormData(prev => ({ ...prev, price: Number(e.target.value) }))}
        error={errors.errors.price}
      />

      <Button type="submit">Guardar</Button>
    </form>
  )
}
```

El componente Input renderiza el mensaje de error cuando existe, aplicando estilos visuales que indican el problema:

```typescript
function Input({ label, error, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-zinc-300">{label}</label>
      <input
        className={cn(
          'rounded-lg border bg-zinc-800 px-3 py-2',
          error ? 'border-red-500' : 'border-zinc-700'
        )}
        {...props}
      />
      {error && (
        <span className="text-sm text-red-400">{error}</span>
      )}
    </div>
  )
}
```

---

## Hooks Personalizados

Los hooks del Dashboard encapsulan patrones de lógica que se repiten en múltiples componentes. Cada hook resuelve un problema específico y expone una interfaz clara.

### useFormModal

El hook useFormModal gestiona el estado combinado de un modal de formulario. Sin este hook, cada página CRUD requeriría tres estados separados: si el modal está abierto, qué item se está editando, y los datos del formulario. Este patrón se repite en quince páginas, lo que justifica su extracción:

```typescript
interface UseFormModalReturn<T, I> {
  isOpen: boolean
  mode: 'create' | 'edit'
  editingItem: I | null
  formData: T

  openCreate: (initialData?: Partial<T>) => void
  openEdit: (item: I, formData: T) => void
  close: () => void
  setFormData: React.Dispatch<React.SetStateAction<T>>
}

export function useFormModal<T, I = any>(initialFormData: T): UseFormModalReturn<T, I> {
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<'create' | 'edit'>('create')
  const [editingItem, setEditingItem] = useState<I | null>(null)
  const [formData, setFormData] = useState<T>(initialFormData)

  const openCreate = useCallback((initial?: Partial<T>) => {
    setFormData({ ...initialFormData, ...initial })
    setEditingItem(null)
    setMode('create')
    setIsOpen(true)
  }, [initialFormData])

  const openEdit = useCallback((item: I, data: T) => {
    setFormData(data)
    setEditingItem(item)
    setMode('edit')
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    // Reset diferido para evitar flash visual durante animación de cierre
    setTimeout(() => {
      setFormData(initialFormData)
      setEditingItem(null)
      setMode('create')
    }, 300)
  }, [initialFormData])

  return { isOpen, mode, editingItem, formData, openCreate, openEdit, close, setFormData }
}
```

El reset diferido durante el cierre es un detalle de UX importante. Si el formData se limpiara inmediatamente, el usuario vería el formulario vaciarse durante la animación de fade-out del modal. El setTimeout de 300ms permite que la animación complete antes del reset.

### useConfirmDialog

Similar a useFormModal, pero especializado en diálogos de confirmación que necesitan referencia al item sobre el cual se actuará:

```typescript
interface UseConfirmDialogReturn<T> {
  isOpen: boolean
  item: T | null
  open: (item: T) => void
  close: () => void
}

export function useConfirmDialog<T>(): UseConfirmDialogReturn<T> {
  const [isOpen, setIsOpen] = useState(false)
  const [item, setItem] = useState<T | null>(null)

  const open = useCallback((newItem: T) => {
    setItem(newItem)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setTimeout(() => setItem(null), 300)
  }, [])

  return { isOpen, item, open, close }
}
```

### usePagination

Gestiona estado de paginación con reset automático cuando cambian los filtros:

```typescript
interface UsePaginationReturn {
  page: number
  pageSize: number
  offset: number
  setPage: (page: number) => void
  setPageSize: (size: number) => void
  reset: () => void
}

export function usePagination(initialPageSize = 20): UsePaginationReturn {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)

  const offset = (page - 1) * pageSize

  const reset = useCallback(() => {
    setPage(1)
  }, [])

  const handleSetPageSize = useCallback((size: number) => {
    setPageSize(size)
    setPage(1) // Reset a página 1 al cambiar tamaño
  }, [])

  return {
    page,
    pageSize,
    offset,
    setPage,
    setPageSize: handleSetPageSize,
    reset,
  }
}
```

El componente que usa este hook típicamente llama `reset()` cuando cambian los filtros de búsqueda para evitar páginas vacías.

### useFocusTrap

Implementa captura de foco para accesibilidad en modales. Cuando un modal está abierto, el foco debe permanecer dentro del modal; presionar Tab no debe mover el foco a elementos detrás del overlay:

```typescript
export function useFocusTrap<T extends HTMLElement>(isActive: boolean) {
  const containerRef = useRef<T>(null)

  useEffect(() => {
    if (!isActive || !containerRef.current) return

    const container = containerRef.current
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const focusables = container.querySelectorAll<HTMLElement>(focusableSelector)
      const first = focusables[0]
      const last = focusables[focusables.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    container.focus()
    document.addEventListener('keydown', handleKeyDown)

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isActive])

  return containerRef
}
```

Este hook retorna una ref que el componente Modal asigna a su contenedor. Cuando el modal se activa, el foco se mueve automáticamente al contenedor y queda atrapado dentro.

---

## Integración en Tiempo Real

El Dashboard mantiene sincronización constante con el estado del sistema mediante WebSocket. Cuando un cliente en pwaMenu escanea un código QR, el Dashboard refleja inmediatamente el cambio de estado de la mesa. Cuando la cocina marca un plato como listo, la interfaz de administración lo muestra sin necesidad de refresh.

Esta integración ocurre en dos niveles. El servicio websocket.ts gestiona la conexión y distribución de eventos. Los hooks useAdminWebSocket y useTableWebSocket consumen estos eventos y actualizan los stores correspondientes.

```typescript
export function useAdminWebSocket() {
  const updateTableStatus = useTableStore((s) => s.updateTableStatus)
  const markTableWithNewOrder = useTableStore((s) => s.markTableWithNewOrder)
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    const subscriptions: (() => void)[] = []

    // Nueva sesión de mesa (cliente escaneó QR)
    subscriptions.push(
      dashboardWS.on('TABLE_SESSION_STARTED', (data) => {
        updateTableStatus(data.table_id, 'ocupada')
        addToast({
          type: 'info',
          message: `Mesa ${data.table_number} ocupada`,
        })
      })
    )

    // Nuevo pedido recibido
    subscriptions.push(
      dashboardWS.on('ROUND_SUBMITTED', (data) => {
        markTableWithNewOrder(data.table_id)
        addToast({
          type: 'warning',
          message: `Nuevo pedido en mesa ${data.table_number}`,
          duration: 10000, // Más tiempo para pedidos
        })
      })
    )

    // Pedido listo en cocina
    subscriptions.push(
      dashboardWS.on('ROUND_READY', (data) => {
        addToast({
          type: 'success',
          message: `Pedido listo para mesa ${data.table_number}`,
        })
      })
    )

    // Pago aprobado
    subscriptions.push(
      dashboardWS.on('PAYMENT_APPROVED', (data) => {
        updateTableStatus(data.table_id, 'pagada')
      })
    )

    return () => {
      subscriptions.forEach(unsubscribe => unsubscribe())
    }
  }, [updateTableStatus, markTableWithNewOrder, addToast])
}
```

El patrón de suscripciones con cleanup garantiza que los event listeners se remuevan cuando el componente se desmonta, evitando memory leaks y actualizaciones a componentes desmontados.

La función `markTableWithNewOrder` implementa una animación visual que llama la atención del administrador:

```typescript
// En tableStore
markTableWithNewOrder: (tableId) => set((state) => ({
  tables: state.tables.map(table =>
    table.id === tableId
      ? { ...table, status: 'ocupada', hasNewOrder: true }
      : table
  ),
}))

clearNewOrderFlag: (tableId) => set((state) => ({
  tables: state.tables.map(table =>
    table.id === tableId
      ? { ...table, hasNewOrder: false }
      : table
  ),
}))
```

El componente TableCard aplica una clase de animación cuando `hasNewOrder` es true:

```typescript
function TableCard({ table }: { table: Table }) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-all',
        table.hasNewOrder && 'animate-pulse-warning'
      )}
    >
      {/* Contenido de la tarjeta */}
    </div>
  )
}
```

La animación `pulse-warning` definida en CSS alterna entre naranja y amarillo, creando un efecto visual que persiste hasta que el administrador interactúa con la mesa, momento en que se llama `clearNewOrderFlag`.

---

## Eliminación en Cascada

El modelo de datos del Dashboard contiene relaciones profundas donde eliminar una entidad padre requiere eliminar o actualizar múltiples hijos. Eliminar una categoría implica eliminar sus subcategorías, que a su vez implica eliminar productos, que implica eliminar relaciones con alérgenos, ingredientes y precios por sucursal.

El servicio cascadeService.ts orquesta estas eliminaciones manteniendo integridad referencial. La implementación utiliza inyección de dependencias para facilitar testing:

```typescript
interface CascadeStores {
  categoryStore: CategoryStore
  subcategoryStore: SubcategoryStore
  productStore: ProductStore
  promotionStore: PromotionStore
}

export function cascadeDeleteCategory(
  categoryId: string,
  stores: CascadeStores
): CascadeDeleteResult {
  const { categoryStore, subcategoryStore, productStore, promotionStore } = stores

  const deletedCounts = {
    products: 0,
    subcategories: 0,
    promotionItems: 0,
  }

  try {
    // 1. Obtener subcategorías de la categoría
    const subcategories = subcategoryStore.getByCategoryId(categoryId)

    // 2. Para cada subcategoría, eliminar productos
    for (const subcategory of subcategories) {
      const products = productStore.getBySubcategoryId(subcategory.id)
      for (const product of products) {
        // Remover de promociones que lo contengan
        promotionStore.removeProductFromAllPromotions(product.id)
        deletedCounts.promotionItems++

        productStore.deleteProduct(product.id)
        deletedCounts.products++
      }

      subcategoryStore.deleteSubcategory(subcategory.id)
      deletedCounts.subcategories++
    }

    // 3. Finalmente eliminar la categoría
    categoryStore.deleteCategory(categoryId)

    return { success: true, deletedCounts }
  } catch (error) {
    return {
      success: false,
      deletedCounts,
      error: error instanceof Error ? error.message : 'Error desconocido',
    }
  }
}

// Wrapper con stores inyectados automáticamente
export function deleteCategoryWithCascade(categoryId: string): CascadeDeleteResult {
  return cascadeDeleteCategory(categoryId, {
    categoryStore: useCategoryStore.getState(),
    subcategoryStore: useSubcategoryStore.getState(),
    productStore: useProductStore.getState(),
    promotionStore: usePromotionStore.getState(),
  })
}
```

Antes de ejecutar la eliminación, el componente muestra un preview de qué se eliminará mediante el componente CascadePreviewList:

```typescript
function DeleteCategoryDialog({ category, onConfirm, onCancel }: Props) {
  const subcategories = useSubcategoryStore(selectByCategoryId(category.id))
  const products = useProductStore(selectByCategoryId(category.id))

  return (
    <ConfirmDialog
      title={`Eliminar "${category.name}"`}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p className="text-zinc-400 mb-4">
        Esta acción eliminará también:
      </p>

      <CascadePreviewList
        items={[
          { type: 'Subcategorías', count: subcategories.length },
          { type: 'Productos', count: products.length },
        ]}
      />

      <p className="text-red-400 mt-4 text-sm">
        Esta acción no se puede deshacer.
      </p>
    </ConfirmDialog>
  )
}
```

Este preview permite al usuario comprender el impacto completo antes de confirmar, reduciendo eliminaciones accidentales de datos importantes.

---

## Pruebas

El Dashboard incluye cien pruebas automatizadas que verifican la funcionalidad de hooks, validadores y utilidades. La ejecución completa toma aproximadamente tres segundos, permitiendo feedback rápido durante el desarrollo.

La configuración de Vitest establece jsdom como entorno para simular APIs del navegador:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'src/test/'],
    },
  },
})
```

El archivo setup.ts configura mocks globales necesarios para las pruebas:

```typescript
// src/test/setup.ts
import '@testing-library/jest-dom'

// Mock de localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
global.localStorage = localStorageMock as any

// Mock de matchMedia para hooks de tema
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  })),
})
```

Las pruebas de hooks utilizan renderHook de Testing Library:

```typescript
import { renderHook, act } from '@testing-library/react'
import { useFormModal } from '../hooks/useFormModal'

describe('useFormModal', () => {
  const initialData = { name: '', price: 0 }

  it('should initialize with closed state', () => {
    const { result } = renderHook(() => useFormModal(initialData))

    expect(result.current.isOpen).toBe(false)
    expect(result.current.mode).toBe('create')
    expect(result.current.editingItem).toBeNull()
  })

  it('should open for create with initial data', () => {
    const { result } = renderHook(() => useFormModal(initialData))

    act(() => {
      result.current.openCreate({ name: 'Nuevo' })
    })

    expect(result.current.isOpen).toBe(true)
    expect(result.current.mode).toBe('create')
    expect(result.current.formData).toEqual({ name: 'Nuevo', price: 0 })
  })

  it('should open for edit with item and form data', () => {
    const { result } = renderHook(() => useFormModal(initialData))
    const item = { id: '1', name: 'Existente' }

    act(() => {
      result.current.openEdit(item, { name: 'Existente', price: 100 })
    })

    expect(result.current.isOpen).toBe(true)
    expect(result.current.mode).toBe('edit')
    expect(result.current.editingItem).toEqual(item)
    expect(result.current.formData).toEqual({ name: 'Existente', price: 100 })
  })

  it('should close and reset state', async () => {
    const { result } = renderHook(() => useFormModal(initialData))

    act(() => {
      result.current.openEdit({ id: '1' }, { name: 'Test', price: 50 })
    })

    act(() => {
      result.current.close()
    })

    expect(result.current.isOpen).toBe(false)

    // Esperar reset diferido
    await new Promise(resolve => setTimeout(resolve, 350))

    expect(result.current.formData).toEqual(initialData)
    expect(result.current.editingItem).toBeNull()
  })
})
```

Las pruebas de validación verifican tanto casos válidos como inválidos:

```typescript
describe('validateProduct', () => {
  it('should pass validation with valid data', () => {
    const data = {
      name: 'Milanesa Napolitana',
      price: 15000,
      category_id: '1',
      subcategory_id: '2',
    }

    const result = validateProduct(data)

    expect(result.isValid).toBe(true)
    expect(Object.keys(result.errors)).toHaveLength(0)
  })

  it('should fail validation with empty name', () => {
    const data = {
      name: '',
      price: 15000,
      category_id: '1',
      subcategory_id: '2',
    }

    const result = validateProduct(data)

    expect(result.isValid).toBe(false)
    expect(result.errors.name).toBeDefined()
  })

  it('should detect duplicate name in same subcategory', () => {
    const existingProducts = [
      { id: '1', name: 'Milanesa', subcategory_id: '2' },
    ]

    const data = {
      name: 'milanesa', // Case insensitive
      price: 15000,
      category_id: '1',
      subcategory_id: '2',
    }

    const result = validateProduct(data, { existingProducts })

    expect(result.isValid).toBe(false)
    expect(result.errors.name).toContain('existe')
  })

  it('should allow same name in different subcategory', () => {
    const existingProducts = [
      { id: '1', name: 'Milanesa', subcategory_id: '2' },
    ]

    const data = {
      name: 'Milanesa',
      price: 15000,
      category_id: '1',
      subcategory_id: '3', // Different subcategory
    }

    const result = validateProduct(data, { existingProducts })

    expect(result.isValid).toBe(true)
  })
})
```

---

## Consideraciones de Rendimiento

El Dashboard implementa varias optimizaciones para mantener una interfaz fluida incluso con grandes volúmenes de datos.

El code splitting mediante React.lazy divide el bundle en chunks que se cargan bajo demanda. La página de productos, la más compleja del sistema, solo se descarga cuando el usuario navega a ella:

```typescript
const ProductsPage = lazy(() => import('./pages/Products'))
const KitchenPage = lazy(() => import('./pages/Kitchen'))
const TablesPage = lazy(() => import('./pages/Tables'))

function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/kitchen" element={<KitchenPage />} />
        <Route path="/tables" element={<TablesPage />} />
      </Routes>
    </Suspense>
  )
}
```

El React Compiler analiza dependencias y genera memoización automática, pero el patrón de selectores de Zustand sigue siendo necesario para evitar suscripciones innecesarias a nivel de store.

Los componentes que renderizan listas largas utilizan paginación del lado del servidor. En lugar de cargar miles de productos y filtrar en el frontend, el Dashboard solicita páginas de datos al backend:

```typescript
const { data, isLoading } = useQuery(
  ['products', { page, pageSize, categoryId, search }],
  () => productAPI.list({
    offset: (page - 1) * pageSize,
    limit: pageSize,
    category_id: categoryId,
    search,
  })
)
```

Para operaciones frecuentes como búsqueda, el Dashboard implementa debouncing que reduce requests innecesarios:

```typescript
function SearchInput({ onSearch }: { onSearch: (term: string) => void }) {
  const [value, setValue] = useState('')
  const debouncedValue = useDebounce(value, 300)

  useEffect(() => {
    onSearch(debouncedValue)
  }, [debouncedValue, onSearch])

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="Buscar..."
    />
  )
}
```

El usuario puede escribir rápidamente sin que cada tecla dispare un request; solo el valor final tras 300ms de inactividad genera la búsqueda.

---

## Accesibilidad

El Dashboard implementa prácticas de accesibilidad que permiten su uso con tecnologías asistivas.

Los modales capturan el foco mediante useFocusTrap, garantizando que usuarios de teclado no naveguen accidentalmente a elementos detrás del overlay. El foco inicial se coloca en el primer elemento interactivo del modal.

Todos los botones con iconos sin texto incluyen aria-label descriptivo:

```typescript
<button
  onClick={handleDelete}
  aria-label={`Eliminar ${product.name}`}
  className="p-2 hover:bg-red-500/10 rounded"
>
  <Trash2 className="w-4 h-4" />
</button>
```

Los estados de carga se comunican mediante aria-busy y aria-live regions:

```typescript
<div aria-busy={isLoading} aria-live="polite">
  {isLoading ? (
    <span className="sr-only">Cargando productos...</span>
  ) : (
    <ProductList products={products} />
  )}
</div>
```

El skip link al inicio del Layout permite saltar directamente al contenido principal:

```typescript
function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-zinc-800 focus:text-white focus:rounded"
      >
        Saltar al contenido principal
      </a>

      <Header />
      <Sidebar />

      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
    </>
  )
}
```

---

## Variables de Entorno

La configuración del Dashboard se realiza mediante variables de entorno prefijadas con VITE_ para exposición al frontend:

```bash
# URL del backend REST API
VITE_API_URL=http://localhost:8000

# URL del WebSocket Gateway
VITE_WS_URL=ws://localhost:8001

# Timeout para requests HTTP (milisegundos)
VITE_API_TIMEOUT=30000

# Entorno de ejecución
VITE_ENVIRONMENT=development

# Habilitar logging de debug
VITE_DEBUG_MODE=true
```

El archivo `config/env.ts` centraliza el acceso con valores por defecto:

```typescript
export const env = {
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:8000',
  wsUrl: import.meta.env.VITE_WS_URL ?? 'ws://localhost:8001',
  apiTimeout: Number(import.meta.env.VITE_API_TIMEOUT) || 30000,
  environment: import.meta.env.VITE_ENVIRONMENT ?? 'development',
  debugMode: import.meta.env.VITE_DEBUG_MODE === 'true',

  get isDevelopment() {
    return this.environment === 'development'
  },

  get isProduction() {
    return this.environment === 'production'
  },
}
```

---

## Comandos de Desarrollo

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo (puerto 5177)
npm run dev

# Ejecutar pruebas
npm test

# Ejecutar pruebas con interfaz visual
npm run test:ui

# Ejecutar pruebas con cobertura
npm run test:coverage

# Verificar tipos TypeScript
npm run type-check

# Ejecutar linter
npm run lint

# Construir para producción
npm run build

# Previsualizar build de producción
npm run preview
```

---

## Documentación Relacionada

La documentación completa del sistema Integrador se distribuye en archivos especializados:

- [CLAUDE.md](CLAUDE.md) contiene guías de desarrollo específicas para el Dashboard, incluyendo patrones de código, convenciones y troubleshooting.

- [backend/README.md](../backend/README.md) documenta el REST API que el Dashboard consume, con detalle de endpoints, autenticación y modelos de datos.

- [ws_gateway/README.md](../ws_gateway/README.md) documenta el WebSocket Gateway que proporciona eventos en tiempo real.

- [devOps/README.md](../devOps/README.md) documenta la infraestructura Docker y scripts de inicio para el entorno de desarrollo.
