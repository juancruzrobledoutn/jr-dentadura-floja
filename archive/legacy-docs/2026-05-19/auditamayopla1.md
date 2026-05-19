# Plan de Ejecución — Remediación Auditoría Mayo 2026
**Origen:** `auditamayo12.md` (auditoría 2026-05-13)
**Fecha del plan:** 2026-05-13
**Modalidad:** plan de remediación priorizado por riesgo × esfuerzo con dependencias técnicas explícitas
**Autor del plan:** Claude Code Opus 4.7 (arquitecto senior)

---

## 1. Resumen ejecutivo

- **Total hallazgos a remediar:** 67 (20 CRITICO + 17 ALTO + 24 MEDIO + 6 BAJO)
- **Esfuerzo total estimado:** ~58-72 días-persona
- **Sprints recomendados:** 5 (Sprint 0 saneamiento + S1 seguridad + S2 concurrencia + S3 deuda crítica + S4 refactor estructural)
- **Tiempo total estimado** (1 dev full-time): ~12 semanas
- **Tiempo con 2 devs en paralelo** (1 backend + 1 frontend): ~7 semanas
- **Riesgo de NO remediar:** sin remediación, un deploy a producción es legalmente peligroso (AFIP stub emite facturas falsas), expone secrets 2FA en breach de DB (TOTP plaintext), permite hijack de sesión 7 días vía XSS (refresh en body), y el sistema cae bajo 20+ submits simultáneos (Redis evicta blacklist + outbox SPOF + N+1 dentro del lock). Adicionalmente, el frontend tiene 11 endpoints rotos visibles al usuario (MercadoPago, fiscal, loyalty) y un módulo entero (~45 endpoints de Inventory/Suppliers/CashRegister/FloorPlan) implementado en backend pero sin UI.

### Bloqueantes de producción (hay que arreglar SÍ o SÍ antes de deploy stage/prod)

1. **C1** — AFIP stub sin gate (riesgo legal/fiscal)
2. **C2** — Redis `noeviction` (sino blacklist/outbox/rate-limit se evictan bajo carga)
3. **C3** — TOTP secrets cifrados (breach de DB filtra 2FA)
4. **C4** — Refresh token cookie-only (XSS roba sesión 7d)
5. **C5** — Outbox sweeper (sin esto, eventos financieros se pierden si proceso muere)
6. **C9** — Validación de secrets en stage/prod (sino arranca con `dev-secret-change-me-in-production`)
7. **C13** — MercadoPago endpoint roto (pago en pwaMenu nunca arranca)

### Matriz riesgo × esfuerzo (asignación de sprints)

| | Esfuerzo S (≤1d) | Esfuerzo M (2-4d) | Esfuerzo L (5-10d) | Esfuerzo XL (10+d) |
|---|---|---|---|---|
| **Riesgo CRITICO** | Sprint 0 (C10-14, C15-17) | Sprint 1 (C1, C3, C4, C5, C9) | Sprint 2 (C2, C6, C7) — Sprint 3 (C18, C19, C20) | Sprint 4 (C8) |
| **Riesgo ALTO** | Sprint 0 (A1, A11, A15) | Sprint 2 (A6, A8, A9) — Sprint 3 (A3, A4, A5, A7, A10, A13, A16, A17) | Sprint 3 (A2, A12, A14) | — |
| **Riesgo MEDIO** | Sprint 0 (M18, M22) — Sprint 3 (M9-M12) | Backlog (M13-M21, M23, M24) | Backlog | Reconsiderar |
| **Riesgo BAJO** | Backlog continuo (B1-B6) | — | — | — |

---

## 2. Principios del plan

1. **Quick wins primero (Sprint 0):** endpoints rotos, cross-leakage, console.log y memory leaks son S/M con impacto inmediato y cero riesgo de regresión — se hacen en 3-5 días y desbloquean tanto desarrollo como pruebas de QA.
2. **Seguridad antes que performance (Sprint 1):** los 3 críticos de seguridad (TOTP plaintext, refresh en body, table token HMAC legacy) deben cerrarse antes de cualquier deploy a stage. Performance puede esperar a Sprint 2.
3. **Dependencias técnicas respetadas:** Redis `noeviction` antes que outbox sweeper (sino el sweeper también se evicta). Pool de DB antes que sacar stock check del lock (sino el fix de C7 enmascara el problema de C6). Tests antes que refactor de routers fat (sino el refactor de C8 rompe sin red de seguridad).
4. **Cada cambio CRITICO tiene rollback plan:** migrations reversibles, feature flags para cambios de contrato (refresh body, table token HMAC), métricas a observar post-deploy.
5. **Feature flags para cambios de contrato externos:** `LEGACY_REFRESH_BODY=true` con deprecation date para C4. `ALLOW_LEGACY_TABLE_TOKENS=true` con deprecation para table token HMAC. `AFIP_ENABLED=false` por default (gate de C1). `IS_PRODUCTION=true` explícito (gate de C9).
6. **Esfuerzo en días-persona, no calendario:** S=0.5-1d, M=2-4d, L=5-10d, XL=10+d (probablemente partir).
7. **Cada fix tiene criterio de aceptación cuantificable:** test específico, comportamiento observable, métrica que validar.

---

## 3. Sprint 0 — Saneamiento (quick wins, ~4-5 días)

**Objetivo:** desbloquear producción sin tocar arquitectura. Fixes triviales con alto impacto y cero riesgo de regresión.

**Por qué este sprint primero:** bugs visibles al usuario (endpoints rotos), config insegura, deuda trivial. Permite continuar desarrollando mientras se planifican cambios estructurales. Reduce significativamente la lista de incidentes abiertos antes de comenzar trabajos pesados.

---

### S0.1 — Alinear 11 endpoints rotos frontend ↔ backend

- **Origen:** auditamayo12.md C10, C11, C12, C13, C14
- **Archivos:**
  - `Dashboard/src/services/api.ts:2285` `/fiscal/invoices` → `/fiscal/invoice`
  - `Dashboard/src/services/api.ts:2298` `/fiscal/credit-notes` → `/fiscal/credit-note`
  - `Dashboard/src/services/api.ts:2317-2322` PUT `/fiscal/points/{id}` → PATCH
  - `Dashboard/src/services/api.ts:2579,2583,2590,2597` `/loyalty/rules` → `/loyalty-rules`
  - `pwaMenu/src/services/mercadoPago.ts:142` `/api/payments/preference` → `/api/billing/mercadopago/preference`
  - `pwaMenu/src/services/api.ts:432` eliminar `/menu/{slug}/categories` (no existe)
  - `pwaMenu/src/services/api.ts:436` `/items/{itemId}` → `/products/{product_id}`
  - `pwaMenu/src/services/api.ts:441,448` eliminar `/api/public/orders[/{id}]`
- **Esfuerzo:** S (1 día total para los 11)
- **Riesgo de regresión:** ninguno — endpoints actualmente rotos (404/405)
- **Dependencias:** ninguna
- **Steps técnicos:**
  1. Recorrer cada llamada, cambiar la ruta a la canónica del backend
  2. Eliminar wrappers muertos (`/api/public/orders`, `/menu/{slug}/categories`) y sus tipos en TypeScript
  3. Verificar que no haya referencias a las rutas viejas con grep
- **Criterio de aceptación:**
  - `POST /api/billing/mercadopago/preference` desde pwaMenu retorna 200 con `preference_id`
  - Editar punto de venta fiscal desde Dashboard funciona (PATCH 200)
  - CRUD de loyalty rules retorna 200 en GET/POST/PATCH/DELETE
- **Rollback:** revert del commit
- **Test:** integration test con mock backend + manual: scan QR → carrito → pagar (pwaMenu); editar punto de venta (Dashboard); CRUD loyalty rule

### S0.2 — Eliminar cross-leakage pwaWaiter → /admin/branches

- **Origen:** auditamayo12.md A1
- **Archivos:** `pwaWaiter/src/services/api.ts:713,720`
- **Esfuerzo:** S (0.5 día)
- **Riesgo de regresión:** ninguno — endpoint admin retornaría 403 a un WAITER
- **Dependencias:** ninguna
- **Steps técnicos:**
  1. Cambiar `/api/admin/branches/{id}` y `/api/admin/branches` por `/api/public/branches`
  2. Verificar que el shape de la respuesta sea compatible (ajustar mapeo si difiere)
- **Criterio de aceptación:** pwaWaiter pre-login muestra branches sin token JWT (vía endpoint público)
- **Rollback:** revert
- **Test:** abrir pwaWaiter en modo incógnito sin login, debe listar branches

### S0.3 — Eliminar hardcoded Spanish en pwaMenu (A11)

- **Origen:** auditamayo12.md A11
- **Archivos:** `pwaMenu/src/components/AdvancedFiltersModal.tsx` (líneas 123,154,179,201,220,266,290) y `pwaMenu/src/components/close-table/NoSessionView.tsx:24`
- **Esfuerzo:** S (1 día)
- **Riesgo de regresión:** ninguno
- **Dependencias:** ninguna
- **Steps técnicos:**
  1. Reemplazar `_t` alias roto por `t` y agregar las keys faltantes en `pwaMenu/src/i18n/locales/{es,en,pt}/`
  2. Sumar regla ESLint que detecte literales de string en JSX dentro de pwaMenu (`react/jsx-no-literals` con whitelist mínima)
- **Criterio de aceptación:** cambiar idioma del navegador a `en` muestra textos en inglés en AdvancedFiltersModal y NoSessionView
- **Rollback:** revert
- **Test:** unit test que verifica que todas las keys nuevas existen en los 3 idiomas; manual de cambio de idioma

### S0.4 — Memory leak: clearTimeout sobre setInterval (C16)

- **Origen:** auditamayo12.md C16
- **Archivos:** `pwaMenu/src/App.tsx:96-99`
- **Esfuerzo:** S (0.25 día)
- **Riesgo de regresión:** ninguno (fix de un bug obvio)
- **Dependencias:** ninguna
- **Steps técnicos:**
  1. Cambiar `clearTimeout(handleId)` por `clearInterval(handleId)` en la cleanup function del useEffect
