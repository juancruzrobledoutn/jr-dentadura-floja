# pwaMenu

Aplicación web progresiva para experiencias gastronómicas colaborativas. Cuando un grupo de amigos o familiares se sienta a comer, el proceso tradicional de pedido fragmenta la experiencia social: cada persona espera su turno para hablar con el mozo, desconoce qué están pidiendo los demás, y las decisiones sobre platos para compartir requieren negociación verbal sin contexto visual. pwaMenu transforma esta dinámica mediante un carrito compartido donde todos los comensales ven en tiempo real qué productos están agregando los demás, quién pidió cada item, y participan en una confirmación grupal antes de enviar cada ronda a la cocina.

---

## Fundamentos Arquitectónicos

La arquitectura de pwaMenu emerge de tres necesidades fundamentales que definen un sistema de pedidos colaborativo moderno. La primera necesidad es la operación offline: los restaurantes frecuentemente tienen conectividad intermitente, y un comensal que pierde señal en medio del pedido no debería perder su carrito ni su capacidad de navegar el menú. La segunda necesidad es la sincronización en tiempo real: cuando cuatro personas sentadas en una mesa agregan productos simultáneamente, cada dispositivo debe reflejar el estado combinado sin perder ningún item y sin duplicar ninguno. La tercera necesidad es el reconocimiento de dispositivos: clientes frecuentes que regresan semanas después deberían encontrar sus preferencias de filtrado restauradas sin necesidad de crear cuentas formales.

Estas tres necesidades determinaron las decisiones tecnológicas fundamentales. React 19 con TypeScript en modo estricto proporciona la base de componentes, aprovechando las nuevas primitivas como `useOptimistic` para actualizaciones instantáneas de interfaz y `useTransition` para mantener la fluidez durante operaciones pesadas. Zustand gestiona el estado global con patrones de selectores diseñados específicamente para evitar los bucles infinitos de re-renderizado que afectan a aplicaciones React 19 mal diseñadas. Workbox configura el service worker con estrategias de caché diferenciadas según el tipo de recurso. Y un sistema de tokens de mesa HMAC proporciona autenticación ligera sin requerir cuentas de usuario formales.

### El Desafío de la Consistencia Distribuida

El problema central de pwaMenu es un caso específico de consistencia eventual en sistemas distribuidos. Cuando múltiples dispositivos modifican el mismo carrito compartido, el sistema debe garantizar que todas las modificaciones se preserven, que ningún item se duplique, y que todos los dispositivos converjan al mismo estado final. La solución implementada utiliza tres mecanismos complementarios que operan en diferentes niveles del stack.

El primer mecanismo es el carrito compartido como array plano con atribución. En lugar de mantener carritos separados por comensal que luego requieren fusión compleja, el sistema almacena un único array `sharedCart` donde cada `CartItem` incluye el `dinerId` de quien lo agregó. Este diseño elimina la necesidad de algoritmos de merge sofisticados porque cada item tiene un identificador único generado mediante `crypto.randomUUID()`:

```typescript
interface CartItem {
  id: string              // UUID v4 generado con crypto.randomUUID()
  productId: string       // Referencia al producto del catálogo
  name: string            // Nombre cacheado para rendimiento
  price: number           // Precio unitario en pesos (no centavos)
  quantity: number        // Cantidad (1-99, validado)
  dinerId: string         // UUID del comensal que agregó el item
  dinerName: string       // Nombre para mostrar en la interfaz
  notes?: string          // Instrucciones especiales sanitizadas
  _submitting?: boolean   // Flag interno para tracking de envío
  _locked?: boolean       // Flag interno para confirmación grupal
}
```

El segundo mecanismo es la sincronización via WebSocket. Cuando un comensal agrega un producto, la actualización fluye en tres pasos secuenciales: primero se actualiza el store local de Zustand proporcionando feedback visual instantáneo, luego Zustand persiste automáticamente a localStorage mediante su middleware de persistencia, y finalmente el backend emite un evento WebSocket a todas las conexiones de la misma mesa. Las demás instancias reciben el evento y fusionan el cambio en su estado local.

El tercer mecanismo maneja el caso especial de múltiples pestañas en el mismo dispositivo. Cuando un usuario abre pwaMenu en dos pestañas del navegador, ambas comparten el mismo localStorage pero tienen instancias independientes de Zustand. El sistema registra un listener para el evento `storage` del navegador que dispara una función `syncFromStorage`. Esta función implementa una estrategia de merge basada en Map donde la pestaña que detecta el cambio considera a la otra como fuente de verdad:

```typescript
syncFromStorage: () => {
  const stored = localStorage.getItem('pwamenu-table-storage')
  if (!stored) return

  const storageState = JSON.parse(stored)?.state

  // Estrategia de merge: Map por ID, otra pestaña es fuente de verdad
  const currentCart = get().session?.sharedCart ?? []
  const storageCart = storageState?.session?.sharedCart ?? []

  const mergedCartMap = new Map<string, CartItem>()

  // Items locales primero (serán sobrescritos si existen en storage)
  currentCart.forEach((item: CartItem) => mergedCartMap.set(item.id, item))

  // Items de storage sobrescriben (fuente de verdad)
  storageCart.forEach((item: CartItem) => mergedCartMap.set(item.id, item))

  set({
    session: {
      ...storageState.session,
      sharedCart: Array.from(mergedCartMap.values()),
    },
  })
}
```

Esta estrategia de "última escritura gana" funciona correctamente para carritos porque cada item tiene un ID único: no hay conflictos de merge a nivel de item, solo actualizaciones completas de items existentes o adiciones de items nuevos.

