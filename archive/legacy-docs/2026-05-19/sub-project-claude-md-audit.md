# Auditoría de Sub-Project CLAUDE.md

> Generado durante el change `agentic-infra-uplift` (2026-05-19).
> Scope: identificar duplicación con el root CLAUDE.md y conocimiento genuinamente sub-project-specific.
> Acción en este change: NINGUNA — solo auditoría. Los archivos NO fueron editados.

---

## Dashboard/CLAUDE.md (846 líneas)

### Contenido duplicado con root CLAUDE.md / knowledge-base

| Sección en Dashboard/CLAUDE.md | Duplicado en |
|--------------------------------|-------------|
| Quick Reference / Commands (dev, build, test) | Root CLAUDE.md — Quick Reference |
| Stack table (React 19, TypeScript, Zustand...) | Root CLAUDE.md — Stack |
| Zustand store pattern (selector usage, useShallow) | `knowledge-base/05-dx/04_convenciones_y_estandares.md` §3 |
| `useActionState` pattern | `knowledge-base/05-dx/09_react19_frontend_patterns.md` |
| RBAC summary | Root CLAUDE.md — RBAC |
| Governance levels | Root CLAUDE.md — Governance |
| WebSocket ref pattern | `knowledge-base/05-dx/04_convenciones_y_estandares.md` §3 |

### Contenido genuinamente sub-project-specific (NO duplicado)

- **Estructura de stores**: lista de los 25 Zustand stores con propósito y versión de migración
- **Custom hooks**: `useFormModal`, `useConfirmDialog`, `usePagination`, `useFocusTrap`, `useDocumentTitle`, `useOptimisticMutation` — con API detallada y ejemplos
- **Store migrations**: `STORE_VERSIONS`, `unknown` type guards, migration factory pattern
- **CRUD page pattern**: estructura de los 38 pages, hook trio (`useFormModal` + `useConfirmDialog` + `usePagination`)
- **Help system**: `HelpButton`, estructura de `helpContent.tsx`, campos `description`/`keyPoints`/`examples`
- **i18n Dashboard**: estructura de keys i18n, namespace por page, 700+ claves
- **Idle timeout**: `useIdleTimeout` hook — 25min warning, 30min auto-logout, skip Kitchen page
- **React Compiler**: `babel-plugin-react-compiler` config específica de Dashboard
- **2FA UI**: `useTotp` hook, condicional TOTP field en Login, Settings section
- **Sidebar structure**: 38 rutas, collapsible groups, current page detection
- **Testing patterns**: 174 tests, co-located, Vitest 4.0, cobertura por store

### Recomendación para futuros changes

**ALTA PRIORIDAD**: Eliminar las secciones duplicadas con el root (Commands, Stack, Zustand pattern, RBAC, Governance). Estas duplican ~200 líneas innecesariamente.

**PRESERVAR**: Todo lo sub-project-specific listado arriba — es información densa y única que los sub-agents de Dashboard necesitan. No mover a root.

---

## pwaMenu/CLAUDE.md (433 líneas)

### Contenido duplicado con root CLAUDE.md / knowledge-base

| Sección en pwaMenu/CLAUDE.md | Duplicado en |
|------------------------------|-------------|
| Dev commands (npm run dev, test, etc.) | Root CLAUDE.md — Quick Reference |
| Tech stack | Root CLAUDE.md — Stack |
| Data model hierarchy | `knowledge-base/02-arquitectura/02_modelo_de_datos.md` |
| i18n overview | `knowledge-base/05-dx/07_internacionalizacion.md` |
| Zustand store pattern | `knowledge-base/05-dx/04_convenciones_y_estandares.md` §3 |

### Contenido genuinamente sub-project-specific

- **PWA caching strategies**: Workbox estrategias (CacheFirst/NetworkFirst), fallback images, SW lifecycle
- **Shared cart model**: per-device cart, collaborative round submission, WebSocket vs cart state
- **`useOptimisticCart`**: implementación React 19 `useOptimistic`, rollback automático
- **AIChat component**: `useActionState` + strategy pattern para response handlers
- **MercadoPago integration**: checkout flow, redirect URLs, `VITE_MP_PUBLIC_KEY`, mock mode
- **localStorage TTL**: 8-hour expiry, `withExpiry()` wrapper pattern
- **i18n detallado**: 3 idiomas (es/en/pt), fallback chain, `t()` enforcement en TODOS los strings
- **QR code scanning**: branch slug requirement, session endpoint flow
- **Collaborative ordering**: diner colors, round confirmation flow

### Recomendación para futuros changes

**MEDIA PRIORIDAD**: Eliminar secciones duplicadas con root (~100 líneas). Preservar todo lo PWA-specific.

---

## pwaWaiter/CLAUDE.md (251 líneas)

### Contenido duplicado con root CLAUDE.md / knowledge-base

| Sección en pwaWaiter/CLAUDE.md | Duplicado en |
|--------------------------------|-------------|
| Dev commands | Root CLAUDE.md — Quick Reference |
| Pre-login flow (branch select antes de login) | Root CLAUDE.md — RBAC / Auth, knowledge-base |
| Authentication flow overview | `knowledge-base/03-seguridad/01_modelo_de_seguridad.md` |
| WebSocket patterns | `knowledge-base/05-dx/04_convenciones_y_estandares.md` §3 |

### Contenido genuinamente sub-project-specific

- **Navigation structure**: `PreLoginBranchSelect → Login → AssignmentVerification → MainPage` con tabs
- **AutogestionModal**: split-view ordering, comanda rápida flow
- **Push notifications**: `sw-push.js`, `VAPID_PUBLIC_KEY`, subscription via `/api/waiter/notifications/subscribe`
- **`RetryQueueStore`**: queue de operaciones fallidas para reconexión
- **Sound alerts**: Web Audio API, localStorage toggle para sonido
- **TableDetailModal**: estados de mesa, acciones por estado, confirmaciones
- **Zustand stores waiter**: `tableStore`, `waiterStore`, `authStore` — estructura y selectores
- **Assignment verification**: `GET /api/waiter/verify-branch-assignment`, "Acceso Denegado" screen

### Recomendación para futuros changes

**BAJA PRIORIDAD**: Es el más compacto (251 líneas) y la duplicación es menor. Preservar como está en el corto plazo.

---

## Resumen de Recomendaciones

| Sub-project | Prioridad extracción | Líneas a eliminar aprox. | Riesgo |
|-------------|----------------------|--------------------------|--------|
| Dashboard/CLAUDE.md | ALTA | ~200 | Bajo — duplicación clara |
| pwaMenu/CLAUDE.md | MEDIA | ~100 | Bajo — duplicación clara |
| pwaWaiter/CLAUDE.md | BAJA | ~50 | Mínimo |

### Próximos changes sugeridos

1. **`dashboard-claude-md-refactor`**: Eliminar duplicaciones en `Dashboard/CLAUDE.md`, convertirlo en hub sub-project con links al root. Mantener toda la info sub-project-specific.
2. **`pwamenu-claude-md-refactor`**: Mismo para `pwaMenu/CLAUDE.md`.
3. **`pwawaiter-claude-md-refactor`**: Mismo para `pwaWaiter/CLAUDE.md` (opcional, baja prioridad).

### Verificación

- [x] `Dashboard/CLAUDE.md` NO fue editado en este change
- [x] `pwaMenu/CLAUDE.md` NO fue editado en este change
- [x] `pwaWaiter/CLAUDE.md` NO fue editado en este change