- **Criterio de aceptación:** abrir DevTools → Performance → grabar 1 minuto con HMR → no debe acumular intervals huérfanos
- **Rollback:** revert
- **Test:** unit test (jest fake timers) que verifica que el interval se cancela en unmount

### S0.5 — Destructuring directo de store Zustand (C15)

- **Origen:** auditamayo12.md C15
- **Archivos:** `Dashboard/src/components/tables/WaiterAssignmentModal.tsx:52-61`
- **Esfuerzo:** S (0.5 día)
- **Riesgo de regresión:** bajo — el componente puede mostrar diferentes resultados si re-renderiza en momentos distintos, pero el patrón es el documentado en CLAUDE.md
- **Dependencias:** ninguna
- **Steps técnicos:**
  1. Crear selectores individuales: `const items = useStore(selectItems); const addItem = useStore((s) => s.addItem)`
  2. Si hay arrays filtrados, usar `useShallow`
  3. Verificar que el useEffect de la línea 78 no entre en loop
- **Criterio de aceptación:** abrir modal y asignar mozo no debe re-renderizar más de 2 veces (medible con React DevTools Profiler)
- **Rollback:** revert
- **Test:** Vitest con `@testing-library` contando re-renders

### S0.6 — Side effect (ref assignment) durante render (C17)

- **Origen:** auditamayo12.md C17
- **Archivos:** `Dashboard/src/hooks/useAdminWebSocket.ts:54-57`
- **Esfuerzo:** S (0.25 día)
- **Riesgo de regresión:** ninguno (fix de un patrón mal aplicado)
- **Dependencias:** ninguna
- **Steps técnicos:**
  1. Mover asignación `ref.current = value` dentro de un `useEffect(() => { ref.current = value })`
  2. Tomar de referencia el patrón correcto de `useTableWebSocket.ts:21-24`
- **Criterio de aceptación:** activar StrictMode + React Compiler, el hook no ejecuta el side effect 2 veces
- **Rollback:** revert
- **Test:** unit test que verifica que ref.current refleja el último value en re-renders

### S0.7 — pwaWaiter logout server-side (A15 + M17)

- **Origen:** auditamayo12.md A15 (overlap M17)
- **Archivos:** `pwaWaiter/src/services/api.ts:305-308`
- **Esfuerzo:** S (0.5 día)
- **Riesgo de regresión:** bajo — hay que aplicar el patrón `retry-on-401=false` documentado en CLAUDE.md
- **Dependencias:** ninguna
- **Steps técnicos:**
  1. Antes de limpiar localStorage, llamar `POST /api/auth/logout` con `credentials: 'include'`
  2. Pasar `false` como tercer arg de `fetchAPI` para deshabilitar retry-on-401
  3. Continuar con la limpieza local incluso si el call falla (logout debe ser idempotente)
- **Criterio de aceptación:** tras logout, intentar usar el refresh token devuelve 401 (token invalidado server-side)
- **Rollback:** revert
- **Test:** integration test: login → logout → intentar refresh → 401

### S0.8 — `console.*` directo en Dashboard env.ts (M18)

- **Origen:** auditamayo12.md M18
- **Archivos:** `Dashboard/src/config/env.ts:166-176`
- **Esfuerzo:** S (0.25 día)
- **Riesgo de regresión:** ninguno
- **Dependencias:** ninguna
- **Steps técnicos:**
  1. Importar `logger` de `utils/logger.ts` y reemplazar todos los `console.*` por `logger.info/warn/error`
- **Criterio de aceptación:** grep de `console\.` en `Dashboard/src/config/` retorna cero hits
- **Rollback:** revert
- **Test:** lint rule que prohíbe `console.*` en `src/` (excepto en `utils/logger.ts`)

### S0.9 — backend cli.py print() (M22)

- **Origen:** auditamayo12.md M22
- **Archivos:** `backend/cli.py:19`
- **Esfuerzo:** S (0.25 día)
- **Riesgo de regresión:** ninguno
- **Dependencias:** ninguna
- **Steps técnicos:**
  1. Reemplazar `print(...)` por `logger.info(...)` usando `shared.config.logging.get_logger`
- **Criterio de aceptación:** `python backend/cli.py --help` sigue funcionando; el output sale por logger formateado
- **Rollback:** revert
- **Test:** ejecución manual del CLI

### S0.10 — Quitar IP hardcodeada de CORS dev (B2)

- **Origen:** auditamayo12.md B2
- **Archivos:** `backend/rest_api/core/cors.py:27-32` y `ws_gateway/components/core/constants.py:318-322`
- **Esfuerzo:** S (0.5 día)
- **Riesgo de regresión:** bajo (solo afecta dev local en la red 192.168.1.x)
- **Dependencias:** ninguna
- **Steps técnicos:**
  1. Eliminar la entrada `192.168.1.106` de la lista de allowed origins
  2. Si se necesita dev en LAN, documentar en README la variable `ALLOWED_ORIGINS` para uso ad-hoc
- **Criterio de aceptación:** grep de `192.168` en backend/cors y ws_gateway retorna cero hits
- **Rollback:** revert
- **Test:** smoke test localhost en dev

### S0.11 — Documentar runbook de migration 013 (A17 + M21)

- **Origen:** auditamayo12.md A17 (overlap M21)
- **Archivos:** `backend/alembic/versions/013_add_void_fields_to_round_item.py` (header comment) + `devOps/RUNBOOK.md`
- **Esfuerzo:** S (0.5 día)
- **Riesgo de regresión:** ninguno (es documentación)
- **Dependencias:** ninguna
- **Steps técnicos:**
  1. Agregar header de comentario en la migration advirtiendo del lock exclusivo
  2. Documentar en RUNBOOK la opción 3-pasos: ADD COLUMN NULL → backfill async → SET NOT NULL
  3. Recomendar ventana de mantenimiento si la tabla `round_item` supera N filas
- **Criterio de aceptación:** runbook tiene sección "Migrations con lock exclusivo conocido" listando 013
- **Rollback:** revert
- **Test:** revisión manual

### S0.12 — WebSocket subscribers solapados en pwaMenu (A16 + M20)

- **Origen:** auditamayo12.md A16 (overlap M20)
- **Archivos:** `pwaMenu/src/hooks/useOrderUpdates.ts:192-201`
- **Esfuerzo:** S (1 día)
- **Riesgo de regresión:** medio — hay que decidir si conservar 9 subscribers específicos o el wildcard. Si se elige el wildcard hay que asegurarse que cada caso se maneje en el switch
- **Dependencias:** ninguna
- **Steps técnicos:**
  1. Auditar qué eventos quedan cubiertos por cada subscriber
  2. Elegir uno de los dos enfoques (recomendado: 9 subscribers específicos, más explícito)
  3. Eliminar el wildcard sobrante
- **Criterio de aceptación:** un mismo evento WS no debe disparar el handler más de una vez (medible con un contador en dev)
- **Rollback:** revert
- **Test:** integration test que envía un evento y verifica un solo dispatch

---

### Validación post-Sprint 0

- **Smoke test de los 11 endpoints corregidos:** golden run del Dashboard (fiscal + loyalty) + pwaMenu (MercadoPago) + pwaWaiter (branch selector)
- **Unit tests verdes** en los 3 frontends
- **Manual happy path:** scan QR → cart → checkout MP (pwaMenu); login mozo → ver mesas asignadas (pwaWaiter); login admin → editar producto + emitir factura (Dashboard)
- **Lint sin errores nuevos** (regla de `react/jsx-no-literals` en pwaMenu, regla de `no-console` en Dashboard)

**Esfuerzo total Sprint 0:** ~6 días-persona (caben holgadamente en 1 semana con 1 dev, o 2-3 días con 2 devs en paralelo).

---

## 4. Sprint 1 — Seguridad CRÍTICA (~10-12 días)

**Objetivo:** cerrar las 3+ vulnerabilidades CRITICAS de seguridad antes de cualquier deploy a stage/prod.

**Por qué este sprint segundo:** sin esto, un breach robaría 2FA secrets de toda la plantilla, sesiones de 7 días vía XSS, y permitiría refacturación con tokens legacy. Es la línea base ineludible antes de hablar de carga o de refactor.

---

### S1.1 — TOTP secrets encryption at rest (estrategia B: backfill + dual-read)
- **Origen:** auditamayo12.md C1
- **Decisión de estrategia:** opción B — backfill con encryption key + rotación gradual (NO se fuerza reset de 2FA a usuarios actuales). Tradeoff aceptado: secrets ya estuvieron en plain text en backups históricos → la protección es **prospectiva** (cubre breaches futuros de DB activa), no retroactiva.
- **Archivos:**
  - `backend/rest_api/models/user.py:40` — agregar columna `totp_secret_encrypted: Mapped[Optional[str]]`
  - `backend/shared/security/encryption.py` (NUEVO) — wrapper de Fernet
  - `backend/shared/config/settings.py` — agregar `totp_encryption_key: str` + validación en `validate_production_secrets()`
  - `backend/alembic/versions/015_add_totp_encrypted_column.py` (NUEVA migration) — ADD COLUMN nullable
  - `backend/scripts/backfill_totp_encryption.py` (NUEVO) — one-off backfill script
  - `backend/rest_api/routers/auth/routes.py:188-203, 464-608` — dual-read en login/setup/verify/disable
  - `backend/alembic/versions/016_drop_totp_secret_plain.py` (NUEVA, post-cutover) — DROP columna vieja
  - `Dashboard/src/pages/Settings.tsx` — warning opcional "rotá tu 2FA si tu cuenta es sensible"
