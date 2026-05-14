# Auditoría completa — Sistema restaurant-buen-sabor
**Fecha:** 2026-05-13
**Modalidad:** Análisis estático arquitectónico + revisión de seguridad + predicción de concurrencia para 100 usuarios simultáneos
**Alcance:** Backend (FastAPI), WebSocket Gateway, 3 frontends (Dashboard, pwaMenu, pwaWaiter), infraestructura, deuda técnica

---

## 1. Resumen ejecutivo

El sistema `restaurant-buen-sabor` muestra una arquitectura ambiciosa con Clean Architecture parcialmente aplicada, outbox pattern correcto en eventos críticos, RBAC enforced, y buenos patrones en los 3 frontends (Zustand selectors estables, React 19 hooks, WebSocket con backoff exponencial). Sin embargo, hay deuda técnica significativa que bloquea producción: routers gordos que violan Clean Architecture y bypassan los domain services existentes, un stub AFIP sin gate de producción que podría emitir facturas falsas como válidas, secrets con defaults funcionales, y un módulo entero (Inventory + Suppliers + Cash Register + Floor Plan) implementado en backend pero sin integración en frontend (~45 endpoints huérfanos). En cuanto a concurrencia, el sistema **aguanta 100 usuarios solo bajo el overlay productivo** (2 backends + 2 ws_gateway + nginx ip_hash) y con tres fixes mandatorios antes: política Redis `noeviction` o segmentación, sweeper de outbox `PROCESSING`, y mover el stock-check N+1 fuera del lock de `submit_round`. En single-instance dev se degrada antes de los 20 submits simultáneos. Seguridad tiene 3 críticos (TOTP plaintext, refresh token en body, table token HMAC sin revocación) pero el resto del hardening es sólido.

### Conteo de hallazgos

| Severidad | Endpoints | Seguridad | Concurrencia | Frontend | Deuda Téc. | **Total** |
|-----------|-----------|-----------|--------------|----------|------------|-----------|
| CRITICO   | 8         | 3         | 3            | 3        | 3          | **20**    |
| ALTO      | 2         | 4         | 4            | 2        | 5          | **17**    |
| MEDIO     | 8         | 4         | 4            | 4        | 4          | **24**    |
| BAJO      | 0         | 3         | 0            | 3        | 0          | **6**     |

### Veredicto sobre carga de 100 usuarios concurrentes
**Aguanta parcialmente.** En dev single-instance se degrada con >15 `submit_round` simultáneos (pool_timeout=30s). En overlay productivo (2 backends + 2 ws_gateway + nginx `ip_hash` + Redis Sentinel) sí soporta los 100, **siempre que** se aplique antes: (1) Redis `noeviction` o segmentación de namespaces, (2) sweeper de eventos outbox en estado `PROCESSING`, (3) sacar el stock-check N+1 fuera del lock con `FOR UPDATE`. Sin estos tres, riesgo de evictions de blacklist/outbox y deadlock cascading bajo pico.

### Top 5 riesgos críticos (priorizar primero)
1. **AFIP stub sin gate de producción** — `services/domain/fiscal_service.py:538-561` — si pasa a prod, factura falsa se persiste como válida (riesgo legal/fiscal grave).
2. **Redis `allkeys-lru` evicta token blacklist / outbox / rate-limit** — `devOps/docker-compose.yml:57` (prod 49-50) — login bypass por blacklist evictada, idempotency perdida, catch-up vacío.
3. **TOTP secret en texto plano en DB** — `backend/rest_api/models/user.py:40` — campo etiquetado "(encrypted)" pero sin cifrado; breach de DB filtra todos los 2FA.
4. **Refresh token devuelto en body además de cookie HttpOnly** — `backend/rest_api/routers/auth/routes.py:222, 367` — XSS roba refresh de 7 días anulando el beneficio de HttpOnly.
5. **Outbox processor SPOF sin recovery de `PROCESSING`** — `services/events/outbox_processor.py:64-87, 102-160` — eventos quedan huérfanos para siempre si el proceso muere entre commit y publish.

---

## 2. Metodología

Auditoría delegada a 5 agentes especialistas trabajando en paralelo:

1. **Mapeo endpoints backend ↔ frontends**: enumeración exhaustiva de rutas FastAPI y cruce con llamadas API en los 3 frontends
2. **Seguridad de dominios CRITICO**: auth, billing, allergens, staff + infraestructura transversal (CORS, CSP, validación, SSRF, XSS)
3. **Análisis estático de concurrencia**: predicción de bottlenecks para 100 clientes simultáneos basado en pools, locks, race conditions, N+1, rate limiters
4. **Patrones frontend y code quality**: Zustand selectors, WebSocket subscriptions, React 19 hooks, type safety, i18n, mobile viewport
5. **Deuda técnica y arquitectura**: Clean Architecture violations, fat routers, AFIP stub, tests gaps, CRUDFactory legacy, exception handling

Severidades:
- **CRITICO**: riesgo de breach, data loss, romperá el sistema en producción
- **ALTO**: degradación significativa, violación de política, deuda que bloquea evolución
- **MEDIO**: riesgo bajo carga pico, refactor candidate
- **BAJO**: hardening, nitpicks

---

## 3. Hallazgos CRITICO consolidados

### C1. AFIP STUB sin gate de producción
- **Dominio**: Deuda técnica / Seguridad
- **Evidencia**: `services/domain/fiscal_service.py:538-561`
- **Impacto**: `_call_afip_wsfe()` retorna `cae="00000000000000"` con `result="A"` y solo emite un warning. Si se promueve a producción sin reemplazar por `pyafipws` + certificados AFIP, la factura se persiste como válida en DB — riesgo legal y fiscal grave (sanciones AFIP, evasión simulada).
- **Recomendación**: Gate de producción que aborte el arranque si `ENVIRONMENT=production` y no hay implementación real (`raise NotImplementedError`). Documentar claramente en runbook que la facturación real requiere `pyafipws`.

### C2. Redis `allkeys-lru` evictará claves críticas bajo presión
- **Dominio**: Concurrencia
- **Evidencia**: `devOps/docker-compose.yml:57` y prod 49-50
- **Impacto**: Con 100 diners cacheando menú (`cache:menu:{slug}`, 5min TTL) + token blacklist + outbox idempotency + rate-limit Lua scripts + catch-up sorted sets, Redis con `allkeys-lru` evicta claves "frías" que en realidad son críticas: token blacklist con falsos negativos (login bypass), outbox idempotency perdida (eventos duplicados), catch-up vacío post-reconexión (eventos perdidos en pwaMenu).
- **Recomendación**: Política `noeviction` con segmentación de namespaces, o subir RAM a 512MB+ y monitorear `evicted_keys`. Alternativa: separar Redis en dos instancias (cache vs. data crítica).