---

## Gestión de Estado con Zustand

El tableStore constituye el corazón del sistema de estado, gestionando la sesión de mesa, el carrito compartido, el historial de pedidos, la confirmación grupal y el seguimiento de pagos. La organización modular distribuye responsabilidades en cuatro archivos que mantienen cohesión mientras previenen archivos monolíticos que dificultan la navegación.

### Arquitectura del Store Modular

El archivo `store.ts` contiene el store Zustand con todas las acciones que modifican estado. Con más de mil líneas, las acciones se organizan en secciones lógicas documentadas con comentarios que facilitan la navegación: acciones de sesión (join, leave, expire), acciones de carrito (add, update, remove), acciones de pedidos (submit, track), acciones de confirmación grupal (propose, confirm, cancel), y acciones de sincronización (syncFromStorage).

El archivo `types.ts` define la interfaz completa `TableState` con documentación JSDoc para cada propiedad. Esta separación permite que editores con soporte TypeScript muestren documentación contextual cuando el desarrollador navega el código, eliminando la necesidad de consultar documentación externa para entender el propósito de cada campo.

El archivo `selectors.ts` exporta hooks de React que encapsulan la complejidad del patrón anti-re-render. Este archivo existe porque React 19 con Zustand requiere un patrón específico de suscripción que difiere significativamente del patrón tradicional de desestructuración.

El archivo `helpers.ts` contiene funciones puras de utilidad que no modifican estado: cálculos de totales, validación de precios y cantidades, lógica de reintentos con backoff exponencial, y funciones de throttling. Esta separación facilita testing porque las funciones puras no requieren mocks de stores ni contextos de React.

### El Problema de los Re-renders Infinitos en React 19

React 19 introdujo cambios en el comportamiento de comparación de estado que interactúan de forma problemática con Zustand cuando los componentes se suscriben al store completo. El patrón tradicional de desestructuración causa bucles infinitos:

```typescript
// INCORRECTO: Causa bucles infinitos de re-render
const { session, currentDiner, cartItems } = useTableStore()
```

La razón de este comportamiento yace en cómo Zustand detecta cambios. Cuando un componente llama `useTableStore()` sin selector, se suscribe al objeto de estado completo. Cualquier modificación a cualquier propiedad genera un nuevo objeto de estado debido a la inmutabilidad, lo que dispara un re-render. El re-render vuelve a llamar `useTableStore()`, que retorna un nuevo objeto de estado con nuevas referencias aunque los valores sean idénticos, disparando otro re-render, creando un bucle infinito.

La solución requiere selectores que extraigan solo las propiedades necesarias:

```typescript
// CORRECTO: Selectores individuales
const session = useTableStore((state) => state.session)
const currentDiner = useTableStore((state) => state.currentDiner)
const cartItems = useTableStore(selectCartItems)
```

Con selectores, Zustand compara el resultado del selector antes y después del cambio. Si los resultados son iguales por valor para primitivos o por referencia para objetos, no dispara re-render.

### El Problema de las Referencias Inestables

Un desafío adicional surge con arrays vacíos. Cada vez que un selector retorna un literal `[]`, crea una nueva referencia de array en memoria. Aunque el array esté vacío en ambos casos, las referencias son diferentes, lo que dispara un re-render innecesario.

La solución utiliza constantes de módulo que proporcionan referencias estables:

```typescript
const EMPTY_CART_ITEMS: CartItem[] = []
const EMPTY_DINERS: Diner[] = []
const EMPTY_ORDERS: OrderRecord[] = []

export const selectCartItems = (state: TableState) =>
  state.session?.sharedCart?.length ? state.session.sharedCart : EMPTY_CART_ITEMS

export const selectDiners = (state: TableState) =>
  state.session?.diners?.length ? state.session.diners : EMPTY_DINERS
```

Cuando no hay items en el carrito, el selector siempre retorna la misma referencia `EMPTY_CART_ITEMS`, evitando re-renders innecesarios. Este patrón es crítico para el rendimiento en componentes que renderizan listas.

### Selectores Derivados con Cache Externa

Para selectores que calculan valores derivados mediante operaciones como filter, map o reduce, el problema se amplifica: cada llamada al selector genera un nuevo array resultado aunque los datos subyacentes no hayan cambiado. La solución implementa un patrón de cache externa que memoriza el último resultado:

```typescript
interface FilterCache<T> {
  source: T[] | null
  result: T[]
}

const myItemsCache: FilterCache<CartItem> = { source: null, result: [] }

export const selectMyCartItems = (state: TableState) => {
  const currentDinerId = state.currentDiner?.id
  const cart = state.session?.sharedCart ?? EMPTY_CART_ITEMS

  // Si el array fuente no cambió, retornar resultado cacheado
  if (cart === myItemsCache.source) {
    return myItemsCache.result
  }

  // Recalcular solo cuando el array fuente cambia
  const filtered = cart.filter(item => item.dinerId === currentDinerId)
  myItemsCache.source = cart
  myItemsCache.result = filtered.length > 0 ? filtered : EMPTY_CART_ITEMS
  return myItemsCache.result
}
```

Este patrón compara la referencia del array fuente en lugar de sus contenidos, lo que es una operación O(1) en lugar de O(n). Solo cuando el array fuente cambia de referencia se ejecuta la operación de filtrado.

### Selectores de Objetos con useShallow

Los selectores que retornan objetos con múltiples propiedades requieren un tratamiento especial porque la desestructuración de objetos siempre crea nuevas referencias. El hook `useShallow` de Zustand proporciona comparación superficial:

```typescript
import { useShallow } from 'zustand/react/shallow'

export const useCartActions = () =>
  useTableStore(
    useShallow((state) => ({
      addToCart: state.addToCart,
      updateQuantity: state.updateQuantity,
      removeItem: state.removeItem,
      submitOrder: state.submitOrder,
    }))
  )
```

`useShallow` compara cada propiedad del objeto individualmente. Si todas las propiedades mantienen la misma referencia, no dispara re-render aunque el objeto contenedor sea técnicamente nuevo.

### Valores Derivados con useMemo

Para valores calculados que dependen de estado pero que no son parte directa del store, el patrón correcto combina selectores con `useMemo` a nivel de componente:

```typescript
export const useSharedCartData = () => {
  const session = useTableStore((state) => state.session)
  const currentDiner = useTableStore((state) => state.currentDiner)

  // Valores derivados calculados con useMemo, no en el selector
  const cartTotal = useMemo(
    () => session?.sharedCart?.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    ) ?? 0,
    [session?.sharedCart]
  )

  const myItemsCount = useMemo(
    () => session?.sharedCart?.filter(
      item => item.dinerId === currentDiner?.id
    ).length ?? 0,
    [session?.sharedCart, currentDiner?.id]
  )

  return { session, currentDiner, cartTotal, myItemsCount }
}
```

Este patrón garantiza que los cálculos de reduce y filter solo se ejecuten cuando las dependencias cambien, no en cada render del componente.

---

## Sistema de Confirmación Grupal

El sistema de confirmación grupal resuelve un problema social común en experiencias gastronómicas: evitar que un comensal envíe accidentalmente el pedido antes de que otros terminen de agregar productos. El flujo implementa un protocolo de consenso donde todos los participantes deben confirmar su disposición antes de que el pedido llegue a la cocina.

### Ciclo de Vida de una Propuesta

Cuando un comensal decide que es momento de enviar el pedido, presiona el botón "Proponer Envío". Esta acción crea un objeto `RoundConfirmation` que captura el estado completo de la propuesta:

```typescript
interface RoundConfirmation {
  id: string                      // UUID único de la propuesta
  proposedBy: string              // dinerId del proponente
  proposedByName: string          // Nombre para mostrar
  proposedAt: string              // ISO timestamp de creación
  status: RoundConfirmationStatus // 'pending' | 'confirmed' | 'cancelled' | 'expired'
  expiresAt: string               // ISO timestamp de expiración (5 minutos)
  dinerStatuses: DinerReadyStatus[]
}

interface DinerReadyStatus {
  dinerId: string
  dinerName: string
  isReady: boolean
  readyAt?: string    // ISO timestamp cuando confirmó
}
```

La inicialización de la propuesta sigue una lógica específica:

```typescript
proposeRound: () => {
  const { session, currentDiner } = get()

  // Validaciones de estado
  if (!session || !currentDiner) return
  if (session.sharedCart.length === 0) return
  if (session.roundConfirmation?.status === 'pending') return

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000) // 5 minutos

  const confirmation: RoundConfirmation = {
    id: generateId(),
    proposedBy: currentDiner.id,
    proposedByName: currentDiner.name,
    proposedAt: now.toISOString(),
    status: 'pending',
    expiresAt: expiresAt.toISOString(),
    dinerStatuses: session.diners.map(diner => ({
      dinerId: diner.id,
      dinerName: diner.name,
      isReady: diner.id === currentDiner.id,  // Proponente auto-confirma
      readyAt: diner.id === currentDiner.id ? now.toISOString() : undefined,
    })),
  }

  // Bloquear carrito durante confirmación
  const lockedCart = session.sharedCart.map(item => ({ ...item, _locked: true }))

  // Caso especial: comensal único
  const allReady = confirmation.dinerStatuses.every(s => s.isReady)

  if (allReady) {
    confirmation.status = 'confirmed'
    set({ session: { ...session, sharedCart: lockedCart, roundConfirmation: confirmation } })

    // Auto-submit después de 1.5s (permite animación de celebración)
    setTimeout(() => {
      const currentState = get()
      if (currentState.session?.roundConfirmation?.status === 'confirmed') {
        const unlockedCart = currentState.session.sharedCart.map(
          ({ _locked, ...item }) => item
        )
        set({
          session: {
            ...currentState.session,
            sharedCart: unlockedCart,
            roundConfirmation: null,
          },
        })
        get().submitOrder()
      }
    }, 1500)
  } else {
    set({ session: { ...session, sharedCart: lockedCart, roundConfirmation: confirmation } })
  }
}
```

El estado inicial marca al proponente como listo automáticamente y a los demás como pendientes. El carrito se "bloquea" mediante el flag `_locked` que la interfaz usa para deshabilitar modificaciones durante la votación.

### Flujo de Confirmación

Los demás comensales ven el panel de confirmación aparecer en sus pantallas mostrando el estado de cada participante. Cada uno puede presionar "Estoy Listo" para confirmar:

```typescript
confirmReady: () => {
  const { session, currentDiner } = get()
  if (!session?.roundConfirmation || !currentDiner) return

  const now = new Date().toISOString()
  const updatedStatuses = session.roundConfirmation.dinerStatuses.map(status =>
    status.dinerId === currentDiner.id
      ? { ...status, isReady: true, readyAt: now }
      : status
  )

  const updatedConfirmation = {
    ...session.roundConfirmation,
    dinerStatuses: updatedStatuses,
  }

  const allReady = updatedStatuses.every(s => s.isReady)

  if (allReady) {
    updatedConfirmation.status = 'confirmed'
    set({ session: { ...session, roundConfirmation: updatedConfirmation } })

    // Auto-submit después de delay
    setTimeout(() => {
      const currentState = get()
      if (currentState.session?.roundConfirmation?.status === 'confirmed') {
        const unlockedCart = currentState.session.sharedCart.map(
          ({ _locked, ...item }) => item
        )
        set({
          session: {
            ...currentState.session,
            sharedCart: unlockedCart,
            roundConfirmation: null,
          },
        })
        get().submitOrder()
      }
    }, 1500)
  } else {
    set({ session: { ...session, roundConfirmation: updatedConfirmation } })
  }
}
```

El delay de 1.5 segundos antes del envío automático cumple dos propósitos: permite una animación de celebración que refuerza visualmente que todos están de acuerdo, y proporciona una ventana para que alguien cambie de opinión si confirmó por error.

### Expiración y Cancelación

Si transcurren 5 minutos sin que todos confirmen, la propuesta expira automáticamente. El componente `RoundConfirmationPanel` implementa un contador regresivo que detecta la expiración:

```typescript
useEffect(() => {
  const calculateTimeLeft = () => {
    const expiresAt = new Date(confirmation.expiresAt).getTime()
    const now = Date.now()
    return Math.max(0, Math.floor((expiresAt - now) / 1000))
  }

  setTimeLeft(calculateTimeLeft())

  const timerRef = setInterval(() => {
    const remaining = calculateTimeLeft()
    setTimeLeft(remaining)

    if (remaining <= 0) {
      onCancelProposal()  // Dispara expiración
      clearInterval(timerRef)
    }
  }, 1000)

  return () => clearInterval(timerRef)
}, [confirmation.expiresAt, onCancelProposal])
```

El proponente original tiene la opción de cancelar toda la propuesta en cualquier momento, y cualquier comensal puede cambiar su confirmación de "Listo" a "No listo" si necesita agregar algo más.

---

## Sistema de Filtrado Avanzado

El sistema de filtrado de pwaMenu aborda una necesidad crítica en gastronomía moderna: ayudar a comensales con restricciones alimentarias a identificar rápidamente qué pueden consumir de forma segura. El sistema implementa tres tipos de filtros independientes que trabajan en composición AND: un producto debe satisfacer todos los filtros activos para mostrarse.

### Filtrado de Alérgenos con Reacciones Cruzadas

El filtro de alérgenos es el más sofisticado porque maneja no solo la presencia directa de alérgenos sino también reacciones cruzadas y niveles de severidad configurable.

La interfaz permite seleccionar alérgenos específicos (maní, lácteos, gluten, mariscos, huevo, soja, frutos secos, etc.) y un nivel de severidad:

- **Estricto**: Excluye productos que definitivamente contienen el alérgeno según su ficha técnica
- **Muy Estricto**: Excluye productos que contienen O que pueden contener trazas por contaminación cruzada

Esta distinción es médicamente relevante. Una persona con intolerancia leve a la lactosa puede tolerar trazas presentes por contaminación en equipos compartidos. Pero alguien con alergia severa a maní puede sufrir anafilaxis por cantidades microscópicas.

El sistema de reacciones cruzadas agrega otra capa de protección:

```typescript
const crossReactedAllergenIds = useMemo(() => {
  if (!crossReactionsEnabled || excludedAllergenIds.length === 0) return []

  const crossReactedIds = new Set<number>()

  for (const excludedId of excludedAllergenIds) {
    const allergen = allergensWithCrossReactions.find(a => a.id === excludedId)
    if (!allergen?.cross_reactions) continue

    for (const cr of allergen.cross_reactions) {
      // Filtrar por sensibilidad configurada
      const shouldInclude =
        crossReactionSensitivity === 'all' ||
        (crossReactionSensitivity === 'high_medium' &&
         (cr.probability === 'high' || cr.probability === 'medium')) ||
        (crossReactionSensitivity === 'high_only' && cr.probability === 'high')

      if (shouldInclude) {
        crossReactedIds.add(cr.cross_reacts_with_id)
      }
    }
  }

  return Array.from(crossReactedIds)
}, [excludedAllergenIds, allergensWithCrossReactions, crossReactionsEnabled, crossReactionSensitivity])
```

Un ejemplo clínico real es el síndrome látex-frutas: personas alérgicas al látex frecuentemente reaccionan a plátano, aguacate, kiwi y castaña porque estas frutas contienen proteínas estructuralmente similares a las del látex. Si un usuario selecciona "Látex" como alérgeno a evitar y habilita reacciones cruzadas, el sistema automáticamente excluirá platos que contengan estas frutas.

La función de filtrado combina todos los niveles:

```typescript
const shouldHideProductAdvanced = useCallback(
  (allergens: ProductAllergens | null | undefined) => {
    if (allFilteredAllergenIds.length === 0) return false
    if (!allergens) return false

    // Verificar presencia directa ("contains")
    const containsExcluded = allergens.contains.some(a =>
      allFilteredAllergenIds.includes(a.id)
    )
    if (containsExcluded) return true

    // En modo muy estricto, también verificar trazas ("may_contain")
    if (strictness === 'very_strict') {
      const mayContainExcluded = allergens.may_contain.some(a =>
        allFilteredAllergenIds.includes(a.id)
      )
      if (mayContainExcluded) return true
    }

    return false
  },
  [allFilteredAllergenIds, strictness]
)
```

### Filtrado Dietético