- **Esfuerzo:** M (3-4 días — sin cambio respecto al plan original)
- **Riesgo de regresión:** MEDIO. Si la encryption key se rota mal o se pierde después del cutover, los usuarios pierden 2FA. Mitigado por backup codes (S1.4) en paralelo.
- **Dependencias:** ninguna técnica, pero **fuertemente recomendado paralelizar con S1.4 (backup codes)** para que usuarios bloqueados puedan auto-recuperarse.
- **Steps técnicos:**
  1. **Crear `shared/security/encryption.py`** con `cryptography.fernet.Fernet`:
     - `encrypt_totp_secret(plain: str) -> str` — devuelve token Fernet (b64)
     - `decrypt_totp_secret(encrypted: str) -> str` — devuelve secret plain (in-memory, jamás se loggea)
     - Inicializar Fernet con `settings.totp_encryption_key` (32 bytes b64, validar formato al startup)
  2. **Agregar a `settings.py`:**
     - `totp_encryption_key: str = Field(default="", description="32-byte base64 Fernet key")`
     - En `validate_production_secrets()`: si `environment in ("production", "staging", "prod")` y `totp_encryption_key == ""` → `errors.append("TOTP_ENCRYPTION_KEY must be set in production")`
     - Documentar generación: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
  3. **Migration 015** (`015_add_totp_encrypted_column.py`):
     - `op.add_column("users", sa.Column("totp_secret_encrypted", sa.Text(), nullable=True))`
     - NO tocar `totp_secret` existente todavía
  4. **Script de backfill** (`backend/scripts/backfill_totp_encryption.py`):
     - Conectar a DB con `SessionLocal`
     - `users = db.query(User).filter(User.totp_secret.isnot(None), User.totp_secret_encrypted.is_(None)).all()`
     - Por cada user: `user.totp_secret_encrypted = encrypt_totp_secret(user.totp_secret)`
     - Commit por batches de 100
     - Log: "Migrated N users to encrypted TOTP storage"
     - Ejecutar con: `python -m backend.scripts.backfill_totp_encryption`
  5. **Dual-read en código** (`routers/auth/routes.py`):
     - Helper `_get_totp_secret(user) -> str`:
       ```python
       if user.totp_secret_encrypted:
           return decrypt_totp_secret(user.totp_secret_encrypted)
       elif user.totp_secret:
           # Fallback: encripta y guarda al vuelo (lazy migration)
           user.totp_secret_encrypted = encrypt_totp_secret(user.totp_secret)
           db.commit()
           return user.totp_secret
       else:
           raise ValueError("No TOTP secret found for user")
       ```
     - Usar este helper en login 2FA, verify, disable
     - En setup (nuevo 2FA): escribir SOLO a `totp_secret_encrypted`, dejar `totp_secret = None`
  6. **Validar cutover:**
     - Query: `SELECT COUNT(*) FROM users WHERE totp_secret IS NOT NULL AND totp_secret_encrypted IS NULL`
     - Debe ser 0 antes de avanzar a paso 7
  7. **Migration 016** (`016_drop_totp_secret_plain.py`, ejecutar DESPUÉS de validar paso 6):
     - `op.drop_column("users", "totp_secret")`
     - Rename `totp_secret_encrypted` → `totp_secret` (opcional, mantiene el nombre canónico)
  8. **Warning opcional en Settings UI** (`Dashboard/src/pages/Settings.tsx`):
     - Banner discreto bajo la sección 2FA: "Tu 2FA fue migrado a almacenamiento cifrado el [fecha]. Si tu cuenta es sensible o sospechás que tu antiguo secret pudo haber sido expuesto, podés regenerarlo."
     - Botón "Regenerar 2FA" → flujo normal de disable + setup
- **Criterio de aceptación:**
  - `SELECT totp_secret_encrypted FROM users LIMIT 1` retorna string base64 Fernet (no texto legible)
  - `SELECT COUNT(*) FROM users WHERE totp_secret_encrypted IS NOT NULL` == count de usuarios con 2FA habilitado
  - Login con 2FA funciona para usuarios pre-migración (lazy migration via dual-read)
  - Login con 2FA funciona para usuarios nuevos (setup escribe directo a encrypted)
  - Si se borra `TOTP_ENCRYPTION_KEY` en prod, app NO arranca (fail-fast en `validate_production_secrets`)
  - Después de migration 016: query `SELECT totp_secret FROM users` falla con "column does not exist"
- **Rollback:**
  - **Antes de migration 016:** revertir código a leer solo `totp_secret` (la columna `totp_secret_encrypted` queda como datos huérfanos, eliminable después)
  - **Después de migration 016:** rollback no trivial. Si se necesita: restaurar dump pre-migration 016 + revertir código. Por eso migration 016 NO se ejecuta hasta validar paso 6.
  - **Si encryption key se pierde post-cutover:** todos los usuarios deben rehacer 2FA. Backup codes (S1.4) permiten login mientras tanto. Documentar en RUNBOOK.md.
- **Test:**
  - **Unit (`tests/test_encryption.py`):**
    - `encrypt → decrypt → original` (roundtrip)
    - `encrypt(same_input)` produce diferentes ciphertexts (Fernet usa IV random)
    - `decrypt` con key incorrecta lanza `InvalidToken`
  - **Integration (`tests/test_auth_2fa_encryption.py`):**
    - Setup 2FA → secret se guarda en `totp_secret_encrypted`, `totp_secret` queda NULL
    - User pre-migración con `totp_secret` no-null y `totp_secret_encrypted` null → primer login dispara lazy migration → columna encrypted se popula
    - Login con TOTP code correcto → success
    - Login con TOTP code incorrecto → 401
  - **Manual security verification:**
    - Dump DB → grep base32 patterns típicos de TOTP secrets → no hits
    - Verificar logs: secret plain JAMÁS aparece en stdout/stderr
- **Métricas post-deploy:**
  - Día 0 (post-migration 015 + backfill): `users with totp_secret_encrypted` == `users with totp_secret`
  - Día 7 (transición): `users with totp_secret NOT NULL AND totp_secret_encrypted NULL` == 0 (todos migrados)
  - Día 14: ejecutar migration 016
  - Alertar si: query de validación devuelve > 0 después de día 7 (algún usuario nunca hizo login → forzar refresh o seguir esperando)

### S1.2 — Refresh token cookie-only, eliminar del body (C4)

- **Origen:** auditamayo12.md C4
- **Archivos:** `backend/rest_api/routers/auth/routes.py:222, 367` + frontends consumiendo el body
- **Esfuerzo:** M (3 días, incluye coordinación con frontends)
- **Riesgo de regresión:** ALTO — frontends pueden estar leyendo el body del refresh response; hay que migrarlos primero
- **Dependencias:** ninguna técnica, pero coordinación cross-team (3 frontends + backend)
- **Steps técnicos:**
  1. Feature flag `LEGACY_REFRESH_BODY` (default `true` por 1 sprint, luego `false`) que decide si se incluye el campo `refresh_token` en el body
  2. Asegurar que el endpoint setea la cookie HttpOnly + `Secure` + `SameSite=Strict` + `Path=/api/auth/refresh`
  3. Auditar los 3 frontends: confirmar que usan `credentials: 'include'` y NO leen `data.refresh_token` del body. Eliminar todos los reads de `data.refresh_token`
  4. Cambiar `LEGACY_REFRESH_BODY` a `false` por default tras confirmar
  5. Documentar deprecation date (1 sprint) y eliminar el flag y el campo del body
- **Criterio de aceptación:**
  - Network tab del browser: response del login/refresh NO contiene `refresh_token` en el JSON body
  - Cookie `refresh_token` aparece con flags `HttpOnly; Secure; SameSite=Strict`
  - Refresh sigue funcionando sin tocar localStorage
- **Rollback:** poner `LEGACY_REFRESH_BODY=true` y deployar
- **Test:**
  - Integration: login → recibir cookie HttpOnly → llamar refresh sin pasar token explícito → success
  - Security: simular XSS con script que intenta leer cookies → no debe poder leer el refresh

### S1.3 — Deprecar formato HMAC legacy de table token (C —"table token HMAC sin revocación")

- **Origen:** auditamayo12.md Top 5 riesgo #3 (mencionado como uno de los 3 críticos de seguridad)
- **Archivos:** `backend/shared/security/auth.py` (verify), `backend/rest_api/routers/diner/*` (issuance)
- **Esfuerzo:** M (2-3 días)
- **Riesgo de regresión:** medio — tokens activos en cliente actual quedan inválidos si no hay backward compat
- **Dependencias:** ninguna
- **Steps técnicos:**
  1. Definir nuevo formato (recomendado: JWT con claim `revoked_at` + lista de revocación en Redis con TTL alineado al lifetime del token)
  2. Feature flag `ALLOW_LEGACY_TABLE_TOKENS=true` durante 1 sprint para backward compat
  3. Emitir tokens en formato nuevo; el verify acepta ambos formatos durante la transición
  4. Mecanismo de revocación: endpoint admin (`POST /api/admin/sessions/{id}/revoke-token`) que invalida el table token
  5. Tras deprecation date, cambiar flag a `false` y eliminar branch legacy
- **Criterio de aceptación:**
  - Nuevo table token verifica OK en handlers de diner
  - Endpoint de revocación funciona; el token revocado retorna 401
  - Listado de revocaciones en Redis no crece sin control (TTL respetado)
- **Rollback:** `ALLOW_LEGACY_TABLE_TOKENS=true`, revert código de revocación si rompe
- **Test:**
  - Integration: emitir token → usarlo (200) → revocar → usar de nuevo (401)
  - Performance: simular 100 verifies/s con revocaciones en cache, latencia < 5ms

### S1.4 — Backup codes para 2FA (M10, paralelo con S1.1)

- **Origen:** auditamayo12.md M10 (sube a Sprint 1 por dependencia con S1.1)
- **Archivos:** `backend/rest_api/routers/auth/routes.py:464-608` + nueva migration para columna `backup_codes_hashed: JSON`
- **Esfuerzo:** M (2 días)
- **Riesgo de regresión:** bajo — feature aditivo
- **Dependencias:** S1.1 (mejora la UX del nuevo flujo de TOTP encriptado)
- **Steps técnicos:**
  1. Generar 10 backup codes durante el setup de 2FA (formato `XXXX-XXXX`)
  2. Hashear con `bcrypt` o `argon2` y persistir en `User.backup_codes_hashed`
  3. Endpoint nuevo `POST /api/auth/2fa/use-backup-code` que verifica y consume un código (marca el slot como usado)
  4. Frontend (Dashboard): mostrar códigos UNA SOLA VEZ tras el setup, con botón de descarga