### C3. TOTP secret en texto plano en DB
- **Dominio**: Seguridad
- **Evidencia**: `backend/rest_api/models/user.py:40`
- **Impacto**: Campo `totp_secret: Text` con comentario "(encrypted)" pero SIN cifrado real. Si la DB se compromete (SQL injection, backup robado, replica filtrada), TODOS los secrets 2FA se filtran y el 2FA queda anulado para toda la plantilla.
- **Recomendación**: Cifrar con AES-GCM usando key del KMS/Vault. Rotación gradual: re-prompt 2FA setup en próximo login para usuarios con secret legacy. Validar en `validate_production_secrets()` que la encryption key existe.

### C4. Refresh token devuelto en body además de cookie HttpOnly
- **Dominio**: Cruzado entre dominios: Seguridad + Endpoints
- **Evidencia**: `backend/rest_api/routers/auth/routes.py:222, 367`
- **Impacto**: Refresh token de 7 días se entrega también en el JSON response. Si hay XSS en cualquier frontend (Dashboard/pwaWaiter), el atacante roba el refresh y mantiene la sesión 7 días aunque el access token expire. Anula el beneficio de la cookie HttpOnly.
- **Recomendación**: Devolver únicamente la cookie HttpOnly + flags `Secure; SameSite=Strict`. Frontends deben confiar en `credentials: 'include'` y no leer el token del body.

### C5. Outbox processor SPOF sin recovery de eventos `PROCESSING`
- **Dominio**: Concurrencia
- **Evidencia**: `services/events/outbox_processor.py:64-87, 102-160`
- **Impacto**: Si el proceso muere entre el commit en estado `PROCESSING` y la publicación a Redis, los eventos quedan colgados para siempre. CHECK_PAID / PAYMENT_APPROVED / ROUND_READY pueden no llegar nunca al frontend. Cumplimiento financiero comprometido.
- **Recomendación**: Sweeper periódico que rescate eventos `PROCESSING` con `updated_at < now() - 5min` y los marque para retry. Considerar mover a Redis Streams consumer groups para resilencia automática.

### C6. DB pool saturable bajo pico de `submit_round`
- **Dominio**: Concurrencia
- **Evidencia**: `shared/infrastructure/db.py:17-38`
- **Impacto**: Pool con 9 conexiones base + 15 overflow = 24 conexiones. 20 `submit_round` simultáneos consumen 20 conexiones cada una con lock `FOR UPDATE` activo durante el stock check N+1 (50-80ms). Con 30+ simultáneos → `pool_timeout=30s`, >2% de errores 500 en login y otros endpoints.
- **Recomendación**: Subir pool a `pool_size=20, max_overflow=40` para 100 users. Sacar el stock check del lock (ver C7). En prod scaling con 2 backends, esto duplica capacidad.

### C7. N+1 query en stock validation dentro del lock de submit_round
- **Dominio**: Concurrencia / Deuda técnica
- **Evidencia**: `inventory_service.py:243-286` (referenciado desde `submit_round`)
- **Impacto**: Por cada producto en la ronda: SELECT Recipe + `json.loads` + por cada ingrediente SELECT Ingredient + SELECT StockItem. Para una orden de 5 productos con 3 ingredientes cada uno: 21+ queries en serie, ejecutadas dentro del lock `FOR UPDATE`. Bloquea otras submissions a la misma sesión.
- **Recomendación**: Pre-fetch stock con un solo query JOIN antes de tomar el lock. Validar en memoria, luego tomar lock corto solo para el decremento atómico. Reduce lock time de 80ms a <10ms.

### C8. Fat routers con lógica de negocio (Clean Arch violation)
- **Dominio**: Deuda técnica
- **Evidencia**:
  - `routers/waiter/routes.py` (2378 LoC, 19 endpoints)
  - `routers/billing/routes.py` (971 LoC, 7 endpoints)
  - `routers/diner/orders.py` (898 LoC)
  - `routers/tables/routes.py` (721 LoC)
- **Impacto**: Routers ejecutan stock validation (waiter/routes.py:742-764), pricing/FIFO allocation (billing/routes.py:138-200, 264-339) y batch round creation (waiter/routes.py:766-808). `BillingService` y `RoundService` existen pero los routers los bypassan. Imposible testear lógica sin levantar FastAPI completo. Cambios duplicados entre router y service.
- **Recomendación**: Migrar lógica progresivamente a domain services. Empezar por billing (más crítico financieramente). Convertir routers en thin controllers de <300 LoC.

### C9. Secrets default funcionales + validación solo en `ENVIRONMENT=production` exacto
- **Dominio**: Deuda técnica / Seguridad
- **Evidencia**: `shared/config/settings.py:22, 38, 119`
- **Impacto**: `jwt_secret = "dev-secret-change-me-in-production"` permite que el sistema arranque con secrets default. `validate_production_secrets()` solo corre cuando `ENVIRONMENT == "production"` exacto — staging, prod, stg, prd no son detectados y se pasa con secrets default. Riesgo de deploy a staging/prod con JWT firmado por "dev-secret".
- **Recomendación**: Aceptar prefix `prod*` / `stag*` o variable `IS_PRODUCTION=true` explícita. Fail fast si secrets son los defaults documentados en cualquier env no-dev.

### C10. Llamadas rotas: fiscal invoices/credit-notes singular vs plural
- **Dominio**: Endpoints
- **Evidencia**: `Dashboard/src/services/api.ts:2285` `POST /api/admin/fiscal/invoices` vs backend `/fiscal/invoice` en `admin/fiscal.py:161`; `api.ts:2298` `/fiscal/credit-notes` vs backend `/fiscal/credit-note` en `admin/fiscal.py:244`.
- **Impacto**: 404 al emitir factura desde Dashboard. Feature de facturación rota desde el frontend.
- **Recomendación**: Alinear naming. Recomendado: estandarizar en plural REST-style en backend (rompe compat) o ajustar frontend a singular.

### C11. Llamada rota: fiscal points usa PUT en frontend, PATCH en backend
- **Dominio**: Endpoints
- **Evidencia**: `Dashboard/src/services/api.ts:2317-2322` `PUT /api/admin/fiscal/points/{id}` vs backend `PATCH /fiscal/points/{id}` en `admin/fiscal.py:116`.
- **Impacto**: 405 Method Not Allowed. Editar punto de venta fiscal queda imposible.
- **Recomendación**: Cambiar frontend a PATCH.

### C12. Llamada rota: loyalty rules guion vs slash
- **Dominio**: Endpoints
- **Evidencia**: `Dashboard/src/services/api.ts:2579,2583,2590,2597` `/api/admin/loyalty/rules` (GET/POST/PATCH/DELETE) vs backend `/loyalty-rules` con guión en `admin/crm.py:283,296,315,336`.
- **Impacto**: 404 en las 4 operaciones CRUD de reglas de fidelización.
- **Recomendación**: Ajustar frontend al naming kebab-case del backend.