El filtro dietético maneja preferencias booleanas: vegetariano, vegano, sin gluten, apto celíacos, keto, bajo en sodio. A diferencia del filtro de alérgenos donde el usuario selecciona qué excluir, aquí el usuario selecciona requisitos que el producto debe cumplir:

```typescript
const matchesFilter = useCallback(
  (profile: DietaryProfile | null | undefined) => {
    if (selectedOptions.length === 0) return true
    if (!profile) return false

    // Producto debe cumplir TODOS los filtros activos (AND)
    return selectedOptions.every((option) => {
      switch (option) {
        case 'vegetarian': return profile.is_vegetarian
        case 'vegan': return profile.is_vegan
        case 'gluten_free': return profile.is_gluten_free
        case 'dairy_free': return profile.is_dairy_free
        case 'celiac_safe': return profile.is_celiac_safe
        case 'keto': return profile.is_keto
        case 'low_sodium': return profile.is_low_sodium
        default: return true
      }
    })
  },
  [selectedOptions]
)
```

### Filtrado por Método de Cocción

El filtro de método de cocción permite tanto excluir como requerir métodos específicos:

```typescript
const matchesFilter = useCallback(
  (productMethods: string[], usesOil: boolean = false) => {
    const { excludedMethods, requiredMethods, excludeUsesOil } = filterState

    // Exclusión de aceite
    if (excludeUsesOil && usesOil) return false

    // Métodos excluidos: producto NO debe tener ninguno
    if (excludedMethods.length > 0) {
      const hasExcludedMethod = productMethods.some(m =>
        excludedMethods.includes(m as CookingMethod)
      )
      if (hasExcludedMethod) return false
    }

    // Métodos requeridos: producto debe tener AL MENOS UNO
    if (requiredMethods.length > 0) {
      const hasRequiredMethod = productMethods.some(m =>
        requiredMethods.includes(m as CookingMethod)
      )
      if (!hasRequiredMethod) return false
    }

    return true
  },
  [filterState]
)
```

Un comensal que evita frituras por razones de salud puede excluir "frito" y "sofrito". Alguien con restricciones médicas que requiere alimentos cocidos puede requerir "hervido" o "al vapor" mientras excluye "crudo".

### Persistencia de Preferencias

Todos los filtros persisten en sessionStorage para sobrevivir recargas de página durante la misma visita, y opcionalmente se sincronizan al backend para clientes recurrentes:

```typescript
// Persistencia local inmediata
useEffect(() => {
  try {
    sessionStorage.setItem(
      'pwamenu_allergen_filter',
      JSON.stringify(excludedAllergenIds)
    )
  } catch {
    // Silenciosamente ignorar errores de storage
  }
}, [excludedAllergenIds])

// Sincronización al backend con debounce de 2 segundos
const syncPreferences = useDebouncedCallback(async () => {
  await dinerAPI.updatePreferences({
    excluded_allergen_ids: Array.from(excludedAllergenIds),
    allergen_strictness: strictness,
    dietary_filters: dietaryFilters,
    excluded_cooking_methods: Array.from(excludedMethods),
  })
}, 2000)
```

---

## Integración con API y Seguridad

### Arquitectura del Cliente API

El servicio API centraliza toda comunicación HTTP con el backend, implementando múltiples capas de seguridad y patrones de resiliencia. El archivo `api.ts` maneja autenticación, prevención de ataques SSRF, deduplicación de peticiones, y reintentos con backoff exponencial.

### Prevención de SSRF

La primera capa de seguridad previene ataques Server-Side Request Forgery. Aunque pwaMenu es una aplicación frontend que corre en el navegador del usuario, validar URLs previene que código malicioso inyectado mediante XSS redirija peticiones a servicios internos de la red del usuario:

```typescript
function isValidApiBase(url: string): boolean {
  try {
    // URLs relativas siempre válidas (mismo origen)
    if (url.startsWith('/') && !url.startsWith('//')) return true

    const parsed = new URL(url)

    // Solo protocolos seguros
    if (!['http:', 'https:'].includes(parsed.protocol)) return false

    // SEGURIDAD: Bloquear direcciones IP (previene acceso a redes internas)
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
    const ipv6Regex = /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i

    if (ipv4Regex.test(parsed.hostname) || ipv6Regex.test(parsed.hostname)) {
      throw new ApiError('IP addresses not allowed in API URL', 0, ERROR_CODES.VALIDATION)
    }

    // SEGURIDAD: Bloquear credenciales en URL
    if (parsed.username || parsed.password) {
      throw new ApiError('Credentials not allowed in URL', 0, ERROR_CODES.VALIDATION)
    }

    // Verificar contra lista de hosts permitidos
    const ALLOWED_HOSTS = new Set(API_CONFIG.ALLOWED_HOSTS)
    const ALLOWED_PORTS = new Set(API_CONFIG.ALLOWED_PORTS)

    // Normalizar puerto (string vacío = puerto por defecto del protocolo)
    const normalizedPort = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')

    return ALLOWED_HOSTS.has(parsed.hostname) && ALLOWED_PORTS.has(normalizedPort)
  } catch {
    return false
  }
}
```

### Deduplicación de Peticiones

La deduplicación previene condiciones de carrera causadas por clicks rápidos del usuario. Si un usuario presiona "Agregar al carrito" tres veces en rápida sucesión, solo la primera presión genera una petición real:

```typescript
const pendingRequests = new Map<string, {
  body: string | undefined
  promise: Promise<unknown>
  startTime: number
}>()

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase()
  const bodyStr = typeof options.body === 'string' ? options.body : undefined
  const baseKey = `${method}:${endpoint}`

  // Buscar petición idéntica en vuelo
  for (const [key, cached] of pendingRequests.entries()) {
    if (key.startsWith(baseKey) && cached.body === bodyStr) {
      // Verificar que no esté estancada
      if (Date.now() - cached.startTime < REQUEST_TIMEOUT_MS) {
        return cached.promise as Promise<T>  // Retornar misma promesa
      } else {
        pendingRequests.delete(key)  // Limpiar petición estancada
      }
    }
  }

  // Crear nueva petición
  const uniqueKey = `${baseKey}_${Date.now()}_${Math.random()}`
  const promise = fetch(url, options)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    })
    .finally(() => pendingRequests.delete(uniqueKey))

  pendingRequests.set(uniqueKey, { body: bodyStr, promise, startTime: Date.now() })
  return promise as Promise<T>
}
```

La comparación usa el body directamente en lugar de un hash para evitar colisiones: dos peticiones con diferentes bodies pero que colisionan en hash serían incorrectamente deduplicadas.

### Autenticación mediante Table Tokens

A diferencia del Dashboard que usa JWT para usuarios autenticados, pwaMenu usa tokens de mesa HMAC que identifican la sesión de una mesa específica sin requerir cuentas de usuario:

```typescript
function getAuthHeaders(): Record<string, string> {
  const tableToken = getTableToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',  // CSRF protection
  }

  if (tableToken) {
    headers['X-Table-Token'] = tableToken
  }

  return headers
}
```

Los table tokens tienen vida corta (3 horas por defecto) y solo permiten operaciones relacionadas con la mesa específica. No pueden usarse para acceder a datos de otros usuarios ni realizar operaciones privilegiadas.

### Integración WebSocket

La conexión WebSocket proporciona actualizaciones en tiempo real sin polling. El servicio gestiona el ciclo de vida completo incluyendo reconexión automática con backoff exponencial y jitter:

```typescript
private scheduleReconnect(): void {
  if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    wsLogger.error('Max reconnect attempts reached')
    return
  }

  this.reconnectAttempts++

  // Backoff exponencial: 1s, 2s, 4s, 8s... hasta 30s máximo
  const exponentialDelay = Math.min(
    BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1),
    MAX_RECONNECT_DELAY
  )

  // Jitter aleatorio previene thundering herd
  const jitter = exponentialDelay * JITTER_FACTOR * Math.random()
  const delay = Math.round(exponentialDelay + jitter)

  this.reconnectTimeout = setTimeout(() => this.connect(), delay)
}
```

El jitter es crítico: sin él, si 100 clientes pierden conexión simultáneamente (por ejemplo, por un reinicio del servidor), todos intentarían reconectarse exactamente al mismo tiempo, sobrecargando el servidor. Con jitter, los reintentos se distribuyen en el tiempo.

El sistema también implementa heartbeats para detectar conexiones zombie:

```typescript
private startHeartbeat(): void {
  this.heartbeatInterval = setInterval(() => {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'ping' }))

      this.heartbeatTimeout = setTimeout(() => {
        wsLogger.warn('Heartbeat timeout - no pong received')
        this.ws?.close(4000, 'Heartbeat timeout')
      }, HEARTBEAT_TIMEOUT)
    }
  }, HEARTBEAT_INTERVAL)
}
```

Si el servidor no responde al ping en 10 segundos, la conexión se considera muerta y se cierra para forzar reconexión.

---

## Patrones de React 19

pwaMenu aprovecha las nuevas primitivas de React 19 para mejorar la experiencia de usuario y simplificar el código asíncrono.

### Actualizaciones Optimistas con useOptimistic

El hook `useOptimisticCart` proporciona feedback visual instantáneo cuando el usuario agrega productos al carrito:

```typescript
export function useOptimisticCart({
  cartItems,
  currentDinerId,
  currentDinerName,
  onAddToCart,
  onUpdateQuantity,
  onRemoveItem,
}): UseOptimisticCartReturn {
  const [isPending, startTransition] = useTransition()
  const [optimisticItems, addOptimistic] = useOptimistic(cartItems, cartReducer)

  // Contador incremental para garantizar IDs únicos en clicks rápidos
  const tempIdCounterRef = useRef(0)

  const addToCartOptimistic = useCallback(
    (input: AddToCartInput) => {
      if (!currentDinerId) return

      // ID único incluso en doble-click rápido
      const tempId = `temp-${Date.now()}-${++tempIdCounterRef.current}-${Math.random().toString(36).substring(2, 9)}`

      const optimisticItem: CartItem = {
        id: tempId,
        productId: input.productId,
        name: input.name,
        price: input.price,
        quantity: input.quantity || 1,
        dinerId: currentDinerId,
        dinerName: currentDinerName,
        notes: input.notes,
      }

      startTransition(() => {
        addOptimistic({ type: 'add', item: optimisticItem })  // UI instantáneo
        onAddToCart(input)  // Sincronizar store en background
      })
    },
    [currentDinerId, currentDinerName, addOptimistic, onAddToCart, startTransition]
  )

  return { optimisticItems, isPending, addToCartOptimistic, updateQuantityOptimistic, removeItemOptimistic }
}
```

El usuario ve el item aparecer instantáneamente con un ID temporal. Cuando el store de Zustand confirma la adición con el ID permanente, React reconcilia automáticamente. Si la operación falla, el item desaparece automáticamente porque `useOptimistic` revierte al estado original cuando el componente re-renderiza con el estado real del store.