- **Criterio de aceptación:**
  - Login con TOTP roto + backup code válido → success
  - Cada backup code solo puede usarse una vez
  - Setup de 2FA muestra los 10 códigos antes de cerrar el modal
- **Rollback:** revert migration + revert frontend
- **Test:**
  - Integration: setup 2FA → guardar códigos → usar uno → segundo uso del mismo código → 401
  - UX: e2e Playwright que verifica que se muestran los 10 códigos

### S1.5 — Secrets default = None + validación amplia (C9)

- **Origen:** auditamayo12.md C9
- **Archivos:** `backend/shared/config/settings.py:22, 38, 119` + `backend/rest_api/lifespan.py:29`
- **Esfuerzo:** S (1 día)
- **Riesgo de regresión:** medio — si alguien arranca dev sin `.env`, ya no funciona (intencional)
- **Dependencias:** ninguna (pero ayudaría tener S1.1, S1.2 primero para no romper deploys mientras se prueba)
- **Steps técnicos:**
  1. Cambiar default de `jwt_secret`, `table_token_secret` etc. a `None`
  2. `validate_production_secrets()` se debe llamar también con prefix `prod*` / `stag*` o variable `IS_PRODUCTION=true` explícita
  3. Fail-fast: si `IS_PRODUCTION=true` y algún secret crítico es default-documented o None, raise en lifespan
  4. Documentar en README de backend que `.env` es obligatorio para `python -m uvicorn`
- **Criterio de aceptación:**
  - `ENVIRONMENT=staging` sin secrets reales → app no arranca con mensaje claro
  - `ENVIRONMENT=production` sin secrets reales → app no arranca
  - `ENVIRONMENT=dev` sin `.env` falla con mensaje claro pidiendo crear `.env` con `JWT_SECRET=dev-secret-change-me`
- **Rollback:** revertir defaults; pero NO se recomienda — la criticidad justifica la fricción de dev
- **Test:**
  - Unit: instanciar `Settings()` sin envs → ValidationError
  - CI: agregar job que verifica que el arranque en `ENVIRONMENT=production` sin secrets falla

---

### Validación post-Sprint 1

- **Penetration test focal:**
  - 2FA bypass via DB read: dump table `users`, intentar reconstruir secret → no debe ser posible
  - Refresh token theft simulation: XSS-like que intenta leer cookie y storage → no debe encontrar refresh
  - Table token replay: emitir, revocar, intentar usar → 401
- **Security headers scan** (Mozilla Observatory): score B+ mínimo
- **Audit log:** verificar que todos los password/2FA events queden registrados (no swallowing)
- **Fail-fast tests:** CI valida que arrancar con secrets default falla

**Esfuerzo total Sprint 1:** ~12 días-persona (~2.5 semanas con 1 dev, 1 semana con 2 devs).

---

## 5. Sprint 2 — Concurrencia y resiliencia (~10-12 días)

**Objetivo:** hacer al sistema capaz de soportar 100 usuarios concurrentes en overlay productivo sin degradación.

**Por qué este sprint tercero:** sin estos fixes, el sistema se cae a >15-20 submits simultáneos (pool agotado), Redis evicta blacklist/outbox (bypass de seguridad + eventos perdidos), y un MP lento cascadea a otros endpoints (conn DB ocupadas durante await).

---

### S2.1 — Redis `noeviction` y separación de namespaces (C2)

- **Origen:** auditamayo12.md C2
- **Archivos:** `devOps/docker-compose.yml:57` + prod 49-50, eventualmente split de instancia en `devOps/docker-compose.prod.yml`
- **Esfuerzo:** M (2 días)
- **Riesgo de regresión:** medio — si Redis se llena por bug de cache, ahora rechaza writes en vez de evictar (fail-fast). Se necesita monitoring previo
- **Dependencias:** **debe hacerse ANTES de S2.2 (outbox sweeper)**, sino el sweeper también se evicta
- **Steps técnicos:**
  1. Cambiar `maxmemory-policy allkeys-lru` → `noeviction` en docker-compose
  2. Subir `maxmemory` a 512MB en prod overlay
  3. Agregar alerta Prometheus `redis_evicted_keys_total > 0` y `redis_memory_used_bytes / maxmemory > 0.8`
  4. (Plan B opcional, semana 2): separar Redis en dos instancias — `redis-cache` (con LRU, 256MB) para menú/i18n y `redis-data` (noeviction, 256MB) para blacklist/outbox/rate-limit
  5. Documentar política en RUNBOOK
- **Criterio de aceptación:**
  - `INFO memory` de Redis muestra `maxmemory-policy:noeviction`
  - Bajo load test, `evicted_keys` se mantiene en 0
  - Si Redis se llena, los writes fallan con error explícito (visible en logs)
- **Rollback:** revertir `maxmemory-policy` a `allkeys-lru` y subir RAM
- **Test:**
  - Smoke: arranque del stack, `redis-cli INFO memory` muestra noeviction
  - Load test: 100 VUs durante 10 min, `evicted_keys=0`

### S2.2 — Outbox sweeper para eventos PROCESSING zombies (C5)

- **Origen:** auditamayo12.md C5
- **Archivos:** `backend/rest_api/services/events/outbox_processor.py:64-87, 102-160` + nuevo módulo `outbox_sweeper.py`
- **Esfuerzo:** M (2-3 días)
- **Riesgo de regresión:** medio — si el sweeper rescata un evento que en realidad sí se publicó pero no se actualizó el estado, se publica 2 veces (debe haber idempotency downstream)
- **Dependencias:** **S2.1 (sino el sweeper se evicta)**. Idempotency keys downstream también ayudan
- **Steps técnicos:**
  1. Crear task background `outbox_sweeper` que corre cada 60s
  2. Query: `SELECT * FROM outbox_events WHERE status='PROCESSING' AND updated_at < NOW() - INTERVAL '5 minutes'`
  3. Por cada uno: marcar como `PENDING` (reset) para retry por el processor estándar
  4. Métrica Prometheus: `outbox_zombies_recovered_total`
  5. (Stretch) considerar mover el processor a Redis Streams consumer groups con `XAUTOCLAIM`
- **Criterio de aceptación:**
  - Inyectar artificialmente un evento PROCESSING con `updated_at` viejo → sweeper lo rescata en < 90s
  - Bajo load test, no quedan eventos PROCESSING con `processed_at NULL` > 5 min
- **Rollback:** desactivar el background task (env `OUTBOX_SWEEPER_ENABLED=false`)
- **Test:**
  - Unit: test que setea un evento PROCESSING con `updated_at - 10min` y verifica que el sweeper lo resetea
  - Integration: simular crash entre commit y publish, validar recovery

### S2.3 — Stock check fuera del lock + pool DB sizing (C6 + C7)

- **Origen:** auditamayo12.md C6 + C7
- **Archivos:**
  - `backend/rest_api/services/domain/inventory_service.py:243-286` (stock check)
  - `backend/rest_api/services/domain/round_service.py` (submit_round flow)
  - `backend/shared/infrastructure/db.py:17-38` (pool sizing)
- **Esfuerzo:** L (4-5 días)
- **Riesgo de regresión:** medio-alto — cambio en el flow de submit_round; hay que mantener exactly-once semantic en el decremento
- **Dependencias:** **C7 depende implícitamente de C6** (sino el pool sigue saturable). Hacer juntos
- **Steps técnicos:**
  1. **Refactor del stock check:**
     - Pre-fetch fuera del lock: 1 query JOIN que trae `Recipe + Ingredient + StockItem` para todos los productos de la ronda
     - Validar en memoria sin lock
     - Si OK, tomar lock corto solo para el decremento atómico (`UPDATE stock_item SET qty = qty - X WHERE ... AND qty >= X RETURNING ...`)
     - Si la validación previa fue OK pero el UPDATE devuelve 0 filas (alguien me ganó la carrera), reintentar con backoff o fallar con error claro
  2. **Pool sizing:** subir `pool_size=20, max_overflow=40` para 100 users (en overlay con 2 backends, 80 total)
  3. **Métrica:** instrumentar lock duration con OpenTelemetry → objetivo p95 < 10ms (vs 80ms actual)
- **Criterio de aceptación:**
  - Lock duration p95 < 10ms
  - 30 submits simultáneos sin pool_timeout
  - Stock decrement sigue siendo atómico (no se vende lo que no hay)
- **Rollback:** revert; el lock vuelve a ser largo pero el sistema funciona
- **Test:**
  - Unit: race condition test (2 hilos compitiendo por el último item, exactly-once)
  - Load test k6: 30 VUs submitting rounds, error rate < 0.5%

### S2.4 — Routing por scope WebSocket: cart/round a sesión, no a branch (A7)

- **Origen:** auditamayo12.md A7
- **Archivos:** `ws_gateway/core/connection/broadcaster.py:296-381` + emisores de eventos en backend
- **Esfuerzo:** M (3 días)
- **Riesgo de regresión:** medio — hay que identificar exactamente qué eventos deben quedarse en `send_to_branch` (admin, ENTITY_*) y cuáles van a `send_to_session` (cart, round)
- **Dependencias:** ninguna técnica, pero ayuda haber hecho S2.1 (Redis estable)
- **Steps técnicos:**
  1. Crear tabla de routing: tipo de evento → scope (`session` | `branch` | `branch+session`)
  2. Cambiar emisores que actualmente usan `send_to_branch` para CART_*, ROUND_PENDING/CONFIRMED a `send_to_session(session_id)`
  3. Mantener `send_to_branch` para ROUND_SUBMITTED+ (donde admin/kitchen necesitan saber)
  4. Verificar que el catch-up endpoint también respete el scope
- **Criterio de aceptación:**
  - Diner del table A no recibe CART_ITEM_ADDED del table B
  - WS broadcast latency con 100 conns < 80ms (worker pool)
- **Rollback:** revert
- **Test:**
  - Integration: 2 sesiones distintas, agregar item en A, B no debe recibir
  - Load test: 100 diners en 25 sesiones, medir mensajes/s en cada conexión

