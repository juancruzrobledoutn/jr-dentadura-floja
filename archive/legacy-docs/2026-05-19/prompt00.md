# Prompts Profesionales para Historias de Usuario — Buen Sabor

**Proyecto:** Sistema de Gestión de Restaurantes Multi-Sucursal
**Fecha:** 11 de marzo de 2026
**Metodología:** Prompt Engineering Profesional (Rol + Contexto + Tarea + Formato + Restricciones + Validación)

---

## Metodología de Construcción de Prompts

Cada prompt sigue la estructura **RCTFRV**:

1. **Rol (R):** Define la expertise específica del agente IA
2. **Contexto (C):** Provee información técnica y arquitectónica relevante extraída de la documentación del proyecto
3. **Tarea (T):** Especifica exactamente qué debe implementar
4. **Formato (F):** Define la estructura esperada del output
5. **Restricciones (X):** Establece límites, patrones obligatorios y anti-patrones
6. **Validación (V):** Criterios verificables de completitud

---

## Índice de Prompts

- E01: Infraestructura y DevOps (HU-0101 a HU-0104)
- E02: Autenticación y Seguridad (HU-0201 a HU-0208)
- E03: Gestión de Tenants y Sucursales (HU-0301 a HU-0303)
- E04: Gestión de Staff (HU-0401 a HU-0404)
- E05: Estructura del Menú (HU-0501 a HU-0505)
- E06: Alérgenos y Perfiles Alimentarios (HU-0601 a HU-0603)
- E07: Gestión de Mesas y Sectores (HU-0701 a HU-0703)
- E08: Sesión de Mesa y Comensales (HU-0801 a HU-0803)
- E09: Menú Digital pwaMenu (HU-0901 a HU-0904)
- E10: Carrito Compartido y Pedidos (HU-1001 a HU-1005)
- E11: Ciclo de Vida de Rondas (HU-1101 a HU-1108)
- E12: Operaciones del Mozo (HU-1201 a HU-1208)
- E13: Cocina (HU-1301 a HU-1303)
- E14: Facturación y Pagos (HU-1401 a HU-1406)
- E15: WebSocket Gateway (HU-1501 a HU-1508)
- E16: Promociones (HU-1601 a HU-1602)
- E17: Recetas e Ingredientes (HU-1701 a HU-1702)
- E18: Fidelización de Clientes (HU-1801 a HU-1803)
- E19: Reportes y Analíticas (HU-1901 a HU-1903)
- E20: PWA y Experiencia Offline (HU-2001 a HU-2005)

---

## E01 — Infraestructura y DevOps

---

### PROMPT HU-0101 — Configuración de Base de Datos PostgreSQL

**ROL:**
Actúa como un ingeniero de bases de datos senior especializado en PostgreSQL, SQLAlchemy 2.0 y arquitecturas multi-tenant para sistemas de restaurantes de alta concurrencia.

**CONTEXTO:**
Estás trabajando en el proyecto "Buen Sabor", un sistema de gestión de restaurantes multi-sucursal con la siguiente pila tecnológica:
- Backend: FastAPI 0.115 + SQLAlchemy 2.0 + PostgreSQL (puerto 5432)
- El sistema maneja 52+ modelos de datos organizados en un esquema relacional que incluye: Tenant, Branch, User, UserBranchRole (M:N), Category, Subcategory, Product, BranchProduct (precios por sucursal en centavos), Table, BranchSector, TableSession, Diner, Round, RoundItem, KitchenTicket, KitchenTicketItem, Check (tabla `app_check`), Charge, Allocation, Payment, ServiceCall, WaiterSectorAssignment, Customer, ProductAllergen, Promotion, IngredientGroup, Ingredient, SubIngredient, CookingMethod, FlavorProfile, TextureProfile, CuisineType, OutboxEvent.
- El modelo de datos sigue arquitectura multi-tenant donde cada entidad principal tiene campo `tenant_id`.
- Todas las entidades soportan soft delete con campos `is_active`, `deleted_at`, `deleted_by`.
- Auditoría automática: `created_by`, `updated_by`, `created_at`, `updated_at`.
- Las relaciones clave son: Tenant → Branch (1:N), Branch → Category (1:N) → Subcategory (1:N) → Product (1:N), Branch → BranchSector (1:N) → Table (1:N), Table → TableSession → Diner (1:N), TableSession → Round → RoundItem, Round → KitchenTicket → KitchenTicketItem, TableSession → Check → Charge/Payment, Product ↔ ProductAllergen (M:N), User ↔ UserBranchRole (M:N).
- Los precios se almacenan como enteros en centavos (ej: $125.50 = 12550).
- La tabla Check usa `__tablename__ = "app_check"` para evitar conflicto con palabra reservada SQL.

**TAREA:**
Implementa la configuración completa de la base de datos PostgreSQL incluyendo:
1. Todos los modelos SQLAlchemy con relaciones, índices y cascadas apropiadas.
2. Script de migración inicial con Alembic.
3. Script de seed con datos de demostración (tenant demo, sucursales, usuarios de prueba, categorías, productos, mesas, sectores).
4. Índices optimizados para queries frecuentes (tenant_id, branch_id, is_active, session_id).

**FORMATO DE SALIDA:**
- Archivos Python en `backend/rest_api/models/` con un archivo por dominio.
- Archivo `backend/alembic/versions/001_initial.py` con la migración.
- Archivo `backend/scripts/seed.py` con datos demo.
- Cada modelo debe incluir docstring breve en inglés.

**RESTRICCIONES:**
- Usar BigInteger para todos los IDs.
- Usar `sqlalchemy.orm.Mapped` y `mapped_column` (estilo SQLAlchemy 2.0).
- Booleanos comparar con `.is_(True)`, nunca `== True`.
- Precios siempre como Integer en centavos.
- Palabras reservadas SQL como nombres de tabla deben prefijarse con `app_`.
- No usar CRUDFactory (deprecated). Preparar para Domain Services.
- Incluir `selectinload` y `joinedload` para relaciones que se cargan frecuentemente.
- Soft delete: `is_active = True` por defecto, cascada lógica a entidades dependientes.

**VALIDACIÓN:**
- [ ] Todas las 52+ tablas están definidas con relaciones correctas.
- [ ] Los índices cubren: `(tenant_id,)`, `(branch_id,)`, `(tenant_id, is_active)`, `(session_id,)`.
- [ ] El seed crea al menos: 1 tenant, 2 branches, 5 usuarios (admin, manager, waiter, kitchen, waiter2), 3 categorías con subcategorías y productos, 2 sectores con mesas.
- [ ] Las migraciones se ejecutan sin errores contra una BD limpia.
- [ ] Los foreign keys tienen cascadas apropiadas (ON DELETE para relaciones fuertes).
- [ ] Usuarios de prueba: `admin@demo.com`/`admin123`, `waiter@demo.com`/`waiter123`, `kitchen@demo.com`/`kitchen123`, `ana@demo.com`/`ana123`, `alberto.cortez@demo.com`/`waiter123`.

---

### PROMPT HU-0102 — Configuración de Redis

**ROL:**
Actúa como un ingeniero de infraestructura senior especializado en Redis, sistemas pub/sub y arquitecturas event-driven para aplicaciones de alta concurrencia.

**CONTEXTO:**
El sistema "Buen Sabor" utiliza Redis como sistema nervioso central para:
- **Pub/Sub en tiempo real:** 7 patrones de canales — `branch:{id}:waiters`, `branch:{id}:kitchen`, `branch:{id}:admin`, `sector:{id}:waiters`, `session:{id}`, `user:{id}`, `tenant:{id}:admin`.
- **Redis Streams:** Cola `events:critical` con consumer group `ws_gateway_group` para entrega at-least-once de eventos financieros (CHECK_REQUESTED, PAYMENT_APPROVED/REJECTED, CHECK_PAID, ROUND_SUBMITTED, ROUND_READY, SERVICE_CALL_CREATED).
- **Token blacklist:** Claves `auth:blacklist:{jti}` con TTL del tiempo restante del token. Política fail-closed (si Redis no disponible, asumir blacklisted).
- **Revocación por usuario:** Claves `auth:revoke:{user_id}` con timestamp.
- **Rate limiting:** Scripts Lua atómicos para limitar login (5/min por email), billing (5-20/min según endpoint).
- **Caché de sectores:** Clave `(user_id, tenant_id)`, TTL 60s, máximo 1000 entradas con LRU.
- **Pool asíncrono:** 50 conexiones máx, timeout 5s, health check 30s, singleton con double-checked locking.
- **Pool síncrono:** 20 conexiones para rate limiting y blacklist.
- Redis corre en puerto 6380 (no el default 6379).

**TAREA:**
Implementa la configuración completa de Redis incluyendo:
1. Pool de conexiones asíncronas como singleton en `shared/infrastructure/events.py`.
2. Pool de conexiones síncronas para operaciones bloqueantes.
3. Funciones de publicación de eventos con validación de tamaño (máx 64KB), serialización JSON compacta y circuit breaker (5 fallos → open, 30s timeout, 3 test calls para close).
4. Scripts Lua para rate limiting atómico.
5. Funciones de blacklist de tokens JWT.
6. Configuración de Redis Streams con consumer group.

**FORMATO DE SALIDA:**
- `shared/infrastructure/events.py` — pools, publicación, circuit breaker.
- `shared/infrastructure/redis_streams.py` — consumer group y procesamiento.
- `shared/security/token_blacklist.py` — blacklist y revocación.
- `shared/security/rate_limiter.py` — rate limiting con Lua scripts.

**RESTRICCIONES:**
- Pool asíncrono: usar `redis.asyncio`, nunca cerrar manualmente (singleton).
- Pool síncrono: usar `redis.Redis` con threading locks.
- Circuit breaker: estados CLOSED/OPEN/HALF_OPEN con contadores thread-safe.
- Serialización: manejar datetime como ISO format, usar `separators=(',', ':')` para compactar.
- Rate limiting: Lua script debe hacer INCR+EXPIRE atómicamente para evitar race condition de TTL perdido.
- No usar Redis puerto default; configurar via `settings.redis_url`.
- Fail-closed en blacklist: si Redis cae, denegar acceso.

**VALIDACIÓN:**
- [ ] Pool asíncrono es singleton (múltiples llamadas retornan misma instancia).
- [ ] Pool síncrono está separado del asíncrono.
- [ ] Publicación valida tamaño < 64KB antes de enviar.
- [ ] Circuit breaker cambia a OPEN tras 5 fallos consecutivos.
- [ ] Script Lua de rate limiting es atómico (INCR+EXPIRE en una operación).
- [ ] Blacklist soporta pipeline para verificar múltiples tokens en un round-trip.
- [ ] Consumer group se crea automáticamente si no existe.

---

### PROMPT HU-0103 — Docker Compose para Desarrollo

**ROL:**
Actúa como un ingeniero DevOps especializado en containerización con Docker Compose para entornos de desarrollo de aplicaciones web full-stack.

**CONTEXTO:**
El monorepo "Buen Sabor" tiene 5 componentes que necesitan orquestación:
- **backend (REST API):** FastAPI en puerto 8000, requiere PostgreSQL y Redis.
- **ws_gateway:** FastAPI WebSocket en puerto 8001, requiere Redis y `PYTHONPATH=backend`.
- **PostgreSQL:** Puerto 5432, requiere volumen persistente.
- **Redis:** Puerto 6380 (no default), requiere persistencia.
- **pgAdmin:** Puerto 5050 para administración de BD.
- Los tres frontends (Dashboard:5177, pwaMenu:5176, pwaWaiter:5178) corren fuera de Docker con `npm run dev`.

**TAREA:**
Crea el archivo `devOps/docker-compose.yml` que levante todos los servicios backend con un solo comando `docker compose up -d --build`.

**FORMATO DE SALIDA:**
- `devOps/docker-compose.yml`
- `devOps/Dockerfile.backend` (multi-stage si aplica)
- `devOps/Dockerfile.ws_gateway`
- `.env.example` en `devOps/`

**RESTRICCIONES:**
- Redis en puerto 6380, no 6379.
- Hot reload funcional para backend y ws_gateway (mount de código fuente).
- Volúmenes nombrados para persistencia de PostgreSQL.
- Health checks en PostgreSQL y Redis antes de arrancar servicios dependientes.
- Variables de entorno configurables via `.env`.
- No exponer puertos innecesarios al host.

**VALIDACIÓN:**
- [ ] `docker compose up -d --build` levanta todos los servicios sin errores.
- [ ] Backend responde en `http://localhost:8000/docs`.
- [ ] WS Gateway acepta conexiones en `ws://localhost:8001`.
- [ ] PostgreSQL acepta conexiones en puerto 5432.
- [ ] Redis acepta conexiones en puerto 6380.
- [ ] pgAdmin accesible en puerto 5050.
- [ ] Cambios en código backend se reflejan automáticamente (hot reload).

---

### PROMPT HU-0104 — Configuración de Entornos (.env)

**ROL:**
Actúa como un ingeniero de configuración especializado en gestión segura de variables de entorno para aplicaciones distribuidas.

**CONTEXTO:**
El proyecto tiene 4 componentes que requieren configuración independiente:
- **backend:** JWT_SECRET, TABLE_TOKEN_SECRET, DATABASE_URL, REDIS_URL, ALLOWED_ORIGINS, DEBUG, ENVIRONMENT, COOKIE_SECURE.
- **Dashboard (puerto 5177):** VITE_API_URL, VITE_WS_URL.
- **pwaMenu (puerto 5176):** VITE_API_URL, VITE_WS_URL, VITE_BRANCH_SLUG, VITE_MP_PUBLIC_KEY.
- **pwaWaiter (puerto 5178):** VITE_API_URL, VITE_WS_URL.
- Valores por defecto para desarrollo local: API en localhost:8000, WS en localhost:8001, Redis en localhost:6380, PostgreSQL en localhost:5432.
- Producción requiere: JWT_SECRET y TABLE_TOKEN_SECRET de 32+ caracteres, COOKIE_SECURE=true, DEBUG=false.

**TAREA:**
Crea archivos `.env.example` para cada componente con documentación inline y valores por defecto seguros para desarrollo.

**FORMATO DE SALIDA:**
- `backend/.env.example`
- `Dashboard/.env.example`
- `pwaMenu/.env.example`
- `pwaWaiter/.env.example`

**RESTRICCIONES:**
- Nunca incluir valores reales de secretos.
- Comentarios explicativos para cada variable.
- Marcar variables obligatorias en producción con `# REQUIRED IN PRODUCTION`.
- Valores por defecto funcionales para desarrollo local sin modificaciones.

**VALIDACIÓN:**
- [ ] Cada componente tiene su `.env.example`.
- [ ] Copiar `.env.example` a `.env` sin cambios permite arrancar en modo desarrollo.
- [ ] Variables sensibles tienen placeholder, no valores reales.
- [ ] Documentación inline explica formato y propósito de cada variable.

---

## E02 — Autenticación y Seguridad

---

### PROMPT HU-0201 — Login con JWT

**ROL:**
Actúa como un ingeniero de seguridad senior especializado en autenticación JWT, FastAPI y protección de APIs REST.

**CONTEXTO:**
El sistema "Buen Sabor" usa autenticación JWT con las siguientes especificaciones:
- Access token: 15 minutos de validez, contiene `sub` (user_id como string), `tenant_id`, `branch_ids` (lista), `roles` (lista), `email`, `jti` (UUID único para revocación).
- Refresh token: 7 días, almacenado en cookie HttpOnly con flag Secure en producción.
- Contraseñas hasheadas con bcrypt.
- Modelo User vinculado a roles por sucursal via UserBranchRole (M:N).
- Roles: ADMIN, MANAGER, KITCHEN, WAITER (definidos en `shared/config/constants.py` como `Roles`).
- El endpoint `POST /api/auth/login` acepta `{email, password}` y retorna access token en body + refresh token en cookie.
- Credenciales inválidas retornan 401 con mensaje genérico (no revelar si email existe).
- Logging: email enmascarado en logs (primeros 3 + últimos 3 caracteres).
- Rate limiting: 5 intentos/minuto por email (via Lua script en Redis).
- Imports canónicos: `from shared.security.auth import verify_jwt`, `from shared.config.settings import settings`.

**TAREA:**
Implementa el endpoint de login completo incluyendo:
1. Router en `rest_api/routers/auth.py` con endpoint `POST /api/auth/login`.
2. Generación de JWT con payload completo (sub, tenant_id, branch_ids, roles, email, jti).
3. Verificación de contraseña con bcrypt.
4. Cookie HttpOnly para refresh token con configuración segura.
5. Rate limiting integrado con Redis.
6. Logging estructurado con email enmascarado.

**FORMATO DE SALIDA:**
- `rest_api/routers/auth.py` — endpoint de login.
- `shared/security/auth.py` — generación y verificación de JWT.
- `shared/security/passwords.py` — hash y verificación bcrypt.
- Schemas Pydantic para request/response.

**RESTRICCIONES:**
- Nunca revelar si el email existe o no en mensajes de error.
- `user_id` va en claim `sub` como string: `str(user.id)`.
- Cookie refresh: HttpOnly=True, Secure=True en producción, SameSite=Lax, path="/api/auth".
- Rate limit verificar ANTES de consultar BD (fail-fast).
- No usar CRUDFactory; query directa con SQLAlchemy.
- Imports desde `shared.*`, nunca importar directamente de librerías internas.
- Código en inglés, mensajes de error al usuario en español.

**VALIDACIÓN:**
- [ ] Login exitoso retorna access token con todos los claims requeridos.
- [ ] Refresh token se envía como cookie HttpOnly.
- [ ] Credenciales incorrectas retornan 401 con mensaje genérico.
- [ ] Rate limiting bloquea tras 5 intentos/minuto retornando 429.
- [ ] Email se enmascara en todos los logs.
- [ ] jti es UUID único en cada token generado.
- [ ] branch_ids y roles son listas, no strings.

---

### PROMPT HU-0202 — Refresh de Token

**ROL:**
Actúa como un ingeniero de seguridad especializado en rotación segura de tokens JWT y prevención de ataques de reutilización.

**CONTEXTO:**
El sistema implementa refresh token con rotación:
- Refresh token en cookie HttpOnly (7 días de validez).
- Al refrescar: se genera nuevo access token + nuevo refresh token, el anterior se invalida en Redis blacklist.
- Clave de blacklist: `auth:blacklist:{jti}` con TTL = tiempo restante del token.
- Detección de reutilización: si un refresh token ya invalidado se usa de nuevo, se revoca toda la sesión del usuario (`auth:revoke:{user_id}` con timestamp actual).
- Frontend (Dashboard y pwaWaiter) hace refresh proactivo cada 14 minutos (antes de los 15 min de expiración).
- Si el refresh falla, el frontend redirige a login sin entrar en loop.
- Endpoint: `POST /api/auth/refresh` — lee refresh token de cookie, no de body.

**TAREA:**
Implementa el endpoint de refresh token con rotación segura y detección de reutilización.

**FORMATO DE SALIDA:**
- Agregar endpoint en `rest_api/routers/auth.py`.
- Funciones de blacklist en `shared/security/token_blacklist.py`.
- Lógica de revocación por usuario.

**RESTRICCIONES:**
- El refresh token se lee SOLO de la cookie, nunca del body o header.
- Blacklist y revocación son operaciones atómicas en Redis (pipeline).
- Si Redis no está disponible, rechazar el refresh (fail-closed).
- El nuevo refresh token debe tener un jti diferente.
- No hacer refresh si el access token aún es válido (frontend controla esto).
- Credentials: `include` en fetch del frontend para enviar cookies.