### C13. Llamada rota: MercadoPago preference endpoint inexistente
- **Dominio**: Endpoints
- **Evidencia**: `pwaMenu/src/services/mercadoPago.ts:142` `POST /api/payments/preference` no existe. La correcta es `/api/billing/mercadopago/preference` en `billing/routes.py:607`.
- **Impacto**: Pago por MercadoPago en pwaMenu nunca arranca — 404 antes de redirigir al checkout.
- **Recomendación**: Apuntar al endpoint canónico `/api/billing/mercadopago/preference`.

### C14. Llamadas rotas: pwaMenu menu/categories y orders inexistentes
- **Dominio**: Endpoints
- **Evidencia**:
  - `pwaMenu/src/services/api.ts:432` `GET /api/public/menu/{slug}/categories` — no existe
  - `pwaMenu/src/services/api.ts:436` `GET /api/public/menu/{slug}/items/{itemId}` — backend usa `/menu/{slug}/products/{product_id}` en `public/catalog.py:363`
  - `pwaMenu/src/services/api.ts:441,448` `POST/GET /api/public/orders[/{id}]` — no existen
- **Impacto**: Si código de pwaMenu llega a esas rutas (deep-link, filtros, detalle de producto, polling de orden), todo es 404.
- **Recomendación**: Limpiar wrappers muertos. Apuntar items al naming `/products/{product_id}`. Eliminar `/api/public/orders` si no se usa.

### C15. Destructuring directo de store Zustand
- **Dominio**: Frontend
- **Evidencia**: `Dashboard/src/components/tables/WaiterAssignmentModal.tsx:52-61`
- **Impacto**: Suscribe el componente al store entero. Candidato a re-render loop con el `useEffect` de línea 78 que depende del state retornado. Patrón explícitamente prohibido en CLAUDE.md de Dashboard.
- **Recomendación**: Migrar a selectores individuales: `const items = useStore(selectItems); const addItem = useStore((s) => s.addItem)`.

### C16. Memory leak: `clearTimeout` aplicado a `setInterval`
- **Dominio**: Frontend
- **Evidencia**: `pwaMenu/src/App.tsx:96-99`
- **Impacto**: `setInterval` de línea 73 nunca se cancela porque la cleanup usa `clearTimeout`. Cada HMR/remount deja un poll activo huérfano. Acumulación de intervalos consumiendo CPU y memoria en desarrollo (y producción tras navegaciones SPA agresivas).
- **Recomendación**: Cambiar a `clearInterval(handleId)` en la cleanup function del useEffect.

### C17. Side effect (asignación de ref) durante render
- **Dominio**: Frontend
- **Evidencia**: `Dashboard/src/hooks/useAdminWebSocket.ts:54-57`
- **Impacto**: Asigna `.current` en el body del hook (fuera de useEffect). Viola las reglas de React. Con StrictMode o React Compiler puede ejecutarse 2 veces. Patrón correcto está en `useTableWebSocket.ts:21-24` (asignación dentro de useEffect).
- **Recomendación**: Mover asignación a `useEffect(() => { ref.current = value })`.

### C18. Tests cero en módulos financieros y de permisos
- **Dominio**: Deuda técnica
- **Evidencia**: Ausencia de `test_payment_gateway.py`, `test_mercadopago_gateway.py`, `test_allocation.py`, `test_circuit_breaker.py`, `test_webhook_retry.py`, `test_permissions_*.py`
- **Impacto**: FIFO allocation es financialmente crítico (decide qué charge cobra qué payment). Cero tests sobre billing service / payment gateways / permission strategy. Riesgo de regresión silenciosa en operaciones reales con dinero.
- **Recomendación**: Tests unitarios obligatorios para `BillingService.allocate_payment`, `MercadoPagoGateway`, `PermissionContext.require_*`. Coverage mínimo 80% en `services/payments/*` y `services/permissions/*`.

### C19. CI no valida alembic upgrade/downgrade
- **Dominio**: Deuda técnica
- **Evidencia**: `.github/workflows/ci.yml`
- **Impacto**: 14 migrations con `downgrade()` declarado pero nunca ejecutado en CI. Ninguna validación de roundtrip `upgrade head → downgrade base → upgrade head`. Migrations rotas se descubren en producción.
- **Recomendación**: Job dedicado en CI que ejecute el roundtrip completo contra PostgreSQL ephemeral con seed básico.

### C20. Manejo de errores híbrido + `except Exception` swallowing en flows críticos
- **Dominio**: Deuda técnica
- **Evidencia**:
  - 428 ocurrencias mezcladas HTTPException + dominio
  - `waiter/routes.py:179-196` (router atrapa ValueError/NotFoundError/Exception y reemite como HTTPException)
  - `billing/routes.py:362-364, 506-507` (swallowing de audit log con solo warning)
  - 164 `except Exception` en 49 archivos
- **Impacto**: Exception handler centralizado existe pero los routers lo bypassan. Errores de billing se swallowan con warning, comprometiendo cumplimiento PCI/SOX (audit trail roto). Imposible debuggear con stack traces consistentes.
- **Recomendación**: Borrar try/except genéricos en routers. Dejar que el exception handler central convierta `NotFoundError → 404`, `ForbiddenError → 403`, `ValidationError → 400`. En billing/audit, usar `except Exception` solo con re-raise tras logging estructurado.

---

## 4. Hallazgos ALTO consolidados

### A1. Cross-leakage: pwaWaiter llama endpoints admin
- **Dominio**: Endpoints
- **Evidencia**: `pwaWaiter/src/services/api.ts:713` `GET /api/admin/branches/{branchId}` y `:720` `GET /api/admin/branches`
- **Impacto**: pwaWaiter no es ADMIN — los endpoints devolverán 403. Selección de branch pre-login y otros flows quedan rotos.
- **Recomendación**: Usar `/api/public/branches` (no auth, ya existe).

### A2. Patrón de módulos backend sin integrar al frontend (~45 endpoints huérfanos)
- **Dominio**: Endpoints / Arquitectura
- **Evidencia**:
  - Módulo completo `admin/inventory.py:65-529` (22 endpoints: stock, movimientos, alertas, food-cost, waste, suppliers, purchase-orders)
  - `admin/cash_register.py:57,97,136,174,202,237` (6 endpoints)
  - `admin/floor_plan.py:67-212` (8 endpoints) — `FloorPlan.tsx:182,188` mockeado
  - `admin/overrides.py:51,78,105` (3 endpoints) sin consumer
  - `admin/data_export.py:36,141,235` (3 endpoints GDPR) sin caller
  - `content/rag.py:120,169,291` (RAG ingest)
- **Impacto**: Sub-sistema entero implementado en backend con UI Dashboard mockeada. Inversión de desarrollo sin valor entregado al usuario. ~45 endpoints huérfanos atribuibles.
- **Recomendación**: Decisión estratégica — integrar (Sprint completo) o eliminar (rollback de feature work). No dejar zombie code.