### S2.5 — Circuit breaker MercadoPagoGateway + ThreadPoolExecutor rate limiter (A8 + A9)

- **Origen:** auditamayo12.md A8 + A9
- **Archivos:**
  - `backend/rest_api/services/payments/mercadopago_gateway.py:21,54`
  - `backend/shared/security/rate_limit.py:43,87`
- **Esfuerzo:** M (3 días)
- **Riesgo de regresión:** bajo — circuit breaker se puede iniciar en modo permisivo
- **Dependencias:** ninguna
- **Steps técnicos:**
  1. Agregar circuit breaker (lib `purgatory` o `pybreaker`) al `MercadoPagoGateway`:
     - 3 fallos consecutivos → abrir circuito por 30s
     - Fallback: devolver error 503 al cliente con sugerencia de pago manual
  2. Bajar timeout de `httpx.AsyncClient` a 8s (de 30s)
  3. Rate limit ThreadPool: subir a 8-12 workers (`max_workers=10` para hosts 4 cores)
- **Criterio de aceptación:**
  - Si MP responde >8s, request del usuario falla rápido con 503
  - Si MP falla 3 veces, las siguientes requests durante 30s se rechazan sin llamar a MP (circuit open)
  - Login bajo 100 simultáneos: p95 < 200ms (down de 250-500ms)
- **Rollback:** revert
- **Test:**
  - Unit: mockear MP timeout, validar que el circuit abre tras 3 fallos
  - Load test: 100 logins/s con jitter, p95 < 200ms

---

### Validación post-Sprint 2

- **Load test k6** (a generar en `devOps/loadtest/100-users.js`): 100 VUs durante 10 min, escenario realista (scan QR + cart + submit + payment + waiter ops). Métricas objetivo:
  - Login p95 < 200ms
  - Submit round p95 < 350ms con 20 simultáneos
  - WS broadcast latency < 80ms (100 conns)
  - Error rate < 0.5%
- **Redis monitoring:** `evicted_keys` debe estar en 0 durante todo el test
- **Outbox table:** 0 eventos PROCESSING con `processed_at NULL` > 60s
- **DB pool monitoring:** sin `pool_timeout` durante todo el test

**Esfuerzo total Sprint 2:** ~14 días-persona (~3 semanas con 1 dev, ~1.5 semanas con 2 devs).

---

## 6. Sprint 3 — Deuda crítica + seguridad alta + integraciones (~14-18 días)

**Objetivo:** cerrar deuda crítica que bloquea evolución (tests, AFIP gate, CI roundtrip), todos los ALTOS de seguridad restantes, y decidir el destino de los ~45 endpoints huérfanos.

---

### S3.1 — AFIP stub con gate de producción (C1)

- **Origen:** auditamayo12.md C1
- **Archivos:** `backend/rest_api/services/domain/fiscal_service.py:538-561` + `backend/shared/config/settings.py` (nueva env `AFIP_ENABLED`)
- **Esfuerzo:** S (1 día)
- **Riesgo de regresión:** ninguno si se mantiene `AFIP_ENABLED=false` por default
- **Dependencias:** S1.5 (validación amplia de secrets) — ya tendría `IS_PRODUCTION` cubierto
- **Steps técnicos:**
  1. Agregar env `AFIP_ENABLED: bool = False` con `AFIP_BACKEND: Literal["stub", "pyafipws"] = "stub"`
  2. `_call_afip_wsfe()` chequea: si `IS_PRODUCTION and not AFIP_ENABLED` → raise `NotImplementedError("AFIP no está implementado para producción")`
  3. Si `AFIP_ENABLED=true` y `AFIP_BACKEND=stub` → raise también (defensa en profundidad)
  4. Documentar en RUNBOOK que la facturación real requiere `pyafipws` + certificados AFIP + decisión de producto
- **Criterio de aceptación:**
  - `ENVIRONMENT=production` y `AFIP_ENABLED=false` → app no permite emitir factura, raise claro
  - `ENVIRONMENT=dev` → sigue funcionando con stub (warning visible)
- **Rollback:** `AFIP_ENABLED=true` (NO recomendado sin pyafipws real)
- **Test:**
  - Unit: con `IS_PRODUCTION=true`, llamar `_call_afip_wsfe` → NotImplementedError
  - Smoke: en dev, factura se emite con stub + warning en logs

### S3.2 — Tests críticos: payments, permissions, outbox processor (C18)

- **Origen:** auditamayo12.md C18
- **Archivos:** nuevos `backend/tests/test_payment_gateway.py`, `test_mercadopago_gateway.py`, `test_allocation.py`, `test_circuit_breaker.py`, `test_webhook_retry.py`, `test_permissions_*.py`, `test_outbox_processor.py`
- **Esfuerzo:** L (5-6 días)
- **Riesgo de regresión:** ninguno (aditivo)
- **Dependencias:** S2.5 (circuit breaker exists) para `test_circuit_breaker.py`. **Prerequisito para C8 (refactor de routers fat) en Sprint 4**
- **Steps técnicos:**
  1. `test_allocation.py`: FIFO allocation con varios escenarios (single charge, multiple charges, partial payment, refund)
  2. `test_payment_gateway.py`: abstract behavior testing del `PaymentGateway` ABC
  3. `test_mercadopago_gateway.py`: mockear httpx, validar timeouts, retries, circuit breaker
  4. `test_permissions_*.py`: cada strategy (Admin, Manager, Waiter, Kitchen) con casos positivos y negativos
  5. `test_outbox_processor.py`: lifecycle PENDING → PROCESSING → PROCESSED, recovery del sweeper
  6. Objetivo de cobertura: > 80% en `services/payments/*` y `services/permissions/*`
- **Criterio de aceptación:**
  - `pytest --cov=services/payments` > 80%
  - `pytest --cov=services/permissions` > 80%
  - Tests verdes en CI
- **Rollback:** no aplica
- **Test:** los tests mismos son la validación

### S3.3 — CI valida alembic upgrade/downgrade/upgrade (C19)

- **Origen:** auditamayo12.md C19
- **Archivos:** `.github/workflows/ci.yml` (nuevo job `alembic-roundtrip`)
- **Esfuerzo:** S (1 día)
- **Riesgo de regresión:** ninguno
- **Dependencias:** ninguna
- **Steps técnicos:**
  1. Nuevo job `alembic-roundtrip`:
     - levanta PostgreSQL ephemeral (services container)
     - `alembic upgrade head`
     - `alembic downgrade base`
     - `alembic upgrade head` de nuevo
     - falla si cualquier paso falla
  2. (Stretch) agregar seed básico entre upgrade y downgrade para validar que los datos sobreviven a la rollback (cuando aplique)
- **Criterio de aceptación:**
  - PR que rompe `downgrade()` de cualquier migration → CI rojo
  - PR limpia → CI verde
- **Rollback:** revertir cambio en CI
- **Test:** el job mismo

### S3.4 — Exception handling unificado en routers (C20)

- **Origen:** auditamayo12.md C20
- **Archivos:** `backend/rest_api/routers/waiter/routes.py:179-196`, `billing/routes.py:362-364, 506-507`, y 49 archivos con `except Exception` (~164 ocurrencias)
- **Esfuerzo:** L (4-5 días)
- **Riesgo de regresión:** medio — algunos try/except están ocultando bugs; al quitarlos pueden aparecer 500s
- **Dependencias:** S3.2 (tests para no romper sin red de seguridad)
- **Steps técnicos:**
  1. Verificar que `register_exception_handlers()` esté correctamente configurado en `core/exceptions.py`: `NotFoundError → 404`, `ForbiddenError → 403`, `ValidationError → 400`
  2. Recorrer los 49 archivos con `except Exception`:
     - En billing/audit: prohibir swallowing — `except Exception` solo con re-raise tras logging estructurado
     - En routers: eliminar try/except genéricos que reemiten como HTTPException (delegar al handler central)
     - Mantener `except Exception` SOLO donde haya cleanup explícito (e.g., cerrar sockets, rollback)
  3. Lint rule (ruff/pylint): regla custom que detecta `except Exception:\n.*pass` y `except Exception:\n.*logger.warning` sin re-raise en módulos billing/payments
- **Criterio de aceptación:**
  - `except Exception` con swallow: 0 en `routers/billing/*` y `routers/waiter/*`
  - Errores reales producen stack trace consistente vía exception handler central
  - Audit log: cualquier operación financiera que falle queda registrada con re-raise
- **Rollback:** revert por router individual si rompe algún flow
- **Test:**
  - Integration: forzar un `NotFoundError` desde service → verificar response 404 con shape esperado
  - Lint en CI

### S3.5 — A2: decisión estratégica sobre módulos backend huérfanos (Inventory, Suppliers, CashRegister, FloorPlan, Overrides, GDPR, RAG)

- **Origen:** auditamayo12.md A2 (overlap M1, M2, M3, M4, M5, M6)
- **Archivos:** `backend/rest_api/routers/admin/{inventory,cash_register,floor_plan,overrides,data_export}.py`, `content/rag.py`, `Dashboard/src/pages/{Inventory,Suppliers,CashRegister,FloorPlan}.tsx`
- **Esfuerzo:** XL (10+ días — partir en sub-tasks)
- **Riesgo de regresión:** medio — integración requiere UI completa, no parchecitos
- **Dependencias:** decisión estratégica de producto. Sin esa decisión NO empezar
- **Steps técnicos (modo "integrar"):**
  1. **Decisión de producto**: ¿integrar todo, parcial, o eliminar? Owner: PM/Architect
  2. Si integrar: priorizar por valor (recomendado: Inventory + Suppliers primero por dependencia con stock-check del C7)
  3. Para cada módulo:
     - Generar tipos TypeScript con `scripts/generate-types.sh` tras alinear los schemas (depende de A13)
     - Wirear hooks en stores (`useInventoryStore`, `useSuppliersStore`, etc.)
     - Reemplazar mocks en `Inventory.tsx`, `Suppliers.tsx`, `CashRegister.tsx`, `FloorPlan.tsx`
     - Tests E2E con Playwright
  4. GDPR (`admin/data_export.py`) — integrar botones de export/anonymize en CRM page (más simple, 1 día)
