<!-- merged from CLAUDE.md 2026-05-19 (change: agentic-infra-uplift) -->

> Creado: 2026-05-19 | Fuente: migrado desde CLAUDE.md sección "Core Patterns" (React 19 específico)

# React 19 Frontend Patterns

Patrones específicos de React 19 y sus hooks nuevos usados en el proyecto.
Para los patrones de Zustand y convenciones generales, ver `05-dx/04_convenciones_y_estandares.md`.

---

## useActionState para formularios

Dashboard y pwaMenu usan `useActionState` para form submissions:

```typescript
const [state, formAction, isPending] = useActionState<FormState, FormData>(
  async (prevState, formData) => {
    const value = formData.get('field')
    // Validate, submit, return { isSuccess, errors }
    try {
      await api.submit(value)
      return { isSuccess: true, errors: {} }
    } catch (e) {
      return { isSuccess: false, errors: { field: 'Error message' } }
    }
  },
  { isSuccess: false, errors: {} }
)
// En JSX:
// <form action={formAction}>
//   <Button isLoading={isPending}>Submit</Button>
// </form>
```

## useOptimisticCart (pwaMenu)

Hook propio que usa React 19's `useOptimistic` para feedback instantáneo del carrito:

```typescript
// Ubicación: pwaMenu/src/hooks/useOptimisticCart.ts
// Patrón: optimistic update → llamada API → rollback automático en error
const { optimisticCart, addToCart, removeFromCart } = useOptimisticCart()
```

## useFormModal + useConfirmDialog (Dashboard)

Hooks de Dashboard que eliminan boilerplate en páginas CRUD:

- `useFormModal` reemplaza 3 llamadas a `useState` (isOpen, editingItem, formData)
- `useConfirmDialog` reemplaza 2 (isOpen, itemToDelete)

Ubicación: `Dashboard/src/hooks/`

## Store migrations con type guards (Dashboard)

Las migraciones de Zustand persist usan `unknown` para `persistedState` (nunca `any`):

```typescript
// En la config de persist:
migrate: (persistedState: unknown, version: number) => {
  // Siempre validar estructura antes de usar
  if (!isValidState(persistedState)) return defaultState
  // Migrar campo por campo
  const state = persistedState as OldState
  return { ...state, newField: defaultValue }
}
// Incrementar STORE_VERSIONS al cambiar la estructura
```

Ver `Dashboard/CLAUDE.md` → sección "Store Migrations" para ejemplos completos.

## Logout Infinite Loop Prevention

En `api.ts`, `authAPI.logout()` debe deshabilitar el retry en 401:

```typescript
// Pasar false como tercer argumento para deshabilitar retry:
await fetchAPI('/auth/logout', { method: 'POST' }, false)
// Sin esto: expired token → 401 → onTokenExpired → logout() → 401 → loop infinito
```

## React Compiler

Solo Dashboard usa `babel-plugin-react-compiler` para memoización automática.
pwaMenu y pwaWaiter NO lo tienen en devDeps actualmente.

`eslint-plugin-react-hooks` 7.x enforces reglas más estrictas:
- Hooks deben llamarse incondicionalmente
- Preferir estado derivado sobre `setState` en `useEffect`

---

## Notas de compatibilidad

- **Vitest**: Dashboard y pwaMenu usan Vitest 4.0, pwaWaiter usa Vitest 3.2.
- **React Compiler**: Solo Dashboard (pwaMenu/pwaWaiter: memoización manual con `useMemo`/`useCallback`).
- **useActionState**: Disponible en React 19+ — no disponible en React 18.
