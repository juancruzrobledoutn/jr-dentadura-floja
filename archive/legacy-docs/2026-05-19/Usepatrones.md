# Patrones de Diseno — Proyecto Integrador

> Analisis exhaustivo de todos los patrones de software utilizados en el monorepo "Integrador", un sistema de gestion de restaurantes multi-sucursal con backend FastAPI, WebSocket Gateway y tres frontends React (Dashboard, pwaMenu, pwaWaiter).

---

## Tabla de Contenidos

- [1. Patrones Arquitectonicos](#1-patrones-arquitectonicos)
  - [1.1 Clean Architecture (Backend)](#11-clean-architecture-backend)
  - [1.2 Monorepo Poliglota](#12-monorepo-poliglota)
  - [1.3 Microservicios (REST API + WS Gateway)](#13-microservicios-rest-api--ws-gateway)
  - [1.4 Arquitectura basada en Eventos](#14-arquitectura-basada-en-eventos)
- [2. Patrones Creacionales](#2-patrones-creacionales)
  - [2.1 Factory (CRUDFactory, Service Creation)](#21-factory-crudfactory-service-creation)
  - [2.2 Singleton (Redis Pool, DB Session)](#22-singleton-redis-pool-db-session)
  - [2.3 Builder (EntityOutputBuilder)](#23-builder-entityoutputbuilder)
- [3. Patrones Estructurales](#3-patrones-estructurales)
  - [3.1 Facade (Domain Services, API Services Frontend)](#31-facade-domain-services-api-services-frontend)
  - [3.2 Adapter (Conversiones Frontend-Backend)](#32-adapter-conversiones-frontend-backend)
  - [3.3 Composite (Jerarquia de Menu)](#33-composite-jerarquia-de-menu)
  - [3.4 Decorator/Middleware (Security, CORS, Headers)](#34-decoratormiddleware-security-cors-headers)
- [4. Patrones de Comportamiento](#4-patrones-de-comportamiento)
  - [4.1 Strategy (Auth Strategies en WS Gateway)](#41-strategy-auth-strategies-en-ws-gateway)
  - [4.2 Observer (WebSocket Pub/Sub, Zustand Subscriptions)](#42-observer-websocket-pubsub-zustand-subscriptions)
  - [4.3 Chain of Responsibility (Middleware Pipeline, Composite Auth)](#43-chain-of-responsibility-middleware-pipeline-composite-auth)
  - [4.4 State (Table Sessions, Round Lifecycle)](#44-state-table-sessions-round-lifecycle)
  - [4.5 Template Method (Base Services con Hooks)](#45-template-method-base-services-con-hooks)
  - [4.6 Null Object (NullAuthStrategy)](#46-null-object-nullauthstrategy)
- [5. Patrones de Dominio](#5-patrones-de-dominio)
  - [5.1 Repository Pattern](#51-repository-pattern)
  - [5.2 Domain Service Pattern](#52-domain-service-pattern)
  - [5.3 Aggregate Root (Table > Session > Diner > Round)](#53-aggregate-root)
  - [5.4 Soft Delete Convention](#54-soft-delete-convention)
  - [5.5 Specification Pattern](#55-specification-pattern)
  - [5.6 Permission Context (RBAC)](#56-permission-context-rbac)
- [6. Patrones de Infraestructura](#6-patrones-de-infraestructura)
  - [6.1 Transactional Outbox](#61-transactional-outbox)
  - [6.2 Circuit Breaker](#62-circuit-breaker)
  - [6.3 Rate Limiter (Sliding Window)](#63-rate-limiter-sliding-window)
  - [6.4 Connection Pool (Redis, PostgreSQL)](#64-connection-pool-redis-postgresql)
  - [6.5 Health Check Pattern](#65-health-check-pattern)
  - [6.6 Correlation ID / Request Tracing](#66-correlation-id--request-tracing)
  - [6.7 Event Publishing con Retry y Backoff](#67-event-publishing-con-retry-y-backoff)
- [7. Patrones Frontend](#7-patrones-frontend)
  - [7.1 Zustand Store con Selectors](#71-zustand-store-con-selectors)
  - [7.2 Custom Hooks (useFormModal, useConfirmDialog)](#72-custom-hooks)
  - [7.3 useRef Pattern para WebSocket y Callbacks](#73-useref-pattern-para-websocket-y-callbacks)
  - [7.4 Lazy Loading / Code Splitting](#74-lazy-loading--code-splitting)
  - [7.5 i18n Pattern (pwaMenu)](#75-i18n-pattern-pwamenu)
  - [7.6 Optimistic Updates (React 19)](#76-optimistic-updates-react-19)
  - [7.7 Token Refresh & Auth Guard](#77-token-refresh--auth-guard)
  - [7.8 Retry Queue Offline-First (pwaWaiter)](#78-retry-queue-offline-first-pwawaiter)
- [8. Patrones de Testing](#8-patrones-de-testing)
  - [8.1 Backend (pytest markers, fixtures)](#81-backend-pytest)
  - [8.2 Frontend (Vitest, mocking strategies)](#82-frontend-vitest)
- [9. Patrones DevOps](#9-patrones-devops)
  - [9.1 Docker Compose Orchestration](#91-docker-compose-orchestration)
  - [9.2 Health Checks en Servicios](#92-health-checks-en-servicios)
  - [9.3 Environment Configuration](#93-environment-configuration)
- [10. Patrones de Seguridad](#10-patrones-de-seguridad)
  - [10.1 JWT + Refresh Token Strategy](#101-jwt--refresh-token-strategy)
  - [10.2 HMAC Table Tokens](#102-hmac-table-tokens)
  - [10.3 Token Blacklist con Redis](#103-token-blacklist-con-redis)
  - [10.4 Input Validation & SSRF Prevention](#104-input-validation--ssrf-prevention)
  - [10.5 Rate Limiting con Lua Scripts Atomicos](#105-rate-limiting-con-lua-scripts-atomicos)
- [Resumen](#resumen)

---

## 1. Patrones Arquitectonicos

### 1.1 Clean Architecture (Backend)

**Que es:** Separacion en capas donde la logica de negocio vive en el centro, aislada de frameworks, bases de datos e infraestructura. Las dependencias apuntan siempre hacia adentro.

**Donde se usa:**
- `backend/rest_api/services/domain/` -- Servicios de dominio (logica de negocio)
- `backend/rest_api/services/crud/repository.py` -- Capa de acceso a datos
- `backend/rest_api/services/base_service.py` -- Clases base abstractas
- `backend/rest_api/routers/` -- Controladores "thin"

**Implementacion:**

La arquitectura queda documentada en el propio codigo. Miremos el `__init__.py` de los domain services:

```python
# backend/rest_api/services/domain/__init__.py

"""
Domain Services - Clean Architecture Application Layer.

Structure:
    Router (thin controller)
        |
    Service (business logic)  <-- VOS ESTAS ACA
        |
    Repository (data access)
        |
    Model (entity)
"""

from .category_service import CategoryService
from .subcategory_service import SubcategoryService
from .branch_service import BranchService
from .product_service import ProductService
from .round_service import RoundService
from .billing_service import BillingService
# ... 14 domain services en total
```

Y un router "thin" se ve asi:

```python
@router.get("/categories")
def list_categories(db: Session = Depends(get_db), user: dict = Depends(current_user)):
    service = CategoryService(db)
    return service.list_by_branch(user["tenant_id"], branch_id)
```

**Beneficio:** El router NO tiene logica de negocio. Si maniana cambiamos FastAPI por otra cosa, los services siguen intactos. Es asi de simple.

---

### 1.2 Monorepo Poliglota

**Que es:** Un unico repositorio con multiples proyectos en distintas tecnologias (Python + TypeScript) compartiendo configuraciones, documentacion y CI/CD.

**Donde se usa:** Raiz del proyecto.

**Estructura:**
```
Jr-main/
  backend/          # Python (FastAPI + SQLAlchemy)
    rest_api/       # REST API
    shared/         # Codigo compartido backend
  ws_gateway/       # Python (WebSocket Gateway)
  Dashboard/        # TypeScript (React 19 + Zustand)
  pwaMenu/          # TypeScript (React 19 + i18n)
  pwaWaiter/        # TypeScript (React 19 + PWA)
  devOps/           # Docker Compose orchestration
```

**Beneficio:** Cambios que cruzan fronteras (por ejemplo, un nuevo campo en la API) se hacen en un solo commit. Los frontends comparten convenciones (Zustand selectors, logging patterns) sin duplicar configuracion.

---

### 1.3 Microservicios (REST API + WS Gateway)

**Que es:** Separacion del backend en dos servicios independientes que se comunican via Redis como message broker.

**Donde se usa:**
- `backend/rest_api/` -- Puerto 8000, API REST sincrona
- `ws_gateway/` -- Puerto 8001, Gateway WebSocket asincrono
- Redis (Pub/Sub + Streams) como canal de comunicacion

**Implementacion:**

El REST API publica eventos a Redis:

```python
# backend/shared/infrastructure/events/publisher.py
async def publish_event(redis_client, channel, event):
    event_json = event.to_json()
    _validate_event_size(event_json, event.type)
    circuit_breaker = get_event_circuit_breaker()
    if not circuit_breaker.can_execute():
        return 0  # Fail-fast
    result = await redis_client.publish(channel, event_json)
    circuit_breaker.record_success()
    return result
```

El WS Gateway suscribe a esos canales y routea a los WebSockets correspondientes.

**Beneficio:** Cada servicio escala independientemente. El WS Gateway puede manejar 400+ conexiones concurrentes sin afectar la latencia del REST API.

---

### 1.4 Arquitectura basada en Eventos

**Que es:** Los componentes se comunican mediante eventos asincrónicos en lugar de llamadas directas. Permite desacoplamiento temporal y espacial.

**Donde se usa:**
- `backend/shared/infrastructure/events/` -- Publicacion de eventos
- `backend/shared/infrastructure/events/channels.py` -- Canales Redis con naming estandarizado
- `ws_gateway/components/events/router.py` -- Routing de eventos a conexiones

**Implementacion:**

Canales Redis con naming estandarizado:

```python
# backend/shared/infrastructure/events/channels.py
def channel_branch_waiters(branch_id: int) -> str:
    _validate_positive_id(branch_id, "branch_id")
    return f"branch:{branch_id}:waiters"

def channel_table_session(session_id: int) -> str:
    _validate_positive_id(session_id, "session_id")
    return f"session:{session_id}"

def channel_sector_waiters(sector_id: int) -> str:
    _validate_positive_id(sector_id, "sector_id")
    return f"sector:{sector_id}:waiters"
```

El EventRouter decide a quien le llega cada tipo de evento:

```python
# ws_gateway/components/events/router.py
class EventRouter:
    KITCHEN_EVENTS = frozenset({
        "ROUND_SUBMITTED", "ROUND_IN_KITCHEN", "ROUND_READY", "ROUND_SERVED",
        "TICKET_IN_PROGRESS", "TICKET_READY", "TICKET_DELIVERED",
    })

    SESSION_EVENTS = frozenset({
        "ROUND_IN_KITCHEN", "ROUND_READY", "ROUND_SERVED",
        "CHECK_REQUESTED", "CHECK_PAID", "PAYMENT_APPROVED",
        "CART_ITEM_ADDED", "CART_ITEM_UPDATED", "CART_ITEM_REMOVED",
    })

    ADMIN_ONLY_EVENTS = frozenset({
        "ENTITY_CREATED", "ENTITY_UPDATED", "ENTITY_DELETED", "CASCADE_DELETE",
    })

    async def route_event(self, event: dict) -> RoutingResult:
        event_type = event.get("type")
        to_kitchen = event_type in self.KITCHEN_EVENTS
        to_session = event_type in self.SESSION_EVENTS
        admin_only = event_type in self.ADMIN_ONLY_EVENTS
        # ... routing logic
```

**Beneficio:** El REST API no necesita saber cuantos mozos estan conectados ni donde. Solo publica el evento y el Gateway se encarga de la distribucion.

---

## 2. Patrones Creacionales

### 2.1 Factory (CRUDFactory, Service Creation)

**Que es:** Un objeto que crea otros objetos sin exponer la logica de instanciacion. Aca hay dos implementaciones: una `CRUDFactory` deprecated y factory functions para los auth strategies.

**Donde se usa:**
- `backend/rest_api/services/crud/factory.py` -- CRUDFactory (deprecated, migrado a domain services)
- `ws_gateway/components/auth/strategies.py` -- Factory functions para estrategias de autenticacion
- `backend/rest_api/services/crud/repository.py` -- `get_repository()` factory function

**Implementacion:**

Factory functions para auth strategies del WebSocket:

```python
# ws_gateway/components/auth/strategies.py
def create_waiter_auth_strategy() -> JWTAuthStrategy:
    return JWTAuthStrategy(required_roles=["WAITER", "MANAGER", "ADMIN"])

def create_kitchen_auth_strategy() -> JWTAuthStrategy:
    return JWTAuthStrategy(required_roles=["KITCHEN", "MANAGER", "ADMIN"])

def create_admin_auth_strategy() -> JWTAuthStrategy:
    return JWTAuthStrategy(required_roles=["MANAGER", "ADMIN"])

def create_diner_auth_strategy() -> TableTokenAuthStrategy:
    return TableTokenAuthStrategy()
```

Factory function para repositorios:

```python
# backend/rest_api/services/crud/repository.py
def get_repository(model, session, *, branch_scoped=False):
    if branch_scoped:
        return BranchRepository(model, session)
    if hasattr(model, "tenant_id"):
        return TenantRepository(model, session)
    return BaseRepository(model, session)
```

**Beneficio:** Encapsula las reglas de creacion (que roles necesita cada endpoint, que tipo de repo necesita cada modelo) en un solo lugar. Si cambian los roles del mozo, se toca una sola funcion.

---

### 2.2 Singleton (Redis Pool, DB Session Factory)

**Que es:** Garantiza una unica instancia de un recurso costoso (conexion a base de datos, pool de Redis) compartida por toda la aplicacion.

**Donde se usa:**
- `backend/shared/infrastructure/events/redis_pool.py` -- Pool Redis asincrono y sincrono
- `backend/shared/infrastructure/db.py` -- Engine y SessionLocal de SQLAlchemy

**Implementacion:**

El pool de Redis usa double-check locking con asyncio:

```python
# backend/shared/infrastructure/events/redis_pool.py

_redis_pool: redis.Redis | None = None
_redis_pool_lock: asyncio.Lock | None = None
_pool_lock_init = threading.Lock()

async def get_redis_pool() -> redis.Redis:
    global _redis_pool

    # Fast path: pool already initialized
    if _redis_pool is not None:
        return _redis_pool

    # Slow path: acquire lock and initialize if needed
    async with _get_pool_lock():
        # Double-check after acquiring lock
        if _redis_pool is None:
            _redis_pool = redis.from_url(
                REDIS_URL,
                max_connections=settings.redis_pool_max_connections,
                decode_responses=True,
                socket_connect_timeout=settings.redis_socket_timeout,
                health_check_interval=30,
            )
    return _redis_pool
```

El engine de SQLAlchemy tambien es singleton a nivel de modulo:

```python
# backend/shared/infrastructure/db.py
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=_calculate_pool_size(),  # Dynamic: (2 * CPU cores) + 1
    max_overflow=15,
    pool_timeout=30,
    pool_recycle=1800,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
```

**Beneficio:** No se crean conexiones nuevas en cada request. El pool se reutiliza, bajando latencia y uso de memoria. El double-check locking previene race conditions en entornos async.

---

### 2.3 Builder (EntityOutputBuilder)

**Que es:** Construye objetos complejos paso a paso. Aca se usa para construir DTOs de salida desde entidades del ORM.

**Donde se usa:**
- `backend/rest_api/services/crud/entity_builder.py`
- Se referencia en `CRUDConfig.output_builder`

**Implementacion:**

La CRUDFactory tiene un hook `output_builder` que permite construir DTOs custom:

```python
# backend/rest_api/services/crud/factory.py
@dataclass
class CRUDConfig:
    # Custom output builder (if entity needs special handling)
    output_builder: Callable[[Any, Session], OutputT] | None = None
```

Y en los BaseCRUDService, `to_output()` es el punto de extension:

```python
# backend/rest_api/services/base_service.py
def to_output(self, entity: ModelT) -> OutputT:
    """Override this method for custom transformation logic."""
    return self._output_schema.model_validate(entity)
```

**Beneficio:** Permite transformaciones complejas (calculos, joins, formatos) sin ensuciar el repositorio ni el router.

---

## 3. Patrones Estructurales

### 3.1 Facade (Domain Services, API Services Frontend)

**Que es:** Proporciona una interfaz simplificada a un subsistema complejo. Los domain services son fachadas que esconden la complejidad de repos, validaciones, eventos y audit.

**Donde se usa:**
- `backend/rest_api/services/domain/category_service.py` (y los 13 servicios restantes)
- `Dashboard/src/services/api.ts`, `pwaMenu/src/services/api.ts`, `pwaWaiter/src/services/api.ts`

**Implementacion:**

El `CategoryService` es una fachada que combina repositorio + validacion + eventos + audit:

```python
# backend/rest_api/services/domain/category_service.py
class CategoryService(BranchScopedService[Category, CategoryOutput]):
    def __init__(self, db: Session):
        super().__init__(
            db=db, model=Category,
            output_schema=CategoryOutput, entity_name="Categoria",
        )

    def create_with_auto_order(self, data, tenant_id, user_id, user_email):
        if data.get("order") is None:
            data["order"] = self.get_next_order(data["branch_id"])
        return self.create(data, tenant_id, user_id, user_email)

    def _validate_create(self, data, tenant_id):
        branch_id = data.get("branch_id")
        if not branch_id:
            raise ValidationError("branch_id es requerido", field="branch_id")
        branch = self._db.scalar(
            select(Branch).where(Branch.id == branch_id, Branch.tenant_id == tenant_id)
        )
        if not branch:
            raise ValidationError("branch_id invalido", field="branch_id")

    def _after_delete(self, entity_info, user_id, user_email):
        publish_entity_deleted(
            tenant_id=entity_info["tenant_id"],
            entity_type="category",
            entity_id=entity_info["id"],
            entity_name=entity_info.get("name"),
            branch_id=entity_info.get("branch_id"),
            actor_user_id=user_id,
        )
```

El router solo dice: `service.create_with_auto_order(data, tenant_id, user_id, email)`. Todo lo demas esta escondido atras de la fachada.

**Beneficio:** El router no necesita saber que se valida el branch, se auto-calcula el order, se hace soft delete con audit y se publica un evento. La complejidad queda encapsulada.

---

### 3.2 Adapter (Conversiones Frontend-Backend)

**Que es:** Convierte la interfaz de un sistema a la que espera otro. Aca se usa para adaptar los tipos del backend (Python snake_case, IDs numericos, precios en centavos) a los del frontend (TypeScript camelCase, IDs string, precios en pesos).

**Donde se usa:**
- `Dashboard/src/stores/categoryStore.ts` -- `mapAPICategoryToFrontend()`
- `pwaMenu/src/pages/Home.tsx` -- `convertBackendProduct()`, `convertBackendCategory()`
- Todos los stores que consumen la API

**Implementacion:**

```typescript
// Dashboard/src/stores/categoryStore.ts
function mapAPICategoryToFrontend(apiCategory: APICategory): Category {
  return {
    id: String(apiCategory.id),           // number -> string
    name: apiCategory.name,
    icon: apiCategory.icon ?? undefined,   // null -> undefined
    image: apiCategory.image ?? undefined,
    order: apiCategory.order,
    branch_id: String(apiCategory.branch_id),  // number -> string
    is_active: apiCategory.is_active,
  }
}
```

Las reglas de conversion estan documentadas:

| Campo | Backend | Frontend | Conversion |
|-------|---------|----------|------------|
| IDs | `number` | `string` | `String(id)` / `parseInt(id, 10)` |
| Precios | centavos (`12550`) | pesos (`125.50`) | `/ 100` / `* 100` |
| Status | UPPERCASE | lowercase | `.toLowerCase()` |

**Beneficio:** Cada mundo trabaja con sus convenciones nativas. El backend usa enteros para IDs (rendimiento en DB), el frontend usa strings (React keys). La conversion se hace en un solo punto.

---

### 3.3 Composite (Jerarquia de Menu)

**Que es:** Compone objetos en estructuras de arbol para representar jerarquias parte-todo.

**Donde se usa:** El modelo de datos del menu es un arbol de tres niveles:

```
Tenant (Restaurant)
  -> Branch (N)
       -> Category (N)
            -> Subcategory (N)
                 -> Product (N)
```

**Implementacion:** Cada nivel tiene su propio servicio de dominio que entiende la relacion padre-hijo:

```python
# CategoryService valida que el branch exista
def _validate_create(self, data, tenant_id):
    branch = self._db.scalar(
        select(Branch).where(Branch.id == data["branch_id"], Branch.tenant_id == tenant_id)
    )

# Y valida que no tenga hijos antes de borrar
def _validate_delete(self, entity, tenant_id):
    active_subcategories = self._db.scalar(
        select(func.count()).select_from(Subcategory)
        .where(Subcategory.category_id == entity.id, Subcategory.is_active.is_(True))
    )
    if active_subcategories > 0:
        raise ValidationError(
            f"La categoria tiene {active_subcategories} subcategorias activas."
        )
```

**Beneficio:** El cascade delete baja por el arbol recursivamente, y las validaciones impiden borrar un nodo que tiene hijos activos.

---

### 3.4 Decorator/Middleware (Security, CORS, Headers)

**Que es:** Agrega responsabilidades adicionales a un objeto de forma dinamica, como un "envoltorio". En FastAPI se implementa como middleware chain.

**Donde se usa:**
- `backend/shared/infrastructure/correlation.py` -- Correlation ID middleware
- `backend/rest_api/main.py` -- Security headers, CORS, content-type validation
- `backend/shared/security/rate_limit.py` -- Rate limiting middleware

**Implementacion:**

El `CorrelationIdMiddleware` es un decorator clasico -- envuelve cada request con un ID de trazabilidad:

```python
# backend/shared/infrastructure/correlation.py
class CorrelationIdMiddleware(BaseHTTPMiddleware):
    HEADER_NAME = "X-Request-ID"

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get(self.HEADER_NAME) or str(uuid.uuid4())
        token = request_id_var.set(request_id)
        try:
            request.state.request_id = request_id
            response = await call_next(request)
            response.headers[self.HEADER_NAME] = request_id
            return response
        finally:
            request_id_var.reset(token)
```

**Beneficio:** Cada middleware agrega UNA responsabilidad (CORS, headers, correlation ID, rate limit). Se componen como capas de una cebolla sin que uno sepa del otro.

---

## 4. Patrones de Comportamiento

### 4.1 Strategy (Auth Strategies en WS Gateway)

**Que es:** Define una familia de algoritmos intercambiables encapsulados en clases. El cliente elige cual usar en runtime.

**Donde se usa:**
- `ws_gateway/components/auth/strategies.py` -- 5 estrategias de autenticacion

**Implementacion:**

Interfaz abstracta:

```python
# ws_gateway/components/auth/strategies.py
class AuthStrategy(ABC):
    """PATTERN: Strategy - Encapsulates authentication algorithm."""

    @abstractmethod
    async def authenticate(self, websocket, token) -> AuthResult:
        pass

    @abstractmethod
    async def revalidate(self, token) -> bool:
        pass
```

Implementaciones concretas:

```python
class JWTAuthStrategy(AuthStrategy, OriginValidationMixin):
    """JWT token authentication for staff."""
    def __init__(self, required_roles: list[str]):
        self._required_roles = required_roles

    async def authenticate(self, websocket, token) -> AuthResult:
        if not self.validate_origin(websocket):
            return AuthResult.forbidden("Origin not allowed")
        claims = verify_jwt(token)
        if not any(role in claims.get("roles", []) for role in self._required_roles):
            return AuthResult.forbidden("Access denied")
        return AuthResult.ok(claims)

class TableTokenAuthStrategy(AuthStrategy, OriginValidationMixin):
    """HMAC table token for diners."""
    async def authenticate(self, websocket, token) -> AuthResult:
        if not self.validate_origin(websocket):
            return AuthResult.forbidden("Origin not allowed")
        token_data = verify_table_token(token)
        return AuthResult.ok(token_data)
```

Cada endpoint de WebSocket elige su strategy:

```python
# /ws/waiter -> JWTAuthStrategy(["WAITER", "MANAGER", "ADMIN"])
# /ws/kitchen -> JWTAuthStrategy(["KITCHEN", "MANAGER", "ADMIN"])
# /ws/diner  -> TableTokenAuthStrategy()
```

**Beneficio:** Si maniana agregamos OAuth2 o API Keys, se crea una nueva strategy sin tocar las existentes. Open-Closed Principle en estado puro.

---

### 4.2 Observer (WebSocket Pub/Sub, Zustand Subscriptions)

**Que es:** Cuando un objeto cambia de estado, todos sus observadores son notificados automaticamente.

**Donde se usa:**
- Redis Pub/Sub -- REST API publica, WS Gateway suscribe
- Zustand stores -- Componentes React se suscriben a slices especificos del estado
- `pwaWaiter/src/stores/tablesStore.ts` -- Escucha eventos WS y actualiza estado

**Implementacion (Frontend):**

```typescript
// pwaMenu/src/stores/sessionStore.ts

// Selectors: cada componente observa SOLO lo que necesita
export const selectSessionId = (state: SessionState) => state.sessionId
export const selectTableToken = (state: SessionState) => state.tableToken
export const selectSessionStatus = (state: SessionState) => state.sessionStatus

// Stable empty arrays para React 19 getSnapshot compatibility
const EMPTY_DINERS: Diner[] = []
const EMPTY_ROUNDS: RoundOutput[] = []
```

**Implementacion (Backend):**

```python
# El REST API publica a un canal Redis (observable)
await publish_event(redis_client, channel_branch_waiters(branch_id), event)

# El WS Gateway esta suscripto (observer) y routea
class EventRouter:
    async def route_event(self, event):
        if branch_id is not None:
            result.admin_sent = await self._manager.send_to_admins(branch_id, event)
            if not admin_only:
                result.waiter_sent = await self._manager.send_to_sector(sector_id, event)
        if to_session and session_id:
            result.diner_sent = await self._manager.send_to_session(session_id, event)
```

**Beneficio:** Desacoplamiento total. El endpoint que crea un round no sabe cuantos mozos estan conectados. Publica y se olvida.

---

### 4.3 Chain of Responsibility (Middleware Pipeline, Composite Auth)

**Que es:** Pasa un request por una cadena de handlers donde cada uno decide si lo procesa o lo pasa al siguiente.

**Donde se usa:**
- `ws_gateway/components/auth/strategies.py` -- `CompositeAuthStrategy`
- Pipeline de middlewares de FastAPI (CORS -> Security Headers -> Correlation ID -> Rate Limit -> Router)

**Implementacion:**

```python
# ws_gateway/components/auth/strategies.py
class CompositeAuthStrategy(AuthStrategy):
    """PATTERN: Chain of Responsibility - Try strategies until one succeeds."""

    def __init__(self, strategies: list[AuthStrategy]):
        if not strategies:
            raise ValueError("At least one strategy required")
        self._strategies = strategies

    async def authenticate(self, websocket, token) -> AuthResult:
        last_result = None
        for strategy in self._strategies:
            result = await strategy.authenticate(websocket, token)
            if result.success:
                return result
            last_result = result
        return last_result or AuthResult.fail("No authentication strategy succeeded")
```

**Beneficio:** Un endpoint puede aceptar multiples metodos de auth (JWT o Table Token) sin logica condicional. La cadena prueba cada uno en orden.

---

### 4.4 State (Table Sessions, Round Lifecycle)

**Que es:** Un objeto cambia de comportamiento cuando cambia su estado interno. Parece que el objeto cambio de clase.

**Donde se usa:**
- Ciclo de vida de sesiones: `OPEN -> PAYING -> CLOSED`
- Ciclo de vida de rounds: `PENDING -> CONFIRMED -> SUBMITTED -> IN_KITCHEN -> READY -> SERVED`
- `backend/shared/utils/exceptions.py` -- `InvalidStateError`, `InvalidTransitionError`

**Implementacion:**

Las excepciones tipadas previenen transiciones invalidas:

```python
# backend/shared/utils/exceptions.py
class InvalidStateError(ValidationError):
    def __init__(self, entity, current_state, expected_states=None):
        if expected_states:
            states_str = ", ".join(expected_states)
            detail = f"{entity} esta en estado '{current_state}', se esperaba: {states_str}"
        else:
            detail = f"{entity} no puede estar en estado '{current_state}' para esta operacion"

class InvalidTransitionError(ValidationError):
    def __init__(self, entity, from_status, to_status):
        detail = f"Transicion invalida de '{from_status}' a '{to_status}' para {entity}"
```

El flujo de rounds tiene restricciones por rol:

```
PENDING -> CONFIRMED -> SUBMITTED -> IN_KITCHEN -> READY -> SERVED
(Diner)   (Waiter)   (Admin/Mgr)   (Kitchen)  (Kitchen) (Staff)
```

**Beneficio:** Los estados y transiciones estan centralizados. Un diner no puede marcar un round como `IN_KITCHEN`. El sistema rechaza transiciones invalidas con mensajes claros.

---

### 4.5 Template Method (Base Services con Hooks)

**Que es:** Define el esqueleto de un algoritmo en una clase base, dejando que las subclases redefinan pasos especificos sin cambiar la estructura.

**Donde se usa:**
- `backend/rest_api/services/base_service.py` -- `BaseCRUDService` con hooks

**Implementacion:**

El metodo `create()` define la estructura y las subclases solo redefinen hooks:

```python
# backend/rest_api/services/base_service.py
class BaseCRUDService(BaseService[ModelT], Generic[ModelT, OutputT]):

    def create(self, data, tenant_id, user_id, user_email) -> OutputT:
        # Step 1: Validate (hook - subclass overrides)
        self._validate_create(data, tenant_id)
        # Step 2: Validate images (built-in)
        data = self._validate_image_urls(data)
        # Step 3: Create entity (built-in)
        entity = self._model(**{**data, "tenant_id": tenant_id})
        set_created_by(entity, user_id, user_email)
        self._db.add(entity)
        safe_commit(self._db)
        # Step 4: Post-create hook (subclass overrides)
        self._after_create(entity, user_id, user_email)
        return self.to_output(entity)

    # Hooks for subclasses
    def _validate_create(self, data, tenant_id): pass
    def _validate_update(self, entity, data, tenant_id): pass
    def _validate_delete(self, entity, tenant_id): pass
    def _after_create(self, entity, user_id, user_email): pass
    def _after_update(self, entity, old_values, user_id, user_email): pass
    def _after_delete(self, entity_info, user_id, user_email): pass
```

`CategoryService` redefine `_validate_create` y `_after_delete`. `ProductService` seguramente redefine mas hooks. Pero la estructura `validar -> crear -> audit -> evento` es siempre la misma.

**Beneficio:** Los 14 domain services comparten la misma estructura CRUD. Cada uno solo define sus reglas de negocio especificas.

---

### 4.6 Null Object (NullAuthStrategy)

**Que es:** Proporciona un objeto que representa "no hacer nada", evitando null checks en el codigo cliente.

**Donde se usa:**
- `ws_gateway/components/auth/strategies.py` -- `NullAuthStrategy`

**Implementacion:**

```python
# ws_gateway/components/auth/strategies.py
class NullAuthStrategy(AuthStrategy):
    """Null strategy that always succeeds or fails. PATTERN: Null Object."""

    def __init__(self, always_succeed=True, mock_data=None):
        self._always_succeed = always_succeed
        self._mock_data = mock_data or {
            "sub": "1", "tenant_id": 1, "roles": ["ADMIN"], "branch_ids": [1],
        }

    async def authenticate(self, websocket, token) -> AuthResult:
        if self._always_succeed:
            return AuthResult.ok(self._mock_data)
        return AuthResult.fail("Auth disabled")
```

**Beneficio:** En tests, no necesitas mockear toda la cadena de auth. Inyectas un `NullAuthStrategy` y listo.

---

## 5. Patrones de Dominio

### 5.1 Repository Pattern

**Que es:** Abstrae el acceso a datos detras de una interfaz de coleccion. Los servicios no escriben queries SQL directamente.

**Donde se usa:**
- `backend/rest_api/services/crud/repository.py` -- `BaseRepository`, `TenantRepository`, `BranchRepository`

**Implementacion:**

Jerarquia de repositorios con isolation automatico:

```python
# backend/rest_api/services/crud/repository.py
class BaseRepository(Generic[ModelT]):
    """Base: sin tenant isolation."""
    def find_by_id(self, entity_id, *, options=None, include_inactive=False):
        query = self._base_query().where(self._model.id == entity_id)
        query = self._apply_active_filter(query, include_inactive)
        return self._session.scalar(query)

class TenantRepository(BaseRepository[ModelT]):
    """Agrega filtro automatico por tenant_id."""
    def _tenant_query(self, tenant_id):
        return self._base_query().where(self._model.tenant_id == tenant_id)

    def find_all(self, tenant_id, *, options=None, limit=None, offset=None, order_by=None):
        query = self._tenant_query(tenant_id)
        query = self._apply_active_filter(query, include_inactive=False)
        # ... limit, offset, order_by
        return self._session.scalars(query).all()

class BranchRepository(TenantRepository[ModelT]):
    """Agrega filtro por branch_id encima del tenant."""
    def find_by_branch(self, branch_id, tenant_id, **kwargs):
        query = self._tenant_query(tenant_id).where(self._model.branch_id == branch_id)
        # ...
```

**Beneficio:** Multi-tenancy esta built-in. Es IMPOSIBLE que un `TenantRepository.find_all(tenant_id=1)` devuelva datos del tenant 2. El filtro se aplica automaticamente.

---

### 5.2 Domain Service Pattern

**Que es:** Logica de negocio que no pertenece a una sola entidad se encapsula en un servicio de dominio.

**Donde se usa:**
- `backend/rest_api/services/domain/` -- 14 servicios de dominio

**Implementacion:**

```python
# backend/rest_api/services/domain/__init__.py
__all__ = [
    "CategoryService", "SubcategoryService", "BranchService",
    "TableService", "SectorService", "ProductService",
    "AllergenService", "StaffService", "PromotionService",
    "TicketService", "RoundService", "ServiceCallService",
    "BillingService", "DinerService",
]
```

Cada servicio hereda de `BaseCRUDService` o `BranchScopedService`:

```python
# Ejemplo minimo de un domain service
class CategoryService(BranchScopedService[Category, CategoryOutput]):
    def __init__(self, db: Session):
        super().__init__(db=db, model=Category,
                         output_schema=CategoryOutput, entity_name="Categoria")

    def list_by_branch_ordered(self, tenant_id, branch_id, **kwargs):
        return self.list_by_branch(tenant_id=tenant_id, branch_id=branch_id,
                                    order_by=Category.order, **kwargs)
```

**Beneficio:** La logica de negocio esta testeable sin HTTP, sin base de datos real (se puede mockear el repo). Y es reutilizable desde cualquier endpoint.

---

### 5.3 Aggregate Root

**Que es:** Una entidad "raiz" que controla el acceso a un cluster de objetos relacionados. Solo se modifica el agregado a traves de la raiz.

**Donde se usa:** El agregado mas importante del sistema:

```
Table (raiz)
  -> TableSession (1 activa)
       -> Diner (N)
       -> Round (N)
            -> RoundItem (N)
            -> KitchenTicket (N)
       -> Check (1)
            -> Charge (N)
            -> Payment (N)
       -> ServiceCall (N)
```

**Implementacion:**

El cascade delete respeta la estructura del agregado:

```python
# backend/rest_api/services/crud/soft_delete.py
CASCADE_RELATIONSHIPS = {
    TableSession: [
        (Diner, "session_id"),
        (Round, "session_id"),
        (ServiceCall, "session_id"),
        (Check, "session_id"),
    ],
    Round: [
        (RoundItem, "round_id"),
        (KitchenTicket, "round_id"),
    ],
    Check: [
        (Charge, "check_id"),
        (Payment, "check_id"),
    ],
}
```

**Beneficio:** Cuando se cierra una sesion, TODO el arbol se borra recursivamente. No quedan rounds huerfanos ni diners sin sesion.

---

### 5.4 Soft Delete Convention

**Que es:** En lugar de borrar registros fisicamente, se marcan como inactivos preservando el historial de audit.

**Donde se usa:**
- `backend/rest_api/services/crud/soft_delete.py`
- Todas las entidades con `AuditMixin`

**Implementacion:**

```python
# backend/rest_api/services/crud/soft_delete.py
def soft_delete(db, entity, user_id, user_email):
    entity.soft_delete(user_id, user_email)  # Sets is_active=False + audit fields
    try:
        db.commit()
        db.refresh(entity)
    except Exception:
        db.rollback()
        raise
    return entity

# Cascade version - recursivo
def cascade_soft_delete(db, entity, user_id, user_email, commit=True):
    affected = []
    relationships = CASCADE_RELATIONSHIPS.get(type(entity), [])
    for child_model, foreign_key in relationships:
        children = db.execute(
            select(child_model).where(
                getattr(child_model, foreign_key) == entity.id,
                child_model.is_active.is_(True),
            )
        ).scalars().all()
        for child in children:
            child_affected = cascade_soft_delete(db, child, user_id, user_email, commit=False)
            affected.extend(child_affected)
            child.soft_delete(user_id, user_email)
    entity.soft_delete(user_id, user_email)
    if commit:
        db.commit()
    return affected
```

Los repositorios aplican `is_active` automaticamente:

```python
def _apply_active_filter(self, query, include_inactive):
    if hasattr(self._model, "is_active") and not include_inactive:
        query = query.where(self._model.is_active.is_(True))
    return query
```

**Beneficio:** Compliance, auditoria, y la posibilidad de restaurar datos borrados. Nunca se pierde informacion.

---

### 5.5 Specification Pattern

**Que es:** Encapsula reglas de consulta en objetos reutilizables y combinables con operadores logicos.

**Donde se usa:**
- `backend/rest_api/services/crud/repository.py` -- `SpecificationRepository`, `Specification`

**Implementacion:**

```python
# backend/rest_api/services/crud/repository.py
class Specification:
    def to_expression(self): raise NotImplementedError
    def __and__(self, other): return AndSpecification(self, other)
    def __or__(self, other): return OrSpecification(self, other)
    def __invert__(self): return NotSpecification(self)

class AndSpecification(Specification):
    def __init__(self, left, right):
        self._left, self._right = left, right
    def to_expression(self):
        from sqlalchemy import and_
        return and_(self._left.to_expression(), self._right.to_expression())

# Usage example from docstring:
class VegetarianSpec(Specification):
    def to_expression(self):
        return Product.is_vegetarian.is_(True)

class CategorySpec(Specification):
    def __init__(self, category_id):
        self.category_id = category_id
    def to_expression(self):
        return Product.category_id == self.category_id

# Combinacion: vegetarianos de la categoria entradas
vegetarian_entradas = repo.find_by_spec(
    VegetarianSpec() & CategorySpec(entradas_id), tenant_id=1,
)
```

**Beneficio:** Filtros complejos se componen como LEGOs con `&`, `|` y `~`. Cada spec es testeable y reutilizable.

---

### 5.6 Permission Context (RBAC)

**Que es:** Encapsula el contexto de permisos del usuario en un objeto que expone metodos declarativos para verificar acceso.

**Donde se usa:**
- Referenciado en `CLAUDE.md` como `PermissionContext`
- Base service usa `validate_branch_access()` en `BranchScopedService`

**Implementacion:**

```python
# Documentado en CLAUDE.md (patron de uso)
from rest_api.services.permissions import PermissionContext

ctx = PermissionContext(user)
ctx.require_management()           # Raises ForbiddenError if not ADMIN/MANAGER
ctx.require_branch_access(branch_id)
```

Y en BranchScopedService, la validacion de acceso a branch:

```python
# backend/rest_api/services/base_service.py
class BranchScopedService:
    def validate_branch_access(self, entity, user_branch_ids):
        if user_branch_ids is None:
            return  # Admin has full access
        entity_branch_id = getattr(entity, "branch_id", None)
        if entity_branch_id and entity_branch_id not in user_branch_ids:
            raise ForbiddenError(
                f"acceder a este {self._entity_name.lower()}",
                branch_id=entity_branch_id,
            )
```

Roles del sistema: `ADMIN > MANAGER > WAITER | KITCHEN`

**Beneficio:** Las reglas de RBAC estan centralizadas. No hay `if user.role == "ADMIN"` disperso por los routers.

---

## 6. Patrones de Infraestructura

### 6.1 Transactional Outbox

**Que es:** Escribe el evento de dominio en la MISMA transaccion que los datos de negocio. Un procesador separado lee la tabla outbox y publica los eventos. Garantiza consistencia eventual sin perder eventos.

**Donde se usa:**
- `backend/rest_api/services/events/outbox_service.py`

**Implementacion:**

```python
# backend/rest_api/services/events/outbox_service.py
def write_outbox_event(db, tenant_id, event_type, aggregate_type, aggregate_id, payload):
    """MUST be called within the same transaction as the business operation."""
    outbox_event = OutboxEvent(
        tenant_id=tenant_id,
        event_type=event_type,
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        payload=json.dumps(payload),
        status=OutboxStatus.PENDING,
        retry_count=0,
    )
    db.add(outbox_event)
    # Don't flush/commit - let the caller control the transaction
    return outbox_event

# Convenience functions for specific domains
def write_billing_outbox_event(db, tenant_id, event_type, check_id, branch_id, session_id, ...):
    payload = {"branch_id": branch_id, "session_id": session_id, "check_id": check_id, ...}
    return write_outbox_event(db, tenant_id, event_type, "check", check_id, payload)

def write_round_outbox_event(db, tenant_id, event_type, round_id, branch_id, session_id, ...):
    return write_outbox_event(db, tenant_id, event_type, "round", round_id, ...)

def write_service_call_outbox_event(db, tenant_id, event_type, call_id, ...):
    return write_outbox_event(db, tenant_id, event_type, "service_call", call_id, ...)
```

Uso en endpoint:

```python
round = Round(...)
db.add(round)
write_round_outbox_event(db=db, tenant_id=tenant_id, event_type="ROUND_SUBMITTED",
                          round_id=round.id, branch_id=round.branch_id, ...)
db.commit()  # ATOMICO: round + evento se guardan juntos
```

**Beneficio:** Si el commit falla, ni el round ni el evento se guardan. Si el commit tiene exito, el evento esta GARANTIZADO para publicarse despues. No se pierden eventos criticos (pagos, rounds).

---

### 6.2 Circuit Breaker

**Que es:** Previene cascadas de fallos cortando llamadas a un servicio que esta caido. Tres estados: CLOSED (normal), OPEN (rechaza todo), HALF_OPEN (prueba recovery).

**Donde se usa:**
- `ws_gateway/components/resilience/circuit_breaker.py` -- Para Redis en WS Gateway
- `backend/shared/infrastructure/events/circuit_breaker.py` -- Para event publishing

**Implementacion:**

```python
# ws_gateway/components/resilience/circuit_breaker.py
class CircuitBreaker:
    def __init__(self, name, failure_threshold=5, recovery_timeout=30.0, half_open_max_calls=3):
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._lock = threading.Lock()  # Thread-safe

    async def __aenter__(self):
        self._before_call_sync()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if exc_type is None:
            self.record_success()
        else:
            self.record_failure(exc_val)
        return False

    def record_failure(self, error=None):
        with self._lock:
            self._failure_count += 1
            if self._state == CircuitState.HALF_OPEN:
                self._transition_to(CircuitState.OPEN)
            elif self._failure_count >= self._failure_threshold:
                self._transition_to(CircuitState.OPEN)

    def record_success(self):
        with self._lock:
            if self._state == CircuitState.HALF_OPEN:
                self._transition_to(CircuitState.CLOSED)
            self._failure_count = 0

    # Decorator version
    @breaker.protect
    async def call_redis():
        return await redis.get("key")
```

Uso en event publishing:

```python
# backend/shared/infrastructure/events/publisher.py
circuit_breaker = get_event_circuit_breaker()
if not circuit_breaker.can_execute():
    logger.warning("Event publish skipped - circuit breaker open")
    return 0  # Fail-fast

for attempt in range(max_retries):
    try:
        result = await redis_client.publish(channel, event_json)
        circuit_breaker.record_success()
        return result
    except Exception as e:
        # ... retry with exponential backoff + jitter
        
circuit_breaker.record_failure()
```

**Beneficio:** Si Redis se cae, despues de 5 fallos el circuit breaker corta TODAS las llamadas por 30 segundos. Esto evita que 400 WebSockets saturen el sistema con retries.

---

### 6.3 Rate Limiter (Sliding Window)

**Que es:** Limita la cantidad de operaciones por ventana de tiempo usando un algoritmo de sliding window.

**Donde se usa:**
- `ws_gateway/components/connection/rate_limiter.py` -- WebSocket per-connection
- `backend/shared/security/rate_limit.py` -- HTTP endpoints con Redis + Lua

**Implementacion (WebSocket):**

```python
# ws_gateway/components/connection/rate_limiter.py
class WebSocketRateLimiter:
    """Per-connection rate limiter using sliding window counter algorithm."""

    async def is_allowed(self, ws) -> bool:
        now = time.time()
        window_start = now - self._window_seconds
        async with self._lock:
            # Remove timestamps outside the window
            self._counters[ws] = [t for t in self._counters[ws] if t > window_start]
            # Check if under limit
            if len(self._counters[ws]) >= self._max_messages:
                self._total_rejected += 1
                return False
            self._counters[ws].append(now)
            return True
```

**Implementacion (HTTP con Lua atomico):**

```python
# backend/shared/security/rate_limit.py
RATE_LIMIT_LUA_SCRIPT = """
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

local count = redis.call('INCR', key)
if count == 1 then
    redis.call('EXPIRE', key, window)
end

local ttl = redis.call('TTL', key)
if ttl == -1 then
    redis.call('EXPIRE', key, window)
    ttl = window
end

return {count, ttl}
"""
```

**Beneficio:** Previene DoS y abuso. El Lua script es ATOMICO en Redis: no hay race condition donde el INCR pasa pero el EXPIRE no.

---

### 6.4 Connection Pool (Redis, PostgreSQL)

**Que es:** Reutiliza un conjunto pre-creado de conexiones en vez de crear una nueva por request.

**Donde se usa:**
- `backend/shared/infrastructure/db.py` -- Pool PostgreSQL
- `backend/shared/infrastructure/events/redis_pool.py` -- Pool Redis async + sync

**Implementacion:**

PostgreSQL con pool size dinamico:

```python
# backend/shared/infrastructure/db.py
def _calculate_pool_size():
    """Formula: (2 * CPU cores) + 1, capped at 20."""
    cores = os.cpu_count() or 4
    return min(cores * 2 + 1, 20)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,    # Verify connections before using
    pool_size=_calculate_pool_size(),
    max_overflow=15,
    pool_timeout=30,
    pool_recycle=1800,     # Recycle after 30 minutes
)
```

Redis con pools separados para async y sync:

```python
# Async pool para event publishing
_redis_pool = redis.from_url(REDIS_URL, max_connections=settings.redis_pool_max_connections)

# Sync pool para token blacklist, rate limiting
_redis_sync_pool = redis_sync.ConnectionPool.from_url(
    REDIS_URL, max_connections=settings.redis_sync_pool_max_connections)
```

**Beneficio:** Con 400+ usuarios concurrentes, crear una conexion por request seria suicidio. El pool reutiliza conexiones existentes, reduciendo latencia de ~50ms (connection setup) a ~0ms.

---

### 6.5 Health Check Pattern

**Que es:** Endpoints que reportan el estado de salud de los servicios y sus dependencias.

**Donde se usa:**
- `backend/shared/utils/health.py` -- Decorator y aggregador de health checks

**Implementacion:**

```python
# backend/shared/utils/health.py
@health_check_with_timeout(timeout=3.0, component="redis")
async def check_redis_health():
    await redis.ping()
    return {"pool_size": 10}

# Returns: HealthCheckResult(status=HEALTHY, component="redis", latency_ms=5.2)
# On timeout: HealthCheckResult(status=UNHEALTHY, error="timeout after 3.0s")

# Aggregador concurrente
result = await aggregate_health_checks([
    check_redis_health(),
    check_database_health(),
])
# Returns: {"status": "healthy"|"degraded", "components": {...}}
```

Docker Compose tambien tiene health checks:

```yaml
# devOps/docker-compose.yml
backend:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
    interval: 30s
    timeout: 10s
    retries: 3
```

**Beneficio:** Monitoring automatico. Si Redis tarda mas de 3 segundos en responder, el health check lo detecta como UNHEALTHY. Docker reinicia el servicio automaticamente.

---

### 6.6 Correlation ID / Request Tracing

**Que es:** Cada request lleva un ID unico que se propaga por todos los servicios, permitiendo rastrear una operacion end-to-end en los logs.

**Donde se usa:**
- `backend/shared/infrastructure/correlation.py` -- Middleware + ContextVar + Logging filter

**Implementacion:**

```python
# backend/shared/infrastructure/correlation.py

# Thread-safe context variable
request_id_var: ContextVar[str] = ContextVar("request_id", default="")

class CorrelationIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        token = request_id_var.set(request_id)
        try:
            request.state.request_id = request_id
            response = await call_next(request)
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            request_id_var.reset(token)

class CorrelationIdFilter:
    """Adds request_id to all log records automatically."""
    def filter(self, record):
        record.request_id = request_id_var.get() or "-"
        return True
```

En los logs aparece asi:

```
[14:23:45] INFO     [abc12345] rest_api.billing: Check requested (check_id=42)
[14:23:45] INFO     [abc12345] rest_api.events: Outbox event queued (event_type=CHECK_REQUESTED)
```

**Beneficio:** Cuando algo falla en produccion, buscar por correlation ID te da toda la traza en un grep.

---

### 6.7 Event Publishing con Retry y Backoff

**Que es:** Reintentar publicacion de eventos con backoff exponencial y jitter cuando Redis falla momentaneamente.

**Donde se usa:**
- `backend/shared/infrastructure/events/publisher.py`

**Implementacion:**

```python
# backend/shared/infrastructure/events/publisher.py
async def publish_event(redis_client, channel, event):
    event_json = event.to_json()
    _validate_event_size(event_json, event.type)  # Max size check

    circuit_breaker = get_event_circuit_breaker()
    if not circuit_breaker.can_execute():
        return 0

    for attempt in range(settings.redis_publish_max_retries):
        try:
            result = await redis_client.publish(channel, event_json)
            circuit_breaker.record_success()
            return result
        except Exception as e:
            if attempt < settings.redis_publish_max_retries - 1:
                delay = calculate_retry_delay_with_jitter(
                    attempt, settings.redis_publish_retry_delay)
                await asyncio.sleep(delay)

    circuit_breaker.record_failure()
    raise last_error
```

**Beneficio:** Fallos transientes de Redis (network blip) no pierden eventos. El jitter evita thundering herd cuando multiples workers reintentan al mismo tiempo.

---

## 7. Patrones Frontend

### 7.1 Zustand Store con Selectors

**Que es:** Gestion de estado con selectors granulares que previenen re-renders innecesarios. Es EL patron mas critico del frontend.

**Donde se usa:**
- `Dashboard/src/stores/` -- 22 stores
- `pwaMenu/src/stores/` -- 3 stores
- `pwaWaiter/src/stores/` -- 4 stores

**Implementacion:**

```typescript
// pwaMenu/src/stores/sessionStore.ts

// Stable empty arrays for React 19
const EMPTY_DINERS: Diner[] = []
const EMPTY_ROUNDS: RoundOutput[] = []

// Exported selectors (cada componente elige exactamente lo que necesita)
export const selectSessionId = (state: SessionState) => state.sessionId
export const selectTableToken = (state: SessionState) => state.tableToken

// Store con persist middleware
export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      sessionId: null,
      tableId: null,
      diners: EMPTY_DINERS,
      rounds: EMPTY_ROUNDS,
      // ...
    }),
    { name: 'session-store' }
  )
)
```

**Regla critica -- NUNCA destructurar:**

```typescript
// CORRECTO: Selector
const items = useStore(selectItems)
const addItem = useStore((s) => s.addItem)

// INCORRECTO: Destructuring (causa infinite re-render loops)
// const { items } = useStore()  // NUNCA

// Para arrays filtrados: useShallow obligatorio
import { useShallow } from 'zustand/react/shallow'
const activeItems = useStore(useShallow(state => state.items.filter(i => i.active)))
```

**Beneficio:** Un componente que solo usa `selectSessionId` NO se re-renderiza cuando cambian los rounds o los diners. Performance critica para 400+ usuarios concurrentes en el menu compartido.

---

### 7.2 Custom Hooks (useFormModal, useConfirmDialog)

**Que es:** Hooks reutilizables que encapsulan logica comun de UI eliminando boilerplate en las 16 paginas CRUD.

**Donde se usa:**
- `Dashboard/src/hooks/useFormModal.ts`
- `Dashboard/src/hooks/useConfirmDialog.ts`
- 9 de 11 paginas CRUD migradas

**Implementacion:**

```typescript
// Dashboard/src/hooks/useFormModal.ts
export function useFormModal<T, S = T>(initialFormData: T): UseFormModalReturn<T, S> {
  const [isOpen, setIsOpen] = useState(false)
  const [formData, setFormData] = useState<T>(initialFormData)
  const [selectedItem, setSelectedItem] = useState<S | null>(null)

  const openCreate = useCallback((customInitialData?: Partial<T>) => {
    setFormData(customInitialData ? { ...initialFormData, ...customInitialData } : initialFormData)
    setSelectedItem(null)
    setIsOpen(true)
  }, [initialFormData])

  const openEdit = useCallback((item: S, customFormData?: T) => {
    setFormData(customFormData || (item as unknown as T))
    setSelectedItem(item)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    closeTimeoutRef.current = window.setTimeout(() => {
      setFormData(initialFormData)
      setSelectedItem(null)
    }, 200)  // Reset after animation
  }, [initialFormData])

  return { isOpen, formData, selectedItem, setFormData, openCreate, openEdit, close, reset }
}
```

Antes (3 useState por pagina):

```typescript
const [isModalOpen, setIsModalOpen] = useState(false)
const [editingItem, setEditingItem] = useState(null)
const [formData, setFormData] = useState({ name: '', ... })
```

Despues (1 hook):

```typescript
const modal = useFormModal<CategoryFormData>({ name: '', order: 0, is_active: true })
modal.openCreate()
modal.openEdit(category, { name: category.name, ... })
modal.close()
```

**Beneficio:** Elimina ~30 lineas de boilerplate por pagina. 9 paginas x 30 lineas = ~270 lineas menos.

---

### 7.3 useRef Pattern para WebSocket y Callbacks

**Que es:** Usar `useRef` para callbacks en listeners de WebSocket y timeouts, evitando stale closures y re-suscripciones innecesarias.

**Donde se usa:**
- `Dashboard/src/hooks/useAdminWebSocket.ts`
- `pwaMenu/src/components/SharedCart.tsx`
- `pwaMenu/src/components/ProductDetailModal.tsx`

**Implementacion:**

```typescript
// Patron documentado en CLAUDE.md
const handleEventRef = useRef(handleEvent)
useEffect(() => { handleEventRef.current = handleEvent })

useEffect(() => {
  const unsubscribe = ws.on('*', (e) => handleEventRef.current(e))
  return unsubscribe
}, [])  // Empty deps - subscribe ONCE
```

Sin este patron, cada vez que `handleEvent` cambia (porque depende de estado), se re-suscribiria al WebSocket, causando duplicacion de listeners.

**Beneficio:** Una sola suscripcion al WebSocket, con el handler siempre actualizado via ref.

---

### 7.4 Lazy Loading / Code Splitting

**Que es:** Cargar componentes bajo demanda con `React.lazy()` y `Suspense`.

**Donde se usa:**
- `Dashboard/src/App.tsx` -- Las 19 paginas se cargan lazy
- `pwaMenu/` -- Componentes below-the-fold

**Implementacion:**

```typescript
// Dashboard/src/App.tsx
import { lazy, Suspense } from 'react'

const DashboardPage = lazy(() => import('./pages/Dashboard'))
const CategoriesPage = lazy(() => import('./pages/Categories'))
const ProductsPage = lazy(() => import('./pages/Products'))
// ... 16 paginas mas

<Suspense fallback={<PageLoader />}>
  <Route path="/" element={<DashboardPage />} />
  <Route path="/categories" element={<CategoriesPage />} />
</Suspense>
```

**Beneficio:** El bundle inicial solo carga el Login + Layout. Cada pagina se carga cuando el usuario navega a ella. Reduce el tiempo de carga inicial drasticamente.

---

### 7.5 i18n Pattern (pwaMenu)

**Que es:** Internacionalizacion con i18next para soporte multilenguaje (es/en/pt).

**Donde se usa:**
- `pwaMenu/src/i18n/index.ts` -- Configuracion
- `pwaMenu/src/i18n/locales/` -- es.json, en.json, pt.json

**Implementacion:**

```typescript
// pwaMenu/src/i18n/index.ts
export const SUPPORTED_LANGUAGES = ['es', 'en', 'pt'] as const

i18n
  .use(validatedLanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
      pt: { translation: pt },
    },
    fallbackLng: {
      en: ['es'],      // English falls back to Spanish
      pt: ['es'],      // Portuguese falls back to Spanish
      default: ['es'],
    },
    saveMissing: import.meta.env.DEV,
    missingKeyHandler: import.meta.env.DEV
      ? (lngs, _ns, key) => i18nLogger.warn(`Missing key: ${key}`)
      : undefined,
  })
```

Con detector custom que valida contra lenguajes soportados:

```typescript
const validatedLanguageDetector = new LanguageDetector()
validatedLanguageDetector.addDetector({
  name: 'validatedLocalStorage',
  lookup() {
    const stored = localStorage.getItem('pwamenu-language')
    if (stored && SUPPORTED_LANGUAGES.includes(stored as SupportedLanguage)) {
      return stored
    }
    return undefined
  },
})
```

**Beneficio:** ZERO strings hardcodeadas en pwaMenu. Todo pasa por `t()`. Si faltan traducciones en ingles/portugues, fallback a espanol.

---

### 7.6 Optimistic Updates (React 19)

**Que es:** Actualizar la UI inmediatamente antes de que el servidor confirme, haciendo rollback si falla.

**Donde se usa:**
- `pwaMenu/src/hooks/useOptimisticCart.ts` -- React 19's `useOptimistic`
- `pwaMenu/src/stores/tableStore/store.ts` -- Optimistic rollback en `submitOrder()`

**Implementacion (documentado en pwaMenu CLAUDE.md):**

```typescript
// React 19 useOptimistic hook
import { useOptimistic } from 'react'

function useOptimisticCart() {
  const [optimisticCart, addOptimistic] = useOptimistic(
    cart,
    (state, newItem) => [...state, newItem]
  )
  // Instant UI update, rollback on error
}
```

**Beneficio:** El usuario ve el item en el carrito instantaneamente. Si el server rechaza, se revierte. Percepcion de velocidad clave en mobile.

---

### 7.7 Token Refresh & Auth Guard

**Que es:** Renovar tokens de acceso automaticamente antes de que expiren, con jitter para evitar timing attacks.

**Donde se usa:**
- `Dashboard/src/stores/authStore.ts` -- Refresh con jitter (14 min +/- 2 min)
- `pwaWaiter/src/stores/authStore.ts` -- Refresh cada 14 minutos

**Implementacion:**

```typescript
// Dashboard/src/stores/authStore.ts
const BASE_REFRESH_INTERVAL_MS = 14 * 60 * 1000  // 14 min (1 min before 15 min expiry)
const JITTER_RANGE_MS = 2 * 60 * 1000            // +/- 2 min

function getRefreshIntervalWithJitter(): number {
  const jitter = (Math.random() - 0.5) * 2 * JITTER_RANGE_MS
  return Math.max(BASE_REFRESH_INTERVAL_MS + jitter, 60000)
}

function startTokenRefreshInterval(refreshFn) {
  const scheduleNextRefresh = () => {
    const interval = getRefreshIntervalWithJitter()
    refreshTimeoutId = setTimeout(async () => {
      const success = await refreshFn()
      if (success) {
        authBroadcast.postMessage({ type: 'TOKEN_REFRESHED' })  // Cross-tab sync
      }
      scheduleNextRefresh()
    }, interval)
  }
  scheduleNextRefresh()
}
```

**Beneficio:** El token se renueva ANTES de expirar. El jitter previene que todos los clients del mismo mozo hagan refresh al mismo segundo (timing attack vector).

---

### 7.8 Retry Queue Offline-First (pwaWaiter)

**Que es:** Cola persistente de operaciones fallidas que se reintentan cuando vuelve la conexion.

**Donde se usa:**
- `pwaWaiter/src/stores/retryQueueStore.ts`

**Implementacion:**

```typescript
// pwaWaiter/src/stores/retryQueueStore.ts
export type QueuedActionType =
  | 'MARK_ROUND_SERVED'
  | 'ACK_SERVICE_CALL'
  | 'RESOLVE_SERVICE_CALL'
  | 'CLEAR_TABLE'

interface QueuedAction {
  id: string
  type: QueuedActionType
  payload: Record<string, unknown>
  createdAt: string
  retryCount: number
  lastError?: string
}

// Execution by action type
async function executeAction(action: QueuedAction): Promise<void> {
  switch (action.type) {
    case 'MARK_ROUND_SERVED':
      await roundsAPI.markAsServed(action.payload.roundId as number)
      break
    case 'RESOLVE_SERVICE_CALL':
      await serviceCallsAPI.resolve(action.payload.serviceCallId as number)
      break
    case 'CLEAR_TABLE':
      await billingAPI.clearTable(action.payload.tableId as number)
      break
  }
}
```

Se persiste en localStorage para sobrevivir reinicios. Max 3 retries por action.

**Beneficio:** Un mozo en una zona con mala senal puede marcar rounds como servidos. La accion se encola y se ejecuta cuando vuelve la conexion. La PWA sigue siendo funcional offline.

---

## 8. Patrones de Testing

### 8.1 Backend (pytest)

**Que es:** Testing con pytest, fixtures para setup de DB y usuarios, markers para categorizar tests.

**Donde se usa:**
- `backend/tests/`

**Implementacion (de CLAUDE.md):**

```bash
cd backend && python -m pytest tests/test_auth.py -v     # Un solo archivo
cd backend && python -m pytest tests/ -v                  # Todos los tests
```

---

### 8.2 Frontend (Vitest)

**Que es:** Testing con Vitest en los tres frontends. Dashboard tiene 100+ tests.

**Donde se usa:**
- `Dashboard/src/stores/*.test.ts` -- Tests de stores
- `Dashboard/src/hooks/*.test.ts` -- Tests de hooks
- `pwaMenu/src/stores/*.test.ts`
- `pwaWaiter/src/stores/*.test.ts`

**Implementacion:**

```bash
cd Dashboard && npm test -- src/stores/branchStore.test.ts  # Watch mode, archivo unico
cd Dashboard && npm run test:coverage                        # Coverage report
cd pwaMenu && npm run test:run                               # Sin watch
cd pwaWaiter && npm run test:run                             # Sin watch
```

**Beneficio:** Tests rapidos (<4s para 100 tests). Cada store tiene tests que validan el estado, las mutaciones y las migraciones de version.

---

## 9. Patrones DevOps

### 9.1 Docker Compose Orchestration

**Que es:** Orquestacion de 5 servicios (DB, Redis, Backend, WS Gateway, pgAdmin) con un solo comando.

**Donde se usa:**
- `devOps/docker-compose.yml`

**Implementacion:**

```yaml
# devOps/docker-compose.yml
services:
  db:
    image: pgvector/pgvector:pg16
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d menu_ops"]
      interval: 10s
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    ports:
      - "6380:6379"  # 6380 to avoid local conflict

  backend:
    build: { context: .., dockerfile: backend/Dockerfile }
    depends_on:
      db: { condition: service_healthy }
      redis: { condition: service_healthy }
    command: ["python", "-m", "uvicorn", "rest_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
    volumes:
      - ../backend:/app/backend:ro  # Hot reload in dev

  ws_gateway:
    depends_on:
      backend: { condition: service_started }
    command: ["python", "-m", "uvicorn", "ws_gateway.main:app", "--host", "0.0.0.0", "--port", "8001", "--reload"]
```

**Beneficio:** `docker compose up -d --build` levanta todo el stack. Los `depends_on` con `service_healthy` garantizan que DB y Redis estan listos antes de iniciar el backend.

---

### 9.2 Health Checks en Servicios

**Que es:** Cada servicio declara como verificar que esta sano.

**Donde se usa:**
- `devOps/docker-compose.yml` -- Todos los servicios tienen healthcheck

**Implementacion:**

```yaml
db:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U postgres -d menu_ops"]
    interval: 10s
    retries: 5

redis:
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]

backend:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
    interval: 30s
    start_period: 30s  # Grace period for startup

ws_gateway:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8001/ws/health"]
```

**Beneficio:** Docker reinicia automaticamente un servicio que falla sus health checks. El `start_period` previene falsos positivos durante el startup.

---

### 9.3 Environment Configuration

**Que es:** Variables de entorno separadas por servicio y ambiente (dev/prod).

**Donde se usa:**
- `devOps/docker-compose.yml` -- Variables inline para desarrollo
- `.env.example` en cada sub-proyecto
- `backend/shared/config/settings.py` -- Lectura centralizada

**Implementacion:**

Docker Compose inyecta variables para desarrollo:

```yaml
backend:
  environment:
    - ENVIRONMENT=development
    - DEBUG=true
    - DATABASE_URL=postgresql+psycopg://postgres:postgres@db:5432/menu_ops
    - REDIS_URL=redis://redis:6379
    - JWT_SECRET=dev-secret-change-me-in-production
    - TABLE_TOKEN_SECRET=table-token-secret-change-me
```

Frontends usan Vite env vars:

```bash
VITE_API_URL=http://localhost:8000/api
VITE_WS_URL=ws://localhost:8001
VITE_BRANCH_SLUG=demo-branch
```

**Beneficio:** El mismo codigo corre en dev y prod. Solo cambian las variables de entorno.

---

## 10. Patrones de Seguridad

### 10.1 JWT + Refresh Token Strategy

**Que es:** Access tokens cortos (15 min) + refresh tokens largos (7 dias) con blacklist en Redis.

**Donde se usa:**
- `backend/shared/security/auth.py`
- `Dashboard/src/stores/authStore.ts`
- `pwaWaiter/src/stores/authStore.ts`

**Implementacion:**

```python
# backend/shared/security/auth.py
def sign_jwt(payload, ttl_seconds=None, token_type="access"):
    now = int(time.time())
    data = {
        **payload,
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "iat": now,
        "exp": now + ttl_seconds,
        "type": token_type,
        "jti": str(uuid.uuid4()),  # Unique ID for blacklisting
    }
    return jwt.encode(data, JWT_SECRET, algorithm="HS256")
```

Los frontends refrescan proactivamente:

```typescript
// Dashboard: refresh con jitter
const interval = 14min + random(-2min, +2min)
// pwaWaiter: refresh fijo
const interval = 14min
```

**Beneficio:** Access token comprometido solo dura 15 minutos. El `jti` permite blacklistear tokens individuales.

---

### 10.2 HMAC Table Tokens

**Que es:** Tokens firmados con HMAC para autenticar clientes (diners) sin password. Validos 3 horas.

**Donde se usa:**
- `backend/shared/security/auth.py` -- `verify_table_token()`
- `ws_gateway/components/auth/strategies.py` -- `TableTokenAuthStrategy`

**Implementacion:**

El token se envia via header `X-Table-Token` en HTTP o como query param en WebSocket.

```python
class TableTokenAuthStrategy(AuthStrategy, OriginValidationMixin):
    async def authenticate(self, websocket, token) -> AuthResult:
        if not self.validate_origin(websocket):
            return AuthResult.forbidden("Origin not allowed")
        token_data = verify_table_token(token)  # HMAC verification
        return AuthResult.ok(token_data)
```

**Beneficio:** Los clientes del restaurante no necesitan cuenta. Escanean un QR, reciben un token firmado y pueden operar durante 3 horas.

---

### 10.3 Token Blacklist con Redis

**Que es:** Lista negra de tokens revocados almacenada en Redis con TTL automatico.

**Donde se usa:**
- `backend/shared/security/token_blacklist.py`

**Implementacion:**

```python
# backend/shared/security/token_blacklist.py
async def blacklist_token(token_jti, expires_at):
    redis = await get_redis_pool()
    ttl_seconds = int((expires_at - now).total_seconds())
    if ttl_seconds <= 0:
        return True  # Already expired, no need to blacklist
    await redis.set(f"{BLACKLIST_PREFIX}{token_jti}", "1", ex=ttl_seconds)
```

El TTL coincide con la expiracion del token: cuando el token expira naturalmente, Redis borra la entrada automaticamente.

**Beneficio:** Logout inmediato. No hay que esperar 15 minutos a que expire el access token.

---

### 10.4 Input Validation & SSRF Prevention

**Que es:** Validacion centralizada de URLs de imagen para prevenir Server-Side Request Forgery.

**Donde se usa:**
- `backend/shared/utils/validators.py`

**Implementacion:**

```python
# backend/shared/utils/validators.py
BLOCKED_HOSTS = [
    "localhost", "127.0.0.1", "0.0.0.0",
    "10.", "172.16.", "192.168.", "169.254.",
    "[::1]", "metadata.google", "169.254.169.254",  # Cloud metadata
]

BLOCKED_SCHEMES = {"javascript", "data", "file", "ftp", "mailto", "tel"}
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}

def validate_image_url(url, strict=False):
    # Block internal IPs, cloud metadata endpoints, and dangerous schemes
    parsed = urlparse(url)
    if parsed.scheme in BLOCKED_SCHEMES:
        raise ValueError("Scheme not allowed")
    for blocked in BLOCKED_HOSTS:
        if parsed.hostname and parsed.hostname.startswith(blocked):
            raise ValueError("Internal host not allowed")
    # ...
```

Se integra automaticamente en `BaseCRUDService._validate_image_urls()`:

```python
def _validate_image_urls(self, data):
    for field_name in self._image_url_fields:
        if field_name in data and data[field_name]:
            data[field_name] = validate_image_url(data[field_name])
    return data
```

**Beneficio:** Un atacante no puede poner `http://169.254.169.254/latest/meta-data/` como imagen de producto para acceder a credenciales de AWS/GCP.

---

### 10.5 Rate Limiting con Lua Scripts Atomicos

**Que es:** Proteccion contra abuso de login y endpoints criticos usando contadores atomicos en Redis.

**Donde se usa:**
- `backend/shared/security/rate_limit.py`

**Implementacion:**

El script Lua garantiza que INCR + EXPIRE se ejecutan como operacion atomica:

```lua
-- backend/shared/security/rate_limit.py
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

local count = redis.call('INCR', key)
if count == 1 then
    redis.call('EXPIRE', key, window)
end

-- Safety: ensure TTL exists (handles edge case where EXPIRE failed)
local ttl = redis.call('TTL', key)
if ttl == -1 then
    redis.call('EXPIRE', key, window)
    ttl = window
end

return {count, ttl}
```

**Beneficio:** No hay race condition. Sin el Lua script, podria pasar: Thread A hace INCR (count=1), Thread B hace INCR (count=2), Thread A hace EXPIRE, Thread B PIERDE su EXPIRE. Con Lua, es atomico.

---

## Resumen

| # | Patron | Tipo | Donde |
|---|--------|------|-------|
| 1 | Clean Architecture | Arquitectonico | `backend/rest_api/services/` |
| 2 | Monorepo Poliglota | Arquitectonico | Raiz del proyecto |
| 3 | Microservicios | Arquitectonico | REST API + WS Gateway |
| 4 | Event-Driven | Arquitectonico | Redis Pub/Sub + Streams |
| 5 | Factory | Creacional | Auth strategies, Repository factory |
| 6 | Singleton | Creacional | Redis pool, DB engine |
| 7 | Builder | Creacional | EntityOutputBuilder, to_output() |
| 8 | Facade | Estructural | Domain Services, API services |
| 9 | Adapter | Estructural | Frontend-Backend type conversions |
| 10 | Composite | Estructural | Menu hierarchy (Category>Subcategory>Product) |
| 11 | Decorator/Middleware | Estructural | CORS, Security Headers, Correlation ID |
| 12 | Strategy | Comportamiento | Auth strategies (JWT, HMAC, Composite) |
| 13 | Observer | Comportamiento | WebSocket Pub/Sub, Zustand selectors |
| 14 | Chain of Responsibility | Comportamiento | CompositeAuthStrategy, Middleware pipeline |
| 15 | State | Comportamiento | Table sessions, Round lifecycle |
| 16 | Template Method | Comportamiento | BaseCRUDService hooks |
| 17 | Null Object | Comportamiento | NullAuthStrategy (testing) |
| 18 | Repository | Dominio | TenantRepository, BranchRepository |
| 19 | Domain Service | Dominio | 14 domain services |
| 20 | Aggregate Root | Dominio | Table > Session > Diner > Round |
| 21 | Soft Delete | Dominio | cascade_soft_delete() |
| 22 | Specification | Dominio | Composable query specs (&, |, ~) |
| 23 | Permission Context | Dominio | RBAC con PermissionContext |
| 24 | Transactional Outbox | Infraestructura | write_outbox_event() atomico |
| 25 | Circuit Breaker | Infraestructura | Redis publish + WS Gateway |
| 26 | Rate Limiter (Sliding Window) | Infraestructura | WS per-connection + HTTP Lua atomico |
| 27 | Connection Pool | Infraestructura | PostgreSQL + Redis (async + sync) |
| 28 | Health Check | Infraestructura | Decorator con timeout + aggregation |
| 29 | Correlation ID | Infraestructura | ContextVar + Middleware + Log filter |
| 30 | Retry + Backoff + Jitter | Infraestructura | Event publishing |
| 31 | Zustand Selectors | Frontend | 29 stores, stable refs, useShallow |
| 32 | Custom Hooks | Frontend | useFormModal, useConfirmDialog |
| 33 | useRef Callback Pattern | Frontend | WebSocket listeners |
| 34 | Lazy Loading | Frontend | React.lazy() en 19 paginas |
| 35 | i18n (i18next) | Frontend | pwaMenu (es/en/pt) |
| 36 | Optimistic Updates | Frontend | React 19 useOptimistic |
| 37 | Token Refresh + Jitter | Frontend | authStore (Dashboard, pwaWaiter) |
| 38 | Retry Queue Offline-First | Frontend | pwaWaiter retryQueueStore |
| 39 | Docker Compose Orchestration | DevOps | 5 services + health checks |
| 40 | JWT + Refresh Tokens | Seguridad | 15 min access + 7 day refresh |
| 41 | HMAC Table Tokens | Seguridad | 3h tokens para diners |
| 42 | Token Blacklist | Seguridad | Redis con TTL automatico |
| 43 | SSRF Prevention | Seguridad | validate_image_url() |
| 44 | Atomic Rate Limiting | Seguridad | Lua script en Redis |

---

> **Total: 44 patrones identificados y documentados con implementaciones reales del proyecto.**