- **Steps técnicos (modo "eliminar"):**
  1. Eliminar routers + services + tests asociados
  2. Eliminar páginas mockeadas o convertirlas en "Coming soon"
- **Criterio de aceptación:**
  - Páginas frontend muestran data real (no mockeada) para todos los módulos integrados
  - O bien: zero zombie code en backend
- **Rollback:** revert por módulo
- **Test:** E2E por cada módulo integrado

### S3.6 — Bundle de ALTOS de seguridad (A3, A4, A5, A6)

- **Origen:** auditamayo12.md A3 + A4 + A5 + A6
- **Archivos:**
  - `backend/shared/security/rate_limit.py:104` (A3)
  - `backend/rest_api/services/domain/staff_service.py:306-318` y `backend/rest_api/routers/admin/assignments.py` (A4)
  - `backend/shared/utils/validators.py:100-103` (A5)
  - `backend/rest_api/core/middlewares.py:80` (A6)
- **Esfuerzo:** M (3 días, todos juntos)
- **Riesgo de regresión:** bajo (cada uno es self-contained)
- **Dependencias:** ninguna
- **Steps técnicos:**
  - **A3** — normalizar email: `email.strip().lower()` antes del hash. Test: 3 variantes case → mismo bucket
  - **A4** — `revoke_all_user_tokens(user_id)` tras `update_role`, `revoke_assignment`, `assign_branch`. Test: cambiar rol → access token viejo retorna 403
  - **A5** — SSRF: reescribir `validate_image_url`:
    - `urlparse` para extraer host
    - `socket.gethostbyname_ex` para resolver DNS
    - Validar contra RFC1918 (`10/8`, `172.16/12`, `192.168/16`), `169.254/16`, `100.64/10`, `127/8`, IPv6 `::1`, `fc00::/7`
    - Considerar `validators` lib o `pydantic.HttpUrl` custom validator
  - **A6** — corregir path: `EXEMPT_PATHS = {"/api/billing/mercadopago/webhook"}` (era `/api/billing/webhook`). Test de integración con webhook mock que envía `application/x-www-form-urlencoded`
- **Criterio de aceptación:**
  - A3: brute-force con 3 variantes case bloqueado después de 5 intentos totales
  - A4: cambio de rol → re-login requerido (token viejo 401)
  - A5: URL con `169.254.169.254`, `metadata.aws.com` (DNS rebinding), `localhost:8500` → rechazada
  - A6: webhook MP llega al handler con `application/x-www-form-urlencoded`
- **Rollback:** revert por hallazgo
- **Test:** unit + integration para cada uno

### S3.7 — Stores Dashboard con type guards (A10 + B4)

- **Origen:** auditamayo12.md A10 (overlap B4)
- **Archivos:** 12 stores Dashboard listados en A10 (productStore, categoryStore, branchStore, allergenStore, subcategoryStore, promotionStore, tableStore, promotionTypeStore, sealStore, badgeStore, restaurantStore, orderHistoryStore)
- **Esfuerzo:** M (3-4 días)
- **Riesgo de regresión:** bajo si se aplica el pattern de `staffStore.ts:271` (validar con type guard, retornar defaults si schema cambió)
- **Dependencias:** ninguna
- **Steps técnicos:**
  1. Tomar `staffStore.ts:271` como template
  2. Para cada store:
     - Tipar `persistedState: unknown`
     - Type guard que valida estructura mínima
     - Si invalid: retornar defaults seguros (incrementar `STORE_VERSIONS`)
  3. Documentar la convención en `Dashboard/CLAUDE.md` si no está ya
- **Criterio de aceptación:**
  - `localStorage.setItem('products', '{"corrupt":1}')` → app arranca sin crash, store en defaults
  - `tsc --noEmit` sin `any` en migrate functions
- **Rollback:** revert por store
- **Test:** unit por store con localStorage corrupto

### S3.8 — Bundle de ALTOS de deuda backend (A12 + A13 + A14 + A17)

- **Origen:** auditamayo12.md A12 + A13 + A14 + A17
- **Archivos:**
  - `backend/rest_api/services/domain/{recipe,ingredient,cart}_service.py` (NUEVOS para A12)
  - 10+ endpoints retornando `dict[str, Any]` para A13
  - 49 archivos con `except Exception` swallowing para A14 (overlap con C20, ya cubierto en S3.4 — A14 solo agrega lint rule específica de billing)
  - `backend/alembic/versions/013_*` (ya cubierto en S0.11 — A17 ya hecho)
- **Esfuerzo:** L (5-6 días)
- **Riesgo de regresión:** bajo-medio (refactor incremental)
- **Dependencias:** S3.4 (exception handling unificado)
- **Steps técnicos:**
  - **A12** — Crear `RecipeService`, `IngredientService`, `CartService` siguiendo `BranchScopedService[Model, Output]`. Migrar `routers/diner/cart.py` (591 LoC) a usar `CartService`
  - **A13** — Definir Pydantic output schemas para todos los `dict[str, Any]` returns. Habilitar `response_model_exclude_none=True`. Regenerar tipos en frontends con `scripts/generate-types.sh`
  - **A14** — Lint rule (`ruff` o custom): prohibir `except Exception:\n.*logger.warning` sin re-raise en `routers/billing/*` y `services/payments/*`
- **Criterio de aceptación:**
  - 3 nuevos services con cobertura > 70%
  - 0 endpoints con `dict[str, Any]` return en billing/admin/waiter
  - OpenAPI codegen produce tipos válidos (no `Record<string, unknown>`)
  - CI lint bloquea swallowing en billing
- **Rollback:** revert por hallazgo
- **Test:** unit + tipo de regression

---

### Validación post-Sprint 3

- **Tests coverage:** > 80% en `services/payments/*`, `services/permissions/*`, `services/outbox*`. > 70% global en backend
- **OpenAPI codegen:** `scripts/generate-types.sh` produce tipos sin `any` ni `Record<string, unknown>` en frontends
- **CI roundtrip:** PR de migration de prueba (que rompe downgrade) → CI rojo
- **Páginas frontend con data real:** Inventory, Suppliers, CashRegister, FloorPlan dejan de mostrar mocks (según decisión A2)
- **AFIP gate:** intentar emitir factura en `IS_PRODUCTION=true` sin pyafipws → falla con error claro

**Esfuerzo total Sprint 3:** ~22 días-persona (~4-5 semanas con 1 dev, ~2.5 semanas con 2 devs). **Nota:** si la decisión de A2 es "eliminar", baja a ~14 días.

---

## 7. Sprint 4 — Refactor estructural (~10-15 días)

**Objetivo:** salud arquitectónica de largo plazo. Routers thin, integraciones cerradas, hardening final.

---

### S4.1 — Refactor fat routers a domain services (C8)

- **Origen:** auditamayo12.md C8
- **Archivos:**
  - `backend/rest_api/routers/waiter/routes.py` (2378 LoC) → mover lógica a `WaiterService`, `RoundService`
  - `backend/rest_api/routers/billing/routes.py` (971 LoC) → mover a `BillingService`
  - `backend/rest_api/routers/diner/orders.py` (898 LoC) → mover a `RoundService`, `OrderService`
  - `backend/rest_api/routers/tables/routes.py` (721 LoC) → mover a `TableService`
- **Esfuerzo:** XL (10-12 días — partir en 4 sub-tasks por router)
- **Riesgo de regresión:** ALTO — refactor masivo de código en producción
- **Dependencias:** **S3.2 (tests críticos) es prerequisite obligatorio**. Sin tests, el refactor es ciego
- **Steps técnicos:**
  1. **Orden recomendado** (más crítico primero): billing → waiter → diner/orders → tables
  2. Para cada router:
     - Identificar lógica de negocio (stock validation, pricing, FIFO allocation, batch creation, etc.)
     - Crear método en el domain service correspondiente
     - Router se convierte en thin controller (parse request → llamar service → return response). Target: < 300 LoC por router
  3. Eliminar duplicación entre router y service
  4. Tests de regresión por endpoint
- **Criterio de aceptación:**
  - `routers/waiter/routes.py` < 800 LoC
  - `routers/billing/routes.py` < 500 LoC
  - `routers/diner/orders.py` < 500 LoC
  - Tests de regresión verdes
- **Rollback:** revert por router individual (no big bang)
- **Test:** suite completa de integration tests para cada flow

### S4.2 — Pydantic schemas globales (continuación de A13 si no se cerró)

- **Origen:** auditamayo12.md A13
- **Archivos:** todos los endpoints que devuelven `dict[str, Any]`
- **Esfuerzo:** M (3 días)
- **Riesgo de regresión:** bajo
- **Dependencias:** S3.8 (parte de A13 ya hecha)
- **Steps técnicos:** completar cualquier endpoint pendiente; regenerar tipos en frontends
- **Criterio de aceptación:** 0 endpoints con dict response
- **Test:** OpenAPI codegen valida tipos

### S4.3 — Hardening MEDIOS de seguridad (M9, M10, M11, M12)

- **Origen:** auditamayo12.md M9, M10, M11, M12
- **Archivos:**
  - `backend/rest_api/routers/billing/routes.py:205-378` (M9)
  - `backend/rest_api/routers/auth/routes.py:464-608` (M10 — ya hecho en S1.4 si se siguió este plan)
  - `backend/rest_api/core/middlewares.py:50` (M11)
  - `backend/shared/config/settings.py:33` (M12)
- **Esfuerzo:** M (3 días)
- **Riesgo de regresión:** bajo
- **Dependencias:** ninguna
- **Steps técnicos:**
  - **M9** — Idempotency keys: agregar header `Idempotency-Key: UUID` en `/billing/cash/pay` y `/payments/manual`. Almacenar key + hash(request) en Redis con TTL 24h. Si misma key llega de nuevo, devolver response cacheada
  - **M11** — Migrar styles de `'unsafe-inline'` a nonces o hashes. Auditar tailwind config y CSS-in-JS para asegurar compatibilidad
  - **M12** — `validate_production_secrets()` chequea que `cookie_secure=True` en stage/prod