### A3. Email rate limiter no normaliza case
- **Dominio**: Seguridad
- **Evidencia**: `backend/shared/security/rate_limit.py:104`
- **Impacto**: Falta `.lower()` antes de hashear el email key. `Admin@DEMO.COM`, `admin@demo.com`, `ADMIN@demo.com` cuentan como buckets distintos. Bypass de credential-stuffing: atacante prueba el mismo usuario 15+ veces variando case.
- **Recomendación**: Normalizar email con `email.strip().lower()` antes del hash.

### A4. JWT no se revoca al cambiar roles/branches
- **Dominio**: Seguridad
- **Evidencia**: `services/domain/staff_service.py:306-318` y `admin/assignments.py`
- **Impacto**: Cambios de rol/branch NO llaman `revoke_all_user_tokens`. Un MANAGER despedido o degradado a WAITER mantiene su access token (15 min) y refresh token (7 días) con permisos viejos.
- **Recomendación**: Tras `update_role` / `revoke_assignment` / `assign_branch`, invocar `revoke_all_user_tokens(user_id)` para forzar re-login.

### A5. SSRF: `validate_image_url` substring match sin parseo de IP/DNS
- **Dominio**: Seguridad
- **Evidencia**: `shared/utils/validators.py:100-103`
- **Impacto**: Validación por substring (`"169.254" in url`) es bypassable con DNS rebinding o URL encoding. AWS metadata `169.254.169.254` alcanzable vía nombre DNS que resuelve a IP interna. Atacante puede pivotar al metadata service y robar credenciales IAM.
- **Recomendación**: Parsear con `urllib.parse`, resolver DNS con `socket.gethostbyname_ex`, validar contra rangos RFC1918 + 169.254/16 + 100.64/10 + ::1 + fc00::/7. Considerar lib `validators` o `pydantic.HttpUrl` con custom validator.

### A6. ContentTypeValidationMiddleware exempta path incorrecto del MP webhook
- **Dominio**: Seguridad
- **Evidencia**: `core/middlewares.py:80`
- **Impacto**: `EXEMPT_PATHS = {"/api/billing/webhook"}` pero la ruta real es `/api/billing/mercadopago/webhook`. MercadoPago manda `application/x-www-form-urlencoded` o similar, y la validación lo rechaza → webhook nunca llega al handler → eventos de pago perdidos.
- **Recomendación**: Corregir el path a `/api/billing/mercadopago/webhook`. Agregar test de integración que envíe un webhook real (mock MP).

### A7. WebSocket fan-out a 100 diners cuando un mozo modifica ítem
- **Dominio**: Concurrencia
- **Evidencia**: `ws_gateway/core/connection/broadcaster.py:296-381`
- **Impacto**: `send_to_branch` envía a 100 diners por evento en vez de `send_to_session` por mesa. 100 diners x 10 eventos cart/round/seg = 1000 mensajes/s solo de cart sync. Saturación de socket + ancho de banda.
- **Recomendación**: Routing por scope: eventos de cart/round van a `send_to_session(session_id)`. Solo eventos cross-branch (admin reports, status global) usan `send_to_branch`.

### A8. Rate-limit ThreadPoolExecutor de 2 workers para 100 logins
- **Dominio**: Concurrencia
- **Evidencia**: `shared/security/rate_limit.py:43,87`
- **Impacto**: 100 logins / refresh sincronizados pasan por un thread pool de 2 workers ejecutando Redis sync. Cola de 50 ops espera FIFO → 250-500ms extra de latencia en p95-p99 cuando hay refresh proactivo (cada 14min en Dashboard/pwaWaiter).
- **Recomendación**: Subir a 8-12 workers, o mover a cliente Redis async nativo (`redis.asyncio`).

### A9. MercadoPago `httpx.AsyncClient(timeout=30s)` sin circuit breaker
- **Dominio**: Concurrencia
- **Evidencia**: `services/payments/mercadopago_gateway.py:21,54`
- **Impacto**: Si MP responde lento (incidente en su lado), todas las requests de pago cuelgan 30s. 20 pagos concurrentes con MP lento → 20 conexiones DB ocupadas (mantenidas durante el await) → pool agotado → cascada a otros endpoints.
- **Recomendación**: Circuit breaker (lib `purgatory`, `pybreaker` o custom). Bajar timeout a 8-10s. Fallback a modo manual si MP falla 3x consecutivas.

### A10. Persist migrations Zustand sin type guard ni null check
- **Dominio**: Frontend
- **Evidencia**: 12 stores Dashboard:
  - `productStore.ts:357-385`
  - `categoryStore.ts:229-249`
  - `branchStore.ts:259`
  - `allergenStore.ts:266`
  - `subcategoryStore.ts:217`
  - `promotionStore.ts:287`
  - `tableStore.ts:785`
  - `promotionTypeStore.ts:89`
  - `sealStore.ts:99`
  - `badgeStore.ts:81`
  - `restaurantStore.ts:150`
  - `orderHistoryStore.ts:181`
  - Solo `staffStore.ts:271` cumple
- **Impacto**: `persistedState` implícito `any`, sin null check, sin validación de estructura. Schema change → app crashea en mount sin recovery. CLAUDE.md de Dashboard documenta el patrón correcto pero no se aplicó.
- **Recomendación**: Aplicar pattern de `staffStore.ts:271` (validar con type guard, retornar defaults si la forma es incorrecta) a las 12 stores restantes.

### A11. Hardcoded Spanish en pwaMenu (rompe 100% i18n)
- **Dominio**: Frontend
- **Evidencia**:
  - `AdvancedFiltersModal.tsx` líneas 123, 154, 179, 201, 220, 266, 290 (importa `useTranslation` pero lo aliasa a `_t`)
  - `close-table/NoSessionView.tsx:24`
- **Impacto**: Diners en inglés/portugués ven texto en español. Convención de pwaMenu es zero hardcoded strings — esta violación rompe la garantía i18n declarada en CLAUDE.md.
- **Recomendación**: Reemplazar con `t('key')`. Agregar regla ESLint que detecte literales de string en JSX en archivos de pwaMenu.

### A12. CRUDFactory deprecated migrado pero entidades sin domain service
- **Dominio**: Deuda técnica
- **Evidencia**: Entidades sin domain service: recipe, ingredient/subingredient, exclusion, knowledge, feedback, cart
- **Impacto**: Aunque CRUDFactory ya no se usa (0 de 30 routers), 6 entidades siguen sin service layer. Lógica dispersa en routers gordos (cart en `diner/cart.py:591 LoC`).
- **Recomendación**: Crear `RecipeService`, `IngredientService`, `CartService` siguiendo el pattern de `BranchScopedService[Model, Output]`.