**VALIDACIÓN:**
- [ ] Refresh exitoso retorna nuevo access token + nueva cookie con refresh token.
- [ ] El refresh token anterior queda en blacklist de Redis.
- [ ] Reutilización de refresh token invalida TODA la sesión del usuario.
- [ ] Si Redis cae, el refresh retorna 503 (fail-closed).
- [ ] Cada refresh genera un jti nuevo.

---

### PROMPT HU-0203 — Logout

**ROL:**
Actúa como un ingeniero de seguridad especializado en cierre seguro de sesiones y prevención de loops infinitos en clientes.

**CONTEXTO:**
- El logout debe invalidar el access token actual añadiéndolo a blacklist en Redis con TTL del tiempo restante.
- La cookie de refresh token debe eliminarse (set-cookie con Max-Age=0).
- CRÍTICO: En el frontend (`api.ts`), `authAPI.logout()` debe deshabilitar el retry en 401. Sin esto: token expirado → 401 → onTokenExpired → logout() → 401 → loop infinito. Se pasa `false` como tercer argumento a `fetchAPI` para deshabilitar retry.
- Endpoint: `POST /api/auth/logout`.

**TAREA:**
Implementa el logout seguro con prevención de loop infinito en el frontend.

**FORMATO DE SALIDA:**
- Endpoint en `rest_api/routers/auth.py`.
- Código frontend en `services/api.ts` mostrando el patrón anti-loop.

**RESTRICCIONES:**
- Logout NUNCA debe causar 401 en cascada.
- Si el token ya está expirado al hacer logout, retornar 200 igualmente (idempotente).
- Eliminar cookie con path idéntico al que se usó para crearla (`/api/auth`).
- Si Redis falla al blacklistear, loguear warning pero retornar 200 (el token expirará naturalmente).

**VALIDACIÓN:**
- [ ] Logout retorna 200 y elimina cookie de refresh.
- [ ] Access token queda en blacklist de Redis.
- [ ] Logout con token ya expirado retorna 200 sin error.
- [ ] Frontend no entra en loop infinito al hacer logout con token expirado.

---

### PROMPT HU-0204 — Obtener Perfil del Usuario

**ROL:**
Actúa como un desarrollador backend FastAPI especializado en endpoints protegidos con JWT.

**CONTEXTO:**
- Endpoint `GET /api/auth/me` retorna datos del usuario autenticado.
- Se extrae el usuario del JWT via dependency `current_user_context`.
- El user_id está en `user["sub"]` como string, convertir con `int(user["sub"])`.
- Debe retornar: id, email, nombre, tenant_id, branch_ids, roles.
- 401 si token expirado, blacklisted o inválido.

**TAREA:**
Implementa el endpoint `/api/auth/me` que retorna el perfil del usuario autenticado.

**FORMATO DE SALIDA:**
- Endpoint en `rest_api/routers/auth.py`.
- Schema Pydantic `UserProfileResponse`.

**RESTRICCIONES:**
- No retornar datos sensibles (password hash, jti, timestamps internos).
- Verificar que el token no esté en blacklist antes de responder.
- Usar dependency injection de FastAPI, no verificación manual.

**VALIDACIÓN:**
- [ ] Retorna perfil completo con id, email, nombre, tenant_id, branch_ids, roles.
- [ ] 401 con token expirado.
- [ ] 401 con token blacklisted.
- [ ] No expone password hash ni datos internos.

---

### PROMPT HU-0205 — Table Token para Comensales

**ROL:**
Actúa como un ingeniero de seguridad especializado en tokens HMAC y autenticación sin estado para usuarios anónimos.

**CONTEXTO:**
- Los comensales del pwaMenu no se registran; reciben un table token HMAC al unirse a una mesa.
- Payload del token: table_id, session_id, diner_id, branch_id, tenant_id.
- Validez: 3 horas desde la creación.
- Se envía en header `X-Table-Token` en cada request del comensal.
- Secreto de firma: `TABLE_TOKEN_SECRET` (32+ caracteres en producción).
- El WebSocket del comensal usa el mismo token como query param: `/ws/diner?table_token=`.
- El token se revalida en el WS Gateway cada 30 minutos.
- No usa JWT estándar sino HMAC personalizado para ser más ligero.

**TAREA:**
Implementa la generación y verificación de table tokens HMAC.

**FORMATO DE SALIDA:**
- `shared/security/table_token.py` — generación, verificación, extracción de claims.
- Middleware o dependency para FastAPI que extrae el token de `X-Table-Token`.

**RESTRICCIONES:**
- HMAC-SHA256 con el secreto de `settings.table_token_secret`.
- Payload serializado como JSON compacto antes de firmar.
- Verificación en tiempo constante para prevenir timing attacks (`hmac.compare_digest`).
- Token inválido o expirado retorna 401, nunca 403.
- No almacenar tokens en BD; son stateless por diseño.

**VALIDACIÓN:**
- [ ] Token generado contiene todos los claims requeridos.
- [ ] Token expirado (>3h) retorna 401.
- [ ] Token con firma manipulada retorna 401.
- [ ] Verificación usa comparación en tiempo constante.
- [ ] Dependency de FastAPI extrae claims correctamente del header.

---

### PROMPT HU-0206 — Middlewares de Seguridad

**ROL:**
Actúa como un ingeniero de seguridad web especializado en middlewares de protección para FastAPI, prevención OWASP Top 10 y hardening de headers HTTP.

**CONTEXTO:**
El backend necesita múltiples capas de seguridad:
- **CORS:** En desarrollo usa puertos localhost (5176, 5177, 5178). En producción usa variable `ALLOWED_ORIGINS`. Default origins definidos en `DEFAULT_CORS_ORIGINS` tanto en `rest_api/main.py` como en `ws_gateway/components/core/constants.py`.
- **Headers de seguridad:** CSP restrictivo, HSTS en producción con max-age 1 año, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin.
- **Content-Type validation:** POST/PUT/PATCH deben ser application/json o application/x-www-form-urlencoded.
- **SSRF protection:** `validate_image_url()` en `shared/utils/validators.py` bloquea IPs internas (10.x, 172.16-31.x, 192.168.x, 127.x), cloud metadata (169.254.169.254), y esquemas no-HTTP.
- **WebSocket origin validation:** Verifica que el Origin header esté en la lista permitida.

**TAREA:**
Implementa todos los middlewares de seguridad como middlewares de FastAPI o Starlette.

**FORMATO DE SALIDA:**
- `rest_api/middleware/security_headers.py`
- `rest_api/middleware/content_type_validator.py`
- `shared/utils/validators.py` — `validate_image_url()`
- Configuración CORS en `rest_api/main.py`

**RESTRICCIONES:**
- HSTS solo en producción (`ENVIRONMENT=production`).
- CORS no debe usar `allow_origins=["*"]` en producción.
- Content-Type validation excluye GET, HEAD, OPTIONS.
- SSRF validation debe cubrir todas las rangos de IP privados RFC 1918.
- No bloquear requests legítimos; solo los que violan políticas.

**VALIDACIÓN:**
- [ ] Headers de seguridad presentes en todas las respuestas.
- [ ] CORS rechaza orígenes no listados.
- [ ] POST sin Content-Type application/json retorna 415.
- [ ] URLs con IPs internas son rechazadas por validate_image_url.
- [ ] HSTS solo se aplica cuando ENVIRONMENT=production.

---

### PROMPT HU-0207 — Control de Acceso por Roles (RBAC)

**ROL:**
Actúa como un arquitecto de seguridad especializado en RBAC (Role-Based Access Control) con el patrón Strategy para sistemas multi-tenant y multi-branch.

**CONTEXTO:**
- Roles definidos en `shared/config/constants.py`: ADMIN, MANAGER, KITCHEN, WAITER.
- Permisos: ADMIN (todo), MANAGER (staff, mesas, alérgenos, promos en sus branches), KITCHEN (solo vista cocina y recetas), WAITER (solo sus mesas/sectores asignados).
- `PermissionContext` en `rest_api/services/permissions.py` encapsula la verificación.
- El JWT contiene `roles` (lista) y `branch_ids` (lista) del usuario.
- `MANAGEMENT_ROLES = [ADMIN, MANAGER]` para operaciones administrativas.
- user_id se extrae con `int(user["sub"])`.
- Acceso denegado lanza `ForbiddenError` (403) de `shared/utils/exceptions.py`.

**TAREA:**
Implementa el sistema RBAC completo con PermissionContext y decoradores/dependencies para proteger endpoints.

**FORMATO DE SALIDA:**
- `rest_api/services/permissions.py` — PermissionContext con métodos de verificación.
- `shared/config/constants.py` — roles y constantes.
- Dependencies de FastAPI reutilizables para cada nivel de acceso.

**RESTRICCIONES:**
- Nunca verificar roles con strings hardcodeados; usar constantes de `Roles`.
- `require_management()` acepta ADMIN y MANAGER.
- `require_branch_access(branch_id)` verifica que branch_id está en branch_ids del usuario. ADMIN bypasea esta verificación.
- ForbiddenError incluye mensaje descriptivo en español.
- Las verificaciones se hacen en el router (thin controller), no en el servicio.

**VALIDACIÓN:**
- [ ] ADMIN puede acceder a todo.
- [ ] MANAGER solo accede a branches en su branch_ids.
- [ ] KITCHEN no puede hacer operaciones CRUD de entidades.
- [ ] WAITER no puede acceder a endpoints de admin.
- [ ] ForbiddenError retorna 403 con mensaje claro.
- [ ] Constantes MANAGEMENT_ROLES incluyen ADMIN y MANAGER.

---

### PROMPT HU-0208 — Rate Limiting en Endpoints Críticos

**ROL:**
Actúa como un ingeniero de seguridad especializado en protección contra abuso de APIs y rate limiting distribuido con Redis.

**CONTEXTO:**
- Rate limiting usa scripts Lua en Redis para atomicidad (INCR+EXPIRE en una operación).
- Límites configurados: login 5/min por email+IP, solicitud de cuenta 10/min, pago efectivo 20/min, Mercado Pago 5/min, registro de comensal 20/min.
- El script Lua hace: GET count → si count > max retorna REJECT → INCR counter → SET TTL si es primera request → retorna PERMIT.
- Los scripts se cachean por SHA en memoria, auto-reload en NOSCRIPT error.
- Respuesta 429 con header `Retry-After`.
- Se implementa como decorador Python reutilizable.

**TAREA:**
Implementa el sistema de rate limiting distribuido con Redis y Lua scripts.

**FORMATO DE SALIDA:**
- `shared/security/rate_limiter.py` — decorador y funciones de rate limiting.
- Scripts Lua embebidos como strings en Python.
- Ejemplos de uso como dependency de FastAPI.

**RESTRICCIONES:**
- Lua script debe ser atómico (no separar GET e INCR en comandos individuales).
- Cachear SHA del script; recargar en error NOSCRIPT.
- Si Redis no disponible, permitir el request (fail-open para rate limiting, a diferencia de blacklist que es fail-closed).
- La clave de rate limiting debe incluir identificador único (email, IP, user_id según contexto).
- Header Retry-After indica segundos hasta reset de ventana.

**VALIDACIÓN:**
- [ ] Requests dentro del límite pasan normalmente.
- [ ] Request que excede límite recibe 429 con Retry-After.
- [ ] Script Lua es atómico (no hay race condition entre check y increment).
- [ ] Si Redis cae, requests pasan (fail-open).
- [ ] SHA del script se cachea y recarga en NOSCRIPT.

---

## E03 — Gestión de Tenants y Sucursales

---

### PROMPT HU-0301 — Multi-Tenancy

**ROL:**
Actúa como un arquitecto de software especializado en sistemas multi-tenant con aislamiento de datos a nivel de fila en PostgreSQL.

**CONTEXTO:**
- Cada entidad principal tiene campo `tenant_id` (BigInteger, FK a Tenant).
- Todas las queries deben filtrar por tenant_id del usuario autenticado.
- El tenant_id se extrae del JWT: `user["tenant_id"]`.
- Los catálogos CookingMethod, FlavorProfile, TextureProfile, CuisineType son por tenant.
- El Repository pattern (`TenantRepository`, `BranchRepository`) aplica filtrado automático.
- Nunca debe ser posible acceder a datos de otro tenant, ni por error en queries.

**TAREA:**
Implementa el aislamiento multi-tenant completo en el backend.

**FORMATO DE SALIDA:**
- `rest_api/services/crud/repository.py` — TenantRepository y BranchRepository con filtrado automático.
- Mixin o base class para modelos con tenant_id.
- Tests que verifican aislamiento entre tenants.

**RESTRICCIONES:**
- TODA query debe incluir `.where(Model.tenant_id == tenant_id)`.
- No existe endpoint para listar tenants ni cambiar de tenant.
- TenantRepository.find_all() SIEMPRE filtra por tenant_id.
- Tests deben crear 2 tenants y verificar que uno no ve datos del otro.

**VALIDACIÓN:**
- [ ] Ningún endpoint retorna datos de otro tenant.
- [ ] TenantRepository filtra automáticamente por tenant_id.
- [ ] BranchRepository filtra por tenant_id Y branch_id.
- [ ] Catálogos (CookingMethod, etc.) son por tenant.
- [ ] Tests de aislamiento pasan con 2 tenants.

---

### PROMPT HU-0302 — CRUD de Sucursales

**ROL:**
Actúa como un desarrollador backend senior especializado en FastAPI, Domain Services y APIs RESTful paginadas.

**CONTEXTO:**
- Modelo Branch vinculado a Tenant (N:1).
- Campos: name, address, slug (único por tenant), is_active, configuración JSON.
- El slug se usa para acceso público al menú: `GET /api/public/menu/{slug}`.
- Endpoint público sin auth: `GET /api/public/branches` lista sucursales activas (usado por pwaWaiter en pre-login).
- CRUD protegido bajo `/api/admin/branches` con paginación `?limit=&offset=`.
- BranchService extiende BaseCRUDService.
- Soft delete (is_active=false) con cascade a sectores, mesas, categorías.

**TAREA:**
Implementa el CRUD completo de sucursales con endpoint público y paginación.

**FORMATO DE SALIDA:**
- `rest_api/routers/admin/branches.py` — CRUD protegido.
- `rest_api/routers/public.py` — endpoint público de branches.
- `rest_api/services/domain/branch_service.py` — BranchService.
- Schemas Pydantic para create/update/response.

**RESTRICCIONES:**
- Slug debe ser único dentro del mismo tenant.
- Endpoint público NO requiere autenticación.
- CRUD requiere ADMIN o MANAGER (MANAGER solo sus branches).
- Paginación con limit (default 20, max 100) y offset.
- Soft delete con cascade usando `cascade_soft_delete()`.
- Evento ENTITY_CREATED/UPDATED/DELETED emitido al canal admin.

**VALIDACIÓN:**
- [ ] CRUD funcional con paginación.
- [ ] Endpoint público lista solo branches activas sin auth.
- [ ] Slug único por tenant (409 si duplicado).
- [ ] Soft delete desactiva sector y mesas asociadas.
- [ ] MANAGER solo gestiona sus branches.

---

### PROMPT HU-0303 — Selector de Sucursal en Dashboard

**ROL:**
Actúa como un desarrollador frontend senior especializado en React 19, Zustand y componentes de navegación para paneles administrativos.