- **Criterio de aceptación:**
  - M9: doble POST con misma `Idempotency-Key` → un solo cobro
  - M11: CSP scan no flagea `'unsafe-inline'`
  - M12: arranque con `cookie_secure=False` y `IS_PRODUCTION=true` → fail-fast
- **Rollback:** revert
- **Test:** integration para cada uno

### S4.4 — DLQ archival a S3/MinIO (M23)

- **Origen:** auditamayo12.md M23
- **Archivos:** `backend/shared/infrastructure/events/dlq_processor.py:177`
- **Esfuerzo:** M (2-3 días)
- **Riesgo de regresión:** ninguno (feature aditiva)
- **Dependencias:** ninguna técnica; requiere bucket S3/MinIO configurado
- **Steps técnicos:**
  1. Implementar archival: mensajes que llegan al DLQ se persisten en S3/MinIO con path `dlq/{year}/{month}/{day}/{event_id}.json`
  2. TTL 90 días (lifecycle policy en S3)
  3. Métrica Prometheus: `dlq_archived_total`
- **Criterio de aceptación:** mensaje en DLQ termina como objeto en bucket S3 dentro de 60s
- **Rollback:** desactivar archival (env flag), DLQ vuelve a comportamiento actual
- **Test:** integration con MinIO en docker-compose de tests

### S4.5 — pwaMenu polish (M14, M15, M19)

- **Origen:** auditamayo12.md M14, M15, M19
- **Archivos:**
  - `pwaMenu/vite.config.ts` (M14 — Service Worker caching)
  - `ws_gateway/components/...` (M15 — heartbeat tolerance)
  - `pwaMenu/src/hooks/useCustomerRecognition.ts:175` (M19)
- **Esfuerzo:** M (2-3 días)
- **Riesgo de regresión:** bajo
- **Dependencias:** ninguna
- **Steps técnicos:**
  - **M14** — Agregar jitter en TTL del menú: `5min ± 1min` random en lugar de fijo
  - **M15** — Tolerancia heartbeat: pings cada 30s con tolerancia de 90s (3 misses) antes de cerrar
  - **M19** — Definir `EMPTY_ARRAY` const fuera del hook, devolver siempre la misma referencia
- **Criterio de aceptación:**
  - Cache stampede simulado: 100 diners invalidan menú → distribución temporal de revalidations, no spike
  - WS connection en LTE inestable: hasta 90s de gap sin disconnect
  - `useCustomerRecognition` no causa re-renders extra
- **Test:** load test + unit

### S4.6 — Frontend deps audit + Dashboard hooks refactor (M24 + B6)

- **Origen:** auditamayo12.md M24 + B6
- **Archivos:** `.github/workflows/ci.yml` + `Dashboard/src/pages/{Products,Promotions,Tables,Staff}.tsx`
- **Esfuerzo:** M (3 días)
- **Riesgo de regresión:** bajo
- **Dependencias:** ninguna
- **Steps técnicos:**
  - **M24** — Agregar `npm audit --audit-level=moderate` en CI para los 3 frontends
  - **B6** — Migrar las 4 páginas a `useFormModal` + `useConfirmDialog` (documentado en Dashboard/CLAUDE.md)
- **Criterio de aceptación:**
  - CI rojo si hay CVEs moderate+ en frontends
  - 4 páginas usan los hooks compartidos
- **Test:** lint + unit

### S4.7 — Hardening BAJO (B1, B3, B5)

- **Origen:** auditamayo12.md B1, B3, B5
- **Archivos:** `backend/shared/security/auth.py:231,241`, `token_blacklist.py:58,65,69`, `auth/routes.py:195,548,594`, `pwaMenu/src/components/SubcategoryGrid.tsx:92`
- **Esfuerzo:** S (1-2 días)
- **Riesgo de regresión:** ninguno
- **Dependencias:** ninguna
- **Steps técnicos:**
  - **B1** — Unificar hashing del jti a SHA-256 en todos los puntos (o todos a blake2b)
  - **B3** — TOTP: trackear último counter usado por usuario, rechazar replay dentro de la ventana ±30s
  - **B5** — Imagen clickeable: `alt` descriptivo (nombre subcategoría)
- **Criterio de aceptación:**
  - Hashing consistente
  - Replay de TOTP code en ventana → segundo uso falla
  - Accessibility scan (axe) sin warnings de alt vacío
- **Test:** unit + a11y scan

---

### Validación post-Sprint 4

- **LoC routers fat:** waiter < 800, billing < 500, diner/orders < 500
- **CSP scan:** sin `'unsafe-inline'` en style-src
- **DLQ:** mensajes archivados en S3/MinIO
- **CI:** `npm audit` rojo bloquea PR si hay CVE moderate+
- **a11y:** axe scan en pwaMenu sin warnings críticos

**Esfuerzo total Sprint 4:** ~18 días-persona (~4 semanas con 1 dev, ~2 semanas con 2 devs).

---

## 8. Backlog continuo (a metabolizar)

| ID  | Título                                                     | Esfuerzo | Cuándo                                       |
|-----|------------------------------------------------------------|----------|----------------------------------------------|
| M7  | waiter routes transfer/discount/move-to sin consumer       | M        | Junto con decisión A2 (Sprint 3)             |
| M8  | kitchen tickets endpoints sin consumer                     | M        | Junto con decisión A2 (Sprint 3)             |
| M13 | `with_for_update` sin nowait en `record_cash_payment`      | S        | Sprint 4 si tiempo lo permite                |
| M16 | Logging stdout sync en hot path                            | M        | Backlog (no crítico bajo carga actual)       |
| B1  | Inconsistencia hashing jti                                 | S        | Sprint 4 (S4.7)                              |
| B2  | CORS dev con IP hardcodeada                                | S        | Sprint 0 (S0.10) ya cubierto                 |
| B3  | TOTP replay ±30s                                           | S        | Sprint 4 (S4.7)                              |
| B4  | Tipos `any` en migrate de Zustand stores                   | S        | Cubierto en A10 (S3.7)                       |
| B5  | `alt=""` en imagen clickeable pwaMenu                      | S        | Sprint 4 (S4.7)                              |
| B6  | Páginas Dashboard sin useFormModal/useConfirmDialog        | M        | Sprint 4 (S4.6)                              |

---

## 9. Resumen de esfuerzo total

| Sprint  | Duración estimada (1 dev) | Fixes incluidos | Riesgo principal mitigado                                |
|---------|---------------------------|-----------------|----------------------------------------------------------|
| 0       | 4-6 días                  | 12              | UX rota, endpoints quebrados, deuda trivial              |
| 1       | 10-12 días                | 5 (3 críticos + backup codes + secrets) | Breach de seguridad (TOTP, refresh, table token) |
| 2       | 10-12 días                | 5               | Caída bajo carga (Redis evict, outbox SPOF, N+1)         |
| 3       | 14-18 días                | 7+              | Tests cero, AFIP no gated, CI sin roundtrip, módulos huérfanos |
| 4       | 10-15 días                | 7+              | Deuda estructural, fat routers, hardening               |
| **TOTAL** | **~48-63 días-persona** (sin A2 módulos) | **~36-40** | |

Con A2 modo "integrar todos los módulos huérfanos" suma ~10 días más.

**Calendar estimates:**
- 1 dev full-time: ~10-12 semanas
- 2 devs (1 backend + 1 frontend): ~6-7 semanas
- 3 devs (2 backend + 1 frontend): ~5 semanas

---

## 10. Plan de validación global

### 10.1 Smoke tests post-cada-sprint

- **Endpoint smoke:** golden run de los endpoints corregidos en cada sprint
- **E2E happy paths:** Playwright suite contra cada frontend (scan QR → cart → checkout; login waiter → submit round; login admin → CRUD productos)
- **Health checks:** `GET /health` en backend y `GET /ws/health` en ws_gateway

### 10.2 Load test empírico (k6) — gate antes de prod

- Script: `devOps/loadtest/100-users.js` (a generar en Sprint 2)
- Escenario: 100 VUs durante 10 min — mezcla de roles (60 diners, 25 waiters, 10 admins, 5 kitchen)
- Métricas objetivo (post-Sprint 2):
  - Login p95 < 200ms
  - Submit round p95 < 350ms
  - WS broadcast latency < 80ms (100 conns)
  - Error rate < 0.5%
  - Redis `evicted_keys` = 0
  - Outbox PROCESSING > 5min = 0

### 10.3 Security scan recurrente

- **Mozilla Observatory** post-Sprint 1: score B+ mínimo
- **OWASP ZAP** baseline scan en CI semanalmente
- **`npm audit --audit-level=moderate`** en CI (M24)
- **Penetration test focal** tras Sprint 1: 2FA bypass, refresh theft, table token replay

### 10.4 Métricas de éxito (KPIs)

- Error rate prod < 0.5%
- p95 login < 200ms
- p95 submit_round < 350ms
- 0 events outbox PROCESSING > 60s
- 0 evicted_keys Redis prod
- Tests coverage > 70% en módulos CRITICO (payments, permissions, outbox)
- 0 endpoints rotos frontend ↔ backend
- 0 hardcoded strings en pwaMenu fuera de `t()`

---

## 11. Riesgos del propio plan (meta-riesgos)

1. **Decisión de A2 dilatada:** si el dueño de producto no decide rápido si integrar o eliminar los ~45 endpoints huérfanos, Sprint 3 se atasca. Mitigación: timebox de decisión a la primera semana del Sprint 3.
2. **Refactor de routers fat (C8) sin tests previos:** si se intenta hacer C8 antes que C18 (tests), el refactor es ciego y puede regresionar billing. Mitigación: este plan lo prioriza explícitamente (S3.2 antes que S4.1).
3. **Cambio de secrets defaults (C9/S1.5) rompe envs de desarrollo:** todos los devs van a necesitar actualizar sus `.env` locales. Mitigación: comunicación temprana + script `setup_dev_env.sh` que genera `.env` con dummy values.
4. **Refresh token cookie-only (C4/S1.2) cross-team:** depende de que los 3 frontends migren a `credentials: 'include'`. Mitigación: feature flag `LEGACY_REFRESH_BODY=true` con deprecation date documentada.
5. **AFIP gate (C1/S3.1) sin claridad de timeline real para pyafipws:** si el producto necesita facturación electrónica real para Q3, hay que arrancar la integración pyafipws en paralelo a este plan. No bloquea el gate pero sí bloquea el deploy a prod con facturación real.