### A13. Inconsistencia response schema (dict vs Pydantic) rompe OpenAPI codegen
- **Dominio**: Deuda técnica
- **Evidencia**: `billing/routes.py:512-563` `get_check` retorna `dict[str, Any]`. 10 `return {...}` directos en billing. También en `admin/cash_register`, `admin/tips`, `admin/data_export`, `admin/assignments`, `waiter/notifications`.
- **Impacto**: OpenAPI spec genera `additionalProperties: {}` para esos endpoints. `scripts/generate-types.sh` produce tipos `Record<string, unknown>` en frontends → type safety perdido. Frontend usa `as any` implícito o `// @ts-ignore`.
- **Recomendación**: Definir Pydantic output schemas para todas las respuestas. Habilitar `response_model_exclude_none=True` para reducir verbosidad.

### A14. `except Exception` swallowing financiero
- **Dominio**: Deuda técnica
- **Evidencia**: 164 ocurrencias en 49 archivos; ejemplos en `billing/routes.py:362-364, 506-507`
- **Impacto**: Audit log se swallowa con warning → cumplimiento PCI/SOX comprometido. No hay forma de auditar quién cobró qué cuando hay un bug en billing.
- **Recomendación**: En billing/payments, prohibir `except Exception` sin re-raise. Logging estructurado obligatorio antes del raise. CI lint que detecte `except Exception:\n.*pass` y `.*logger.warning`.

### A15. pwaWaiter `logout` no hace request al backend
- **Dominio**: Frontend / Seguridad
- **Evidencia**: `pwaWaiter/src/services/api.ts:305-308`
- **Impacto**: Logout solo limpia localStorage. Refresh token sigue válido en el servidor 7 días. Token robado tras logout sigue funcionando.
- **Recomendación**: Llamar `POST /api/auth/logout` para invalidar el refresh token server-side (con retry-on-401 deshabilitado para evitar el infinite loop documentado en CLAUDE.md).

### A16. WebSocket — subscribers solapados en pwaMenu
- **Dominio**: Frontend
- **Evidencia**: `pwaMenu/src/hooks/useOrderUpdates.ts:192-201`
- **Impacto**: 9 subscribers individuales + 1 wildcard solapado. Eventos procesados 2 veces, contadores duplicados, posibles efectos visuales repetidos.
- **Recomendación**: Usar solo subscribers específicos o solo el wildcard. No mezclar.

### A17. Migration 013 ADD COLUMN NOT NULL sin nota de concurrencia
- **Dominio**: Deuda técnica / Concurrencia
- **Evidencia**: `alembic/versions/013_add_void_fields_to_round_item.py:21-25`
- **Impacto**: ADD COLUMN NOT NULL en tabla grande en producción puede tomar lock exclusivo y bloquear operaciones por minutos. Sin nota de runbook que advierta ventana de mantenimiento.
- **Recomendación**: Documentar en runbook. Considerar split en 3 pasos: ADD COLUMN NULL → backfill async → SET NOT NULL.

---

## 5. Hallazgos MEDIO consolidados

| ID  | Dominio       | Archivo / Evidencia                                                                 | Problema                                                                 | Fix sugerido                                          |
|-----|---------------|--------------------------------------------------------------------------------------|--------------------------------------------------------------------------|-------------------------------------------------------|
| M1  | Endpoints     | `admin/inventory.py:65-529`                                                          | 22 endpoints stock/suppliers/purchase-orders huérfanos                   | Integrar o eliminar                                   |
| M2  | Endpoints     | `admin/cash_register.py:57,97,136,174,202,237`                                       | 6 endpoints sin consumer en CashRegister.tsx                             | Integrar wrappers en Dashboard                        |
| M3  | Endpoints     | `admin/floor_plan.py:67-212`                                                         | 8 endpoints sin consumer; FloorPlan.tsx:182,188 mockeado                 | Integrar wrappers o eliminar mock                     |
| M4  | Endpoints     | `admin/overrides.py:51,78,105`                                                       | 3 endpoints sin consumer Dashboard                                       | Integrar o eliminar                                   |
| M5  | Endpoints     | `admin/data_export.py:36,141,235`                                                    | 3 endpoints GDPR sin caller                                              | Integrar botones en CRM page                          |
| M6  | Endpoints     | `content/rag.py:120,169,291`                                                         | RAG ingest sin consumer                                                  | Integrar o eliminar feature                           |
| M7  | Endpoints     | `waiter/routes.py:1972,2109,2220`                                                    | transfer/discount/move-to sin consumer pwaWaiter                         | Integrar UI o eliminar                                |
| M8  | Endpoints     | `kitchen/tickets.py:29,51,70,93`                                                     | 4 endpoints kitchen tickets sin consumer                                 | Integrar UI                                           |
| M9  | Seguridad     | `billing/routes.py:205-378`                                                          | Sin idempotency key en `/billing/cash/pay` y `/payments/manual`          | Header `Idempotency-Key` UUID v4                      |
| M10 | Seguridad     | `auth/routes.py:464-608`                                                             | Sin backup codes para 2FA                                                | Generar 10 backup codes en setup, hashearlos en DB    |
| M11 | Seguridad     | `core/middlewares.py:50`                                                             | CSP permite `'unsafe-inline'` para `style-src`                           | Migrar styles a nonces o hashes                       |
| M12 | Seguridad     | `shared/config/settings.py:33`                                                       | `settings.cookie_secure default = False` y prod no lo chequea            | Validar `cookie_secure=True` en prod                  |
| M13 | Concurrencia  | `billing/routes.py:226,828`                                                          | `with_for_update` en `record_cash_payment` sin `nowait`                  | Agregar `nowait=True` o `skip_locked=True`            |
| M14 | Concurrencia  | pwaMenu vite.config.ts (caching strategies)                                          | Service Worker cache stampede: 100 diners invalidan menú simultáneo      | Jitter en TTL (4-6min random)                         |
| M15 | Concurrencia  | ws_gateway heartbeat                                                                 | 100 clientes en LTE inestable → connection churn                         | Tolerancia de heartbeat + sticky reconnect            |
| M16 | Concurrencia  | `shared/config/logging.py:156`                                                       | Logging stdout sync en hot path                                          | Mover a logging async / queue                         |
| M17 | Frontend      | `pwaWaiter/src/services/api.ts:305-308` (overlap con A15)                            | Logout no invalida server-side                                           | POST /api/auth/logout                                 |
| M18 | Frontend      | `Dashboard/src/config/env.ts:166-176`                                                | `console.*` directo (gated por DEV pero viola convención)                | Usar `utils/logger.ts`                                |
| M19 | Frontend      | `pwaMenu/src/hooks/useCustomerRecognition.ts:175`                                    | Hook retorna array nuevo cada render (`?? []` sin EMPTY_*)               | Definir `EMPTY_ARRAY` const fuera                     |
| M20 | Frontend      | `pwaMenu/src/hooks/useOrderUpdates.ts:192-201` (overlap con A16)                     | 9 subscribers + 1 wildcard solapados                                     | Elegir uno u otro                                     |
| M21 | Deuda téc.    | `alembic/versions/013_add_void_fields_to_round_item.py:21-25`                        | ADD COLUMN NOT NULL sin nota runbook                                     | Documentar ventana de mantenimiento                   |
| M22 | Deuda téc.    | `backend/cli.py:19`                                                                  | `print()` en código (debería usar logger)                                | Reemplazar con `logger.info`                          |
| M23 | Deuda téc.    | `shared/infrastructure/events/dlq_processor.py:177`                                  | TODO: S3 archival no implementado. Mensajes financieros DLQ se pierden   | Implementar archival a S3/MinIO con TTL 90 días       |
| M24 | Deuda téc.    | Frontend deps (Dashboard/pwaMenu/pwaWaiter package.json)                             | Sin red flags inmediatos pero falta `npm audit` en CI                    | Agregar `npm audit --audit-level=moderate` en CI      |