**CONTEXTO:**
- Dashboard usa React 19 + Zustand para estado.
- La sucursal activa se almacena en `branchStore` y persiste en localStorage.
- CRÍTICO: usar selectores de Zustand, NUNCA destructurar el store (`const branch = useStore(s => s.branch)`, no `const { branch } = useStore()`).
- Para arrays filtrados usar `useShallow` de `zustand/react/shallow`.
- El usuario tiene `branch_ids` (lista); si tiene una sola, se selecciona automáticamente.
- Al cambiar sucursal, todos los stores deben recargar datos (tablesStore, categoriesStore, etc.).
- El dropdown va en el header/navbar del Dashboard.
- UI en español, código en inglés. Tema naranja (#f97316).

**TAREA:**
Implementa el selector de sucursal en el header del Dashboard con persistencia y recarga automática de datos.

**FORMATO DE SALIDA:**
- Componente `BranchSelector.tsx` en `Dashboard/src/components/`.
- Store `branchStore.ts` en `Dashboard/src/stores/`.
- Integración en el layout/header existente.

**RESTRICCIONES:**
- NUNCA destructurar Zustand stores.
- Usar `EMPTY_ARRAY` constante para fallbacks de arrays vacíos.
- Persistir selección en localStorage.
- Si el usuario tiene 1 sola branch, seleccionar automáticamente sin mostrar dropdown.
- Al cambiar branch, llamar a reset/fetch de todos los stores dependientes.
- Usar logger de `utils/logger.ts`, nunca `console.*`.

**VALIDACIÓN:**
- [ ] Dropdown muestra branches del usuario.
- [ ] Selección persiste tras reload.
- [ ] Una sola branch = selección automática.
- [ ] Cambio de branch recarga datos de otros stores.
- [ ] No hay destructuración de Zustand stores en el código.

---

## E04 — Gestión de Staff

---

### PROMPT HU-0401 — CRUD de Usuarios

**ROL:**
Actúa como un desarrollador backend senior especializado en gestión de usuarios con RBAC multi-branch y protección de datos sensibles.

**CONTEXTO:**
- Modelo User con email, nombre, password_hash (bcrypt), tenant_id.
- Relación M:N via UserBranchRole: un usuario puede tener roles diferentes en diferentes sucursales.
- StaffService maneja la lógica de negocio para CRUD de usuarios.
- Solo ADMIN puede crear/editar usuarios. MANAGER puede gestionar staff en sus branches.
- Soft delete (desactivar usuario).
- Endpoints bajo `/api/admin/staff` con paginación.
- Contraseñas se hashean con bcrypt antes de almacenar.
- El email debe ser único por tenant.

**TAREA:**
Implementa el CRUD completo de usuarios con asignación de roles por sucursal.

**FORMATO DE SALIDA:**
- `rest_api/routers/admin/staff.py`
- `rest_api/services/domain/staff_service.py`
- Schemas Pydantic para create/update/response (sin exponer password_hash).

**RESTRICCIONES:**
- NUNCA retornar password_hash en respuestas.
- Email único por tenant (no globalmente).
- Al crear usuario, hashear contraseña con bcrypt.
- MANAGER solo puede asignar roles WAITER y KITCHEN en sus branches.
- ADMIN puede asignar cualquier rol en cualquier branch.
- Desactivar usuario invalida todos sus tokens (revocación por usuario en Redis).
- Gobernanza CRITICO: solo análisis, no cambios en producción sin revisión.

**VALIDACIÓN:**
- [ ] CRUD funcional con roles por sucursal.
- [ ] Password hash nunca expuesto en API.
- [ ] Email único por tenant.
- [ ] MANAGER limitado a roles WAITER/KITCHEN en sus branches.
- [ ] Desactivar usuario revoca tokens activos.

---

### PROMPT HU-0402 — Asignación Diaria de Mozos a Sectores

**ROL:**
Actúa como un desarrollador backend especializado en modelos de asignación temporal y lógica de negocio con validación de fechas.

**CONTEXTO:**
- Modelo WaiterSectorAssignment vincula user_id + sector_id + fecha.
- Un mozo puede estar asignado a múltiples sectores (máximo 10, warning si se excede).
- Las asignaciones son por día y se reinician automáticamente.
- El mozo debe tener rol WAITER en la sucursal del sector.
- El WS Gateway usa caché de sectores asignados (TTL 60s) para filtrar eventos.
- Endpoint: `POST /api/admin/waiter-assignments`.
- Al guardar, mozos conectados reciben actualización de sectores sin reconectar.

**TAREA:**
Implementa el sistema de asignación diaria de mozos a sectores.

**FORMATO DE SALIDA:**
- `rest_api/routers/admin/assignments.py`
- Modelo WaiterSectorAssignment.
- Lógica de validación y eventos.

**RESTRICCIONES:**
- Validar que el usuario tiene rol WAITER en la branch del sector.
- Fecha de asignación = hoy (no permitir asignar en el pasado).
- Máximo 10 sectores por mozo (warning, no error).
- Invalidar caché de sectores en Redis al crear/modificar asignación.
- Emitir evento para que mozos conectados reciban actualización.

**VALIDACIÓN:**
- [ ] Asignación vincula mozo a sector para fecha específica.
- [ ] Rechaza si el mozo no tiene rol WAITER en la branch.
- [ ] Permite múltiples sectores por mozo.
- [ ] Caché de sectores se invalida tras cambio.

---

### PROMPT HU-0403 — Verificación de Asignación del Mozo

**ROL:**
Actúa como un desarrollador backend especializado en endpoints de verificación y flujos de autorización por contexto temporal.

**CONTEXTO:**
- Endpoint: `GET /api/waiter/verify-branch-assignment?branch_id={id}`.
- Verifica que el mozo está asignado HOY a la sucursal seleccionada (WaiterSectorAssignment con fecha = hoy).
- Si no está asignado: retorna error → pwaWaiter muestra "Acceso Denegado" con fecha y botón "Elegir otra sucursal".
- Si está asignado: retorna sectores asignados y confirma acceso.
- El pwaWaiter llama este endpoint después del login exitoso, antes de mostrar MainPage.
- El resultado se almacena en authStore como `assignmentVerified: true` y `selectedBranchId`.

**TAREA:**
Implementa el endpoint de verificación de asignación y la lógica en el frontend.

**FORMATO DE SALIDA:**
- Endpoint en `rest_api/routers/waiter.py`.
- Lógica de verificación en pwaWaiter `stores/authStore.ts`.
- Componente de "Acceso Denegado" en pwaWaiter.

**RESTRICCIONES:**
- Solo verificar asignaciones del día actual (fecha local del servidor).
- El endpoint requiere JWT con rol WAITER.
- No crear asignación; solo verificar si existe.
- Si no hay asignación, retornar 403 con mensaje descriptivo en español.

**VALIDACIÓN:**
- [ ] Mozo asignado hoy: retorna 200 con sectores.
- [ ] Mozo no asignado: retorna 403.
- [ ] pwaWaiter muestra "Acceso Denegado" cuando 403.
- [ ] Botón "Elegir otra sucursal" funcional.

---

### PROMPT HU-0404 — Gestión de Staff desde Dashboard

**ROL:**
Actúa como un desarrollador frontend senior especializado en React 19, tablas de datos, formularios con validación y Zustand stores.

**CONTEXTO:**
- Dashboard tiene página de gestión de personal bajo ruta `/staff`.
- Tabla con lista de empleados mostrando: nombre, email, roles por sucursal, estado (activo/inactivo).
- Formulario modal de creación/edición con validación.
- Filtros por sucursal, rol y estado.
- StaffService en backend maneja la lógica.
- Zustand store para estado con selectores (NUNCA destructurar).
- UI en español, tema naranja (#f97316), botones rectangulares (sin bordes redondeados).

**TAREA:**
Implementa la vista completa de gestión de personal en el Dashboard.

**FORMATO DE SALIDA:**
- Página `StaffPage.tsx` en `Dashboard/src/pages/`.
- Componentes: `StaffTable.tsx`, `StaffFormModal.tsx`.
- Store: `staffStore.ts`.
- Integración con rutas existentes.

**RESTRICCIONES:**
- NUNCA destructurar Zustand stores; usar selectores.
- `useShallow` para arrays filtrados.
- Botones rectangulares, no redondeados.
- Logger centralizado, no `console.*`.
- Formulario valida email único antes de enviar.
- Guard de mount asíncrono: `isMounted` pattern en useEffect.

**VALIDACIÓN:**
- [ ] Tabla muestra empleados con paginación.
- [ ] Filtros por sucursal, rol y estado funcionan.
- [ ] Modal de creación/edición con validación.
- [ ] No hay destructuración de Zustand.
- [ ] UI en español con tema naranja.

---

## E05 — Estructura del Menú

---

### PROMPT HU-0501 — CRUD de Categorías

**ROL:**
Actúa como un desarrollador full-stack especializado en Domain Services, CRUD con soft delete cascading y componentes React de gestión.

**CONTEXTO:**
- Modelo Category: name, description, image_url, display_order, branch_id, tenant_id, is_active.
- CategoryService extiende BranchScopedService[Category, CategoryOutput].
- Cascade soft delete: al desactivar categoría → desactivar subcategorías → desactivar productos.
- Reordenamiento por drag-and-drop (campo display_order).
- Endpoints bajo `/api/admin/categories` con paginación.
- Validación de image_url contra SSRF con `validate_image_url()`.
- Evento ENTITY_CREATED/UPDATED/DELETED emitido al canal admin.

**TAREA:**
Implementa el CRUD completo de categorías con cascade soft delete y reordenamiento.

**FORMATO DE SALIDA:**
- `rest_api/services/domain/category_service.py`
- `rest_api/routers/admin/categories.py`
- Schemas Pydantic.
- Componente frontend en Dashboard si aplica.

**RESTRICCIONES:**
- Usar BranchScopedService como base, no CRUDFactory.
- `validate_image_url()` para URLs de imagen.
- Cascade soft delete con `cascade_soft_delete()`.
- display_order como integer, permite reordenamiento.
- Eventos ENTITY_* emitidos tras cada operación.
- Gobernanza BAJO: autonomía completa si tests pasan.

**VALIDACIÓN:**
- [ ] CRUD funcional con paginación.
- [ ] Soft delete desactiva subcategorías y productos en cascada.
- [ ] image_url validada contra SSRF.
- [ ] Reordenamiento actualiza display_order.
- [ ] Eventos emitidos correctamente.

---

### PROMPT HU-0502 — CRUD de Subcategorías

**ROL:**
Actúa como un desarrollador backend especializado en Domain Services jerárquicos con relaciones padre-hijo y cascade operations.

**CONTEXTO:**
- Modelo Subcategory: name, description, image_url, display_order, category_id (FK), branch_id, tenant_id.
- SubcategoryService extiende BranchScopedService.
- Cascade: al desactivar subcategoría → desactivar productos asociados.
- La subcategoría pertenece a una categoría; si la categoría está inactiva, la subcategoría no debe mostrarse.

**TAREA:**
Implementa el CRUD de subcategorías vinculado a categorías con cascade a productos.

**FORMATO DE SALIDA:**
- `rest_api/services/domain/subcategory_service.py`
- `rest_api/routers/admin/subcategories.py`
- Schemas Pydantic.

**RESTRICCIONES:**
- Validar que la categoría padre existe y está activa al crear.
- Cascade soft delete a productos.
- Mismos patrones que CategoryService.

**VALIDACIÓN:**
- [ ] Subcategoría vinculada a categoría existente y activa.
- [ ] Soft delete desactiva productos en cascada.
- [ ] No se puede crear subcategoría en categoría inactiva.

---

### PROMPT HU-0503 — CRUD de Productos

**ROL:**
Actúa como un desarrollador backend senior especializado en entidades complejas con relaciones M:N, precios multi-branch y validación de datos.

**CONTEXTO:**
- Modelo Product: name, description, image_url, subcategory_id, tenant_id, is_active. Campos opcionales: estimated_prep_time, is_featured.
- Indicadores dietarios: is_vegetarian, is_vegan, is_gluten_free, is_dairy_free, is_keto, is_low_sodium.
- Relación M:N con Allergen via ProductAllergen (presence_type, risk_level).
- Precios por sucursal via BranchProduct (price_cents como Integer).
- ProductService extiende BaseCRUDService.
- Validación SSRF en image_url.
- Gobernanza ALTO: proponer cambios, esperar revisión humana.

**TAREA:**
Implementa el CRUD completo de productos con precios por sucursal y alérgenos.

**FORMATO DE SALIDA:**
- `rest_api/services/domain/product_service.py`
- `rest_api/routers/admin/products.py`
- Schemas Pydantic con nested allergens y branch_prices.

**RESTRICCIONES:**
- Precios SIEMPRE en centavos (Integer).
- No mostrar producto en una sucursal si no tiene BranchProduct para esa sucursal.
- Validar image_url contra SSRF.
- Eager loading: `selectinload(Product.allergens)`, `selectinload(Product.branch_products)`.
- Al crear/editar, permitir enviar alérgenos y precios en el mismo request.

**VALIDACIÓN:**
- [ ] Producto se crea con subcategoría válida.
- [ ] Precios por sucursal en centavos.
- [ ] Alérgenos asociados con presence_type y risk_level.
- [ ] Producto sin precio en branch X no aparece en menú de branch X.
- [ ] image_url validada contra SSRF.

---

### PROMPT HU-0504 — Precios por Sucursal

**ROL:**
Actúa como un desarrollador backend especializado en relaciones de precio multi-branch y conversión de monedas en centavos.

**CONTEXTO:**
- Modelo BranchProduct: product_id, branch_id, price_cents (Integer), is_available.
- Un producto puede tener precios diferentes en cada sucursal.
- Frontend muestra: `displayPrice = backendCents / 100` (12550 → $125.50).
- Backend recibe: `backendCents = Math.round(price * 100)`.
- Si un producto no tiene BranchProduct para una sucursal, no se muestra en esa sucursal.

**TAREA:**
Implementa la gestión de precios por sucursal con conversión frontend-backend.

**FORMATO DE SALIDA:**
- Endpoints en admin products router para gestionar precios por branch.
- Helpers de conversión de precios en frontend.

**RESTRICCIONES:**
- SIEMPRE Integer en backend, NUNCA float para precios.
- Conversión: frontend `Math.round(price * 100)`, backend retorna Integer.
- Validar que price_cents > 0.
- Un producto puede no tener precio en todas las sucursales.

**VALIDACIÓN:**
- [ ] Precio almacenado como Integer en centavos.
- [ ] Frontend muestra correctamente con 2 decimales.
- [ ] Producto sin precio en branch no aparece en menú público de esa branch.

---

### PROMPT HU-0505 — Menú Público por Slug

**ROL:**
Actúa como un desarrollador backend especializado en APIs públicas de alto rendimiento con respuestas optimizadas.

**CONTEXTO:**
- Endpoint público: `GET /api/public/menu/{slug}` — NO requiere autenticación.
- Retorna menú completo de la sucursal: categorías → subcategorías → productos con precios.
- Solo items activos (is_active=True) con precios disponibles (BranchProduct existente).
- El slug identifica la sucursal (único por tenant, pero el endpoint público necesita resolver sin tenant_id).
- Incluye alérgenos por producto con presence_type y risk_level.
- Respuesta optimizada: no incluir campos internos (tenant_id, deleted_at, etc.).
- pwaMenu cachea esta respuesta 5 minutos.

**TAREA:**
Implementa el endpoint público de menú por slug con respuesta optimizada.

**FORMATO DE SALIDA:**
- Endpoint en `rest_api/routers/public.py`.
- Schema de respuesta optimizado (sin campos internos).
- Eager loading para evitar N+1.

**RESTRICCIONES:**
- SIN autenticación requerida.
- Solo items activos con precio en la sucursal.
- Eager loading obligatorio: categories → subcategories → products → allergens + branch_products.
- No retornar: tenant_id, created_by, updated_by, deleted_at, password hashes.
- Si el slug no existe, retornar 404.

**VALIDACIÓN:**
- [ ] Endpoint accesible sin autenticación.
- [ ] Retorna jerarquía completa: categorías → subcategorías → productos.
- [ ] Productos incluyen precio en centavos y alérgenos.
- [ ] No expone campos internos.
- [ ] N+1 queries evitado con eager loading.

---

## E06 — Alérgenos y Perfiles Alimentarios

---

### PROMPT HU-0601 — CRUD de Alérgenos

**ROL:**
Actúa como un desarrollador backend especializado en datos médicos/alimentarios y catálogos por tenant.

**CONTEXTO:**
- Modelo Allergen: name, description, icon, tenant_id, is_active.
- Los 14 alérgenos principales (gluten, lácteos, huevos, pescado, mariscos, frutos secos, maní, soja, apio, mostaza, sésamo, sulfitos, altramuces, moluscos) deben estar pre-cargados en el seed.
- AllergenService maneja el CRUD.
- Gobernanza CRITICO: solo análisis, no cambios en producción sin revisión.
- Cross-reactivity: datos para síndrome látex-frutas (configurable, probabilidad asociada).

**TAREA:**
Implementa el CRUD de alérgenos con catálogo pre-cargado de los 14 principales.

**FORMATO DE SALIDA:**
- `rest_api/services/domain/allergen_service.py`
- `rest_api/routers/admin/allergens.py`
- Seed data con los 14 alérgenos.

**RESTRICCIONES:**
- Gobernanza CRITICO: toda modificación requiere revisión humana.
- Los 14 alérgenos principales deben existir como seed.
- No permitir eliminar (ni soft delete) alérgenos que están asociados a productos.
- Nombres de alérgenos en español.

**VALIDACIÓN:**
- [ ] 14 alérgenos pre-cargados en seed.
- [ ] No se puede eliminar alérgeno asociado a productos (409).
- [ ] CRUD funcional con paginación.

---

### PROMPT HU-0602 — Asociación Producto-Alérgeno

**ROL:**
Actúa como un desarrollador backend especializado en relaciones M:N con metadatos y seguridad alimentaria.

**CONTEXTO:**
- Tabla ProductAllergen: product_id, allergen_id, presence_type (CONTAINS, MAY_CONTAIN, FREE_OF), risk_level (LOW, STANDARD, HIGH).
- El Dashboard muestra selector de alérgenos en el formulario de producto.
- La API retorna alérgenos con cada producto en el menú público.
- pwaMenu usa esta info para filtros dietarios.
- Color coding: rojo=CONTAINS, amarillo=MAY_CONTAIN, verde=FREE_OF.

**TAREA:**
Implementa la asociación M:N entre productos y alérgenos con metadatos de presencia y riesgo.

**FORMATO DE SALIDA:**
- Modelo ProductAllergen con presence_type y risk_level.
- Endpoints para asociar/desasociar alérgenos a productos.
- Schema de respuesta que incluye alérgenos en el producto.

**RESTRICCIONES:**
- presence_type y risk_level como Enums en Python.
- Eager loading en queries de producto: `selectinload(Product.product_allergens).joinedload(ProductAllergen.allergen)`.
- Permitir bulk update (enviar lista completa de alérgenos, reemplazar existentes).
- Gobernanza CRITICO.

**VALIDACIÓN:**
- [ ] Producto asociado a múltiples alérgenos con metadatos.
- [ ] Menú público incluye alérgenos por producto.
- [ ] Bulk update reemplaza lista completa.
- [ ] Enums correctos para presence_type y risk_level.

---

### PROMPT HU-0603 — Filtros Dietarios en pwaMenu

**ROL:**
Actúa como un desarrollador frontend senior especializado en sistemas de filtrado complejos, React 19 y experiencia de usuario para personas con restricciones alimentarias.

**CONTEXTO:**
- pwaMenu permite filtrar menú por alérgenos y preferencias dietarias.
- Filtros en cascada: Alérgenos (strict/very strict modes) + Dietarios (vegetariano, vegano, sin gluten, sin lácteos, keto, bajo sodio) + Métodos de cocción.
- Cross-reactivity: síndrome látex-frutas detectado opcionalmente (configurable, probabilidad asociada).
- Filtro de alérgenos strict: excluye CONTAINS. Very strict: excluye CONTAINS y MAY_CONTAIN.
- Indicador visual: badge con cantidad de filtros activos.
- Preferencias se persisten localmente y se sincronizan al servidor (HU-1801, device tracking).
- i18n: todos los textos usan `t()`, cero strings hardcodeados.
- Tema oscuro base con acento naranja (#f97316).

**TAREA:**
Implementa el sistema de filtros dietarios completo en pwaMenu.

**FORMATO DE SALIDA:**
- Componente `DietaryFilters.tsx` o `AllergenFilter.tsx`.
- Lógica de filtrado en store o hook.
- Integración con la vista de menú existente.

**RESTRICCIONES:**
- TODOS los textos con `t()` (i18n).
- NUNCA destructurar Zustand stores.
- Filtros en cascada: aplicar en orden alérgenos → dietarios → cocción.
- Badge visual con conteo de filtros activos.
- Persistir en localStorage para recuperar en siguiente visita.
- Performance: filtrar en el cliente, no re-fetchar del servidor.

**VALIDACIÓN:**
- [ ] Filtro strict excluye productos con CONTAINS.
- [ ] Filtro very strict excluye CONTAINS + MAY_CONTAIN.
- [ ] Filtros dietarios funcionan (vegetariano, vegano, etc.).
- [ ] Badge muestra cantidad de filtros activos.
- [ ] Filtros persisten en localStorage.
- [ ] Todos los textos usan i18n.

---

## E07 — Gestión de Mesas y Sectores

---

### PROMPT HU-0701 — CRUD de Sectores

**ROL:**
Actúa como un desarrollador backend especializado en Domain Services para entidades organizacionales con cascade y eventos en tiempo real.

**CONTEXTO:**
- Modelo BranchSector: name, branch_id, tenant_id, is_active.
- SectorService extiende BranchScopedService.
- Cascade soft delete: desactivar sector → desactivar mesas asociadas.
- Los sectores organizan el salón (ej: "Interior", "Terraza", "Barra").
- El WS Gateway usa sector_id para filtrar eventos de mozos (solo reciben eventos de sus sectores asignados).
- Evento ENTITY_CREATED/UPDATED/DELETED emitido al canal admin.
- Gobernanza BAJO: autonomía completa si tests pasan.

**TAREA:**
Implementa el CRUD completo de sectores con cascade soft delete.

**FORMATO DE SALIDA:**
- `rest_api/services/domain/sector_service.py`
- `rest_api/routers/admin/sectors.py`
- Schemas Pydantic.

**RESTRICCIONES:**
- Nombre de sector único por branch.
- Cascade soft delete con `cascade_soft_delete()`.
- No permitir eliminar sector con mesas activas con sesiones abiertas.
- Evento ENTITY_* emitido tras cada operación.

**VALIDACIÓN:**
- [ ] CRUD funcional.
- [ ] Nombre único por branch.
- [ ] Soft delete desactiva mesas asociadas.
- [ ] No elimina sector con sesiones activas.

---

### PROMPT HU-0702 — CRUD de Mesas

**ROL:**
Actúa como un desarrollador backend especializado en entidades con estado y códigos alfanuméricos para sistemas de hospitalidad.

**CONTEXTO:**
- Modelo Table: number, code (alfanumérico, ej: "INT-01"), capacity, sector_id, branch_id, tenant_id, status (FREE/ACTIVE/PAYING/OUT_OF_SERVICE), is_active.
- TableService extiende BranchScopedService.
- El código NO es único globalmente — es único por branch (mismo código puede existir en diferentes sucursales).
- Para resolver una mesa se necesita branch_slug + table_code.
- Estados: FREE (verde), ACTIVE (rojo), PAYING (púrpura), OUT_OF_SERVICE (gris).
- Endpoint para cambiar estado manualmente (ej: poner fuera de servicio).

**TAREA:**
Implementa el CRUD de mesas con gestión de estado y código alfanumérico.

**FORMATO DE SALIDA:**
- `rest_api/services/domain/table_service.py`
- `rest_api/routers/admin/tables.py`
- Schemas Pydantic.

**RESTRICCIONES:**
- Code único por branch, NO globalmente.
- Status como Enum en Python.
- No permitir eliminar mesa con sesión activa (status ACTIVE o PAYING).
- Cambio de estado emite evento TABLE_STATUS_CHANGED.
- Validar capacity > 0.

**VALIDACIÓN:**
- [ ] Código único por branch.
- [ ] CRUD funcional con filtros por sector y status.
- [ ] No elimina mesa con sesión activa.
- [ ] Cambio de status emite evento WS.

---

### PROMPT HU-0703 — Vista de Mesas en Dashboard

**ROL:**
Actúa como un desarrollador frontend senior especializado en grillas interactivas en tiempo real con React 19, Zustand y WebSocket.

**CONTEXTO:**
- Dashboard muestra grilla de mesas agrupadas por sector.
- Colores por estado: verde (FREE), rojo (ACTIVE), púrpura (PAYING), gris (OUT_OF_SERVICE).
- Actualización en tiempo real via WebSocket (endpoint `/ws/admin?token=JWT`).
- Eventos: TABLE_SESSION_STARTED, TABLE_STATUS_CHANGED, TABLE_CLEARED, ROUND_*, SERVICE_CALL_*, CHECK_*.
- Click en mesa abre modal con detalle: sesión activa, comensales, rondas, llamados de servicio.
- Filtros por estado.
- Zustand store con selectores, NUNCA destructurar.
- WebSocket: usar ref pattern para listeners (`handleEventRef`), suscribirse una sola vez con `[]` deps.
- UI en español, tema naranja (#f97316), botones rectangulares.

**TAREA:**
Implementa la vista de mesas en tiempo real en el Dashboard con modal de detalle.

**FORMATO DE SALIDA:**
- Página `TablesPage.tsx`.
- Componentes: `TableGrid.tsx`, `TableCard.tsx`, `TableDetailModal.tsx`.
- Store: `tablesStore.ts` con handlers de eventos WS.
- Integración WebSocket.

**RESTRICCIONES:**
- NUNCA destructurar Zustand; usar selectores.
- WebSocket ref pattern: `const handleEventRef = useRef(handleEvent)`.
- useEffect con `[]` deps para suscripción WS (una sola vez).
- `useShallow` para arrays filtrados.
- Guard `isMounted` en hooks async.
- Logger centralizado, no `console.*`.

**VALIDACIÓN:**
- [ ] Mesas agrupadas por sector con colores correctos.
- [ ] Actualizaciones en tiempo real via WS.
- [ ] Modal de detalle con sesión, rondas, llamados.
- [ ] Filtros por estado funcionan.
- [ ] No hay destructuración de Zustand.
- [ ] Patrón ref para WS listeners.

---

## E08 — Sesión de Mesa y Comensales

---

### PROMPT HU-0801 — Iniciar Sesión de Mesa (Escaneo QR)

**ROL:**
Actúa como un desarrollador backend especializado en gestión de sesiones, tokens HMAC y flujos de ingreso con resolución por código de mesa.

**CONTEXTO:**
- El comensal escanea un QR que contiene URL con branch_slug y table_code.
- Endpoint para resolver por código: `POST /api/tables/code/{code}/session` con branch_slug en body o query.
- Si mesa FREE: crea nueva TableSession (estado OPEN) + primer Diner.
- Si mesa ACTIVE: une al comensal a la sesión existente.
- Retorna table_token (HMAC, 3h validez) para el nuevo comensal.
- Evento TABLE_SESSION_STARTED emitido via WS a mozos del sector y admin.
- La sesión tiene validez de 8 horas desde última actividad.
- Device ID (UUID en browser storage) se registra para tracking futuro.

**TAREA:**
Implementa el flujo de inicio de sesión de mesa con generación de table token.

**FORMATO DE SALIDA:**
- Endpoint en `rest_api/routers/tables.py`.
- Lógica de crear/unir sesión.
- Generación de table token.
- Evento WS emitido.

**RESTRICCIONES:**
- Mesa OUT_OF_SERVICE no permite crear sesión (retorna 409).
- Si mesa PAYING, el comensal puede unirse a la sesión existente.
- Usar `with_for_update()` para prevenir race condition al crear sesión.
- Table token contiene: table_id, session_id, diner_id, branch_id, tenant_id.
- Device ID opcional (puede no enviarse).

**VALIDACIÓN:**
- [ ] Mesa FREE → crea sesión + diner + retorna token.
- [ ] Mesa ACTIVE → une a sesión existente + retorna token.
- [ ] Mesa OUT_OF_SERVICE → 409.
- [ ] Token contiene todos los claims.
- [ ] Evento TABLE_SESSION_STARTED emitido.
- [ ] Race condition prevenida con `with_for_update()`.

---

### PROMPT HU-0802 — Registro de Comensal

**ROL:**
Actúa como un desarrollador backend especializado en registro anónimo de usuarios con identificación visual y tracking de dispositivos.

**CONTEXTO:**
- Modelo Diner: name, color, session_id, customer_id (nullable, para device tracking).
- Al unirse a mesa, el comensal ingresa nombre (max 50 chars, auto-generado si omite).
- Se asigna color único dentro de la sesión de una paleta de 16 colores.
- Si existe customer_id (device tracking), se vincula al diner.
- El color identifica visualmente los ítems del comensal en el carrito compartido.
- Rate limiting: 20 registros de comensal por minuto por IP.

**TAREA:**
Implementa el registro de comensal con asignación de color y tracking de dispositivo.

**FORMATO DE SALIDA:**
- Lógica de registro en endpoint de sesión.
- Algoritmo de asignación de color (rotar por paleta, evitar duplicados en sesión).

**RESTRICCIONES:**
- Nombre max 50 caracteres, sanitizar HTML.
- Color único en la sesión actual (no globalmente).
- Si todos los colores están ocupados, reutilizar el menos reciente.
- Device ID vinculado como customer_id si se proporciona.
- Rate limiting: 20/min por IP.

**VALIDACIÓN:**
- [ ] Comensal registrado con nombre y color único.
- [ ] Auto-generación de nombre si se omite.
- [ ] Device ID vinculado si presente.
- [ ] Color no repetido en la sesión activa.

---

### PROMPT HU-0803 — Pantalla de Unirse a Mesa (pwaMenu)

**ROL:**
Actúa como un desarrollador frontend especializado en onboarding flows de PWAs, React 19 y diseño mobile-first.

**CONTEXTO:**
- pwaMenu muestra pantalla de bienvenida al escanear QR.
- Flujo en 2 pasos: 1) Ingresar código de mesa (alfanumérico, ej: "INT-01"), 2) Nombre del comensal (opcional, max 50 chars).
- Si ya hay comensales en la mesa, muestra lista de nombres existentes.
- Al unirse: solicita sesión al server, recibe table token, establece conexión WS.
- Transición fluida al menú después de unirse con animación fade 200ms.
- i18n: todos los textos con `t()`.
- Tema oscuro base, acento naranja (#f97316).
- El table token se almacena en localStorage, sobrevive cierre de browser.

**TAREA:**
Implementa la pantalla de onboarding de pwaMenu.

**FORMATO DE SALIDA:**
- Página `JoinTable.tsx` o equivalente en pwaMenu.
- Store o hook para manejo de sesión.
- Integración con api.ts para crear/unir sesión.

**RESTRICCIONES:**
- TODOS los textos con `t()` (i18n es/en/pt).
- Zustand con selectores, NUNCA destructurar.
- Table token persistido en localStorage.
- Guard `isMounted` en efectos async.
- Touch targets mínimo 44x44px.
- Manejar error de mesa no encontrada y mesa fuera de servicio.

**VALIDACIÓN:**
- [ ] Código de mesa acepta alfanumérico.
- [ ] Nombre opcional con auto-generación.
- [ ] Muestra comensales existentes si los hay.
- [ ] Token persistido en localStorage.
- [ ] Textos i18n, no hardcodeados.
- [ ] Errores manejados con mensajes en idioma del usuario.

---

## E09 — Menú Digital (pwaMenu)

---

### PROMPT HU-0901 — Exploración de Menú por Categorías

**ROL:**
Actúa como un desarrollador frontend senior especializado en navegación jerárquica, React 19 y experiencias de menú digital mobile-first.

**CONTEXTO:**
- Jerarquía de 3 niveles: Categoría (tabs superiores) → Subcategoría (grid) → Productos (lista).
- Vista inicial: banner promocional + carrusel de productos destacados.
- Caché del menú: 5 minutos TTL en el cliente.
- Solo muestra items activos con precio en la sucursal actual.
- Datos vienen de `GET /api/public/menu/{slug}` (sin auth).
- Navegación fluida con animaciones.
- i18n obligatorio en todos los textos.
- Tema oscuro, acento naranja (#f97316).
- Responsive: 2 columnas mobile → 6 columnas desktop.

**TAREA:**
Implementa la navegación de menú jerárquica en pwaMenu.

**FORMATO DE SALIDA:**
- Páginas/componentes de navegación de menú.
- Store para datos del menú con caché.
- Componentes: CategoryTabs, SubcategoryGrid, ProductList.

**RESTRICCIONES:**
- i18n obligatorio: `t()` en todos los textos.
- Zustand con selectores, NUNCA destructurar.
- Caché 5min en store (no re-fetchar si datos frescos).
- Solo items activos con precio.
- Imágenes con fallback si no cargan.
- Performance: virtualización si la lista de productos es larga (>50).

**VALIDACIÓN:**
- [ ] Navegación 3 niveles funcional.
- [ ] Caché 5min evita re-fetch innecesario.
- [ ] Solo items activos con precio.
- [ ] Responsive 2→6 columnas.
- [ ] i18n completo.

---

### PROMPT HU-0902 — Detalle de Producto

**ROL:**
Actúa como un desarrollador frontend especializado en modales de detalle de producto, accesibilidad y visualización de información alimentaria.

**CONTEXTO:**
- Modal con: imagen (con fallback), nombre, descripción, precio, alérgenos (color-coded), badges (popularidad, novedad), tiempo de preparación, selector de cantidad (1-99), campo de notas.
- Alérgenos: rojo=CONTAINS, amarillo=MAY_CONTAIN, verde=FREE_OF, con niveles de riesgo.
- Botón "Agregar al carrito" en la parte inferior.
- Accesibilidad: modal como dialog con título, escape para cerrar, focus trap.
- Precios: backend envía centavos, frontend muestra con 2 decimales.

**TAREA:**
Implementa el modal de detalle de producto en pwaMenu.

**FORMATO DE SALIDA:**
- Componente `ProductDetailModal.tsx`.
- Integración con store del carrito para "agregar".

**RESTRICCIONES:**
- Precio: `displayPrice = backendCents / 100`.
- Alérgenos con color coding (rojo/amarillo/verde).
- Cantidad 1-99, no permitir 0 ni negativos.
- Modal accesible: role="dialog", aria-labelledby, focus trap.
- Escape cierra modal, click en overlay cierra modal.
- i18n en todos los textos.

**VALIDACIÓN:**
- [ ] Muestra todos los datos del producto.
- [ ] Alérgenos con colores correctos.
- [ ] Cantidad entre 1-99.
- [ ] Precio formateado desde centavos.
- [ ] Accesibilidad: escape, focus trap, aria labels.

---

### PROMPT HU-0903 — Búsqueda de Productos

**ROL:**
Actúa como un desarrollador frontend especializado en búsqueda en tiempo real con debounce y UX de resultados de búsqueda.

**CONTEXTO:**
- Barra de búsqueda accesible desde cualquier pantalla del menú.
- Búsqueda en tiempo real con debounce de 300ms.
- Busca en nombre y descripción de productos.
- Resultados muestran: nombre, categoría, precio, imagen miniatura.
- Sin resultados: mensaje apropiado (i18n).
- Click en resultado navega al detalle del producto.
- Búsqueda del lado del cliente (ya tiene datos cacheados del menú).

**TAREA:**
Implementa la búsqueda de productos con debounce y resultados en tiempo real.

**FORMATO DE SALIDA:**
- Componente `SearchBar.tsx` con lista de resultados.
- Hook `useProductSearch` con lógica de debounce y filtrado.

**RESTRICCIONES:**
- Debounce 300ms.
- Búsqueda client-side sobre datos cacheados (no request al server).
- Case-insensitive.
- i18n en placeholders y mensajes.
- Sanitizar input contra XSS.

**VALIDACIÓN:**
- [ ] Búsqueda con debounce 300ms.
- [ ] Resultados muestran nombre, categoría, precio, thumbnail.
- [ ] Sin resultados muestra mensaje i18n.
- [ ] Click navega al detalle.

---

### PROMPT HU-0904 — Internacionalización (i18n)

**ROL:**
Actúa como un especialista en internacionalización de aplicaciones React con soporte multi-idioma completo.

**CONTEXTO:**
- pwaMenu soporta 3 idiomas: español (es, primario), inglés (en), portugués (pt).
- Selector de idioma accesible en la interfaz.
- TODOS los textos de la UI usan función `t()` — CERO strings hardcodeados.
- El idioma seleccionado persiste en localStorage.
- Auto-detección: usa idioma del browser con fallback a español.
- Cobertura: navegación, modales, errores, estados de pedido, descripciones de alérgenos, pantallas de pago, botones, labels, tooltips, mensajes de error.
- Cambio instantáneo sin reload.

**TAREA:**
Implementa el sistema i18n completo para pwaMenu.

**FORMATO DE SALIDA:**
- Configuración i18n (react-i18next o equivalente).
- Archivos de traducciones: `es.json`, `en.json`, `pt.json`.
- Componente `LanguageSelector.tsx`.
- Auditoría de textos hardcodeados existentes.

**RESTRICCIONES:**
- CERO strings hardcodeados en componentes.
- Namespaces por feature si el archivo de traducciones es grande.
- Pluralización correcta en los 3 idiomas.
- Fechas y números formateados según locale.
- Fallback chain: idioma seleccionado → es.
- Persistir en localStorage.

**VALIDACIÓN:**
- [ ] 3 idiomas funcionan (es, en, pt).
- [ ] Cambio instantáneo sin reload.
- [ ] Persistencia en localStorage.
- [ ] CERO strings hardcodeados (auditar con grep).
- [ ] Auto-detección de idioma del browser.

---

## E10 — Carrito Compartido y Pedidos

---

### PROMPT HU-1001 — Agregar Producto al Carrito

**ROL:**
Actúa como un desarrollador frontend senior especializado en carritos de compra con actualizaciones optimistas y sincronización multi-dispositivo via WebSocket.

**CONTEXTO:**
- Carrito compartido entre todos los comensales de una mesa.
- Cada ítem identificado con nombre y color del comensal que lo agregó.
- Actualización optimista: UI actualiza inmediatamente, server confirma después, auto-revert si rechaza.
- Evento CART_ITEM_ADDED emitido via WS a todos los comensales de la sesión.
- Selector de cantidad (1-99), campo de notas opcional.
- No crear duplicados: si el mismo comensal agrega el mismo producto, incrementar cantidad.
- Endpoint diner: usa `X-Table-Token` como autenticación.

**TAREA:**
Implementa la funcionalidad de agregar productos al carrito compartido con actualización optimista.

**FORMATO DE SALIDA:**
- Store del carrito en pwaMenu.
- Componente de botón "Agregar" con selector de cantidad.
- API call con X-Table-Token.
- Handler del evento WS CART_ITEM_ADDED para sincronizar con otros comensales.

**RESTRICCIONES:**
- Optimistic update: actualizar UI antes de confirmación del server.
- Auto-revert si el server rechaza (mostrar toast de error).
- Deduplicación: si existe ítem del mismo producto+comensal, incrementar cantidad.
- Zustand con selectores, NUNCA destructurar.
- i18n en todos los textos.
- Cantidad 0 = eliminar ítem.

**VALIDACIÓN:**
- [ ] Agregar ítem actualiza UI inmediatamente.
- [ ] Server confirma y emite evento WS.
- [ ] Otros comensales ven el ítem agregado.
- [ ] Duplicado = incrementar cantidad, no nuevo ítem.
- [ ] Auto-revert si server rechaza.

---

### PROMPT HU-1002 — Sincronización Multi-Dispositivo del Carrito

**ROL:**
Actúa como un desarrollador especializado en sincronización de estado distribuido via WebSocket con resolución de conflictos y deduplicación.

**CONTEXTO:**
- Todos los comensales de la mesa ven el mismo carrito en tiempo real.
- Eventos WS: CART_ITEM_ADDED, CART_ITEM_UPDATED, CART_ITEM_REMOVED, CART_CLEARED.
- Deduplicación: registro de eventos recientes con ventana de 5 segundos para evitar procesamiento duplicado.
- Caché de conversión: 200 conversiones recientes con TTL de 30 segundos.
- Reconexión: sincronización completa del estado desde el server.
- Cross-tab sync: propagación via localStorage events.
- Conflictos resueltos por orden de llegada al servidor (last-write-wins).

**TAREA:**
Implementa la sincronización completa del carrito entre múltiples dispositivos y pestañas.

**FORMATO DE SALIDA:**
- Handlers de eventos WS en el cart store.
- Lógica de deduplicación.
- Sync on reconnection.
- Cross-tab sync via localStorage.

**RESTRICCIONES:**
- Deduplicación con ventana de 5 segundos.
- WS ref pattern para listeners.
- Al reconectar, solicitar estado completo del server (no inferir de eventos perdidos).
- Cross-tab: usar event listener de `storage` para propagar cambios.
- NUNCA destructurar Zustand.

**VALIDACIÓN:**
- [ ] Cambios en un dispositivo visibles en otro en <3s.
- [ ] Sin procesamiento duplicado de eventos.
- [ ] Reconexión sincroniza estado completo.
- [ ] Cross-tab funciona entre pestañas.

---

### PROMPT HU-1003 — Modificar y Eliminar Ítems del Carrito

**ROL:**
Actúa como un desarrollador frontend especializado en operaciones CRUD en carritos compartidos con permisos por usuario.

**CONTEXTO:**
- Solo el comensal que agregó el ítem puede modificarlo o eliminarlo.
- Botones +/- para cambiar cantidad.
- Botón eliminar con confirmación antes de ejecutar.
- Actualización optimista con rollback en error.
- Eventos CART_ITEM_UPDATED y CART_ITEM_REMOVED emitidos.
- Cantidad = 0 elimina automáticamente el ítem.

**TAREA:**
Implementa modificación y eliminación de ítems del carrito con permisos por comensal.

**FORMATO DE SALIDA:**
- Componentes de controles de cantidad y eliminación en cart view.
- Lógica de permisos (solo dueño puede modificar).
- Handlers de eventos WS para UPDATED y REMOVED.

**RESTRICCIONES:**
- Verificar ownership en frontend (comparar diner_id).
- Confirmación visual antes de eliminar.
- Optimistic update con rollback.
- Cantidad 0 = auto-delete.
- i18n en todos los textos.

**VALIDACIÓN:**
- [ ] Solo el dueño puede modificar/eliminar.
- [ ] +/- cambia cantidad correctamente.
- [ ] Eliminar requiere confirmación.
- [ ] Cantidad 0 auto-elimina.
- [ ] Otros comensales ven los cambios.

---

### PROMPT HU-1004 — Confirmación Grupal del Pedido

**ROL:**
Actúa como un desarrollador frontend especializado en flujos de votación en tiempo real y consenso grupal via WebSocket.

**CONTEXTO:**
- Cualquier comensal puede proponer enviar el pedido.
- Panel muestra: proposer, hora de propuesta, estado de confirmación por comensal con color indicator.
- Contador X/Y comensales confirmados, countdown timer (5 minutos de expiración).
- Cada comensal confirma/desconfirma individualmente.
- Proposer puede cancelar manualmente.
- Auto-submit con pausa de 1.5s cuando todos confirman.
- Animación de celebración en envío exitoso.
- Si un comensal se desconecta durante la votación, no bloquea (se cuenta como no confirmado).

**TAREA:**
Implementa el sistema de confirmación grupal del pedido en pwaMenu.

**FORMATO DE SALIDA:**
- Componente `ConfirmationPanel.tsx`.
- Lógica de votación en store o hook.
- Timer de expiración (5min).
- Animación de celebración.

**RESTRICCIONES:**
- Timer de 5 minutos; si expira, cancelar votación.
- Auto-submit con pausa 1.5s al alcanzar unanimidad.
- Desconexión de un comensal no bloquea la votación.
- i18n en todos los textos.
- Accesibilidad: anuncios para screen readers en cambios de estado.

**VALIDACIÓN:**
- [ ] Propuesta visible para todos los comensales.
- [ ] Confirmación individual funciona.
- [ ] Timer de 5 minutos cancela si expira.
- [ ] Auto-submit al 100% de confirmación con pausa 1.5s.
- [ ] Animación de celebración.

---

### PROMPT HU-1005 — Envío de Ronda (Pedido)

**ROL:**
Actúa como un desarrollador full-stack especializado en creación de pedidos con consolidación multi-comensal y eventos en tiempo real.

**CONTEXTO:**
- Los ítems de todos los comensales se combinan en una sola Round.
- Cada RoundItem registra el diner_id de quien lo pidió.
- Estado inicial: PENDING.
- Evento ROUND_PENDING emitido a admin y mozos (NO a cocina).
- El carrito se limpia tras envío exitoso.
- Si falla, se muestra error y se mantiene el carrito.
- Precios capturados al momento del pedido (inmutables, registro histórico).
- Endpoint diner: usa X-Table-Token.

**TAREA:**
Implementa el envío de ronda consolidando ítems de todos los comensales.

**FORMATO DE SALIDA:**
- Endpoint backend para crear round con items.
- Lógica frontend de envío post-confirmación grupal.
- Limpieza de carrito tras éxito.
- Emisión de evento ROUND_PENDING.

**RESTRICCIONES:**
- Crear Round + RoundItems en una sola transacción (atomicidad).
- Capturar precio del producto al momento del pedido (no referencia al precio actual).
- ROUND_PENDING: emitir a `branch:{id}:waiters` + `branch:{id}:admin`, NO a kitchen.
- Limpiar carrito solo si el server confirma éxito.
- Si la mesa está en estado OUT_OF_SERVICE, rechazar (409).

**VALIDACIÓN:**
- [ ] Round creada con todos los items de todos los comensales.
- [ ] Cada item tiene diner_id correcto.
- [ ] Precio capturado al momento (no referencia).
- [ ] Evento ROUND_PENDING emitido a mozos y admin, no a cocina.
- [ ] Carrito limpio tras éxito.

---

## E11 — Ciclo de Vida de Rondas

---

### PROMPT HU-1101 — Mozo Confirma Pedido (PENDING → CONFIRMED)

**ROL:**
Actúa como un desarrollador full-stack especializado en transiciones de estado con validación de roles y eventos en tiempo real.

**CONTEXTO:**
- El mozo revisa físicamente el pedido en la mesa y confirma.
- Transición: PENDING → CONFIRMED (solo WAITER puede ejecutar).
- Evento ROUND_CONFIRMED emitido a admin y mozos del sector.
- Cocina NO ve rondas PENDING ni CONFIRMED.
- pwaWaiter muestra botón "Confirmar Pedido" en rondas PENDING del detalle de mesa.
- Badge de estado cambia a azul "Confirmado".

**TAREA:**
Implementa la transición PENDING → CONFIRMED con el botón en pwaWaiter.

**FORMATO DE SALIDA:**
- Endpoint backend: `PATCH /api/waiter/rounds/{id}/confirm`.
- Botón en pwaWaiter `TableDetailModal`.
- Emisión de evento ROUND_CONFIRMED.

**RESTRICCIONES:**
- Solo rondas en estado PENDING pueden confirmarse.
- Solo rol WAITER (o ADMIN/MANAGER).
- ROUND_CONFIRMED va a `branch:{id}:admin` + `sector:{id}:waiters`.
- NO emitir a cocina ni a comensales.
- Usar `with_for_update()` para prevenir race condition.

**VALIDACIÓN:**
- [ ] PENDING → CONFIRMED exitoso.
- [ ] Ronda en otro estado → 409.
- [ ] Evento emitido a admin y mozos, no a cocina.
- [ ] Badge cambia a azul en pwaWaiter.

---

### PROMPT HU-1102 — Admin/Manager Envía a Cocina (CONFIRMED → SUBMITTED)

**ROL:**
Actúa como un desarrollador full-stack especializado en transiciones críticas con Outbox pattern y generación de tickets de cocina.

**CONTEXTO:**
- Solo ADMIN/MANAGER puede enviar a cocina.
- Transición: CONFIRMED → SUBMITTED.
- Al hacer SUBMITTED: se genera KitchenTicket asociado a la ronda.
- Evento ROUND_SUBMITTED emitido via Outbox pattern (entrega garantizada) a admin, cocina y mozos.
- A partir de SUBMITTED, la cocina ve la ronda.
- Dashboard muestra rondas CONFIRMED con botón "Enviar a Cocina".

**TAREA:**
Implementa la transición CONFIRMED → SUBMITTED con generación de KitchenTicket y Outbox.

**FORMATO DE SALIDA:**
- Endpoint backend: `PATCH /api/admin/rounds/{id}/submit`.
- Generación de KitchenTicket en misma transacción.
- Outbox event para ROUND_SUBMITTED.
- Botón en Dashboard.

**RESTRICCIONES:**
- Solo ADMIN/MANAGER (require_management()).
- ROUND_SUBMITTED via Outbox: `write_billing_outbox_event()` (mal llamado pero es el mismo patrón).
- KitchenTicket creado atómicamente con la transición.
- Evento va a: `branch:{id}:admin` + `branch:{id}:kitchen` + `branch:{id}:waiters`.
- `with_for_update()` para prevenir race condition.
- `safe_commit()` para transacción segura.

**VALIDACIÓN:**
- [ ] CONFIRMED → SUBMITTED exitoso.
- [ ] KitchenTicket creado en misma transacción.
- [ ] Evento emitido via Outbox a admin, cocina y mozos.
- [ ] Solo ADMIN/MANAGER pueden ejecutar.

---

### PROMPT HU-1103 — Cocina Inicia Preparación (SUBMITTED → IN_KITCHEN)

**ROL:**
Actúa como un desarrollador backend especializado en operaciones de cocina y endpoints con rol KITCHEN.

**CONTEXTO:**
- Personal de cocina marca que comenzó a preparar.
- Transición: SUBMITTED → IN_KITCHEN.
- Evento ROUND_IN_KITCHEN emitido a todos incluyendo comensales.
- Endpoint bajo `/api/kitchen/*` con JWT + rol KITCHEN.
- Timestamp de inicio registrado.
- Routing: admin + kitchen + waiters + session (diners).

**TAREA:**
Implementa la transición SUBMITTED → IN_KITCHEN.

**FORMATO DE SALIDA:**
- Endpoint: `PATCH /api/kitchen/rounds/{id}/start`.
- Emisión de evento.
- Timestamp registrado.

**RESTRICCIONES:**
- Solo rol KITCHEN (o ADMIN/MANAGER).
- Solo rondas SUBMITTED.
- Evento a TODOS los canales (incluyendo session para diners).
- Registrar timestamp de inicio para métricas de tiempo de cocina.

**VALIDACIÓN:**
- [ ] SUBMITTED → IN_KITCHEN exitoso.
- [ ] Evento emitido a todos incluyendo comensales.
- [ ] Timestamp de inicio registrado.

---

### PROMPT HU-1104 — Cocina Marca como Listo (IN_KITCHEN → READY)

**ROL:**
Actúa como un desarrollador full-stack especializado en notificaciones urgentes y Outbox pattern para eventos críticos.

**CONTEXTO:**
- Cocina marca pedido listo para servir.
- Transición: IN_KITCHEN → READY.
- Evento ROUND_READY emitido via Outbox pattern (entrega garantizada).
- Mozo recibe: notificación push con sonido, alerta verde pulsante "¡Pedido listo! Recoger en cocina".
- Card de mesa: animación naranja pulsante (5s) si hay ítems ready + ítems still cooking (ready_with_kitchen).
- Comensal en pwaMenu ve cambio de estado a "Listo".

**TAREA:**
Implementa READY con Outbox, notificaciones al mozo y alertas visuales.

**FORMATO DE SALIDA:**
- Endpoint: `PATCH /api/kitchen/rounds/{id}/ready`.
- Outbox event ROUND_READY.
- Handler en pwaWaiter para mostrar alerta.
- Handler en pwaMenu para actualizar estado.

**RESTRICCIONES:**
- ROUND_READY via Outbox (entrega garantizada).
- Notificación push con sonido al mozo.
- Animación naranja 5s en card de mesa.
- Banner verde pulsante en detalle de mesa.
- Timestamp de fin de cocina para métricas.

**VALIDACIÓN:**
- [ ] IN_KITCHEN → READY exitoso.
- [ ] Evento via Outbox (garantizado).
- [ ] Mozo recibe notificación con sonido.
- [ ] Card muestra animación naranja.
- [ ] Comensal ve estado "Listo".

---

### PROMPT HU-1105 — Staff Marca como Servido (READY → SERVED)

**ROL:**
Actúa como un desarrollador full-stack especializado en operaciones con cola de reintentos offline y confirmación de usuario.

**CONTEXTO:**
- Mozo o personal marca que entregó el pedido a la mesa.
- Transición: READY → SERVED.
- Evento ROUND_SERVED emitido.
- Badge cambia a gris "Servido", animaciones de alerta se detienen.
- Si la operación falla por desconexión, se encola en RetryQueueStore de pwaWaiter.
- Botón requiere confirmación antes de ejecutar.

**TAREA:**
Implementa READY → SERVED con cola de reintentos offline.

**FORMATO DE SALIDA:**
- Endpoint: `PATCH /api/waiter/rounds/{id}/serve`.
- Botón con confirmación en pwaWaiter.
- Integración con RetryQueueStore para offline.

**RESTRICCIONES:**
- Confirmación requerida antes de ejecutar.
- Si falla por desconexión, encolar para reintento (RetryQueueStore).
- Máximo 3 reintentos por acción.
- Evento a todos los canales.

**VALIDACIÓN:**
- [ ] READY → SERVED exitoso.
- [ ] Confirmación antes de ejecutar.
- [ ] Operación encolada si está offline.
- [ ] Badge cambia a gris "Servido".

---

### PROMPT HU-1106 — Cancelar Ronda

**ROL:**
Actúa como un desarrollador backend especializado en cancelaciones con propagación de eventos y auditoría.

**CONTEXTO:**
- Solo rondas PENDING, CONFIRMED o SUBMITTED pueden cancelarse.
- Evento ROUND_CANCELED llega a mozo, cocina (si era SUBMITTED) y comensal.
- Ítems cancelados NO se incluyen en cálculo de cuenta.
- Motivo de cancelación se registra en log de auditoría.
- Solo WAITER, ADMIN o MANAGER pueden cancelar.

**TAREA:**
Implementa la cancelación de ronda con propagación completa.

**FORMATO DE SALIDA:**
- Endpoint: `PATCH /api/waiter/rounds/{id}/cancel`.
- Auditoría del motivo.
- Emisión de evento a canales correspondientes según estado anterior.

**RESTRICCIONES:**
- No cancelar rondas IN_KITCHEN, READY o SERVED.
- Si era SUBMITTED, notificar también a cocina.
- Motivo de cancelación obligatorio.
- Ítems cancelados excluidos de billing.

**VALIDACIÓN:**
- [ ] Solo PENDING/CONFIRMED/SUBMITTED cancelable.
- [ ] IN_KITCHEN/READY/SERVED → 409.
- [ ] Evento emitido a canales correctos.
- [ ] Motivo registrado en auditoría.

---

### PROMPT HU-1107 — Eliminar Ítem de Ronda

**ROL:**
Actúa como un desarrollador backend especializado en operaciones parciales sobre pedidos con limpieza automática.

**CONTEXTO:**
- Solo en rondas PENDING o CONFIRMED.
- Ícono de papelera por cada ítem en pwaWaiter.
- Diálogo de confirmación antes de eliminar.
- Si la ronda queda vacía tras eliminar, se elimina automáticamente.
- Evento ROUND_ITEM_DELETED emitido.
- Endpoint: DELETE del ítem específico.

**TAREA:**
Implementa la eliminación de ítems individuales de una ronda.

**FORMATO DE SALIDA:**
- Endpoint: `DELETE /api/waiter/rounds/{round_id}/items/{item_id}`.
- Lógica de auto-eliminar ronda vacía.
- UI en pwaWaiter con confirmación.

**RESTRICCIONES:**
- Solo PENDING o CONFIRMED.
- Verificar que el ítem pertenece a la ronda.
- Auto-eliminar ronda si queda vacía.
- Confirmación en UI antes de ejecutar.

**VALIDACIÓN:**
- [ ] Ítem eliminado de ronda PENDING/CONFIRMED.
- [ ] Ronda vacía se auto-elimina.
- [ ] Ronda en otro estado → 409.
- [ ] Evento ROUND_ITEM_DELETED emitido.

---

### PROMPT HU-1108 — Vista de Rondas con Filtros

**ROL:**
Actúa como un desarrollador frontend especializado en tabs de filtrado y visualización de datos categorizados en React 19.

**CONTEXTO:**
- En TableDetailModal de pwaWaiter, rondas se filtran por tabs.
- Tabs: "Todos" (todas), "Pendientes" (PENDING, CONFIRMED, SUBMITTED, IN_KITCHEN), "Listos" (READY), "Servidos" (SERVED).
- Cada tab muestra contador con cantidad de rondas.
- UI en español, tema naranja (#f97316).

**TAREA:**
Implementa los tabs de filtrado de rondas en el detalle de mesa.

**FORMATO DE SALIDA:**
- Componente `RoundFilterTabs.tsx` en pwaWaiter.
- Lógica de filtrado por estado.

**RESTRICCIONES:**
- Zustand con selectores, NUNCA destructurar.
- `useShallow` para arrays filtrados.
- Contadores actualizados en tiempo real.
- "Pendientes" agrupa 4 estados.

**VALIDACIÓN:**
- [ ] 4 tabs con contadores correctos.
- [ ] Filtrado funciona al cambiar de tab.
- [ ] Contadores se actualizan en tiempo real con eventos WS.

---

## E12 — Operaciones del Mozo

---

### PROMPT HU-1201 — Selección de Sucursal Pre-Login

**ROL:**
Actúa como un desarrollador frontend especializado en flujos de onboarding pre-autenticación en PWAs móviles.

**CONTEXTO:**
- pwaWaiter: primera pantalla es PreLoginBranchSelect, ANTES del login.
- Lista de sucursales obtenida de `GET /api/public/branches` (sin auth, endpoint público).
- Al seleccionar, se almacena `preLoginBranchId` y `preLoginBranchName` en authStore.
- Botón continuar lleva a login. Nombre de sucursal visible durante login.
- Botón "Cambiar" en login permite volver a seleccionar.
- UI en español, tema naranja (#f97316), botones rectangulares.

**TAREA:**
Implementa la pantalla de selección de sucursal pre-login.

**FORMATO DE SALIDA:**
- Página `PreLoginBranchSelect.tsx` en pwaWaiter.
- Integración con authStore.
- Llamada a API pública de branches.

**RESTRICCIONES:**
- NO requiere autenticación (endpoint público).
- Zustand con selectores.
- Botones rectangulares, no redondeados.
- Logger centralizado.
- Manejar error de red (mostrar mensaje de reconexión).

**VALIDACIÓN:**
- [ ] Lista de sucursales carga sin auth.
- [ ] Selección persiste en authStore.
- [ ] Botón "Cambiar" en login funciona.
- [ ] Error de red manejado.

---

### PROMPT HU-1202 — Login del Mozo

**ROL:**
Actúa como un desarrollador frontend especializado en formularios de autenticación con verificación post-login y refresh proactivo de tokens.

**CONTEXTO:**
- Formulario con email y contraseña.
- Muestra sucursal seleccionada con botón "Cambiar".
- Tras login exitoso: llama a verify-branch-assignment.
- Si no asignado → "Acceso Denegado". Si asignado → MainPage.
- Token refresh proactivo cada 14 minutos.
- authStore: `assignmentVerified`, `selectedBranchId`, JWT tokens.
- Credenciales de prueba: `waiter@demo.com`/`waiter123`, `ana@demo.com`/`ana123`.

**TAREA:**
Implementa el flujo de login del mozo con verificación de asignación post-login.

**FORMATO DE SALIDA:**
- Página `Login.tsx` en pwaWaiter.
- Store `authStore.ts` con lógica de login + verify.
- Refresh proactivo con setInterval 14min.

**RESTRICCIONES:**
- Credentials: `include` en fetch para cookies.
- Refresh proactivo cada 14 min (clearInterval en unmount).
- Si verify falla → mostrar "Acceso Denegado", NO redirigir a login.
- Guard `isMounted` en efectos async.

**VALIDACIÓN:**
- [ ] Login exitoso + verify asignación funciona.
- [ ] "Acceso Denegado" si no asignado.
- [ ] Refresh proactivo cada 14 min.
- [ ] "Cambiar" sucursal vuelve a PreLoginBranchSelect.

---

### PROMPT HU-1203 — Grilla de Mesas por Sector

**ROL:**
Actúa como un desarrollador frontend senior especializado en grillas responsivas con agrupación jerárquica y actualizaciones en tiempo real.

**CONTEXTO:**
- Mesas agrupadas por sector (ej: "Interior", "Terraza").
- Header de sector: nombre, badge con cantidad de mesas, indicador rojo pulsante si tiene mesas urgentes.
- Cards con colores por estado: verde (FREE), rojo (ACTIVE), púrpura (PAYING), gris (OUT_OF_SERVICE).
- Filtros: Urgentes, Activas, Libres, Fuera de servicio.
- Actualización en tiempo real via WebSocket `/ws/waiter?token=JWT`.
- Sector-based filtering: mozo solo ve eventos de sus sectores asignados (ADMIN/MANAGER ven todo).
- Eventos manejados: TABLE_SESSION_STARTED, TABLE_STATUS_CHANGED, TABLE_CLEARED, ROUND_*, SERVICE_CALL_*, CHECK_*.
- 4 mecanismos de actualización: WS events (primario), auto-refresh 60s (reconciliación), botón manual (floating), pull-to-refresh (80px swipe).

**TAREA:**
Implementa la grilla de mesas agrupada por sector con filtros y tiempo real.

**FORMATO DE SALIDA:**
- Página `TableGrid.tsx` en pwaWaiter.
- Componente `SectorGroup.tsx`.
- Componente `TableCard.tsx`.
- Store `tablesStore.ts` con handlers de eventos WS.

**RESTRICCIONES:**
- Zustand con selectores, NUNCA destructurar.
- WS ref pattern para listeners.
- `useShallow` para arrays filtrados.
- 4 mecanismos de actualización implementados.
- Guard `isMounted` en efectos async.
- Logger centralizado.
- Botones rectangulares.

**VALIDACIÓN:**
- [ ] Mesas agrupadas por sector.
- [ ] Filtros funcionan (Urgentes, Activas, Libres, Fuera de servicio).
- [ ] Actualizaciones WS en tiempo real.
- [ ] Auto-refresh 60s como reconciliación.
- [ ] Pull-to-refresh funcional.

---

### PROMPT HU-1204 — Card de Mesa con Animaciones

**ROL:**
Actúa como un desarrollador frontend especializado en animaciones CSS con sistema de prioridades y badges informativos.

**CONTEXTO:**
Prioridad de animaciones (solo se muestra la de mayor prioridad):
1. Llamado de servicio: parpadeo rojo (3s) — captura atención inmediata.
2. Pedido listo parcial (ready_with_kitchen): parpadeo naranja (5s) — visitar cocina.
3. Cambio de estado: parpadeo azul (1.5s) — sesión iniciada, pedido confirmado.
4. Nuevo pedido: pulso amarillo (2s) — pedido recibido.
5. Cuenta solicitada: pulso púrpura — continuo.

Badges: naranja (N rondas abiertas), rojo (N llamados servicio), púrpura (cuenta solicitada).
Status badge del pedido: Pendiente (amarillo), Confirmado (azul), En Cocina (azul), Listo+Cocina (naranja), Listo (verde), Servido (gris).

**TAREA:**
Implementa las cards de mesa con sistema de animaciones por prioridad y badges.

**FORMATO DE SALIDA:**
- Componente `TableCard.tsx` con animaciones CSS.
- CSS/module para animaciones (keyframes).
- Lógica de prioridad de animaciones.

**RESTRICCIONES:**
- Solo una animación activa a la vez (la de mayor prioridad).
- Animaciones con CSS keyframes, no JavaScript intervals.
- Badges no interfieren con animaciones.
- Colores de estado exactos como documentado.
- Performance: evitar re-renders innecesarios.

**VALIDACIÓN:**
- [ ] 5 animaciones con prioridad correcta.
- [ ] Solo una activa a la vez.
- [ ] Badges de rondas, llamados y cuenta.
- [ ] Status badge con colores correctos.

---

### PROMPT HU-1205 — Detalle de Mesa

**ROL:**
Actúa como un desarrollador frontend senior especializado en modales de detalle con múltiples secciones interactivas y acciones contextuales.

**CONTEXTO:**
- Modal/pantalla con info completa de la mesa.
- Header: código de mesa, indicador de estado.
- Resumen: rondas pendientes, llamados activos, total acumulado.
- Sección de llamados: banner rojo con contador + botón "Atender" (verde al aknowledgear).
- Alerta de pedidos listos: banner verde pulsante.
- Tabs de rondas: Todos/Pendientes/Listos/Servidos.
- Detalle de ronda: número secuencial, estado con color, items con color del comensal, producto, categoría, cantidad, precio unitario.
- Acciones por ronda: eliminar items (PENDING/CONFIRMED), marcar servido (READY), confirmar pedido (PENDING).

**TAREA:**
Implementa el detalle completo de mesa en pwaWaiter.

**FORMATO DE SALIDA:**
- Componente `TableDetailModal.tsx`.
- Sub-componentes: `ServiceCallBanner`, `ReadyAlert`, `RoundList`, `RoundDetail`.
- Integración con API y WS.

**RESTRICCIONES:**
- Accesibilidad: modal como dialog con aria labels.
- Escape cierra modal.
- Acciones requieren confirmación.
- Precios mostrados en formato local (centavos → pesos).
- Logger centralizado.

**VALIDACIÓN:**
- [ ] Muestra resumen, llamados, rondas con filtros.
- [ ] Acciones contextuales por estado de ronda.
- [ ] Banner rojo de llamados activos.
- [ ] Banner verde de pedidos listos.
- [ ] Precios formateados correctamente.

---

### PROMPT HU-1206 — Comanda Rápida

**ROL:**
Actúa como un desarrollador frontend especializado en interfaces de toma de pedidos rápidos con búsqueda y carrito local para dispositivos móviles.

**CONTEXTO:**
- Para clientes sin teléfono (menú de papel).
- Menú compacto sin imágenes: `GET /api/waiter/branches/{id}/menu`.
- Interfaz split-view: izquierda (categorías + búsqueda + lista de productos: nombre+descripción+precio), derecha (carrito con controles de cantidad, precios, total, botones limpiar/enviar).
- Envío via `waiterTableAPI.submitRound(sessionId, { items })`.
- Crea ronda como PENDING.
- También disponible desde dentro del detalle de mesa (ComandaTab).

**TAREA:**
Implementa la comanda rápida como tab en detalle de mesa y como modal en autogestión.

**FORMATO DE SALIDA:**
- Componente `ComandaTab.tsx` (dentro de TableDetailModal).
- API call a menú compacto y submit round.
- Carrito local con controles de cantidad.

**RESTRICCIONES:**
- Menú sin imágenes (compacto, solo texto).
- Carrito es LOCAL (no compartido via WS como en pwaMenu).
- Búsqueda client-side con debounce.
- Precio en centavos → mostrar como pesos.
- Confirmación visual tras envío exitoso con auto-close 1.5s.

**VALIDACIÓN:**
- [ ] Menú compacto carga sin imágenes.
- [ ] Búsqueda funciona con debounce.
- [ ] Carrito local con +/- y total.
- [ ] Envío crea ronda PENDING.
- [ ] Funciona desde detalle de mesa y autogestión.

---

### PROMPT HU-1207 — Gestión de Llamados de Servicio

**ROL:**
Actúa como un desarrollador full-stack especializado en notificaciones urgentes con alertas sonoras, animaciones y resolución de incidencias.

**CONTEXTO:**
- Comensal llama al mozo desde pwaMenu (botón "Llamar mozo").
- Tipos: refill de bebida, solicitud de cuenta, queja, otro.
- Estados: active → acknowledged → resolved.
- Evento SERVICE_CALL_CREATED emitido via Outbox (entrega garantizada) a sector waiters + admin.
- pwaWaiter: parpadeo rojo en card (3s), sonido de alerta, badge rojo con contador, notificación push persistente.
- Deduplicación: track IDs únicos de llamados (max 100 entries).
- Acknowledge: botón en detalle de mesa, cambia a verde.
- Resolve: cierra el caso tras atender.
- Endpoints: `POST /waiter/service-calls/{id}/acknowledge`, `POST /waiter/service-calls/{id}/resolve`.

**TAREA:**
Implementa la gestión completa de llamados de servicio: creación, notificación, acknowledge y resolución.

**FORMATO DE SALIDA:**
- Endpoints backend para acknowledge y resolve.
- Endpoint diner para crear service call.
- Handlers WS en pwaWaiter.
- UI de llamados en pwaWaiter.
- Botón "Llamar mozo" en pwaMenu.

**RESTRICCIONES:**
- SERVICE_CALL_CREATED via Outbox (garantizado).
- Sonido de alerta independiente de permisos de notificación.
- Deduplicación de IDs de llamados (máx 100).
- Cooldown de 5 segundos entre notificaciones.
- El comensal no puede crear otro llamado mientras tiene uno activo.

**VALIDACIÓN:**
- [ ] Creación emite evento via Outbox.
- [ ] Mozo recibe parpadeo rojo + sonido + notificación.
- [ ] Acknowledge cambia a verde.
- [ ] Resolve cierra el caso y decrementa contador.
- [ ] Deduplicación evita procesamiento duplicado.

---

### PROMPT HU-1208 — Autogestión de Mesas

**ROL:**
Actúa como un desarrollador frontend senior especializado en flujos completos de gestión de mesa (activación → pedido → pago → cierre) en interfaces móviles.

**CONTEXTO:**
- Tab "Autogestión" en MainPage abre AutogestionModal.
- Flujo completo para gestión tradicional (sin celular del cliente):
  1. Seleccionar mesa (FREE o ACTIVE).
  2. FREE: ingresar cantidad de comensales → `waiterTableAPI.activateTable(tableId, { diner_count })` crea sesión.
  3. ACTIVE: usa sesión existente.
  4. Split-view: izquierda (menú con búsqueda/categorías), derecha (carrito).
  5. Enviar ronda: `waiterTableAPI.submitRound(sessionId, { items })`.
  6. Solicitar cuenta: `waiterTableAPI.requestCheck(sessionId)`.
  7. Registrar pago: `waiterTableAPI.registerManualPayment({ check_id, amount_cents, manual_method })`.
  8. Cerrar mesa: `waiterTableAPI.closeTable(tableId)`.
- Métodos de pago manual: cash, card, transfer, other.

**TAREA:**
Implementa el flujo completo de autogestión de mesas en pwaWaiter.

**FORMATO DE SALIDA:**
- Componente `AutogestionModal.tsx` con flujo paso a paso.
- API calls para cada operación del flujo.
- Integración con tablesStore.

**RESTRICCIONES:**
- Solo mesas FREE y ACTIVE seleccionables.
- Validar diner_count > 0 para mesa FREE.
- Método de pago obligatorio al registrar pago.
- Cerrar mesa solo si saldo pendiente = 0.
- Logger centralizado.
- Botones rectangulares.
- Zustand con selectores.

**VALIDACIÓN:**
- [ ] Activar mesa FREE crea sesión.
- [ ] Tomar pedido y enviar ronda.
- [ ] Solicitar cuenta.
- [ ] Registrar pago manual.
- [ ] Cerrar mesa y liberar.
- [ ] Flujo completo E2E.

---

## E13 — Cocina

---

### PROMPT HU-1301 — Vista de Tickets de Cocina

**ROL:**
Actúa como un desarrollador frontend senior especializado en interfaces touch-friendly para entornos de cocina con actualizaciones en tiempo real.

**CONTEXTO:**
- Dashboard muestra vista de cocina para usuarios con rol KITCHEN.
- Solo muestra rondas SUBMITTED, IN_KITCHEN y READY (no PENDING ni CONFIRMED).
- Tickets ordenados por antigüedad (FIFO).
- Cada ticket muestra: número de mesa, ítems con cantidades, notas especiales, tiempo transcurrido desde creación.
- Actualización en tiempo real via WebSocket `/ws/kitchen?token=JWT`.
- Eventos: ROUND_SUBMITTED (nuevo ticket), ROUND_IN_KITCHEN (cambia columna), ROUND_READY (cambia columna), ROUND_SERVED (se retira).
- Vista en 3 columnas: Nuevos (SUBMITTED) | En Preparación (IN_KITCHEN) | Listos (READY).
- Interfaz touch-friendly para uso con manos húmedas/enguantadas.
- Endpoints: `/api/kitchen/*` con JWT + rol KITCHEN.

**TAREA:**
Implementa la vista de cocina con tickets en 3 columnas y tiempo real.

**FORMATO DE SALIDA:**
- Página `KitchenPage.tsx` en Dashboard.
- Componentes: `TicketColumn.tsx`, `KitchenTicket.tsx`.
- Store: `kitchenStore.ts`.
- Handlers WS para eventos de cocina.

**RESTRICCIONES:**
- Solo rol KITCHEN, MANAGER o ADMIN accede.
- Touch targets grandes (mínimo 48x48px para cocina).
- Timer en cada ticket mostrando tiempo transcurrido.
- WS ref pattern para listeners.
- Zustand con selectores.
- FIFO: tickets más antiguos primero.

**VALIDACIÓN:**
- [ ] 3 columnas: Nuevos, En Preparación, Listos.
- [ ] Solo rondas SUBMITTED+ visibles.
- [ ] Timer de tiempo transcurrido.
- [ ] Touch-friendly (targets grandes).
- [ ] Actualizaciones WS en tiempo real.

---

### PROMPT HU-1302 — Cambio de Estado en Cocina

**ROL:**
Actúa como un desarrollador frontend especializado en transiciones de estado con feedback táctil para interfaces de cocina.

**CONTEXTO:**
- Dos transiciones disponibles en cocina:
  - SUBMITTED → IN_KITCHEN: botón "Iniciar Preparación".
  - IN_KITCHEN → READY: botón "Listo para Servir".
- No puede saltear estados (SUBMITTED no puede ir directo a READY).
- Cada transición emite evento WS correspondiente.
- Interfaz touch-friendly con feedback visual (cambio de color, animación de confirmación).
- El ticket se mueve de columna tras la transición.

**TAREA:**
Implementa los botones de cambio de estado en los tickets de cocina.

**FORMATO DE SALIDA:**
- Acciones en `KitchenTicket.tsx`.
- API calls a endpoints de cocina.
- Feedback visual tras cada transición.

**RESTRICCIONES:**
- No permitir saltar estados.
- Feedback visual inmediato (optimistic update en columna).
- Touch-friendly (botones grandes).
- Confirmación para "Listo" (READY es irreversible).
- Deshabilitar botón durante request (prevenir doble-click).

**VALIDACIÓN:**
- [ ] SUBMITTED → IN_KITCHEN funciona.
- [ ] IN_KITCHEN → READY funciona.
- [ ] No permite saltar estados.
- [ ] Feedback visual inmediato.
- [ ] Prevención de doble-click.

---

### PROMPT HU-1303 — Kitchen Tickets (KitchenTicket)

**ROL:**
Actúa como un desarrollador backend especializado en fragmentación de pedidos por estación de cocina y trazabilidad de preparación.

**CONTEXTO:**
- Modelo KitchenTicket: round_id, branch_id, status, timestamps (created_at, started_at, ready_at).
- KitchenTicketItem: ticket_id, round_item_id, product_id, quantity, notes.
- Se crea al hacer SUBMITTED (HU-1102).
- Cada ticket vinculado a Round y Branch.
- Historial de estado completo para métricas de tiempo de preparación.
- Potencial fragmentación por estación de preparación (si productos tienen estación asignada).

**TAREA:**
Implementa el modelo y la generación automática de KitchenTickets al enviar ronda a cocina.

**FORMATO DE SALIDA:**
- Modelos: KitchenTicket, KitchenTicketItem.
- Lógica de generación en transición CONFIRMED → SUBMITTED.
- Timestamps por cada cambio de estado.

**RESTRICCIONES:**
- Crear ticket atómicamente con la transición de ronda (misma transacción).
- Registrar timestamps: created_at, started_at (IN_KITCHEN), ready_at (READY).
- Si un producto tiene estación, fragmentar en tickets separados por estación.
- Si no hay estaciones, un solo ticket por ronda.

**VALIDACIÓN:**
- [ ] Ticket creado al hacer SUBMITTED.
- [ ] Timestamps registrados en cada transición.
- [ ] Fragmentación por estación si aplica.
- [ ] Historial completo para métricas.

---

## E14 — Facturación y Pagos

---

### PROMPT HU-1401 — Solicitar Cuenta

**ROL:**
Actúa como un desarrollador full-stack senior especializado en operaciones financieras con Outbox pattern y protección contra race conditions.

**CONTEXTO:**
- Comensal presiona "Pedir la cuenta" en pwaMenu.
- Se crea Check (tabla `app_check`) con desglose de consumo.
- Mesa transiciona a estado PAYING.
- Evento CHECK_REQUESTED emitido via Outbox pattern (entrega garantizada).
- Mozo recibe notificación: pulso púrpura en card de mesa + sonido.
- Dashboard muestra mesa en estado PAYING.
- CRÍTICO: el comensal puede seguir pidiendo durante estado PAYING.
- Rate limiting: 10 solicitudes de cuenta por minuto.
- `with_for_update()` para prevenir race condition al crear check.

**TAREA:**
Implementa la solicitud de cuenta con Outbox y transición de estado de mesa.

**FORMATO DE SALIDA:**
- Endpoint: `POST /api/diner/check/request` o equivalente.
- Modelo Check con charges.
- Outbox event CHECK_REQUESTED.
- Handler en pwaWaiter para notificación.
- Botón en pwaMenu.

**RESTRICCIONES:**
- Gobernanza CRITICO: requiere revisión humana.
- CHECK_REQUESTED via Outbox (garantizado).
- `with_for_update()` al crear check.
- `safe_commit()` para atomicidad.
- Rate limiting: 10/min.
- No bloquear pedidos durante PAYING.
- Precios en centavos.

**VALIDACIÓN:**
- [ ] Check creado con charges correctos.
- [ ] Mesa pasa a PAYING.
- [ ] Evento via Outbox garantizado.
- [ ] Mozo recibe pulso púrpura + sonido.
- [ ] Comensal puede seguir pidiendo.
- [ ] Race condition prevenida.

---

### PROMPT HU-1402 — Generación de Cuenta con Cargos

**ROL:**
Actúa como un desarrollador backend especializado en cálculos financieros precisos con centavos y generación automática de cargos.

**CONTEXTO:**
- Check contiene lista de Charges (uno por ítem consumido en rondas no canceladas).
- Charge: product_id, product_name, quantity, unit_price_cents, subtotal_cents.
- Solo items de rondas con estado != CANCELED.
- Total = suma de subtotals de todos los charges.
- Propina se aplica sobre el total y se distribuye proporcionalmente.
- Modelo: Check → Charge (1:N), Check → Payment (1:N).
- Allocation (FIFO): vincula pagos con cargos secuencialmente.

**TAREA:**
Implementa la generación automática de cargos al crear la cuenta.

**FORMATO DE SALIDA:**
- Lógica de generación de charges en billing service.
- Cálculo de totales y subtotales.
- Algoritmo FIFO de allocation.

**RESTRICCIONES:**
- Gobernanza CRITICO.
- SOLO Integer para todos los montos (centavos).
- Excluir ítems de rondas CANCELED.
- Propina como porcentaje sobre total, calculada en centavos.
- FIFO allocation: primer pago cubre primeros charges.

**VALIDACIÓN:**
- [ ] Charges generados para todos los ítems no cancelados.
- [ ] Subtotales = quantity * unit_price_cents.
- [ ] Total = sum de subtotales.
- [ ] FIFO allocation vincula pagos con charges.

---

### PROMPT HU-1403 — División de Cuenta

**ROL:**
Actúa como un desarrollador full-stack especializado en algoritmos de división de cuentas con múltiples métodos y validación de totales.

**CONTEXTO:**
- 3 métodos de división: igualitario, por consumo, personalizado.
- Igualitario: total / N comensales (redondeo al centavo, ajustar residuo en último comensal).
- Por consumo: cada comensal paga exactamente lo que pidió (usar diner_id en RoundItem).
- Personalizado: montos manuales, validar que la suma = total.
- Propina: presets 0%, 10%, 15%, 20% o custom, distribuida proporcionalmente.
- pwaMenu muestra 3 tabs: Resumen de Pago, Historial de Pedidos, Desglose Individual.

**TAREA:**
Implementa la división de cuenta con 3 métodos y propina.

**FORMATO DE SALIDA:**
- Lógica de cálculo en backend (billing service).
- UI en pwaMenu con 3 tabs.
- Selector de propina.

**RESTRICCIONES:**
- Gobernanza CRITICO.
- TODOS los montos en centavos (Integer).
- Redondeo: siempre al centavo, residuo en último comensal.
- Validar que suma de partes = total + propina.
- i18n en todos los textos (pwaMenu).

**VALIDACIÓN:**
- [ ] División igualitaria correcta con redondeo.
- [ ] División por consumo usa diner_id.
- [ ] División personalizada valida suma = total.
- [ ] Propina calculada y distribuida.
- [ ] Todos los montos en centavos.

---

### PROMPT HU-1404 — Pago con Mercado Pago

**ROL:**
Actúa como un desarrollador full-stack senior especializado en integración con pasarelas de pago (Mercado Pago), webhooks y patrones de resiliencia.

**CONTEXTO:**
- Integración con API de Mercado Pago para pagos digitales.
- Flujo: generar preferencia → redirigir a MP → webhook de confirmación → actualizar estado.
- Webhook valida firma, retry con backoff exponencial (máx 5 intentos).
- Circuit breaker: 5 fallos consecutivos → open → 30s timeout → 3 test calls.
- Evento PAYMENT_APPROVED o PAYMENT_REJECTED emitido via Outbox.
- Modo mock en desarrollo (simular pago sin MP real).
- Rate limiting: 5 operaciones MP por minuto.
- Payment registrado atómicamente con Outbox event.

**TAREA:**
Implementa la integración completa con Mercado Pago.

**FORMATO DE SALIDA:**
- `rest_api/services/billing/mercado_pago.py` — integración con API de MP.
- Endpoint para crear preferencia.
- Endpoint webhook para recibir notificaciones.
- Circuit breaker para llamadas a MP.
- Mock mode para desarrollo.
- UI en pwaMenu para seleccionar MP y ver resultado.

**RESTRICCIONES:**
- Gobernanza CRITICO.
- Webhook: validar firma antes de procesar.
- Payment + Outbox event en misma transacción (atomicidad).
- Circuit breaker con 3 estados.
- Rate limiting: 5/min.
- Mock mode: `ENVIRONMENT != production` puede simular pagos.
- NUNCA loguear datos de tarjeta o credenciales de MP.

**VALIDACIÓN:**
- [ ] Preferencia de MP generada con monto correcto.
- [ ] Webhook procesa aprobación y rechazo.
- [ ] Circuit breaker funciona (open tras 5 fallos).
- [ ] Evento via Outbox (garantizado).
- [ ] Mock mode funcional en desarrollo.

---

### PROMPT HU-1405 — Pago en Efectivo/Manual

**ROL:**
Actúa como un desarrollador full-stack especializado en registro de pagos manuales con validación de montos y protección contra race conditions.

**CONTEXTO:**
- Endpoint: `POST /api/waiter/payments/manual`.
- Acepta: check_id, amount_cents, manual_method (cash, card, transfer, other).
- Validar que amount_cents no excede saldo pendiente del check.
- Usar `with_for_update()` para lock exclusivo durante registro.
- Evento PAYMENT_APPROVED emitido al registrar.
- Si cubre total, marcar Check como PAID.
- Disponible en pwaWaiter (autogestión) y Dashboard.
- Rate limiting: 20/min.

**TAREA:**
Implementa el registro de pagos manuales por el mozo.

**FORMATO DE SALIDA:**
- Endpoint en `rest_api/routers/waiter.py`.
- Lógica de billing service.
- UI en pwaWaiter (autogestión).

**RESTRICCIONES:**
- Gobernanza CRITICO.
- `with_for_update()` para prevenir race condition.
- amount_cents no puede exceder saldo pendiente.
- `safe_commit()` para atomicidad.
- Si cubre total → CHECK_PAID.
- Si offline, encolar en RetryQueueStore de pwaWaiter.

**VALIDACIÓN:**
- [ ] Pago registrado con método correcto.
- [ ] No excede saldo pendiente.
- [ ] Check pasa a PAID si total cubierto.
- [ ] Evento PAYMENT_APPROVED emitido.
- [ ] Race condition prevenida.

---

### PROMPT HU-1406 — Confirmar Pago y Cerrar Mesa

**ROL:**
Actúa como un desarrollador full-stack especializado en cierre de sesiones con limpieza de estado y propagación de eventos.

**CONTEXTO:**
- Cerrar mesa solo si saldo pendiente = 0 (todos los pagos cubiertos).
- Check pasa a PAID → evento CHECK_PAID.
- Mesa: sesión CLOSED, status FREE.
- Evento TABLE_CLEARED emitido a todos (comensales, mozos, admin).
- Table tokens de los comensales se invalidan (la sesión ya no existe).
- Dashboard refleja mesa como libre.
- Historial de sesión accesible para reportes.
- Endpoints: `billingAPI.clearTable()` o `waiterTableAPI.closeTable(tableId)`.

**TAREA:**
Implementa el cierre de mesa con verificación de pago completo.

**FORMATO DE SALIDA:**
- Endpoint para cerrar mesa.
- Verificación de saldo = 0.
- Cierre de sesión y limpieza.
- Evento TABLE_CLEARED.

**RESTRICCIONES:**
- Gobernanza CRITICO.
- NO cerrar si hay saldo pendiente (retornar 409).
- TABLE_CLEARED a TODOS los canales (session, sector waiters, admin).
- Invalidar table tokens (sesión cerrada = tokens inválidos por diseño).
- Mesa vuelve a FREE.
- Historial preservado (no borrar datos).

**VALIDACIÓN:**
- [ ] Solo cierra si saldo = 0.
- [ ] Sesión CLOSED, mesa FREE.
- [ ] TABLE_CLEARED emitido a todos.
- [ ] Tokens invalidados.
- [ ] Historial preservado.

---

## E15 — WebSocket Gateway

---

### PROMPT HU-1501 — Conexión WebSocket para Mozos

**ROL:**
Actúa como un ingeniero de sistemas distribuidos especializado en WebSocket Gateway con autenticación JWT y filtrado por sector.

**CONTEXTO:**
- Endpoint: `/ws/waiter?token=JWT`.
- Autenticación via JWTAuthStrategy: verificar firma, roles, blacklist, revalidar cada 5 min.
- Sector-based filtering: mozo solo recibe eventos de sus sectores asignados (WaiterSectorAssignment).
- ADMIN/MANAGER reciben todos los eventos de la sucursal sin filtro de sector.
- Caché de sectores: TTL 60s, max 1000 entradas, LRU eviction.
- Auto-reconexión con backoff exponencial: 1s → 30s max, ±30% jitter, máx 50 intentos.
- Heartbeat: ping cada 30s, timeout 60s.
- Máx 3 conexiones por usuario.
- Close codes: 4001 (auth failed), 4003 (forbidden), 4029 (rate limited).
- Códigos 4001/4003/4029 NO disparan reconexión.

**TAREA:**
Implementa la conexión WebSocket para mozos con autenticación y filtrado por sector.

**FORMATO DE SALIDA:**
- Handler en `ws_gateway/` para endpoint waiter.
- JWTAuthStrategy para autenticación.
- Lógica de filtrado por sector.
- Registro en índices de conexión.

**RESTRICCIONES:**
- Gobernanza ALTO.
- JWT revalidado cada 5 min (no solo al conectar).
- Sector filtering con caché (60s TTL).
- Max 3 conexiones por usuario (cerrar la más antigua si se excede).
- Heartbeat obligatorio (desconectar si no hay pong en 60s).
- Lock ordering: global counter → user → branch → sector.

**VALIDACIÓN:**
- [ ] Conexión con JWT válido exitosa.
- [ ] JWT inválido → close 4001.
- [ ] Mozo solo recibe eventos de sus sectores.
- [ ] ADMIN/MANAGER reciben todo.
- [ ] Max 3 conexiones por usuario.
- [ ] Heartbeat detecta desconexión.

---

### PROMPT HU-1502 — Conexión WebSocket para Cocina

**ROL:**
Actúa como un desarrollador de WebSocket Gateway especializado en filtrado de eventos por rol.

**CONTEXTO:**
- Endpoint: `/ws/kitchen?token=JWT`.
- Solo recibe eventos SUBMITTED+ (no PENDING ni CONFIRMED).
- Roles autorizados: KITCHEN, MANAGER, ADMIN.
- Eventos: ROUND_SUBMITTED, ROUND_IN_KITCHEN, ROUND_READY, ROUND_SERVED.

**TAREA:**
Implementa la conexión WebSocket para cocina con filtrado de eventos.

**FORMATO DE SALIDA:**
- Handler en ws_gateway para endpoint kitchen.
- Filtro de eventos por estado de ronda.

**RESTRICCIONES:**
- Solo eventos SUBMITTED+ llegan a cocina.
- PENDING y CONFIRMED filtrados en el event router.
- Mismos patrones de auth, heartbeat y reconexión que waiter.

**VALIDACIÓN:**
- [ ] Cocina NO recibe ROUND_PENDING ni ROUND_CONFIRMED.
- [ ] Recibe ROUND_SUBMITTED, IN_KITCHEN, READY, SERVED.
- [ ] Solo roles KITCHEN/MANAGER/ADMIN.

---

### PROMPT HU-1503 — Conexión WebSocket para Comensales

**ROL:**
Actúa como un desarrollador de WebSocket Gateway especializado en autenticación por table token y eventos de sesión.

**CONTEXTO:**
- Endpoint: `/ws/diner?table_token=`.
- TableTokenAuthStrategy: verificar HMAC, validez 3h, revalidar cada 30 min.
- Solo eventos de su sesión de mesa.
- Eventos: CART_ITEM_*, ROUND_IN_KITCHEN+, SERVICE_CALL_ACKED, CHECK_*, PAYMENT_*.
- Validación de origen más leniente que JWT.

**TAREA:**
Implementa la conexión WebSocket para comensales.

**FORMATO DE SALIDA:**
- Handler en ws_gateway para endpoint diner.
- TableTokenAuthStrategy.
- Filtro de eventos por sesión.

**RESTRICCIONES:**
- Table token, no JWT.
- Solo eventos de la sesión del comensal.
- Revalidar token cada 30 min.
- No recibe ROUND_PENDING ni ROUND_CONFIRMED.

**VALIDACIÓN:**
- [ ] Conexión con table token válido.
- [ ] Token inválido → close 4001.
- [ ] Solo eventos de su sesión.
- [ ] Token revalidado cada 30 min.

---

### PROMPT HU-1504 — Conexión WebSocket para Admin

**ROL:**
Actúa como un desarrollador de WebSocket Gateway especializado en conexiones administrativas con visibilidad total.

**CONTEXTO:**
- Endpoint: `/ws/admin?token=JWT`.
- Recibe TODOS los eventos de las sucursales del usuario.
- Incluye eventos CRUD: ENTITY_CREATED/UPDATED/DELETED, CASCADE_DELETE.
- Roles: ADMIN, MANAGER.
- Sin filtro de sector (visibilidad total de la sucursal).

**TAREA:**
Implementa la conexión WebSocket para administradores.

**FORMATO DE SALIDA:**
- Handler en ws_gateway para endpoint admin.
- Suscripción a canales: `branch:{id}:admin` para cada branch del usuario.

**RESTRICCIONES:**
- Solo ADMIN/MANAGER.
- Suscribir a `branch:{id}:admin` para cada branch_id del JWT.
- Sin filtro de sector.
- Incluir eventos ENTITY_* y CASCADE_DELETE.

**VALIDACIÓN:**
- [ ] Admin recibe TODOS los eventos de sus branches.
- [ ] Incluye eventos CRUD de entidades.
- [ ] Sin filtro de sector.

---

### PROMPT HU-1505 — Broadcasting Eficiente

**ROL:**
Actúa como un ingeniero de sistemas distribuidos especializado en broadcast paralelo de alta concurrencia con fallback strategies.

**CONTEXTO:**
- Worker pool de 10 workers para broadcast paralelo.
- Sharded locks por branch para reducir contención 90% vs lock global.
- Rendimiento: ~160ms para broadcast a 400 usuarios.
- Fallback a batch legacy (50 por batch) si falla worker pool.
- BroadcastRouter dirige eventos al conjunto correcto de conexiones.
- Conexiones fallidas marcadas como dead, removidas en siguiente ciclo de cleanup.
- Métricas: broadcasts exitosos/fallidos, latencia.

**TAREA:**
Implementa el sistema de broadcast eficiente con workers y fallback.

**FORMATO DE SALIDA:**
- `ws_gateway/components/broadcast/router.py` — BroadcastRouter.
- Worker pool con 10 workers.
- Fallback a batch legacy.
- Métricas de broadcast.

**RESTRICCIONES:**
- Gobernanza ALTO.
- Sharded locks: uno por branch, no global.
- Worker pool: 10 workers con asyncio.
- Fallback automático si worker pool falla.
- Conexiones dead removidas (no reintentar).
- Lock ordering para prevenir deadlocks.

**VALIDACIÓN:**
- [ ] Broadcast a 400 usuarios en <200ms.
- [ ] Fallback a batch si worker pool falla.
- [ ] Locks por branch, no global.
- [ ] Conexiones dead removidas.

---

### PROMPT HU-1506 — Circuit Breaker

**ROL:**
Actúa como un ingeniero de resiliencia especializado en patrones de circuit breaker para conexiones Redis.

**CONTEXTO:**
- Estados: CLOSED (normal), OPEN (fallo), HALF_OPEN (recuperación).
- CLOSED: contar fallos consecutivos; si llega a 5 → OPEN.
- OPEN: rechazar inmediatamente sin intentar conexión; tras 30s → HALF_OPEN.
- HALF_OPEN: permitir 3 llamadas de prueba; si exitosas → CLOSED; si fallan → OPEN.
- Logging de transiciones de estado.
- Aplicado a: conexiones Redis, publicación de eventos.

**TAREA:**
Implementa el circuit breaker para conexiones Redis en el WS Gateway.

**FORMATO DE SALIDA:**
- Clase `CircuitBreaker` en ws_gateway/components.
- Integración con Redis pool.
- Logging de transiciones.

**RESTRICCIONES:**
- Thread-safe (asyncio locks).
- 5 fallos → OPEN.
- 30s timeout → HALF_OPEN.
- 3 test calls exitosas → CLOSED.
- Logging en cada transición.

**VALIDACIÓN:**
- [ ] CLOSED → OPEN tras 5 fallos.
- [ ] OPEN rechaza inmediatamente.
- [ ] HALF_OPEN permite 3 test calls.
- [ ] Transiciones logueadas.

---

### PROMPT HU-1507 — Rate Limiting en WebSocket

**ROL:**
Actúa como un ingeniero de seguridad especializado en protección de WebSocket contra abuso con sliding window algorithm.

**CONTEXTO:**
- 20 mensajes/segundo por conexión (sliding window).
- 10 broadcast operations/segundo globalmente.
- Penalización: 1 hora para conexiones evictas (previene reconexión evasiva).
- Tracking de hasta 5000 conexiones, evicción 10% LRU cuando lleno.
- Close code 4029 cuando se excede el límite.
- Mensaje de error descriptivo antes de cerrar.

**TAREA:**
Implementa el rate limiting para conexiones WebSocket.

**FORMATO DE SALIDA:**
- Rate limiter en ws_gateway/components.
- Sliding window algorithm.
- Penalización por evasión.
- Integración con connection handler.

**RESTRICCIONES:**
- Sliding window, no fixed window.
- Enviar mensaje de error ANTES de close 4029.
- Penalización 1h para evictos.
- Max 5000 conexiones tracked, LRU eviction.

**VALIDACIÓN:**
- [ ] 20 msg/s por conexión.
- [ ] Close 4029 al exceder límite.
- [ ] Penalización 1h para evictos.
- [ ] LRU eviction funciona.

---

### PROMPT HU-1508 — Eventos Críticos con Redis Streams

**ROL:**
Actúa como un ingeniero de infraestructura especializado en Redis Streams, consumer groups y entrega garantizada de mensajes.

**CONTEXTO:**
- Stream key: `events:critical`.
- Consumer group: `ws_gateway_group`, consumer: `gateway-primary`.
- At-least-once delivery via consumer groups.
- PEL (Pending Entries List) check cada 30 ciclos (~1 min).
- XAUTOCLAIM para reclamar mensajes idle (>30s).
- Max 3 retries → Dead Letter Queue.
- DLQ preserva: original ID, source stream, data, retry count, fail timestamp, consumer name.
- Eventos: CHECK_REQUESTED/PAID, PAYMENT_*, ROUND_SUBMITTED/READY, SERVICE_CALL_CREATED.
- XREADGROUP blocking 2s.

**TAREA:**
Implementa el consumer de Redis Streams para eventos críticos.

**FORMATO DE SALIDA:**
- `ws_gateway/components/streams_consumer.py` o equivalente.
- Consumer group setup.
- PEL recovery logic.
- Dead Letter Queue.

**RESTRICCIONES:**
- Gobernanza CRITICO.
- Consumer group auto-creado si no existe.
- PEL check cada 30 ciclos.
- Max 3 retries antes de DLQ.
- XREADGROUP blocking 2s (no busy-wait).
- ACK inmediato tras procesamiento exitoso.
- Recover pending entries de sesión anterior al arrancar.

**VALIDACIÓN:**
- [ ] Consumer group creado automáticamente.
- [ ] Eventos procesados y ACK'd.
- [ ] PEL recovery cada ~1 min.
- [ ] DLQ tras 3 retries fallidos.
- [ ] Pending entries de sesión anterior recuperados al arrancar.

---

## E16 — Promociones

---

### PROMPT HU-1601 — CRUD de Promociones

**ROL:**
Actúa como un desarrollador backend especializado en entidades con vigencia temporal y condiciones de aplicación configurables.

**CONTEXTO:**
- Modelo Promotion: name, description, discount_type, discount_value, start_date, end_date, conditions (JSON), tenant_id, branch_id, is_active.
- Vincular a productos o categorías específicas.
- Condiciones: monto mínimo, cantidad mínima, horarios.
- PromotionService maneja la lógica.
- Activación/desactivación automática por fechas.
- Gobernanza BAJO: autonomía completa.

**TAREA:**
Implementa el CRUD de promociones con vigencia temporal.

**FORMATO DE SALIDA:**
- `rest_api/services/domain/promotion_service.py`
- `rest_api/routers/admin/promotions.py`
- Schemas Pydantic.

**RESTRICCIONES:**
- Validar que end_date > start_date.
- Discount_value coherente con discount_type (porcentaje 0-100, monto en centavos).
- Promociones expiradas no se retornan en endpoints públicos.
- Activación automática basada en fechas/horarios.

**VALIDACIÓN:**
- [ ] CRUD funcional.
- [ ] Vigencia temporal respetada.
- [ ] Descuento aplicado correctamente (% o monto fijo).
- [ ] Promociones expiradas filtradas.

---

### PROMPT HU-1602 — Visualización de Promociones en pwaMenu

**ROL:**
Actúa como un desarrollador frontend especializado en visualización de ofertas y descuentos en interfaces de menú digital.

**CONTEXTO:**
- Carrusel de promociones activas en vista principal del menú.
- Cada promoción: nombre, productos incluidos, precio promocional, ahorro vs precio normal.
- Restricción horaria visible.
- Agregar combo completo al carrito en una acción.
- Promociones expiradas durante la sesión desaparecen sin reload.
- Badge "Promoción" en productos con descuento activo.
- Precio original tachado + precio con descuento.
- i18n obligatorio.

**TAREA:**
Implementa la visualización de promociones en pwaMenu.

**FORMATO DE SALIDA:**
- Componente `PromotionCarousel.tsx`.
- Badge de promoción en `ProductCard.tsx`.
- Lógica de cálculo de ahorro.

**RESTRICCIONES:**
- i18n en todos los textos.
- Precios en centavos → mostrar como pesos.
- Carrusel horizontal con swipe.
- Promociones expiradas removidas reactivamente.
- Precio original tachado con estilo visual claro.

**VALIDACIÓN:**
- [ ] Carrusel de promociones activas.
- [ ] Badge en productos promocionados.
- [ ] Precio original tachado + precio promo.
- [ ] Agregar combo al carrito.
- [ ] Expiradas se remueven sin reload.

---

## E17 — Recetas e Ingredientes

---

### PROMPT HU-1701 — Gestión de Ingredientes

**ROL:**
Actúa como un desarrollador backend especializado en catálogos jerárquicos para gestión culinaria.

**CONTEXTO:**
- Jerarquía: IngredientGroup → Ingredient → SubIngredient.
- Todos son por tenant (tenant_id).
- Vinculación con alérgenos para trazabilidad alimentaria.
- Endpoints bajo `/api/recipes/*` o `/api/admin/ingredients/*`.
- Acceso: KITCHEN, MANAGER, ADMIN.

**TAREA:**
Implementa el CRUD de ingredientes con jerarquía de 3 niveles.

**FORMATO DE SALIDA:**
- Modelos: IngredientGroup, Ingredient, SubIngredient.
- Endpoints CRUD.
- Schemas Pydantic.

**RESTRICCIONES:**
- Gobernanza BAJO.
- Jerarquía: group → ingredient → sub-ingredient.
- Vinculación opcional con allergen_id.
- Solo roles KITCHEN/MANAGER/ADMIN.

**VALIDACIÓN:**
- [ ] CRUD de 3 niveles funcional.
- [ ] Vinculación con alérgenos.
- [ ] Acceso por rol correcto.

---

### PROMPT HU-1702 — Gestión de Recetas

**ROL:**
Actúa como un desarrollador backend especializado en documentación culinaria digital con ingredientes y pasos de preparación.

**CONTEXTO:**
- Receta vinculada a un Product.
- Lista de ingredientes con cantidades y unidades.
- Instrucciones paso a paso.
- Acceso: KITCHEN, MANAGER, ADMIN.
- Endpoints bajo `/api/recipes/*`.

**TAREA:**
Implementa el CRUD de recetas vinculadas a productos.

**FORMATO DE SALIDA:**
- Modelos: Recipe, RecipeIngredient, RecipeStep.
- Endpoints CRUD.
- Schemas.

**RESTRICCIONES:**
- Gobernanza BAJO.
- Una receta por producto (1:1).
- Ingredientes con cantidad y unidad.
- Pasos numerados secuencialmente.

**VALIDACIÓN:**
- [ ] Receta vinculada a producto.
- [ ] Ingredientes con cantidades.
- [ ] Pasos secuenciales.
- [ ] Acceso por rol correcto.

---

## E18 — Fidelización de Clientes

---

### PROMPT HU-1801 — Device Tracking (Fase 1)

**ROL:**
Actúa como un desarrollador backend especializado en tracking anónimo de dispositivos y gestión de identidad sin registro.

**CONTEXTO:**
- Generar UUID persistente en browser storage como device ID.
- Fingerprint de dispositivo: características del browser, resolución de pantalla.
- Modelo Customer almacena datos del dispositivo.
- Vincular Diner con customer_id basado en device.
- No requiere registro ni consentimiento en esta fase.
- pwaMenu envía device_id en headers o body al unirse a mesa.

**TAREA:**
Implementa el tracking de dispositivos para reconocimiento de clientes recurrentes.

**FORMATO DE SALIDA:**
- Frontend: generación y persistencia de device ID en pwaMenu.
- Backend: modelo Customer, endpoint para vincular device con diner.

**RESTRICCIONES:**
- Gobernanza CRITICO (datos personales implícitos).
- UUID generado en primer uso, persistido en localStorage.
- No solicitar permisos ni consentimiento (fase 1 = anónimo).
- No almacenar datos personales (solo device fingerprint).
- Si el usuario borra localStorage, se trata como nuevo dispositivo.

**VALIDACIÓN:**
- [ ] Device ID generado y persistido.
- [ ] Customer creado al primer escaneo.
- [ ] Diner vinculado a customer_id.
- [ ] Sin solicitud de permisos.

---

### PROMPT HU-1802 — Preferencias Implícitas (Fase 2)

**ROL:**
Actúa como un desarrollador backend especializado en sistemas de recomendación basados en historial de comportamiento.

**CONTEXTO:**
- Registrar historial de pedidos por customer_id.
- Calcular productos más pedidos (frecuencia).
- Identificar alérgenos evitados consistentemente.
- Detectar preferencias de cocción y sabor.
- Customer ←→ Diner relación 1:N para tracking cross-session.
- Las preferencias (filtros de alérgenos, dietéticos) se sincronizan con el server tras 2s de inactividad.
- Al volver a escanear, preferencias se cargan automáticamente.

**TAREA:**
Implementa la persistencia y carga de preferencias implícitas entre sesiones.

**FORMATO DE SALIDA:**
- Endpoint para guardar preferencias: `POST /api/customer/preferences`.
- Endpoint para cargar preferencias: `GET /api/customer/preferences?device_id=`.
- Lógica de cálculo de productos frecuentes.
- Carga automática en pwaMenu al unirse.

**RESTRICCIONES:**
- Gobernanza CRITICO.
- Sync con debounce de 2 segundos.
- Si la carga falla, menú sin filtros preconfigurados (sin error visible).
- Preferencias versionadas para migraciones futuras.
- No bloquear flujo de ingreso si falla la consulta.

**VALIDACIÓN:**
- [ ] Preferencias guardadas y cargadas entre sesiones.
- [ ] Debounce 2s en sync.
- [ ] Fallo silencioso si no carga.
- [ ] Productos frecuentes calculados.

---

### PROMPT HU-1803 — Perfil de Cliente Opt-In (Fase 4)

**ROL:**
Actúa como un desarrollador full-stack especializado en registro voluntario con consentimiento GDPR y gestión de datos personales.

**CONTEXTO:**
- Registro OPCIONAL: email y/o teléfono.
- Consentimiento GDPR explícito y revocable.
- Al registrarse, historial de device tracking se vincula a la cuenta.
- El cliente puede consultar y eliminar sus datos en cualquier momento (derecho al olvido).
- Endpoints bajo `/api/customer/*` con autenticación X-Table-Token.

**TAREA:**
Implementa el registro voluntario de cliente con consentimiento y derecho al olvido.

**FORMATO DE SALIDA:**
- Endpoint de registro con consentimiento.
- Endpoint para consultar datos propios.
- Endpoint para eliminar datos (derecho al olvido).
- Formulario de registro en pwaMenu.
- Checkbox de consentimiento.

**RESTRICCIONES:**
- Gobernanza CRITICO.
- Registro NUNCA intrusivo (no popups, no presionar).
- Consentimiento EXPLÍCITO con texto legal.
- Derecho al olvido: eliminar TODOS los datos del customer.
- Email validado, teléfono acepta formato internacional.
- Vincular historial de device tracking al customer al registrarse.

**VALIDACIÓN:**
- [ ] Registro opcional con consentimiento.
- [ ] Historial vinculado tras registro.
- [ ] Derecho al olvido elimina todos los datos.
- [ ] No intrusivo (sin popups forzados).

---

## E19 — Reportes y Analíticas

---

### PROMPT HU-1901 — Dashboard de Métricas Operativas

**ROL:**
Actúa como un desarrollador frontend senior especializado en dashboards de analítica con gráficos interactivos y datos en tiempo real.

**CONTEXTO:**
- Métricas: mesas activas vs totales, pedidos por hora/día, productos más vendidos, ticket promedio, ingresos del día/semana/mes, comensales atendidos.
- Filtros: sucursal, rango de fechas, categoría.
- Gráficos de tendencia temporal con comparación de períodos.
- Actualización en tiempo real cuando se completan pagos.
- Datos del backend via endpoints de reportes.

**TAREA:**
Implementa el dashboard de métricas operativas.

**FORMATO DE SALIDA:**
- Página `MetricsPage.tsx` en Dashboard.
- Componentes de gráficos (bar, line, pie).
- Endpoints backend para métricas agregadas.
- Store para datos de métricas.

**RESTRICCIONES:**
- Gobernanza MEDIO.
- Zona horaria local del restaurante.
- Gráficos interactivos (hover, zoom).
- Filtros reactivos (cambiar filtro actualiza gráficos).
- Solo ADMIN/MANAGER accede.
- Zustand con selectores.

**VALIDACIÓN:**
- [ ] Métricas calculadas correctamente.
- [ ] Filtros por sucursal y fecha.
- [ ] Gráficos interactivos.
- [ ] Actualización en tiempo real.

---

### PROMPT HU-1902 — Reportes de Cocina

**ROL:**
Actúa como un desarrollador especializado en métricas de eficiencia operativa para cocinas de restaurantes.

**CONTEXTO:**
- Tiempo promedio de preparación por producto/categoría.
- Usa timestamps de KitchenTicket: created_at → started_at → ready_at.
- Tickets completados vs pendientes.
- Picos de demanda por hora.
- Comparación entre sucursales.
- Exportación a CSV/PDF.

**TAREA:**
Implementa los reportes de eficiencia de cocina.

**FORMATO DE SALIDA:**
- Endpoints de reportes en backend.
- Vista de reportes en Dashboard.
- Exportación CSV/PDF.

**RESTRICCIONES:**
- Tiempo de cocina = ready_at - started_at.
- Tiempo de espera = started_at - created_at.
- Promedios con desviación estándar.
- Exportación como acción del usuario, no automática.

**VALIDACIÓN:**
- [ ] Tiempos promedio por producto.
- [ ] Picos de demanda identificados.
- [ ] Exportación funcional.

---

### PROMPT HU-1903 — Reportes de Ventas

**ROL:**
Actúa como un desarrollador especializado en reportes financieros para la industria gastronómica.

**CONTEXTO:**
- Ventas por período (día, semana, mes).
- Desglose por categoría y producto.
- Métodos de pago utilizados (cash, MP, card, transfer).
- Propinas totales.
- Ticket promedio por mesa.
- Comparación entre sucursales y períodos.
- Montos en centavos internamente, mostrar como pesos.

**TAREA:**
Implementa los reportes de ventas.

**FORMATO DE SALIDA:**
- Endpoints backend con queries agregadas.
- Vista en Dashboard con gráficos.
- Filtros y exportación.

**RESTRICCIONES:**
- TODOS los cálculos en centavos internamente.
- Conversión solo al mostrar.
- Paginación en historial.
- Solo ADMIN/MANAGER.

**VALIDACIÓN:**
- [ ] Ventas por período correctas.
- [ ] Desglose por categoría.
- [ ] Métodos de pago reportados.
- [ ] Ticket promedio calculado.

---

## E20 — PWA y Experiencia Offline

---

### PROMPT HU-2001 — Instalación como PWA (pwaMenu)

**ROL:**
Actúa como un desarrollador especializado en Progressive Web Apps con estrategias de cache avanzadas.

**CONTEXTO:**
- Manifest con ícono, nombre, colores (tema oscuro, acento naranja #f97316).
- Service worker para cache de assets.
- Estrategias de cache:
  - Imágenes: local-first, 30 días TTL.
  - Fonts: 1 año TTL.
  - Menú data: network-first con fallback a cache (5-10s timeout).
- Prompt "Agregar a pantalla de inicio".
- Splash screen durante carga.
- Modo standalone sin barra de navegador.
- Soporte portrait y landscape.
- Check de actualizaciones cada hora.

**TAREA:**
Implementa la configuración PWA completa para pwaMenu.

**FORMATO DE SALIDA:**
- `manifest.json` actualizado.
- Service worker con estrategias de cache.
- Prompt de instalación.

**RESTRICCIONES:**
- Cache strategies diferenciadas por tipo de recurso.
- No cachear datos sensibles (tokens, preferencias personales).
- Fallback a cache si network falla (offline-first para menú).
- Splash screen personalizado.

**VALIDACIÓN:**
- [ ] Instalable en Android e iOS.
- [ ] Cache de imágenes 30 días.
- [ ] Menú accesible offline desde cache.
- [ ] Prompt de instalación funcional.

---

### PROMPT HU-2002 — Instalación como PWA (pwaWaiter)

**ROL:**
Actúa como un desarrollador especializado en PWAs para apps de productividad laboral.

**CONTEXTO:**
- Manifest con tema naranja (#f97316).
- Service worker con cache strategies:
  - Imágenes: local-first, 7 días.
  - Table data: network-first con fallback, 1 hora TTL si offline.
  - Fonts: 1 año.
- Shortcuts: acceso directo a vista de mesas urgentes.
- Página offline con mensaje de error y estado.
- Instalable en Android e iOS.

**TAREA:**
Implementa la configuración PWA para pwaWaiter.

**FORMATO DE SALIDA:**
- `manifest.json`.
- Service worker.
- Página offline.
- Shortcuts.

**RESTRICCIONES:**
- Tema naranja (#f97316).
- Shortcuts configurados en manifest.
- Offline page con indicador de estado de conexión.
- Botones rectangulares en offline page.

**VALIDACIÓN:**
- [ ] Instalable.
- [ ] Shortcuts funcionan.
- [ ] Offline page muestra estado.
- [ ] Cache strategies correctas.

---

### PROMPT HU-2003 — Cola de Reintentos Offline (pwaWaiter)

**ROL:**
Actúa como un desarrollador frontend especializado en resiliencia offline y colas de operaciones con reintento automático.

**CONTEXTO:**
- RetryQueueStore (Zustand) encola operaciones fallidas.
- Acciones soportadas: marcar ronda servida, acknowledge service call, resolve service call, cerrar mesa.
- Procesamiento FIFO al recuperar conexión.
- Consolidación: 100ms delay para batch operations.
- Max 3 reintentos por acción.
- Discriminar errores transitorios (reintentar) vs permanentes (descartar).
- Deduplicación: no duplicar misma acción + misma entidad.
- Indicadores: contador rotante en top bar, banner rojo "Sin conexión", naranja "Reconectando" (5s).

**TAREA:**
Implementa la cola de reintentos offline completa.

**FORMATO DE SALIDA:**
- Store `retryQueueStore.ts`.
- Indicadores visuales de estado.
- Lógica de reintento con clasificación de errores.

**RESTRICCIONES:**
- FIFO processing.
- Max 3 retries.
- Deduplicación por action_type + entity_id.
- Consolidación 100ms.
- Errores transitorios (5xx, network) → retry; permanentes (4xx) → discard.
- Zustand con selectores.

**VALIDACIÓN:**
- [ ] Operaciones encoladas cuando offline.
- [ ] Procesamiento FIFO al reconectar.
- [ ] Max 3 retries.
- [ ] Deduplicación funciona.
- [ ] Indicadores visuales correctos.

---

### PROMPT HU-2004 — Notificaciones Push (pwaWaiter)

**ROL:**
Actúa como un desarrollador frontend especializado en Web Push Notifications con alertas sonoras para aplicaciones de servicio.

**CONTEXTO:**
- Browser push notifications habilitadas tras permiso.
- Solicitar permiso al primer login.
- Eventos con notificación: service call (persistente), check requested (persistente), order ready (5s auto-close).
- Sonidos de alerta: service call, bill request, orders ready.
- Sonidos independientes de permisos de notificación (Audio API).
- Cooldown de 5 segundos entre notificaciones.
- Deduplicación por contenido.
- Carga on-demand de sonidos para no impactar startup.

**TAREA:**
Implementa las notificaciones push con alertas sonoras.

**FORMATO DE SALIDA:**
- `services/notifications.ts` en pwaWaiter.
- Solicitud de permisos.
- Lógica de sonidos.
- Integración con handlers WS.

**RESTRICCIONES:**
- Solicitar permiso UNA vez (al login).
- Sonidos cargan on-demand, no al startup.
- Cooldown 5s entre notificaciones.
- Deduplicación por contenido (mismo texto no se muestra dos veces).
- Urgentes: persistentes hasta interacción. No urgentes: auto-close 5s.

**VALIDACIÓN:**
- [ ] Permiso solicitado al login.
- [ ] Notificaciones push funcionales.
- [ ] Sonidos reproducidos.
- [ ] Cooldown 5s respetado.
- [ ] Deduplicación funciona.

---

### PROMPT HU-2005 — Auto-Reconexión WebSocket

**ROL:**
Actúa como un desarrollador frontend especializado en conexiones WebSocket resilientes con backoff exponencial y re-sincronización de estado.

**CONTEXTO:**
- Patrón compartido por pwaMenu y pwaWaiter.
- Detección automática de desconexión via heartbeat timeout.
- Backoff exponencial: 1s → 30s max, ±30% jitter aleatorio, máx 50 intentos.
- Códigos 4001, 4003, 4029 NO disparan reconexión (errores permanentes).
- Indicador visual de estado de conexión (verde conectado, rojo desconectado, naranja reconectando).
- Al reconectar: token refresh → nueva conexión con token fresco → re-sync de datos desde server.
- Visibility detection: reconectar al volver de background a foreground.
- pwaWaiter: nuevo token al refresh de 14min, cerrar WS viejo → reconectar con delay.

**TAREA:**
Implementa el sistema de auto-reconexión WebSocket con re-sincronización.

**FORMATO DE SALIDA:**
- `services/websocket.ts` (compartido o por PWA).
- Backoff exponencial con jitter.
- Indicador visual de estado.
- Re-sync de datos al reconectar.

**RESTRICCIONES:**
- Jitter: ±30% aleatorio (prevenir thundering herd).
- No reconectar en códigos 4001/4003/4029.
- Visibility API para detectar background→foreground.
- Re-sync: solicitar estado completo, no inferir de eventos perdidos.
- Max 50 intentos.
- Indicador visual siempre visible.

**VALIDACIÓN:**
- [ ] Reconexión automática tras desconexión.
- [ ] Backoff exponencial 1s → 30s.
- [ ] No reconecta en 4001/4003/4029.
- [ ] Re-sync completo al reconectar.
- [ ] Indicador visual de estado.
- [ ] Visibility detection funciona.

---

## Resumen Estadístico

| Métrica | Valor |
|---------|-------|
| Total de Prompts | 89 |
| Épicas cubiertas | 20 |
| Prompts con gobernanza CRITICO | 22 |
| Prompts con gobernanza ALTO | 14 |
| Prompts con gobernanza MEDIO | 38 |
| Prompts con gobernanza BAJO | 15 |
| Componentes cubiertos | backend, ws_gateway, Dashboard, pwaMenu, pwaWaiter |

---

*Cada prompt está diseñado para ser autosuficiente: contiene todo el contexto técnico necesario extraído de la documentación del proyecto (docBack, docGateway, docMenu, docMozo, compartidoSha, trabajoRedis) para que un agente IA pueda ejecutar la tarea sin necesidad de leer archivos adicionales. La estructura RCTFRV (Rol-Contexto-Tarea-Formato-Restricciones-Validación) garantiza outputs verificables y consistentes con la arquitectura del sistema.*