### Formularios con useActionState

El patrón `useActionState` simplifica el manejo de formularios eliminando la necesidad de múltiples estados separados:

```typescript
const [formState, formAction, isPending] = useActionState(
  async (prevState, formData) => {
    const quantity = parseInt(formData.get('quantity') as string)
    const notes = formData.get('notes')?.toString()

    // Validación
    if (!isValidQuantity(quantity)) {
      return { ...prevState, error: 'validation.invalidQuantity' }
    }

    // Agregar al carrito
    addToCart({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity,
      notes,
    })

    return { ...prevState, success: true, error: null }
  },
  { error: null, success: false }
)

// En JSX:
<form action={formAction}>
  <input name="quantity" type="number" disabled={isPending} />
  <textarea name="notes" disabled={isPending} />
  <button disabled={isPending}>
    {isPending ? 'Agregando...' : 'Agregar al carrito'}
  </button>
</form>
```

Este patrón unifica el ciclo de vida del formulario: `isPending` indica si hay una operación en progreso, `formState.error` contiene errores de validación, y `formState.success` indica completación exitosa.

### Transiciones No Bloqueantes

Las operaciones que actualizan estado significativo se envuelven en transiciones para mantener la interfaz responsiva:

```typescript
const [isPending, startTransition] = useTransition()

const handleCategoryChange = (categoryId: string) => {
  startTransition(() => {
    // Filtrar productos (operación potencialmente pesada)
    const filtered = products.filter(p => p.categoryId === categoryId)
    setSelectedCategory(categoryId)
    setVisibleProducts(filtered)
  })
}
```

Durante la transición, `isPending` es `true`, permitiendo mostrar un indicador de carga sutil mientras el usuario puede seguir interactuando con otros elementos de la interfaz.

---

## Configuración PWA y Capacidades Offline

pwaMenu funciona como una Progressive Web App completa, instalable en dispositivos móviles y capaz de operar sin conexión después de la carga inicial.

### Estrategias de Caché Workbox

El service worker utiliza estrategias diferenciadas según el tipo de recurso y su volatilidad:

**CacheFirst para Assets Inmutables**

Imágenes de productos y fuentes web raramente cambian, y cuando cambian lo hacen mediante nueva URL (hash en nombre de archivo). CacheFirst es seguro porque no hay riesgo de mostrar contenido desactualizado:

```typescript
{
  urlPattern: /^https:\/\/images\.unsplash\.com\/.*/i,
  handler: 'CacheFirst',
  options: {
    cacheName: 'product-images',
    expiration: {
      maxEntries: 100,
      maxAgeSeconds: 60 * 60 * 24 * 30  // 30 días
    },
  },
},
{
  urlPattern: /^https:\/\/fonts\./i,
  handler: 'CacheFirst',
  options: {
    cacheName: 'fonts',
    expiration: {
      maxAgeSeconds: 60 * 60 * 24 * 365  // 1 año
    },
  },
}
```

**NetworkFirst para APIs**

Las peticiones al API prefieren datos frescos pero proporcionan fallback offline:

```typescript
{
  urlPattern: /\/api\/v1\/.*/i,
  handler: 'NetworkFirst',
  options: {
    cacheName: 'local-api-cache',
    networkTimeoutSeconds: 5,  // Timeout corto para APIs locales
    expiration: {
      maxEntries: 50,
      maxAgeSeconds: 60 * 60  // 1 hora
    },
  },
}
```

Si la red responde en menos de 5 segundos, el usuario ve datos frescos. Si la red falla o es lenta, el service worker sirve la última respuesta cacheada. Esto permite que comensales naveguen el menú incluso con conexión intermitente.

**Fallback SPA para Navegación Offline**

```typescript
navigateFallback: '/index.html',
navigateFallbackDenylist: [/^\/api/, /^\/public/]
```

Cualquier navegación a rutas de la aplicación que no tenga respuesta cacheada recibe `index.html`, permitiendo que React Router maneje el enrutamiento client-side incluso offline.

### Actualización del Service Worker

El sistema verifica actualizaciones y notifica al usuario sin interrumpir su experiencia actual:

```typescript
const sw = registerSW({
  onNeedRefresh() {
    setShowUpdateBanner(true)  // Mostrar banner "Nueva versión disponible"
  },
  onOfflineReady() {
    showToast('Aplicación lista para uso offline')
  },
  onRegistered(registration) {
    if (registration) {
      setInterval(() => {
        registration.update()
      }, 60 * 60 * 1000)  // Verificar cada hora
    }
  },
})
```

La combinación de `skipWaiting: true` y `clientsClaim: true` en la configuración significa que las actualizaciones se activan inmediatamente cuando el usuario acepta, sin esperar a que cierre todas las pestañas.

---

## Sistema de Fidelización de Clientes

pwaMenu implementa un sistema progresivo de reconocimiento que permite personalización sin requerir cuentas formales. El sistema evoluciona en fases, cada una agregando capacidades sobre la anterior.

### Fase 1: Identificación por Dispositivo

El nivel más básico utiliza un identificador persistente:

```typescript
export function getDeviceId(): string {
  let deviceId = localStorage.getItem('pwamenu-device-id')

  if (!deviceId) {
    deviceId = crypto.randomUUID()
    localStorage.setItem('pwamenu-device-id', deviceId)
  }

  return deviceId
}
```

Adicionalmente, el sistema calcula un fingerprint del dispositivo combinando características del navegador:

```typescript
export async function getDeviceFingerprint(): Promise<string> {
  const components = [
    navigator.userAgent,
    screen.width,
    screen.height,
    screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
    navigator.platform,
    navigator.deviceMemory ?? 'unknown',
    navigator.hardwareConcurrency ?? 'unknown',
    navigator.maxTouchPoints ?? 0,
  ]

  const text = components.join('|')
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))

  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
```

Este fingerprint ayuda a identificar el mismo dispositivo incluso si el usuario borra localStorage.

### Fase 2: Preferencias Implícitas

La segunda fase almacena automáticamente las preferencias de filtrado. El hook `useImplicitPreferences` sincroniza cambios al backend con debounce:

```typescript
const syncPreferences = useDebouncedCallback(async () => {
  await dinerAPI.updatePreferences({
    excluded_allergen_ids: Array.from(allergenFilter.excludedAllergenIds),
    allergen_strictness: allergenFilter.strictness,
    dietary_filters: dietaryFilter.filters,
    excluded_cooking_methods: Array.from(cookingFilter.excludedMethods),
  })
}, 2000)

// Cargar preferencias guardadas al montar
useEffect(() => {
  const loadPreferences = async () => {
    const deviceId = getDeviceId()
    const prefs = await dinerAPI.getDevicePreferences(deviceId)

    if (prefs) {
      allergenFilter.setFromSaved(prefs.excluded_allergen_ids, prefs.allergen_strictness)
      dietaryFilter.setFromSaved(prefs.dietary_filters)
      cookingFilter.setFromSaved(prefs.excluded_cooking_methods)
    }
  }

  loadPreferences()
}, [])
```

Cuando el mismo comensal regresa semanas después, sus filtros se restauran automáticamente sin necesidad de login.

### Fase 4: Registro Voluntario

La fase final ofrece a clientes frecuentes la opción de registrarse formalmente:

```typescript
interface CustomerRegisterRequest {
  name: string
  email?: string
  birth_month?: number
  birth_day?: number
  device_id: string
  consent_data_processing: boolean   // Obligatorio (GDPR)
  consent_marketing: boolean         // Opcional
  allow_ai_personalization: boolean  // Opcional
}
```

Clientes registrados reciben beneficios: saludo personalizado, carrusel de favoritos basado en historial, y recomendaciones personalizadas.

---

## Internacionalización

pwaMenu soporta tres idiomas con español como primario y fallback para los demás.

### Configuración de i18next

```typescript
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: spanishTranslations },
      en: { translation: englishTranslations },
      pt: { translation: portugueseTranslations },
    },
    fallbackLng: {
      en: ['es'],
      pt: ['es'],
      default: ['es'],
    },
    supportedLngs: ['es', 'en', 'pt'],
    interpolation: {
      escapeValue: false,  // React ya escapa
    },
  })
```

La cadena de fallback garantiza que traducciones faltantes en inglés o portugués muestren la versión española en lugar de la clave cruda.

### Detector de Idioma Validado

El detector personalizado valida contra la lista de idiomas soportados antes de aceptar un valor:

```typescript
const validatedDetector = new LanguageDetector()
validatedDetector.addDetector({
  name: 'validatedLocalStorage',
  lookup() {
    const stored = localStorage.getItem('pwamenu-language')
    if (stored && SUPPORTED_LANGUAGES.includes(stored)) {
      return stored
    }
    return undefined
  },
  cacheUserLanguage(lng: string) {
    if (SUPPORTED_LANGUAGES.includes(lng)) {
      localStorage.setItem('pwamenu-language', lng)
    }
  },
})
```

Esto previene que valores corruptos en localStorage causen comportamiento inesperado.

---

## Pruebas

El proyecto incluye una suite de pruebas automatizadas que verifican funcionalidad crítica.

### Ejecución de Pruebas

```bash
# Modo watch durante desarrollo
npm run test

# Ejecución única
npm run test:run

# Con reporte de cobertura
npm run test:coverage

# Archivo específico
npm test -- src/stores/tableStore/store.test.ts
```

### Áreas Cubiertas

Las pruebas verifican:
- Deduplicación de peticiones en el cliente API
- Prevención SSRF y validación de URLs
- Operaciones de carrito con rollback en error
- Expiración de sesión durante operaciones asíncronas
- Merge de carritos entre pestañas
- Confirmación grupal y timeout de propuestas
- Filtros de alérgenos con reacciones cruzadas

---

## Variables de Entorno

```bash
# URL del backend REST API
VITE_API_URL=http://localhost:8000/api

# URL del WebSocket Gateway
VITE_WS_URL=ws://localhost:8001

# Identificador de sucursal para carga del menú
VITE_BRANCH_SLUG=centro

# Clave pública de Mercado Pago
VITE_MP_PUBLIC_KEY=TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

---

## Comandos de Desarrollo

```bash
# Instalar dependencias
npm install

# Servidor de desarrollo (puerto 5176)
npm run dev

# Verificar tipos TypeScript
npx tsc --noEmit

# Ejecutar linter
npm run lint

# Build de producción
npm run build

# Preview del build
npm run preview
```

---

## Documentación Relacionada

- [pwaMenu/CLAUDE.md](CLAUDE.md) - Guías de desarrollo específicas para Claude Code
- [backend/README.md](../backend/README.md) - REST API que pwaMenu consume
- [ws_gateway/README.md](../ws_gateway/README.md) - WebSocket Gateway para eventos en tiempo real
- [Dashboard/README.md](../Dashboard/README.md) - Panel de administración complementario
- [devOps/README.md](../devOps/README.md) - Infraestructura Docker y scripts de inicio