---

## 6. Hallazgos BAJO / hardening

| ID  | Dominio   | Archivo / Evidencia                                                       | Notas                                                                              |
|-----|-----------|---------------------------------------------------------------------------|-------------------------------------------------------------------------------------|
| B1  | Seguridad | `auth.py:231,241` vs `token_blacklist.py:58,65,69,...`                    | Inconsistencia hashing del jti (SHA-256 vs blake2b o similar)                       |
| B2  | Seguridad | `core/cors.py:27-32` y `ws_gateway/components/core/constants.py:318-322`  | CORS dev incluye IP hardcodeada `192.168.1.106`                                     |
| B3  | Seguridad | `auth/routes.py:195,548,594`                                              | TOTP `valid_window=1` sin tracking del último counter usado → replay ventana ±30s    |
| B4  | Frontend  | 12 stores Dashboard (mismas que A10)                                      | Tipos implícitos `any` en parámetro `persistedState` de migrate                     |
| B5  | Frontend  | `pwaMenu/src/components/SubcategoryGrid.tsx:92`                           | `alt=""` empty en imagen clickeable (accesibilidad)                                  |
| B6  | Frontend  | `Dashboard/src/pages/Products.tsx`, `Promotions.tsx`, `Tables.tsx`, `Staff.tsx` | No usan `useFormModal` / `useConfirmDialog` (deuda técnica documentada en Dashboard/CLAUDE.md) |

---

## 7. Análisis por dominio

### 7.1 Endpoints backend ↔ frontends

**Resumen del agente 1:**

- Total endpoints backend: ~232
- Total llamadas frontend (rutas únicas): ~140 (Dashboard ~110, pwaMenu ~22, pwaWaiter ~25)
- Huérfanos: ~75 | Rotas: 11 | Cross-leakage: 2

**Patrón general detectado**: un sub-sistema completo (Inventory + Suppliers + Purchase Orders + Cash Register + Floor Plan + Overrides + RAG) está implementado en backend SIN wrappers en frontend. Las páginas (`Inventory.tsx`, `Suppliers.tsx`, `CashRegister.tsx`, `FloorPlan.tsx`) existen como UI mockeada. Aproximadamente **45 endpoints huérfanos** son atribuibles a integración incompleta. La decisión es estratégica: o se completa el Sprint de integración o se elimina el zombie code para reducir superficie de mantenimiento.

Los 11 endpoints rotos son fáciles de arreglar pero bloquean features visibles (facturación, MP en pwaMenu, loyalty rules). El cross-leakage de pwaWaiter llamando `/admin/branches` es una violación clara de RBAC que generará 403s en cuanto el rol se aplique estrictamente.

### 7.2 Seguridad

**Resumen del agente 2:**

Estado por dominio CRITICO:

- **Auth**: 3 críticos (TOTP plaintext, refresh token en body, table token HMAC sin revocación) + JWT no revoca al cambiar roles. Email rate limiter sin case normalization. Backup codes faltantes en 2FA.
- **Billing**: idempotency keys faltantes en cash/manual pay. MP webhook signature OK (timing-safe). ContentTypeValidationMiddleware con path mal escrito que rompe el webhook.
- **Allergens**: RBAC correcto. Sin findings críticos.
- **Staff**: validación de Manager-no-asigna-ADMIN correcta. JWT revocation faltante en update_role/revoke_assignment.

**Áreas auditadas sin findings críticos** (positivo):
- MP webhook signature usa `hmac.compare_digest` timing-safe
- Token blacklist fail-closed confirmado
- Outbox commit atómico OK
- SQL injection: 0 f-strings con SQL crudo
- React XSS via `Diner.name`: escape automático
- `validate_production_secrets()` se llama en `lifespan.py:29` con fail-fast (problema es el matching exacto de "production")

### 7.3 Concurrencia (escenario 100 usuarios)

**Resumen del agente 3 con bloque completo "Mediciones predichas" intacto:**

**Bottlenecks predichos**:
1. DB pool sub-dimensionado en hosts pequeños (4 cores → 9 conn base + 15 overflow)
2. Redis `allkeys-lru` evicta token blacklist / outbox / rate-limit bajo presión de cache de menú
3. Outbox processor single-instance SPOF sin sweeper
4. `submit_round` serializa por sesión + N+1 stock check DENTRO de la transacción con `FOR UPDATE`

**¿Aguanta 100 usuarios?**: **Parcial**.
- Dev single-instance: se degrada (>15 `submit_round` simultáneos = `pool_timeout=30s`)
- Overlay prod (2 backends + 2 ws_gateway + nginx `ip_hash`): SÍ aguanta — siempre que se cambie política Redis y outbox sea dedicado

**Mediciones predichas** (base: 2 backends + 2 ws_gateway + nginx + PG + Redis 256MB):

- **Login p95**: 80-180ms. 100 simultáneos: ~250ms p99.
- **Submit round p95**: 150-350ms. p99 con 20 simultáneos: 500-800ms; con 30+ → `pool_timeout` (>2% 500 errors).
- **WS broadcast latency**: `send_to_session` 4 diners: 5-15ms. `send_to_branch` 100 conns: 40-80ms worker pool, 100-200ms legacy. End-to-end DB→cliente: 80-200ms.
- **Cart add latency**: 30-80ms.
- **Error rate al pico**: 0.5-2% si Redis evicta o MP lento. Con fixes: <0.2%.
- **Memoria ws_gateway por instancia**: ~56MB para 250 conns. OK.

**Orden recomendado**:
1. Redis `noeviction` o segmentar namespaces
2. Sweeper outbox `PROCESSING`
3. Stock-check sin N+1 fuera del lock
4. Verificar fan-out de eventos round a session (no a branch)

### 7.4 Patrones frontend

**Resumen del agente 4:**

Estado por frontend:

- **Dashboard**: bien en general (selectores estables, 39 páginas i18n, React 19 hooks). 12 stores con migrate sin type guards (A10). 1 destructuring directo (C15). 1 side effect en render (C17). Páginas legacy sin `useFormModal`/`useConfirmDialog` (B6).
- **pwaMenu**: i18n parcialmente roto (A11), `useOptimisticCart` correcto, memory leak en App.tsx (C16), hook con array nuevo cada render (M19), WebSocket subscribers solapados (A16). Viewport mobile correcto.
- **pwaWaiter**: RetryQueueStore presente, push notifications VAPID OK. Logout sin invalidar server-side (A15). Cross-leakage a admin endpoints (A1).

**Notas positivas**:
- 0 `as any` casts en los 3 frontends
- 0 `parseInt(value)` sin radix
- WebSocket: backoff exponencial con jitter en `shared/websocket-client.ts:357-363`
- Catchup tras reconexión presente en los 3 frontends
- `EMPTY_*` stable refs y `useShallow` bien usados en `pwaMenu/src/stores/tableStore/selectors.ts` y `Dashboard/src/stores/waiterAssignmentStore.ts`
- pwaWaiter: RetryQueueStore presente, push notifications VAPID OK
- pwaMenu: `useOptimisticCart.ts` con rollback OK; viewport correcto
- Async mount guard (`isMounted`) usado en 15 archivos

### 7.5 Deuda técnica

**Resumen del agente 5 con sección "Métricas" intacta:**

Estado general:

- 4 routers gordos (waiter 2378, billing 971, diner/orders 898, tables 721) ejecutando lógica de negocio que debería estar en domain services existentes (C8).
- AFIP stub sin gate (C1) — riesgo legal en producción.
- Secrets con defaults funcionales y validación que solo matchea `ENVIRONMENT=production` exacto (C9).
- Tests cero en módulos financieros (C18).
- CI no valida migrations roundtrip (C19).
- 164 `except Exception` swallowing en 49 archivos (C20).
- Response schemas dict vs Pydantic (A13).
- 6 entidades sin domain service (A12).

**Métricas**:

- **Routers usando CRUDFactory deprecated**: 0 de 30 (migración completa)
- **Domain services**: 27 confirmados (allergen, audit, billing, branch, cash, category, crm, customization, delivery, diner, fiscal, floor_plan, inventory, override, product, promotion, receipt, reservation, round, scheduling, sector, service_call, staff, subcategory, table, ticket, tip)
- **Entidades sin domain service**: recipe, ingredient/subingredient, exclusion, knowledge, feedback, cart
- **TODOs/FIXMEs backend**: 1 (dlq_processor S3)
- **Tests faltantes módulos críticos**: services/payments/*, services/permissions/*, outbox_processor, mp_webhook
- **Migrations**: 14/14 con downgrade(), 0/14 validadas en CI
- **Routers fat (>500 LoC)**: 8 (waiter 2378, billing 971, diner/orders 898, tables 721, diner/cart 591, public/catalog 619, auth 608, admin/inventory 545)
- **`except Exception` blocks**: 164 ocurrencias en 49 archivos

---

## 8. Plan de remediación priorizado

### Sprint 1 (urgente, semana 1) — desbloquear producción

Solo CRITICOS bloqueantes:

- **C1** — Gate de producción para AFIP stub (NotImplementedError si prod sin pyafipws)
- **C2** — Redis a `noeviction` o segmentación de namespaces
- **C3** — Cifrar TOTP secrets con AES-GCM + rotación gradual
- **C4** — Refresh token solo en cookie HttpOnly (remover del body)
- **C5** — Sweeper de outbox `PROCESSING` cada 60s
- **C9** — Validación de secrets en prefix `prod*`/`stag*` o variable explícita
- **C10, C11, C12, C13, C14** — Alinear las 11 rutas rotas frontend↔backend (1 día de trabajo total)

### Sprint 2 (semana 2-3) — seguridad y performance

ALTOS de seguridad + concurrencia:

- **A1** — pwaWaiter usar `/api/public/branches` (eliminar cross-leakage)
- **A3** — Normalizar email case en rate limiter
- **A4** — Revocar JWT al cambiar roles/branches
- **A5** — SSRF parseo IP/DNS robusto en `validate_image_url`
- **A6** — Corregir path del MP webhook en ContentTypeValidationMiddleware
- **A7** — Routing por scope: `send_to_session` para cart/round, `send_to_branch` solo cross-branch
- **A8** — Subir ThreadPoolExecutor del rate limiter a 8-12 workers
- **A9** — Circuit breaker en MercadoPagoGateway (timeout 8-10s)
- **C6** — Subir DB pool a 20/40 base/overflow
- **C7** — Stock check fuera del lock con pre-fetch JOIN

### Sprint 3 (semana 4) — refactor y deuda técnica

ALTOS de deuda + MEDIOS críticos:

- **C8** — Migrar lógica de routers fat a domain services (empezar por billing)
- **C15, C16, C17** — Fixes frontend (destructuring, clearTimeout, side effect en render)
- **C18** — Tests unitarios obligatorios en payment/billing/permissions
- **C19** — CI roundtrip de alembic
- **C20** — Eliminar try/except genéricos en routers; logging estructurado
- **A2** — Decisión estratégica sobre módulos Inventory/Suppliers/CashRegister/FloorPlan
- **A10** — Migrar 12 stores Dashboard al pattern de `staffStore`
- **A11** — Eliminar hardcoded Spanish en pwaMenu
- **A12** — Crear domain services para recipe/ingredient/cart
- **A13** — Pydantic schemas para todos los endpoints
- **A14** — Lint que prohíba `except Exception` sin re-raise en billing
- **A15** — pwaWaiter logout server-side
- **A16** — Limpiar WebSocket subscribers solapados
- **A17** — Documentar runbook de migration 013

### Backlog

BAJOS + MEDIOS no críticos:

- M1-M8 — Integrar o eliminar endpoints huérfanos según decisión de A2
- M9-M12 — Hardening de seguridad (idempotency, backup codes, CSP, cookie_secure validation)
- M13-M16 — Optimizaciones de concurrencia menores
- M17-M20 — Polish frontend
- M21-M24 — Deuda técnica menor
- B1-B6 — Hardening y nitpicks

---

## 9. Validación recomendada post-remediación

Después de aplicar las correcciones del Sprint 1-2, ejecutar:

1. **Load test empírico**: `k6 run devOps/loadtest/100-users.js` (script no existe aún — generar siguiendo escenario del agente 3)
2. **Métricas a validar**:
   - Login p95 < 200ms
   - Submit round p95 < 350ms con 20 simultáneos
   - WS broadcast latency < 80ms (100 conns)
   - Error rate < 0.5%
   - Sin evictions en Redis durante test
3. **Auditoría de regresión**: re-correr análisis de endpoints (huérfanos) tras integrar módulos Inventory/Suppliers
4. **Penetration test focal**: validar fixes de TOTP encryption, refresh token cookie-only, HMAC table token deprecation

---

## 10. Apéndice: archivos clave para remediación

Backend:

- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\rest_api\models\user.py` (C3)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\rest_api\routers\auth\routes.py` (C4, M10, B3)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\shared\security\auth.py` (C4, B1)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\shared\security\rate_limit.py` (A3, A8)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\shared\security\token_blacklist.py` (B1)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\shared\utils\validators.py` (A5)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\shared\config\settings.py` (C9, M12)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\shared\infrastructure\db.py` (C6)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\rest_api\services\domain\fiscal_service.py` (C1)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\rest_api\services\domain\inventory_service.py` (C7)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\rest_api\services\domain\staff_service.py` (A4)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\rest_api\services\events\outbox_processor.py` (C5)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\rest_api\services\payments\mercadopago_gateway.py` (A9)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\rest_api\routers\billing\routes.py` (C8, A6, A14, M9, M13)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\rest_api\routers\waiter\routes.py` (C8, C20, M7)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\rest_api\routers\diner\orders.py` (C8)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\rest_api\routers\admin\fiscal.py` (C10, C11)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\rest_api\routers\admin\crm.py` (C12)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\rest_api\routers\admin\inventory.py` (A2, M1)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\rest_api\routers\admin\cash_register.py` (M2)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\rest_api\routers\admin\floor_plan.py` (M3)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\rest_api\routers\public\catalog.py` (C14)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\rest_api\core\middlewares.py` (A6, M11)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\rest_api\core\cors.py` (B2)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\alembic\versions\013_add_void_fields_to_round_item.py` (A17)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\backend\shared\infrastructure\events\dlq_processor.py` (M23)

WebSocket Gateway:

- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\ws_gateway\core\connection\broadcaster.py` (A7)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\ws_gateway\components\core\constants.py` (B2)

Frontends (Dashboard):

- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\Dashboard\src\services\api.ts` (C10, C11, C12)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\Dashboard\src\components\tables\WaiterAssignmentModal.tsx` (C15)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\Dashboard\src\hooks\useAdminWebSocket.ts` (C17)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\Dashboard\src\stores\productStore.ts` (A10)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\Dashboard\src\stores\categoryStore.ts` (A10)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\Dashboard\src\stores\branchStore.ts` (A10)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\Dashboard\src\stores\allergenStore.ts` (A10)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\Dashboard\src\stores\subcategoryStore.ts` (A10)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\Dashboard\src\stores\promotionStore.ts` (A10)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\Dashboard\src\stores\tableStore.ts` (A10)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\Dashboard\src\stores\staffStore.ts` (referencia positiva A10)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\Dashboard\src\config\env.ts` (M18)

Frontends (pwaMenu):

- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\pwaMenu\src\App.tsx` (C16)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\pwaMenu\src\services\api.ts` (C14)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\pwaMenu\src\services\mercadoPago.ts` (C13)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\pwaMenu\src\components\AdvancedFiltersModal.tsx` (A11)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\pwaMenu\src\components\close-table\NoSessionView.tsx` (A11)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\pwaMenu\src\hooks\useOrderUpdates.ts` (A16)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\pwaMenu\src\hooks\useCustomerRecognition.ts` (M19)

Frontends (pwaWaiter):

- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\pwaWaiter\src\services\api.ts` (A1, A15)

DevOps:

- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\devOps\docker-compose.yml` (C2)
- `C:\fullMenu\restaurant-buen-sabor-main (1)\restaurant-buen-sabor-main\.github\workflows\ci.yml` (C19)

---

## 11. Apéndice: notas positivas (el sistema hizo bien)

El sistema tiene una base arquitectónica sólida y muchas decisiones correctas. Lo positivo encontrado:

**Backend / Seguridad**:
- Outbox pattern con commit atómico verificado en eventos financieros
- MP webhook signature con `hmac.compare_digest` timing-safe
- Token blacklist fail-closed (si Redis falla, asume token revocado)
- Manager NO puede asignar rol ADMIN — validado en `staff_service.py:469-473`
- 0 f-strings con SQL crudo (no SQL injection)
- `validate_production_secrets()` se llama con fail-fast en `lifespan.py:29`
- RBAC enforced en routers admin (no se encontró bypass)
- AFIP `_call_afip_wsfe()` al menos emite warning (problema: no es gate fuerte)

**Backend / Arquitectura**:
- CRUDFactory legacy migrado a 0 de 30 routers (migración limpia)
- 27 domain services bien estructurados con base `BranchScopedService[Model, Output]`
- Permission Strategy Pattern (`PermissionContext`) con métodos semánticos (`require_management()`)
- Cascade soft delete centralizado
- `safe_commit(db)` con rollback automático
- Migrations: 14/14 con `downgrade()` declarado

**WebSocket Gateway**:
- Composition over inheritance (`connection_manager.py` y `redis_subscriber.py` como orchestrators thin)
- Strategy pattern para auth (JWT vs Table Token)
- Sharded locks per branch para alta concurrencia
- Worker pool broadcast (10 workers paralelos)
- Redis Streams consumer para eventos críticos con DLQ

**Frontends**:
- 0 `as any` casts en los 3 frontends
- 0 `parseInt(value)` sin radix
- Backoff exponencial con jitter en WebSocket (`shared/websocket-client.ts:357-363`)
- Catchup tras reconexión presente en los 3 frontends
- `EMPTY_*` stable refs y `useShallow` correctamente usados en stores principales
- React 19 patterns: `useActionState`, `useOptimistic` con rollback (`pwaMenu/src/hooks/useOptimisticCart.ts`)
- React Compiler habilitado en los 3 frontends
- Async mount guard (`isMounted`) en 15 archivos
- pwaWaiter: RetryQueueStore para resilencia offline
- pwaWaiter: push notifications con VAPID
- pwaMenu: viewport mobile correcto (`overflow-x-hidden w-full max-w-full`)
- Dashboard: 39 páginas con i18n (es/en), 700+ keys, 100+ tests
- Logout infinite loop prevention documentado y aplicado
- Async hook mount guard pattern usado consistentemente

**Infraestructura**:
- Overlay productivo bien diseñado (2x backend, 2x ws_gateway, nginx LB, Redis Sentinel)
- WebSocket con `ip_hash` sticky sessions correcto
- Backup script con rotación (7 daily, 4 weekly)
- Backup + restore con health check verification
- Knowledge base v4 con 31 docs en 7 carpetas
- 57 design patterns documentados con file paths y evidencia (`UsadoPatrones.md`)
- E2E tests con Playwright para los 3 frontends
- OpenAPI codegen automatizado (`scripts/generate-types.sh`)

---

**Fin del reporte. Auditado por 5 agentes especialistas en paralelo. Coordinador: Claude Code Opus 4.7.**