---

## 12. Apéndice A: Matriz completa hallazgo → fix → fase

| Hallazgo | Título                                                            | Sprint | Esfuerzo | Owner sugerido         |
|----------|-------------------------------------------------------------------|--------|----------|------------------------|
| C1       | AFIP stub sin gate de producción                                  | S3.1   | S        | backend + product      |
| C2       | Redis `allkeys-lru` evicta claves críticas                        | S2.1   | M        | devops + backend       |
| C3       | TOTP secret en texto plano                                        | S1.1   | M        | backend + security     |
| C4       | Refresh token devuelto en body                                    | S1.2   | M        | backend + 3 frontends  |
| C5       | Outbox processor sin recovery de PROCESSING                       | S2.2   | M        | backend                |
| C6       | DB pool saturable                                                 | S2.3   | (junto con C7) | backend          |
| C7       | N+1 stock check dentro del lock                                   | S2.3   | L        | backend                |
| C8       | Fat routers con lógica de negocio                                 | S4.1   | XL       | backend                |
| C9       | Secrets defaults + validación estrecha                            | S1.5   | S        | backend + security     |
| C10      | Llamadas rotas fiscal invoice/s                                   | S0.1   | S        | frontend Dashboard     |
| C11      | Fiscal points PUT vs PATCH                                        | S0.1   | S        | frontend Dashboard     |
| C12      | Loyalty rules guion vs slash                                      | S0.1   | S        | frontend Dashboard     |
| C13      | MercadoPago preference endpoint inexistente                       | S0.1   | S        | frontend pwaMenu       |
| C14      | pwaMenu menu/categories y orders inexistentes                     | S0.1   | S        | frontend pwaMenu       |
| C15      | Destructuring directo de Zustand                                  | S0.5   | S        | frontend Dashboard     |
| C16      | clearTimeout sobre setInterval                                    | S0.4   | S        | frontend pwaMenu       |
| C17      | Side effect (ref) durante render                                  | S0.6   | S        | frontend Dashboard     |
| C18      | Tests cero en payments/permissions                                | S3.2   | L        | backend + QA           |
| C19      | CI no valida alembic upgrade/downgrade                            | S3.3   | S        | devops                 |
| C20      | Exception handling híbrido + swallowing                           | S3.4   | L        | backend                |
| A1       | pwaWaiter cross-leakage a /admin/branches                         | S0.2   | S        | frontend pwaWaiter     |
| A2       | ~45 endpoints huérfanos (Inventory, etc.)                         | S3.5   | XL       | backend + frontend + product |
| A3       | Email rate limiter sin case normalization                         | S3.6   | S        | backend                |
| A4       | JWT no revoca al cambiar roles/branches                           | S3.6   | M        | backend                |
| A5       | SSRF `validate_image_url`                                         | S3.6   | M        | backend                |
| A6       | MP webhook path incorrecto en ContentTypeValidation               | S3.6   | S        | backend                |
| A7       | WS fan-out cart/round a branch en vez de session                  | S2.4   | M        | backend + ws_gateway   |
| A8       | ThreadPoolExecutor de 2 workers para 100 logins                   | S2.5   | S        | backend                |
| A9       | MP gateway sin circuit breaker                                    | S2.5   | M        | backend                |
| A10      | 12 stores Dashboard sin type guards                               | S3.7   | M        | frontend Dashboard     |
| A11      | Hardcoded Spanish en pwaMenu                                      | S0.3   | S        | frontend pwaMenu       |
| A12      | Entidades sin domain service (recipe, ingredient, cart)           | S3.8   | L        | backend                |
| A13      | Response schemas dict vs Pydantic                                 | S3.8 + S4.2 | L  | backend                |
| A14      | `except Exception` swallowing financiero                          | S3.4 + S3.8 | M  | backend                |
| A15      | pwaWaiter logout sin server-side                                  | S0.7   | S        | frontend pwaWaiter     |
| A16      | WebSocket subscribers solapados en pwaMenu                        | S0.12  | S        | frontend pwaMenu       |
| A17      | Migration 013 ADD COLUMN NOT NULL sin nota                        | S0.11  | S        | devops + backend       |
| M1       | admin/inventory.py endpoints huérfanos                            | S3.5 (con A2) | (parte de A2) | backend + frontend |
| M2       | admin/cash_register.py endpoints huérfanos                        | S3.5 (con A2) | (parte de A2) | backend + frontend |
| M3       | admin/floor_plan.py endpoints huérfanos                           | S3.5 (con A2) | (parte de A2) | backend + frontend |
| M4       | admin/overrides.py endpoints huérfanos                            | S3.5 (con A2) | (parte de A2) | backend + frontend |
| M5       | admin/data_export.py GDPR endpoints sin caller                    | S3.5 (con A2) | S        | backend + frontend     |
| M6       | content/rag.py sin consumer                                       | S3.5 (con A2) | (parte de A2) | backend            |
| M7       | waiter routes transfer/discount/move-to sin consumer              | Backlog (Sprint 3 si A2 = integrar) | M | frontend pwaWaiter |
| M8       | kitchen tickets endpoints sin consumer                            | Backlog (Sprint 3 si A2 = integrar) | M | frontend kitchen |
| M9       | Sin idempotency en /billing/cash/pay                              | S4.3   | M        | backend                |
| M10      | Sin backup codes para 2FA                                         | S1.4   | M        | backend                |
| M11      | CSP `'unsafe-inline'` para style-src                              | S4.3   | M        | backend                |
| M12      | `cookie_secure default=False` sin validación prod                 | S4.3   | S        | backend + security     |
| M13      | `with_for_update` sin nowait en `record_cash_payment`             | Backlog | S       | backend                |
| M14      | Service Worker cache stampede                                     | S4.5   | S        | frontend pwaMenu       |
| M15      | Heartbeat WS sin tolerancia LTE                                   | S4.5   | M        | ws_gateway             |
| M16      | Logging stdout sync en hot path                                   | Backlog | M       | backend                |
| M17      | pwaWaiter logout no invalida server-side                          | S0.7 (overlap A15) | S | frontend pwaWaiter |
| M18      | console.* directo en Dashboard env.ts                             | S0.8   | S        | frontend Dashboard     |
| M19      | useCustomerRecognition: array nuevo cada render                   | S4.5   | S        | frontend pwaMenu       |
| M20      | useOrderUpdates subscribers solapados                             | S0.12 (overlap A16) | S | frontend pwaMenu |
| M21      | Migration 013 sin nota runbook                                    | S0.11 (overlap A17) | S | devops             |
| M22      | print() en backend/cli.py                                         | S0.9   | S        | backend                |
| M23      | DLQ S3 archival no implementado                                   | S4.4   | M        | backend                |
| M24      | Sin `npm audit` en CI                                             | S4.6   | S        | devops + frontend      |
| B1       | Inconsistencia hashing jti                                        | S4.7   | S        | backend                |
| B2       | CORS dev con IP hardcodeada                                       | S0.10  | S        | backend + ws_gateway   |
| B3       | TOTP replay ±30s sin tracking counter                             | S4.7   | S        | backend                |
| B4       | Tipos `any` en migrate Zustand                                    | S3.7 (overlap A10) | S | frontend Dashboard |
| B5       | `alt=""` en imagen clickeable pwaMenu                             | S4.7   | S        | frontend pwaMenu       |
| B6       | Páginas Dashboard sin useFormModal/useConfirmDialog               | S4.6   | M        | frontend Dashboard     |

**Total hallazgos cubiertos:** 67 / 67 ✔️

---

## 13. Apéndice B: Decisiones clave del plan

1. **Sprint 0 como "saneamiento" antes que seguridad:** se eligió correr los quick wins (endpoints rotos, console.log, memory leaks) en un sprint de 4-5 días antes de tocar TOTP/refresh. ¿Por qué? Porque desbloquean QA y dev de forma inmediata, no requieren coordinación cross-team, y reducen el ruido cognitivo al empezar trabajo serio. No hay razón técnica para postergarlos.

2. **Tests (C18) ANTES de refactor de fat routers (C8):** se priorizó S3.2 sobre S4.1 explícitamente. Refactorear billing/waiter sin tests es financialmente irresponsable. La auditoría lo flagga implícitamente al notar que ambos están en CRITICO y que billing maneja dinero real.

3. **Redis `noeviction` (C2) antes que outbox sweeper (C5):** dependencia técnica directa. Si el sweeper se evicta, no rescata nada. Se documentó como bloqueante explícito en S2.2.

4. **Feature flags para cambios de contrato:** `LEGACY_REFRESH_BODY`, `ALLOW_LEGACY_TABLE_TOKENS`, `AFIP_ENABLED`, `IS_PRODUCTION`. Permiten deploys progresivos sin coordinación absoluta entre backend y frontends. Cada flag tiene deprecation date documentada.

5. **A2 (módulos huérfanos) requiere decisión de producto antes de empezar:** se marcó como timebox de 1 semana al inicio del Sprint 3. Sin esa decisión, no se planifica el sub-sprint correspondiente. Esto evita gastar 10+ días-persona en algo que después se elimina.

6. **Mergeé hallazgos overlapping:** A15 + M17 (logout server-side), A16 + M20 (subscribers solapados), A17 + M21 (runbook migration 013), A10 + B4 (type guards stores), C20 + A14 (exception handling). Se hicieron como tasks únicas para evitar duplicar trabajo.

7. **Backlog explícito para BAJOS y MEDIOS no críticos:** B1-B6 y M13/M16 quedan documentados pero no se programan en sprints — se metabolizan en iteraciones normales o en Sprint 4 si hay capacity. Esto evita scope creep en los sprints críticos.

---

**Plan generado por: Claude Code Opus 4.7 — análisis basado en auditamayo12.md (673 líneas, 67 hallazgos).**
