# Patrones de Diseno Utilizados -- Integrador / Buen Sabor

> Documentacion exhaustiva de todos los patrones de diseno encontrados en el proyecto.
> Ultima actualizacion: 2026-04-04

---

## Indice de Patrones

### Backend (REST API + Shared)
| # | Patron | Tipo | Seccion |
|---|--------|------|---------|
| 1 | [Template Method](#1-template-method--metodo-plantilla) | Comportamiento (GoF) | [Backend Creacionales/Comportamiento](#patrones-de-comportamiento) |
| 2 | [Repository](#2-repository--repositorio) | Datos (DDD) | [Backend Datos](#patrones-de-datos) |
| 3 | [Specification](#3-specification--especificacion) | Datos (DDD) | [Backend Datos](#patrones-de-datos) |
| 4 | [Strategy (Permisos)](#4-strategy-permisos--estrategia-de-permisos) | Comportamiento (GoF) | [Backend Comportamiento](#patrones-de-comportamiento) |
| 5 | [Mixin](#5-mixin--composicion-de-comportamiento) | Estructural (Python) | [Backend Estructurales](#patrones-estructurales) |
| 6 | [Soft Delete](#6-soft-delete--borrado-logico) | Datos | [Backend Datos](#patrones-de-datos) |
| 7 | [Transactional Outbox](#7-transactional-outbox--bandeja-de-salida-transaccional) | Datos/Mensajeria | [Backend Datos](#patrones-de-datos) |
| 8 | [Dependency Injection](#8-dependency-injection--inyeccion-de-dependencias) | Arquitectonico | [Backend Arquitectonicos](#patrones-arquitectonicos) |
| 9 | [Middleware Chain](#9-middleware-chain--cadena-de-middlewares) | Comportamiento (GoF) | [Backend Comportamiento](#patrones-de-comportamiento) |
| 10 | [Exception Hierarchy](#10-exception-hierarchy--jerarquia-de-excepciones) | Comportamiento | [Backend Comportamiento](#patrones-de-comportamiento) |
| 11 | [Singleton (Settings)](#11-singleton-settings--configuracion-singleton) | Creacional (GoF) | [Backend Creacionales](#patrones-creacionales) |
| 23 | [Connection Pool](#23-connection-pool--pool-de-conexiones) | Recursos | [Backend Datos](#patrones-de-datos) |

### WebSocket Gateway
| # | Patron | Tipo | Seccion |
|---|--------|------|---------|
| 12 | [Strategy (Auth)](#12-strategy-auth--estrategia-de-autenticacion) | Comportamiento (GoF) | [WS Comunicacion](#patrones-de-comunicacion) |
| 13 | [Circuit Breaker](#13-circuit-breaker--cortacircuito) | Resiliencia | [WS Resiliencia](#patrones-de-resiliencia) |
| 14 | [Sliding Window Rate Limiter](#14-sliding-window-rate-limiter--limitador-de-tasa-por-ventana-deslizante) | Concurrencia | [WS Concurrencia](#patrones-de-concurrencia) |
| 15 | [Multi-Dimensional Index](#15-multi-dimensional-index--indice-multidimensional) | Datos | [WS Concurrencia](#patrones-de-concurrencia) |
| 16 | [Sharded Locks](#16-sharded-locks--locks-fragmentados) | Concurrencia | [WS Concurrencia](#patrones-de-concurrencia) |
| 17 | [Heartbeat Tracker](#17-heartbeat-tracker--rastreador-de-latido) | Monitoreo | [WS Resiliencia](#patrones-de-resiliencia) |
| 18 | [Template Method (Endpoints)](#18-template-method-endpoints--metodo-plantilla-para-endpoints) | Comportamiento (GoF) | [WS Comunicacion](#patrones-de-comunicacion) |
| 19 | [Event Router](#19-event-router--enrutador-de-eventos) | Comunicacion | [WS Comunicacion](#patrones-de-comunicacion) |
| 20 | [Worker Pool](#20-worker-pool--pool-de-workers) | Concurrencia | [WS Concurrencia](#patrones-de-concurrencia) |
| 21 | [Drop Rate Tracker](#21-drop-rate-tracker--rastreador-de-tasa-de-perdida) | Monitoreo | [WS Resiliencia](#patrones-de-resiliencia) |
| 22 | [Retry with Exponential Backoff](#22-retry-with-exponential-backoff--reintento-con-backoff-exponencial) | Resiliencia | [WS Resiliencia](#patrones-de-resiliencia) |

### Frontend (Dashboard + pwaMenu + pwaWaiter)
| # | Patron | Tipo | Seccion |
|---|--------|------|---------|
| F1 | [Zustand Selectors + EMPTY_ARRAY](#f1-zustand-selectors-con-referencias-estables) | Estado | [Frontend Estado](#patrones-de-estado) |
| F2 | [Zustand Persist + Migration](#f2-zustand-persist-con-versionado-y-migracion) | Estado | [Frontend Estado](#patrones-de-estado) |
| F3 | [useShallow](#f3-useshallow-para-selectores-de-objetos) | Estado | [Frontend Estado](#patrones-de-estado) |
| F4 | [useMemo Derived State](#f4-usememo-para-estado-derivado) | Estado | [Frontend Estado](#patrones-de-estado) |
| F5 | [BroadcastChannel](#f5-broadcastchannel-para-sincronizacion-entre-pestanas) | Estado | [Frontend Estado](#patrones-de-estado) |
| F6 | [useFormModal](#f6-useformmodal--hook-de-estado-compuesto) | Hooks | [Frontend Hooks](#patrones-de-hooks) |
| F7 | [useConfirmDialog](#f7-useconfirmdialog--hook-de-confirmacion) | Hooks | [Frontend Hooks](#patrones-de-hooks) |
| F8 | [usePagination](#f8-usepagination--paginacion-con-auto-reset) | Hooks | [Frontend Hooks](#patrones-de-hooks) |
| F9 | [useOptimisticMutation](#f9-useoptimisticmutation--actualizaciones-optimistas) | Hooks | [Frontend Hooks](#patrones-de-hooks) |
| F10 | [useFocusTrap](#f10-usefocustrap--trampa-de-foco-para-accesibilidad) | Hooks | [Frontend Hooks](#patrones-de-hooks) |
| F11 | [useKeyboardShortcuts](#f11-usekeyboardshortcuts--atajos-de-teclado-globales) | Hooks | [Frontend Hooks](#patrones-de-hooks) |
| F12 | [useOptimisticCart](#f12-useoptimisticcart--carrito-optimista-react-19) | Hooks | [Frontend Hooks](#patrones-de-hooks) |
| F13 | [useSystemTheme](#f13-usesystemtheme--deteccion-de-tema-del-sistema) | Hooks | [Frontend Hooks](#patrones-de-hooks) |
| F14 | [Token Refresh Mutex](#f14-token-refresh-mutex--mutex-para-refresco-de-token) | Comunicacion | [Frontend Comunicacion](#patrones-de-comunicacion-1) |
| F15 | [401 Retry](#f15-401-retry--reintento-automatico-en-401) | Comunicacion | [Frontend Comunicacion](#patrones-de-comunicacion-1) |
| F16 | [AbortController Timeout](#f16-abortcontroller-timeout--timeout-con-abortcontroller) | Comunicacion | [Frontend Comunicacion](#patrones-de-comunicacion-1) |
| F17 | [Request Deduplication](#f17-request-deduplication--deduplicacion-de-peticiones) | Comunicacion | [Frontend Comunicacion](#patrones-de-comunicacion-1) |
| F18 | [SSRF Prevention](#f18-ssrf-prevention--prevencion-de-ssrf) | Seguridad | [Frontend Comunicacion](#patrones-de-comunicacion-1) |
| F19 | [WebSocket Singleton + Reconnect](#f19-websocket-singleton-con-reconexion-y-backoff-exponencial) | Comunicacion | [Frontend Comunicacion](#patrones-de-comunicacion-1) |
| F20 | [Observer (Event Subscription)](#f20-observer--suscripcion-a-eventos-websocket) | Comunicacion | [Frontend Comunicacion](#patrones-de-comunicacion-1) |
| F21 | [Throttle](#f21-throttle--limitacion-de-frecuencia-de-eventos) | Rendimiento | [Frontend Rendimiento](#patrones-de-rendimiento) |
| F22 | [Retry Queue (pwaWaiter)](#f22-retry-queue--cola-de-reintentos-offline-pwawaiter) | Offline/PWA | [Frontend Offline](#patrones-de-offlinepwa) |
| F23 | [IndexedDB Queue (pwaMenu)](#f23-indexeddb-queue--cola-offline-con-indexeddb-pwamenu) | Offline/PWA | [Frontend Offline](#patrones-de-offlinepwa) |
| F24 | [useActionState](#f24-useactionstate--formularios-con-react-19) | Formularios | [Frontend Componentes](#patrones-de-componentes) |
| F25 | [Centralized Validation](#f25-validacion-centralizada-con-type-guards) | Validacion | [Frontend Componentes](#patrones-de-componentes) |
| F26 | [i18n Validation Keys](#f26-claves-i18n-para-errores-de-validacion) | i18n | [Frontend Componentes](#patrones-de-componentes) |
| F27 | [Structured Logger](#f27-logger-estructurado-con-mensajes-seguros) | Error Handling | [Frontend Componentes](#patrones-de-componentes) |
| F28 | [Unified Error Classes](#f28-clases-de-error-unificadas-con-i18n) | Error Handling | [Frontend Componentes](#patrones-de-componentes) |
| F29 | [i18n Fallback Chain](#f29-i18n-con-cadena-de-fallback) | i18n | [Frontend Componentes](#patrones-de-componentes) |
| F30 | [Proactive Token Refresh](#f30-refresco-proactivo-de-token-con-jitter) | Seguridad | [Frontend Comunicacion](#patrones-de-comunicacion-1) |
| F31 | [HttpOnly Cookie](#f31-httponly-cookie-para-refresh-token) | Seguridad | [Frontend Comunicacion](#patrones-de-comunicacion-1) |
| F32 | [Type Conversion Layer](#f32-capa-de-conversion-de-tipos-backend--frontend) | Datos | [Frontend Componentes](#patrones-de-componentes) |
| F33 | [Bounded Maps Cleanup](#f33-maps-acotados-para-cleanup-de-timeouts) | Rendimiento | [Frontend Rendimiento](#patrones-de-rendimiento) |
| F34 | [Empty Set Cleanup](#f34-cleanup-de-sets-vacios-en-observers) | Rendimiento | [Frontend Rendimiento](#patrones-de-rendimiento) |

---

## Patrones Backend (REST API + Shared)

### Patrones Creacionales

#### 11. Singleton (Settings) -- Configuracion Singleton

**Nombre GoF:** Singleton  
**Tipo:** Creacional  
**Ubicacion:** `backend/shared/config/settings.py`

**Implementacion:**

El modulo `settings.py` crea una unica instancia de configuracion que se carga al inicio de la aplicacion. Todos los valores se leen de variables de entorno con valores por defecto.

```python
# shared/config/settings.py
class Settings:
    """Application settings loaded from environment."""
    JWT_SECRET: str = os.getenv("JWT_SECRET", "dev-secret")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://...")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6380")
    # ... mas valores de configuracion

settings = Settings()  # Instancia unica a nivel de modulo
```

**Proposito:** Garantiza que toda la aplicacion use una sola fuente de verdad para la configuracion. Se carga una vez al arrancar y se referencia desde cualquier modulo via `from shared.config.settings import settings`.

**Ejemplo de uso:**
```python
from shared.config.settings import settings
engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
```

---

### Patrones Estructurales

#### 5. Mixin -- Composicion de Comportamiento

**Nombre:** Mixin (patron de herencia multiple de Python)  
**Tipo:** Estructural  
**Ubicacion:** `backend/rest_api/services/permissions/strategies.py` (lineas 117-157)

**Implementacion:**

Los mixins son clases pequenas que aportan una sola capacidad y se componen mediante herencia multiple:

```python
class NoCreateMixin:
    """Mixin para roles que no pueden crear nada."""
    def can_create(self, user: dict, entity_type: str, branch_id: int | None = None) -> bool:
        return False

class NoDeleteMixin:
    """Mixin para roles que no pueden eliminar."""
    def can_delete(self, user: dict, entity: Any) -> bool:
        return False

class BranchFilterMixin:
    """Mixin para filtrar queries automaticamente por sucursal."""
    def filter_query(self, query, user: dict, branch_id: int | None = None):
        # Agrega WHERE branch_id IN (user["branch_ids"])
        ...

class BranchAccessMixin:
    """Metodos helper para verificar acceso a sucursal."""
    def _user_has_branch_access(self, user: dict, branch_id: int | None) -> bool:
        if branch_id is None:
            return True
        return branch_id in user.get("branch_ids", [])
```

**Proposito:** Componer comportamiento de permisos desde traits reutilizables. `ManagerStrategy`, `KitchenStrategy` y `WaiterStrategy` usan `NoDeleteMixin` para evitar duplicar logica. Cada mixin tiene una unica responsabilidad (Single Responsibility Principle).

**Ejemplo de uso:**
```python
class ManagerStrategy(NoDeleteMixin, BranchFilterMixin, PermissionStrategy):
    """Manager hereda: sin borrado + filtro por sucursal + estrategia de permisos."""
    ...

class KitchenStrategy(NoCreateMixin, NoDeleteMixin, PermissionStrategy):
    """Kitchen hereda: sin creacion + sin borrado."""
    ...
```

---

### Patrones de Comportamiento

#### 1. Template Method -- Metodo Plantilla

**Nombre GoF:** Template Method  
**Tipo:** Comportamiento  
**Ubicacion:** `backend/rest_api/services/base_service.py` (lineas 82-569)

**Implementacion:**

`BaseCRUDService` define el esqueleto de las operaciones CRUD. Las subclases sobreescriben hooks (`_validate_*`, `_after_*`) para personalizar el comportamiento:

```python
class BaseCRUDService(BaseService[ModelT], Generic[ModelT, OutputT]):
    def create(self, data: dict[str, Any], tenant_id: int, user_id: int, user_email: str) -> OutputT:
        # 1. Validar antes de crear (metodo plantilla)
        self._validate_create(data, tenant_id)
        # 2. Logica de negocio (crear entidad)
        entity = self._model(**data, tenant_id=tenant_id)
        self._db.add(entity)
        safe_commit(self._db)
        # 3. Hook post-creacion (metodo plantilla)
        self._after_create(entity, user_id, user_email)
        return self.to_output(entity)

    def _validate_create(self, data: dict[str, Any], tenant_id: int) -> None:
        """Sobreescribir para agregar reglas de validacion custom."""
        pass

    def _after_create(self, entity: ModelT, user_id: int, user_email: str) -> None:
        """Hook llamado despues de la creacion. Sobreescribir para efectos secundarios."""
        pass
```

**Proposito:** Define un flujo estandar para CRUD: validar -> ejecutar -> auditar -> publicar eventos. Cada servicio de dominio solo necesita implementar las partes que difieren.

**Ejemplo de uso:**
```python
class CategoryService(BranchScopedService[Category, CategoryOutput]):
    def _validate_create(self, data: dict, tenant_id: int) -> None:
        if self._exists_by_name(data["name"], data["branch_id"], tenant_id):
            raise DuplicateEntityError("Categoria", data["name"])

    def _after_delete(self, entity_info: dict, user_id: int, user_email: str) -> None:
        publish_event("ENTITY_DELETED", {"entity_type": "category", **entity_info})
```

---

#### 4. Strategy (Permisos) -- Estrategia de Permisos

**Nombre GoF:** Strategy  
**Tipo:** Comportamiento  
**Ubicacion:** `backend/rest_api/services/permissions/strategies.py` (lineas 1-437)

**Implementacion:**

Cada rol tiene su propia estrategia de permisos. Un registro (diccionario) mapea roles a clases de estrategia:

```python
class PermissionStrategy(ABC, BranchAccessMixin):
    @abstractmethod
    def can_create(self, user: dict, entity_type: str, branch_id: int | None = None) -> bool: ...
    @abstractmethod
    def can_delete(self, user: dict, entity: Any) -> bool: ...

class AdminStrategy(PermissionStrategy):
    """Acceso total."""
    def can_create(self, user, entity_type, branch_id=None): return True
    def can_delete(self, user, entity): return True

class ManagerStrategy(NoDeleteMixin, BranchFilterMixin, PermissionStrategy):
    CREATABLE_ENTITIES = frozenset({"Staff", "Table", "Allergen", "Promotion"})
    def can_create(self, user, entity_type, branch_id=None):
        if entity_type not in self.CREATABLE_ENTITIES:
            return False
        return self._user_has_branch_access(user, branch_id)

class WaiterStrategy(NoCreateMixin, NoDeleteMixin, PermissionStrategy):
    """Solo lectura operacional + acceso a sesiones/mesas."""
    ...

STRATEGY_REGISTRY: dict[str, type[PermissionStrategy]] = {
    Roles.ADMIN: AdminStrategy,
    Roles.MANAGER: ManagerStrategy,
    Roles.KITCHEN: KitchenStrategy,
    Roles.WAITER: WaiterStrategy,
}

def get_strategy_for_role(role: str) -> PermissionStrategy:
    strategy_class = STRATEGY_REGISTRY.get(role, ReadOnlyStrategy)
    return strategy_class()
```

**Proposito:** Encapsula la logica de permisos por rol sin condicionales en los routers. Permite agregar nuevos roles sin modificar codigo existente (Open/Closed Principle). Usa mixins para reducir duplicacion.

**Ejemplo de uso:**
```python
ctx = PermissionContext(user)
strategy = get_strategy_for_role(ctx.highest_role)
if not strategy.can_create(user, "Product", branch_id):
    raise ForbiddenError("crear productos")
```

---

#### 9. Middleware Chain -- Cadena de Middlewares

**Nombre GoF:** Chain of Responsibility  
**Tipo:** Comportamiento  
**Ubicacion:** `backend/rest_api/main.py` (lineas 92-116), `backend/rest_api/core/middlewares.py` (lineas 99-108)

**Implementacion:**

Los middlewares se registran en orden especifico. FastAPI los ejecuta en orden inverso al de registro:

```python
# rest_api/main.py
app.add_middleware(CorrelationIdMiddleware)    # Primero registrado = ultimo ejecutado
register_middlewares(app)                       # Security headers + Content-Type validation
configure_cors(app)                            # Ultimo registrado = primero ejecutado

# rest_api/core/middlewares.py
def register_middlewares(app: FastAPI) -> None:
    """Registra todos los middlewares de seguridad.
    Orden: middlewares se ejecutan en orden inverso al de registro."""
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(ContentTypeValidationMiddleware)
```

Clases clave:
- `SecurityHeadersMiddleware`: Agrega CSP, HSTS, X-Frame-Options
- `ContentTypeValidationMiddleware`: Valida Content-Type en POST/PUT/PATCH
- `CorrelationIdMiddleware`: Agrega X-Request-ID para trazabilidad

**Proposito:** Cada middleware maneja una unica preocupacion transversal (seguridad, correlacion, validacion). El orden es critico: CORS debe ejecutarse primero, Correlation ID debe estar disponible para todos los demas.

---

#### 10. Exception Hierarchy -- Jerarquia de Excepciones

**Nombre:** Exception Hierarchy / Semantic Exception Handling  
**Tipo:** Comportamiento  
**Ubicacion:** `backend/shared/utils/exceptions.py` (lineas 1-318)

**Implementacion:**

Jerarquia de excepciones semanticas con logging automatico:

```python
class AppException(HTTPException):
    """Excepcion base con logging automatico."""
    def __init__(self, status_code, detail, log_level="warning", **log_context):
        log_fn = getattr(logger, log_level, logger.warning)
        log_fn(detail, status_code=status_code, **log_context)
        super().__init__(status_code=status_code, detail=detail)

# Errores 404
class NotFoundError(AppException):
    def __init__(self, entity: str, entity_id=None, **log_context):
        detail = f"{entity} con ID {entity_id} no encontrado" if entity_id else f"{entity} no encontrado"
        super().__init__(status_code=404, detail=detail, entity=entity, **log_context)

class SessionNotFoundError(NotFoundError): ...
class CheckNotFoundError(NotFoundError): ...

# Errores 403
class ForbiddenError(AppException): ...
class BranchAccessError(ForbiddenError): ...
class InsufficientRoleError(ForbiddenError): ...

# Errores 400
class ValidationError(AppException): ...
class InvalidStateError(ValidationError): ...
class InvalidTransitionError(ValidationError): ...
class DuplicateEntityError(ValidationError): ...

# Errores 409
class ConflictError(AppException): ...
class AlreadyPaidError(ConflictError): ...

# Errores 500
class InternalError(AppException): ...
class DatabaseError(InternalError): ...
class ExternalServiceError(InternalError): ...
```

**Proposito:** Excepciones consistentes con codigos HTTP semanticos y logging automatico. Contexto de error capturado automaticamente para debugging. Excepciones de dominio especificas (CheckNotFoundError, AlreadyPaidError) mejoran la legibilidad.

**Ejemplo de uso:**
```python
raise NotFoundError("Producto", product_id, tenant_id=tenant_id)
raise ForbiddenError("eliminar productos", user_id=user_id)
raise InvalidTransitionError(f"No se puede pasar de {current} a {target}")
```

---

### Patrones Arquitectonicos

#### 8. Dependency Injection -- Inyeccion de Dependencias

**Nombre:** Dependency Injection (Inversion of Control)  
**Tipo:** Arquitectonico  
**Ubicacion:** `backend/rest_api/main.py`, `backend/shared/infrastructure/db.py` (lineas 48-79)

**Implementacion:**

FastAPI usa `Depends()` para inyectar automaticamente dependencias en los handlers:

```python
# shared/infrastructure/db.py
def get_db() -> Generator[Session, None, None]:
    """Dependencia de FastAPI para sesiones de base de datos."""
    db = SessionLocal()
    try:
        yield db  # Inyecta en el handler de la ruta
    finally:
        db.close()  # Limpieza automatica

@contextmanager
def get_db_context() -> Generator[Session, None, None]:
    """Context manager para uso fuera de FastAPI."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

**Proposito:** Gestion centralizada y consistente de sesiones de BD. Facil de mockear en tests. Limpieza automatica de recursos (context manager pattern).

**Ejemplo de uso:**
```python
@router.get("/categories")
def list_categories(
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
):
    service = CategoryService(db)
    return service.list_by_branch(user["tenant_id"], branch_id)
```

---

### Patrones de Datos

#### 2. Repository -- Repositorio

**Nombre:** Repository (Domain-Driven Design)  
**Tipo:** Datos  
**Ubicacion:** `backend/rest_api/services/crud/repository.py` (lineas 46-645)

**Implementacion:**

Jerarquia de repositorios con aislamiento multi-tenant automatico:

```python
class BaseRepository(Generic[ModelT]):
    """Repositorio base con operaciones comunes de BD."""
    def __init__(self, model: type[ModelT], db: Session):
        self._model = model
        self._db = db

    def _base_query(self) -> Select:
        return select(self._model).where(self._model.is_active.is_(True))

class TenantRepository(BaseRepository[ModelT]):
    """Repositorio con aislamiento multi-tenant automatico."""
    def _tenant_query(self, tenant_id: int) -> Select:
        return self._base_query().where(self._model.tenant_id == tenant_id)

    def find_by_id(self, entity_id: int, tenant_id: int, **kwargs) -> ModelT | None:
        query = self._tenant_query(tenant_id).where(self._model.id == entity_id)
        return self._db.scalar(query)

    def find_all(self, tenant_id: int, options=None) -> list[ModelT]:
        query = self._tenant_query(tenant_id)
        if options:
            query = query.options(*options)
        return list(self._db.scalars(query).unique().all())

class BranchRepository(TenantRepository[ModelT]):
    """Repositorio para entidades con scope de sucursal."""
    def _branch_query(self, branch_id: int, tenant_id: int) -> Select:
        return self._tenant_query(tenant_id).where(self._model.branch_id == branch_id)
```

**Proposito:** Abstrae la capa de acceso a datos del negocio. TODAS las queries filtran automaticamente por `tenant_id` para aislamiento multi-tenant. `BranchRepository` especializa para entidades de sucursal sin duplicar codigo.

**Ejemplo de uso:**
```python
product_repo = TenantRepository(Product, db)
products = product_repo.find_all(
    tenant_id=1,
    options=[selectinload(Product.allergens)]
)
```

---

#### 3. Specification -- Especificacion

**Nombre:** Specification (Evans, Domain-Driven Design)  
**Tipo:** Datos  
**Ubicacion:** `backend/rest_api/services/crud/repository.py` (lineas 434-620)

**Implementacion:**

Patron para encapsular condiciones de query complejas en objetos componibles:

```python
class Specification:
    """Clase base con operadores logicos."""
    def to_expression(self) -> Any:
        raise NotImplementedError

    def __and__(self, other: "Specification") -> "AndSpecification":
        return AndSpecification(self, other)

    def __or__(self, other: "Specification") -> "OrSpecification":
        return OrSpecification(self, other)

    def __invert__(self) -> "NotSpecification":
        return NotSpecification(self)

class AndSpecification(Specification):
    def __init__(self, left, right):
        self._left, self._right = left, right
    def to_expression(self):
        return and_(self._left.to_expression(), self._right.to_expression())

class SpecificationRepository(TenantRepository[ModelT]):
    def find_by_spec(self, spec: Specification, tenant_id: int, **kwargs):
        query = self._tenant_query(tenant_id).where(spec.to_expression())
        return list(self._db.scalars(query).unique().all())
```

**Proposito:** Encapsula logica de query compleja en objetos reutilizables y testeables. Permite composicion: `VegetarianSpec() & CategorySpec(entradas_id) & ~AvailableInBranchSpec(5)`. Separa la construccion de queries del repositorio.

**Ejemplo de uso:**
```python
vegetarian_entradas = repo.find_by_spec(
    VegetarianSpec() & CategorySpec(entradas_id),
    tenant_id=1,
)
```

---

#### 6. Soft Delete -- Borrado Logico

**Nombre:** Soft Delete (patron de diseno de dominio)  
**Tipo:** Datos  
**Ubicacion:** `backend/rest_api/models/base.py` (lineas 20-103), `backend/rest_api/services/crud/soft_delete.py` (lineas 1-418)

**Implementacion:**

Todas las entidades usan `AuditMixin` para borrado logico con trazabilidad completa:

```python
class AuditMixin:
    """Mixin que provee soft delete y campos de auditoria."""
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    deleted_by_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    def soft_delete(self, user_id, user_email):
        self.is_active = False
        self.deleted_at = datetime.now(tz.utc)
        self.deleted_by_id = user_id
        self.deleted_by_email = user_email
```

Cascade soft delete para relaciones padre-hijo:

```python
CASCADE_RELATIONSHIPS = {
    TableSession: [
        (Diner, "session_id"),
        (Round, "session_id"),
        (ServiceCall, "session_id"),
        (Check, "session_id"),
    ],
}

async def cascade_soft_delete(db, entity, user_id, user_email):
    """Soft delete en cascada para preservar historial de auditoria."""
    relationships = CASCADE_RELATIONSHIPS.get(type(entity), [])
    for child_model, fk in relationships:
        children = db.execute(select(child_model).where(...)).scalars().all()
        for child in children:
            child.soft_delete(user_id, user_email)
```

**Proposito:** Preserva historial completo de auditoria en vez de borrar datos. Los queries filtran `is_active=True` automaticamente. Permite restaurar entidades borradas accidentalmente. El cascade mantiene integridad referencial sin huerfanos.

---

#### 7. Transactional Outbox -- Bandeja de Salida Transaccional

**Nombre:** Transactional Outbox (patron de microservicios)  
**Tipo:** Datos / Mensajeria  
**Ubicacion:** `backend/rest_api/services/events/outbox_service.py` (lineas 1-256)

**Implementacion:**

Los eventos criticos (facturacion, rondas, llamadas de servicio) se escriben en la tabla outbox atomicamente con los datos de negocio:

```python
def write_outbox_event(
    db: Session,
    tenant_id: int,
    event_type: str,
    aggregate_type: str,
    aggregate_id: int,
    payload: dict[str, Any],
) -> OutboxEvent:
    """Escribe un evento en la tabla outbox.
    DEBE llamarse dentro de la misma transaccion que la operacion de negocio."""
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
    # No flush/commit - el llamador controla la transaccion
    return outbox_event

# Funciones de conveniencia por dominio:
def write_billing_outbox_event(db, tenant_id, event_type, ...): ...
def write_round_outbox_event(db, tenant_id, event_type, ...): ...
def write_service_call_outbox_event(db, tenant_id, event_type, ...): ...
```

**Proposito:** Garantiza que los eventos se escriban atomicamente con los datos de negocio (no se pierden eventos). Desacopla la publicacion de eventos de la logica de negocio. Un procesador en background lee la outbox y publica a WebSocket/Redis. Garantiza entrega al menos una vez (at-least-once delivery).

**Ejemplo de uso:**
```python
round = Round(...)
db.add(round)
write_round_outbox_event(db=db, tenant_id=t, event_type="ROUND_SUBMITTED", ...)
db.commit()  # Atomico: round + evento se guardan juntos
```

| Patron | Eventos |
|--------|---------|
| Outbox (criticos) | CHECK_REQUESTED/PAID, PAYMENT_*, ROUND_SUBMITTED/READY, SERVICE_CALL_CREATED |
| Redis directo (baja latencia) | ROUND_CONFIRMED/IN_KITCHEN/SERVED, CART_*, TABLE_*, ENTITY_* |

---

#### 23. Connection Pool -- Pool de Conexiones

**Nombre:** Connection Pool (patron de gestion de recursos)  
**Tipo:** Datos  
**Ubicacion:** `backend/shared/infrastructure/db.py` (lineas 1-80)

**Implementacion:**

Pool de conexiones de base de datos con sizing dinamico basado en CPU:

```python
def _calculate_pool_size() -> int:
    """Calcula tamano optimo basado en nucleos de CPU.
    Formula: (2 * CPU cores) + 1, maximo 20."""
    cores = os.cpu_count() or 4
    return min(cores * 2 + 1, 20)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,       # Verifica conexiones antes de usar
    pool_size=_calculate_pool_size(),  # Dinamico segun CPU
    max_overflow=15,           # Conexiones adicionales para picos
    pool_timeout=30,           # Espera maxima por conexion
    pool_recycle=1800,         # Recicla conexiones cada 30 minutos
    connect_args={"connect_timeout": 10},
)
```

**Proposito:** Reutiliza conexiones de BD en vez de abrir nuevas por request. Sizing dinamico se ajusta a los nucleos de CPU. `pool_pre_ping` detecta conexiones muertas antes de usarlas. `pool_recycle` previene problemas por conexiones de larga duracion.

---

### Patrones de Seguridad

Los patrones de seguridad del backend estan distribuidos en multiples archivos:

- **JWT + RBAC:** `backend/shared/security/auth.py` -- Autenticacion con roles (ADMIN, MANAGER, KITCHEN, WAITER)
- **Table Token (HMAC):** `backend/shared/security/table_token.py` -- Tokens para diners sin login
- **Permission Context:** `backend/rest_api/services/permissions/` -- Estrategia por rol (ver patron #4)
- **Rate Limiting:** `backend/rest_api/main.py` -- slowapi para endpoints de facturacion
- **Input Validation:** `backend/shared/utils/validators.py` -- `validate_image_url()` bloquea SSRF
- **Safe Commit:** `backend/shared/infrastructure/db.py` -- Rollback automatico en fallos

---

## Patrones WebSocket Gateway

### Patrones de Resiliencia

#### 13. Circuit Breaker -- Cortacircuito

**Nombre:** Circuit Breaker (patron de resiliencia)  
**Tipo:** Resiliencia  
**Ubicacion:** `ws_gateway/components/resilience/circuit_breaker.py` (lineas 1-334)

**Implementacion:**

Implementacion clasica con tres estados: CLOSED (normal), OPEN (fallo), HALF_OPEN (recuperacion):

```python
class CircuitState(Enum):
    CLOSED = "closed"      # Operacion normal - requests pasan
    OPEN = "open"          # Modo fallo - requests se rechazan inmediatamente
    HALF_OPEN = "half_open"  # Probando recuperacion - requests limitados

class CircuitBreaker:
    def __init__(self, name, failure_threshold=5, recovery_timeout=30.0, half_open_max_calls=3):
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._lock = threading.Lock()  # Thread-safe

    async def __aenter__(self):
        """Context manager - verifica si la llamada esta permitida."""
        self._before_call_sync()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Registra resultado: exito o fallo."""
        if exc_type is None:
            self.record_success()   # HALF_OPEN -> CLOSED si hay exitos
        else:
            self.record_failure(exc_val)  # -> OPEN si se supera el umbral

    def record_failure(self, error=None):
        with self._lock:
            self._failure_count += 1
            if self._state == CircuitState.HALF_OPEN:
                self._transition_to(CircuitState.OPEN)  # Un fallo en HALF_OPEN vuelve a OPEN
            elif self._failure_count >= self._failure_threshold:
                self._transition_to(CircuitState.OPEN)
```

**Proposito:** Previene fallos en cascada cuando Redis esta caido o lento. Fail-fast: rechaza llamadas inmediatamente cuando el circuito esta OPEN. Auto-recuperacion: prueba HALF_OPEN despues del timeout de recuperacion. Thread-safe con lock unificado. Metricas para monitoreo de salud del sistema.

**Ejemplo de uso:**
```python
breaker = CircuitBreaker("redis")

async def call_redis():
    async with breaker:
        return await redis.get("key")  # Si breaker esta OPEN, lanza CircuitOpenError
```

---

#### 17. Heartbeat Tracker -- Rastreador de Latido

**Nombre:** Heartbeat / Watchdog  
**Tipo:** Monitoreo / Resiliencia  
**Ubicacion:** `ws_gateway/components/connection/heartbeat.py` (lineas 1-253)

**Implementacion:**

Rastrea el tiempo de ultima actividad de cada conexion WebSocket:

```python
class HeartbeatTracker:
    """Thread-safe con threading.Lock."""
    def __init__(self, timeout_seconds=60.0):
        self._timeout = timeout_seconds
        self._last_heartbeat: dict[WebSocket, float] = {}
        self._lock = threading.Lock()

    def record(self, websocket, timestamp=None):
        """Registra actividad de una conexion."""
        with self._lock:
            self._last_heartbeat[websocket] = timestamp or time.time()

    def is_stale(self, websocket) -> bool:
        """Verifica si la conexion no ha enviado heartbeat."""
        with self._lock:
            last_time = self._last_heartbeat.get(websocket)
        if last_time is None:
            return True
        return time.time() - last_time > self._timeout

    def cleanup_stale(self) -> list[WebSocket]:
        """Remueve y retorna conexiones sin actividad."""
        now = time.time()
        stale = []
        with self._lock:
            for ws, last_time in list(self._last_heartbeat.items()):
                if now - last_time > self._timeout:
                    stale.append(ws)
                    del self._last_heartbeat[ws]
        return stale

async def handle_heartbeat(ws, data) -> bool:
    """Responde a ping con pong."""
    if data == '{"type":"ping"}' or data == "ping":
        await ws.send_text('{"type":"pong"}')
        return True
    return False
```

**Proposito:** Detecta conexiones muertas que no envian heartbeats. Limpieza automatica de conexiones zombie. Previene fuga de recursos.

---

#### 21. Drop Rate Tracker -- Rastreador de Tasa de Perdida

**Nombre:** Observer / Metrics Collector  
**Tipo:** Monitoreo  
**Ubicacion:** `ws_gateway/core/subscriber/drop_tracker.py` (lineas 1-185)

**Implementacion:**

Monitorea la tasa de eventos perdidos en una ventana deslizante:

```python
class EventDropRateTracker:
    def __init__(self, window_seconds=60.0, alert_threshold_percent=5.0, alert_cooldown_seconds=300.0):
        self._window: deque = deque(maxlen=int(window_seconds * 1000))
        self._lock = threading.Lock()

    def record_dropped(self):
        """Registra evento perdido y verifica alerta."""
        now = time.time()
        with self._lock:
            self._window.append((now, 0, 1))
            self._total_dropped += 1
            self._check_alert(now)

    def _check_alert(self, now):
        if now - self._last_alert_time < self._alert_cooldown:
            return  # Prevenir tormentas de alertas
        drop_rate = window_dropped / window_total
        if drop_rate > self._alert_threshold:
            logger.error("CRITICAL: Event drop rate exceeds threshold!",
                drop_rate_percent=round(drop_rate * 100, 2))
```

**Proposito:** Detecta fallos silenciosos: si los eventos se estan perdiendo, alerta inmediatamente. Ventana deslizante: tasa calculada sobre los ultimos 60 segundos. Cooldown previene tormentas de alertas (max 1 alerta cada 5 minutos). Memory-bounded con deque maxlen.

---

#### 22. Retry with Exponential Backoff -- Reintento con Backoff Exponencial

**Nombre:** Retry / Backoff Strategy  
**Tipo:** Resiliencia  
**Ubicacion:** `ws_gateway/components/resilience/retry.py` (lineas 1-100+)

**Implementacion:**

```python
@dataclass(frozen=True, slots=True)
class RetryConfig:
    initial_delay: float = 1.0
    max_delay: float = 30.0
    backoff_base: float = 2.0
    jitter_factor: float = 0.25  # +/-25%
    max_attempts: int = 10

def calculate_delay_with_jitter(attempt: int, config: RetryConfig = None) -> float:
    """Calcula delay con backoff exponencial y jitter.
    base_delay = initial_delay * (backoff_base ^ attempt)
    capped_delay = min(base_delay, max_delay)
    final_delay = capped_delay * (1 +/- jitter_factor)

    Ejemplo: attempt 0 -> ~1s, attempt 1 -> ~2s, attempt 5 -> ~30s (cap)
    """
```

**Proposito:** Previene sobrecargar un servicio en dificultades con reintentos inmediatos. Backoff exponencial: 1s -> 2s -> 4s -> 8s -> ... -> 30s. Jitter (+/-25%) previene "thundering herd" cuando muchos clientes reintentan al mismo tiempo. Max attempts previene loops infinitos.

---

### Patrones de Concurrencia

#### 14. Sliding Window Rate Limiter -- Limitador de Tasa por Ventana Deslizante

**Nombre:** Rate Limiter / Token Bucket (variante)  
**Tipo:** Concurrencia / Seguridad  
**Ubicacion:** `ws_gateway/components/connection/rate_limiter.py` (lineas 1-352)

**Implementacion:**

Limitador por conexion con penalidad por desconexion:

```python
class WebSocketRateLimiter:
    """Rate limiter por conexion usando algoritmo de ventana deslizante."""
    def __init__(self, max_messages, window_seconds, max_tracked=10000):
        self._counters: dict[WebSocket, list[float]] = {}  # Timestamps por conexion
        self._lock = asyncio.Lock()
        self._evicted_penalty: dict[int, tuple[int, float]] = {}  # Penalidad por reconexion

    async def is_allowed(self, ws) -> bool:
        now = time.time()
        window_start = now - self._window_seconds
        async with self._lock:
            # Limpiar timestamps fuera de la ventana
            self._counters[ws] = [t for t in self._counters[ws] if t > window_start]
            # Verificar limite
            if len(self._counters[ws]) >= self._max_messages:
                return False
            self._counters[ws].append(now)
            return True
```

**Proposito:** Previene flooding de mensajes y ataques DoS. Limite por conexion respeta el throughput individual. Penalidad por desconexion previene reseteo de rate limit al reconectarse. Memory-bounded: evicta conexiones antiguas cuando alcanza capacidad.

---

#### 15. Multi-Dimensional Index -- Indice Multidimensional

**Nombre:** Multi-Index / Hierarchical Indexing  
**Tipo:** Estructura de Datos  
**Ubicacion:** `ws_gateway/components/connection/index.py` (lineas 1-150+)

**Implementacion:**

Indices multiples para busqueda eficiente de conexiones:

```python
class ConnectionIndex:
    def __init__(self):
        # Indices primarios (forward lookup)
        self._by_user: dict[int, set[WebSocket]] = {}
        self._by_branch: dict[int, set[WebSocket]] = {}
        self._by_session: dict[int, set[WebSocket]] = {}
        self._by_sector: dict[int, set[WebSocket]] = {}
        self._admins_by_branch: dict[int, set[WebSocket]] = {}
        self._kitchen_by_branch: dict[int, set[WebSocket]] = {}

        # Mapeos inversos (eficiente disconnect)
        self._ws_to_user: dict[WebSocket, int] = {}
        self._ws_to_branches: dict[WebSocket, list[int]] = {}
        self._ws_to_sessions: dict[WebSocket, set[int]] = {}
        self._ws_to_tenant: dict[WebSocket, int] = {}

    @property
    def by_user(self) -> MappingProxyType:
        """Vista inmutable para prevenir mutacion externa."""
        return MappingProxyType(self._by_user)
```

**Proposito:** Broadcasting eficiente: encontrar todas las conexiones de una sucursal/sector/sesion en O(1). Disconnect eficiente: mapeos inversos permiten limpieza rapida de todos los indices. Aislamiento multi-tenant. Vistas inmutables con `MappingProxyType` previenen mutacion accidental.

---

#### 16. Sharded Locks -- Locks Fragmentados

**Nombre:** Sharded / Partitioned Locks  
**Tipo:** Concurrencia  
**Ubicacion:** `ws_gateway/components/connection/locks.py` (lineas 1-120+)

**Implementacion:**

Locks particionados para reducir contention:

```python
class LockManager:
    """Locks particionados: uno por sucursal, uno por usuario."""
    def __init__(self, max_cached_locks=1000, cleanup_threshold=800):
        self._branch_locks: dict[int, asyncio.Lock] = {}
        self._user_locks: dict[int, asyncio.Lock] = {}
        self._meta_lock = asyncio.Lock()  # Protege los diccionarios de locks
        self._sector_lock = asyncio.Lock()
        self._session_lock = asyncio.Lock()

# RESTRICCION: _meta_lock es NO-REENTRANTE. Metodos que adquieren
# _meta_lock NO DEBEN llamar a otros metodos que tambien lo adquieran.
```

**Proposito:** Reduce contention comparado con un unico lock global. Operaciones de una sucursal solo lockean esa sucursal. Otras sucursales/usuarios pueden proceder concurrentemente. Memory-bounded: cleanup remueve locks no usados.

---

#### 20. Worker Pool -- Pool de Workers

**Nombre:** Worker Pool / Thread Pool Executor (para async)  
**Tipo:** Concurrencia  
**Ubicacion:** `ws_gateway/core/connection/broadcaster.py` (lineas 1-150+)

**Implementacion:**

Pool de workers asincrono para broadcasting eficiente:

```python
class ConnectionBroadcaster:
    """Broadcasting con pool de workers para alto volumen."""
    DEFAULT_WORKER_COUNT = 10
    QUEUE_MAX_SIZE = 5000

    async def start_workers(self):
        self._queue = asyncio.Queue(maxsize=self.QUEUE_MAX_SIZE)
        self._running = True
        for i in range(self._worker_count):
            worker = asyncio.create_task(
                self._worker_loop(i),
                name=f"broadcast_worker_{i}"
            )
            self._workers.append(worker)
```

**Proposito:** Envio paralelo de mensajes: 10 workers pueden enviar a 10 conexiones simultaneamente. Backpressure basado en queue: limita envios pendientes para prevenir explosion de memoria. Shutdown graceful: espera que la queue se drene antes de salir. Escala a cientos/miles de conexiones sin bloquear.

---

### Patrones de Comunicacion

#### 12. Strategy (Auth) -- Estrategia de Autenticacion

**Nombre GoF:** Strategy + Chain of Responsibility + Null Object  
**Tipo:** Comportamiento  
**Ubicacion:** `ws_gateway/components/auth/strategies.py` (lineas 1-490)

**Implementacion:**

Multiples estrategias de autenticacion intercambiables:

```python
class AuthStrategy(ABC):
    """Strategy: encapsula algoritmo de autenticacion."""
    @abstractmethod
    async def authenticate(self, websocket, token) -> AuthResult: ...

class JWTAuthStrategy(AuthStrategy, OriginValidationMixin):
    """JWT para staff (waiters, kitchen, admins)."""
    async def authenticate(self, websocket, token):
        # 1. Validar origen
        if not self.validate_origin(websocket):
            return AuthResult.forbidden("Origin not allowed")
        # 2. Verificar JWT
        claims = verify_jwt(token)
        # 3. Rechazar refresh tokens
        if claims.get("type") == "refresh":
            return AuthResult.fail("Refresh token used")
        # 4. Verificar roles
        if not any(role in claims["roles"] for role in self._required_roles):
            return AuthResult.forbidden("Insufficient role")
        return AuthResult.ok(claims)

class TableTokenAuthStrategy(AuthStrategy):
    """HMAC table token para diners."""
    async def authenticate(self, websocket, token):
        data = verify_table_token(token)
        return AuthResult.ok(data) if data else AuthResult.fail("Invalid token")

class CompositeAuthStrategy(AuthStrategy):
    """Chain of Responsibility: prueba estrategias en orden."""
    async def authenticate(self, websocket, token):
        for strategy in self._strategies:
            result = await strategy.authenticate(websocket, token)
            if result.success:
                return result  # Primera estrategia exitosa gana
        return AuthResult.fail("No strategy succeeded")

class NullAuthStrategy(AuthStrategy):
    """Null Object para testing sin tokens reales."""
    async def authenticate(self, websocket, token):
        return AuthResult.ok({"sub": "test-user", "roles": ["ADMIN"]})

# Factory functions
def create_waiter_auth_strategy():
    return JWTAuthStrategy(required_roles=["WAITER", "MANAGER", "ADMIN"])
```

**Proposito:** Autenticacion pluggable: se puede cambiar JWT, table token, o estrategias custom sin modificar endpoints. Chain of Responsibility en CompositeAuthStrategy: prueba multiples metodos de auth. NullAuthStrategy para testing sin tokens reales. Validacion de origen antes de proceder (seguridad).

---

#### 18. Template Method (Endpoints) -- Metodo Plantilla para Endpoints

**Nombre GoF:** Template Method  
**Tipo:** Comportamiento  
**Ubicacion:** `ws_gateway/components/endpoints/base.py` (lineas 1-160+)

**Implementacion:**

Clase base para todos los endpoints WebSocket con lifecycle estandarizado:

```python
class WebSocketEndpointBase(
    MessageValidationMixin,
    HeartbeatMixin,
    ConnectionLifecycleMixin,
    ABC,
):
    """Clase base para endpoints WebSocket.
    Encapsula: lifecycle, rate limiting, heartbeat, audit logging.
    Subclases implementan: validate_auth, create_context, register_connection."""

    @abstractmethod
    async def validate_auth(self) -> dict | None:
        """Validar autenticacion para esta conexion."""
        pass

    @abstractmethod
    async def create_context(self, auth_data) -> WebSocketContext:
        """Crear contexto desde datos de autenticacion."""
        pass

    @abstractmethod
    async def register_connection(self, context) -> None:
        """Registrar conexion con ConnectionManager."""
        pass

    async def run(self):
        """Template method: accept -> validate -> register -> message loop -> unregister."""
        await self.accept()
        auth_data = await self.validate_auth()
        if not auth_data:
            await self.close(4001)
            return
        context = await self.create_context(auth_data)
        await self.register_connection(context)
        try:
            await self._message_loop()
        finally:
            await self.unregister_connection(context)
```

**Proposito:** Elimina duplicacion entre los endpoints de waiter, kitchen, admin y diner. El template method `run()` define el flujo general. Subclases se enfocan en comportamiento especifico del rol. Mixins manejan concerns transversales (validacion de mensajes, heartbeat, logging).

---

#### 19. Event Router -- Enrutador de Eventos

**Nombre:** Router / Dispatcher  
**Tipo:** Comunicacion  
**Ubicacion:** `ws_gateway/components/events/router.py` (lineas 1-405)

**Implementacion:**

Enrutamiento centralizado de eventos a conexiones apropiadas:

```python
class EventRouter:
    """Enruta eventos a las conexiones WebSocket correctas."""

    KITCHEN_EVENTS = frozenset({
        "ROUND_SUBMITTED", "ROUND_IN_KITCHEN", "ROUND_READY", "ROUND_SERVED",
    })
    SESSION_EVENTS = frozenset({
        "ROUND_IN_KITCHEN", "ROUND_READY", "CHECK_REQUESTED", "CHECK_PAID",
        "CART_ITEM_ADDED", "CART_ITEM_UPDATED", "CART_ITEM_REMOVED",
    })
    ADMIN_ONLY_EVENTS = frozenset({
        "ENTITY_CREATED", "ENTITY_UPDATED", "ENTITY_DELETED", "CASCADE_DELETE",
    })
    BRANCH_WIDE_WAITER_EVENTS = frozenset({
        "ROUND_PENDING", "TABLE_SESSION_STARTED",
    })

    async def route_event(self, event):
        event_type = event.get("type")
        branch_id = event.get("branch_id")
        sector_id = event.get("sector_id")
        session_id = event.get("session_id")

        # Admins siempre reciben todos los eventos de su sucursal
        await self._manager.send_to_admins(branch_id, event, tenant_id=tenant_id)

        # Kitchen solo recibe eventos de cocina
        if event_type in self.KITCHEN_EVENTS:
            await self._manager.send_to_kitchen(branch_id, event)

        # Waiters: branch-wide o sector-targeted
        if event_type in self.BRANCH_WIDE_WAITER_EVENTS:
            await self._manager.send_to_waiters_only(branch_id, event)
        elif sector_id:
            await self._manager.send_to_sector(sector_id, event)

        # Diners solo reciben eventos de su sesion
        if event_type in self.SESSION_EVENTS and session_id:
            await self._manager.send_to_session(session_id, event)
```

**Proposito:** Desacopla tipos de evento de la logica de ruteo. Reglas centralizadas para todos los tipos de evento. Soporta ruteo complejo: branch-wide vs sector-targeted vs session-scoped. Aislamiento multi-tenant: todas las rutas filtran por tenant_id.

---

## Patrones Frontend (Dashboard + pwaMenu + pwaWaiter)

### Patrones de Estado

#### F1. Zustand Selectors con Referencias Estables

**Nombre:** Zustand Selector Pattern + EMPTY_ARRAY Constants  
**Tipo:** Estado / Rendimiento  
**Ubicacion:**
- `Dashboard/src/stores/authStore.ts` (lineas 467-479)
- `Dashboard/src/stores/productStore.ts` (lineas 8-9)
- `pwaMenu/src/stores/tableStore/selectors.ts` (lineas 15-17, 40-41)

**Implementacion:**

```typescript
// Constantes a nivel de modulo para referencias estables
const EMPTY_ROLES: string[] = []
const EMPTY_BRANCH_IDS: number[] = []
const EMPTY_PRODUCTS: Product[] = []
const EMPTY_CART_ITEMS: CartItem[] = []

// Selectores que retornan la constante estable cuando el valor es null/undefined
export const selectUserRoles = (state: AuthState) => state.user?.roles ?? EMPTY_ROLES
export const selectUserBranchIds = (state: AuthState) => state.user?.branch_ids ?? EMPTY_BRANCH_IDS

// Uso en componentes (CORRECTO)
const roles = useAuthStore(selectUserRoles)
const items = useStore(selectItems)

// INCORRECTO - causa re-renders infinitos:
// const { items } = useStore()  // NUNCA desestructurar
```

**Proposito:** Previene re-renders infinitos en React 19 cuando los componentes reciben nuevas referencias de array vacio en cada render. Las constantes a nivel de modulo garantizan la misma referencia entre renders. El patron selector aisla el acceso al estado, previniendo re-renders por cambios no relacionados.

---

#### F2. Zustand Persist con Versionado y Migracion

**Nombre:** Zustand Store Persistence with Type-Safe Migrations  
**Tipo:** Estado  
**Ubicacion:** `Dashboard/src/stores/authStore.ts` (lineas 218-456)

**Implementacion:**

```typescript
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({ /* acciones del store */ }),
    {
      name: STORAGE_KEYS.AUTH || 'dashboard-auth',
      version: 4, // SEC-09: Bump - refreshToken ahora en HttpOnly cookie
      partialize: (state) => ({
        // Solo persistir token y usuario, NO estados transitorios
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        // isLoading, error NO se persisten
      }),
      onRehydrateStorage: () => (state) => {
        // Despues de rehidratacion, restaurar token al servicio API
        if (state?.token) {
          setAuthToken(state.token)
        }
      },
    }
  )
)
```

**Proposito:** `partialize()` evita persistir estados transitorios (isLoading, error) que deben resetearse al recargar. `onRehydrateStorage()` restaura tokens al servicio API despues de la hidratacion de localStorage. Version bumping + funciones de migracion manejan cambios breaking de forma segura.

---

#### F3. useShallow para Selectores de Objetos

**Nombre:** Zustand useShallow  
**Tipo:** Estado / Rendimiento  
**Ubicacion:** `pwaMenu/src/stores/tableStore/selectors.ts` (lineas 119-129)

**Implementacion:**

```typescript
import { useShallow } from 'zustand/react/shallow'

export const useCartActions = () =>
  useTableStore(
    useShallow((state) => ({
      updateQuantity: state.updateQuantity,
      removeItem: state.removeItem,
      canModifyItem: state.canModifyItem,
      getDinerColor: state.getDinerColor,
      submitOrder: state.submitOrder,
      clearCart: state.clearCart,
    }))
  )
```

**Proposito:** Shallow equality check previene re-renders por nuevas referencias de objetos. Permite retornar objetos con funciones de accion sin loops infinitos. Esencial para selectores de agregacion de acciones en React 19.

---

#### F4. useMemo para Estado Derivado

**Nombre:** Computed/Derived State  
**Tipo:** Estado / Rendimiento  
**Ubicacion:** `pwaMenu/src/stores/tableStore/selectors.ts` (lineas 73-112)

**Implementacion:**

```typescript
export const useSharedCartData = () => {
  const cartItems = useCartItems()
  const currentDiner = useTableStore((state) => state.currentDiner)

  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cartItems]
  )

  const itemCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems]
  )

  return { cartItems, currentDiner, cartTotal, itemCount }
}
```

**Proposito:** Memoizacion previene recalcular totales, listas filtradas y agregados en cada render. Critico para rendimiento con listas grandes y actualizaciones frecuentes del store.

---

#### F5. BroadcastChannel para Sincronizacion entre Pestanas

**Nombre:** BroadcastChannel API  
**Tipo:** Estado / Comunicacion  
**Ubicacion:** `Dashboard/src/stores/authStore.ts` (lineas 83-141)

**Implementacion:**

```typescript
let authBroadcast: BroadcastChannel

function initAuthBroadcast(): BroadcastChannel {
  if (authBroadcast) return authBroadcast
  try {
    authBroadcast = new BroadcastChannel('dashboard-auth-sync')
    authBroadcast.onmessage = (event: MessageEvent<AuthBroadcastMessage>) => {
      switch (event.data.type) {
        case 'TOKEN_REFRESHED':
          // Otra pestana refresco - saltar nuestro proximo refresh programado
          break
        case 'LOGOUT':
          // Otra pestana cerro sesion - sincronizar logout aqui
          performLocalLogout()
          break
        case 'LOGIN':
          // Otra pestana inicio sesion - recargar para sincronizar
          window.location.reload()
          break
      }
    }
  } catch {
    // Fallback si BroadcastChannel no esta soportado
    authBroadcast = { postMessage: () => {}, close: () => {} } as BroadcastChannel
  }
  return authBroadcast
}
```

**Proposito:** Coordina estado de auth entre pestanas del navegador (previene llamadas duplicadas de token refresh). Permite que el logout de una pestana dispare logout en todas las demas. Fallback graceful para navegadores sin soporte.

---

### Patrones de Hooks

#### F6. useFormModal -- Hook de Estado Compuesto

**Nombre:** Compound State Hook  
**Tipo:** Hook Custom  
**Ubicacion:** `Dashboard/src/hooks/useFormModal.ts`

**Implementacion:**

```typescript
export function useFormModal<T, S = T>(initialFormData: T): UseFormModalReturn<T, S> {
  const [isOpen, setIsOpen] = useState(false)
  const [formData, setFormData] = useState<T>(initialFormData)
  const [selectedItem, setSelectedItem] = useState<S | null>(null)
  const closeTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => { if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current) }
  }, [])

  const openCreate = useCallback((customInitialData?: Partial<T>) => {
    setFormData(customInitialData ? { ...initialFormData, ...customInitialData } : initialFormData)
    setSelectedItem(null)
    setIsOpen(true)
  }, [initialFormData])

  const openEdit = useCallback((item: S, customFormData?: T) => {
    setSelectedItem(item)
    setFormData(customFormData ?? (item as unknown as T))
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    closeTimeoutRef.current = window.setTimeout(() => {
      setFormData(initialFormData)
      setSelectedItem(null)
    }, 200) // Reset despues de que termine la animacion
  }, [initialFormData])

  return { isOpen, formData, selectedItem, setFormData, openCreate, openEdit, close, reset }
}
```

**Proposito:** Elimina boilerplate combinando 3 useState (modal abierto/cerrado, item seleccionado, datos del form). API limpia: `modal.openCreate()`, `modal.openEdit(item)`, `modal.close()`. Usado en 9 de 16 paginas CRUD, reemplaza ~150 lineas de codigo duplicado. Gestion de timeout asegura reset despues de la animacion del modal.

---

#### F7. useConfirmDialog -- Hook de Confirmacion

**Nombre:** Reusable Confirmation Dialog State  
**Tipo:** Hook Custom  
**Ubicacion:** `Dashboard/src/hooks/useConfirmDialog.ts`

**Implementacion:**

```typescript
export function useConfirmDialog<T = unknown>(): UseConfirmDialogReturn<T> {
  const [isOpen, setIsOpen] = useState(false)
  const [item, setItem] = useState<T | null>(null)
  const closeTimeoutRef = useRef<number | null>(null)

  const open = useCallback((itemToConfirm: T) => {
    setItem(itemToConfirm)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    closeTimeoutRef.current = window.setTimeout(() => {
      setItem(null)
    }, 200)
  }, [])

  return { isOpen, item, open, close }
}
```

**Proposito:** Estandariza dialogos de confirmacion de eliminacion en todas las paginas. Desacopla el estado del dialogo de la logica de la pagina.

---

#### F8. usePagination -- Paginacion con Auto-Reset

**Nombre:** Smart Pagination Hook  
**Tipo:** Hook Custom  
**Ubicacion:** `Dashboard/src/hooks/usePagination.ts`

**Implementacion:**

```typescript
export function usePagination<T>(items: T[], options = {}): UsePaginationResult<T> {
  const [currentPage, setCurrentPageInternal] = useState(1)
  const isResettingRef = useRef(false)

  // Auto-reset a pagina 1 cuando los filtros reducen items por debajo de la pagina actual
  useEffect(() => {
    if (currentPage > totalPages && !isResettingRef.current) {
      isResettingRef.current = true
      setCurrentPageInternal(1)
      const rafId = requestAnimationFrame(() => { isResettingRef.current = false })
      return () => cancelAnimationFrame(rafId)
    }
  }, [currentPage, totalPages])

  // Pagina segura para el render actual
  const safePage = useMemo(() => Math.max(1, Math.min(currentPage, totalPages)), [currentPage, totalPages])

  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * itemsPerPage
    return items.slice(start, start + itemsPerPage)
  }, [items, safePage, itemsPerPage])
}
```

**Proposito:** Auto-reset a pagina 1 cuando filtros reducen el conteo de items. useRef flag previene loop infinito al resetear. useMemo clamping asegura pagina valida durante render mientras el estado se actualiza en background.

---

#### F9. useOptimisticMutation -- Actualizaciones Optimistas

**Nombre:** React 19 useOptimistic + Mutex  
**Tipo:** Hook Custom  
**Ubicacion:** `Dashboard/src/hooks/useOptimisticMutation.ts`

**Implementacion:**

```typescript
export function useOptimisticMutation<T extends { id: string }, TData = unknown>({
  currentData, mutationFn, onSuccess, onError, context,
}) {
  const [isPending, startTransition] = useTransition()
  const [optimisticData, setOptimisticData] = useOptimistic(currentData, optimisticReducer<T>)
  const isMutatingRef = React.useRef(false)  // Mutex

  const mutate = useCallback(async (action, _data?) => {
    if (isMutatingRef.current) return  // Prevenir mutaciones concurrentes
    isMutatingRef.current = true

    startTransition(async () => {
      setOptimisticData(action)  // Actualizar UI inmediatamente
      try {
        await mutationFn(_data ?? action)
        onSuccess?.()
      } catch (error) {
        // React revierte automaticamente
        onError?.(new Error(handleError(error, context)))
      } finally {
        isMutatingRef.current = false  // Liberar mutex
      }
    })
  }, [mutationFn, onSuccess, onError, context])

  return { optimisticData, mutate, isPending }
}
```

**Proposito:** Feedback inmediato: el item aparece/actualiza antes de la confirmacion del servidor. Rollback automatico si la mutacion falla. Patron mutex previene envios duplicados por doble-click rapido. `useOptimistic` de React 19 maneja el rollback automaticamente.

---

#### F10. useFocusTrap -- Trampa de Foco para Accesibilidad

**Nombre:** Focus Trap Hook  
**Tipo:** Hook Custom / Accesibilidad  
**Ubicacion:** `Dashboard/src/hooks/useFocusTrap.ts`

**Implementacion:**

```typescript
export function useFocusTrap<T extends HTMLElement>(isActive: boolean): RefObject<T | null> {
  const containerRef = useRef<T>(null)
  const previousActiveElement = useRef<Element | null>(null)

  useEffect(() => {
    if (!isActive || !containerRef.current) return
    previousActiveElement.current = document.activeElement
    const container = containerRef.current
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)[0]?.focus()

    const abortController = new AbortController()
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS))
      // Ciclar entre primer y ultimo elemento focuseable
      if (e.shiftKey && currentIndex === 0) { e.preventDefault(); focusable.at(-1)?.focus() }
      if (!e.shiftKey && currentIndex === focusable.length - 1) { e.preventDefault(); focusable[0]?.focus() }
    }
    container.addEventListener('keydown', handler, { signal: abortController.signal })

    return () => {
      abortController.abort()
      // Restaurar foco al elemento previo
      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus()
      }
    }
  }, [isActive])

  return containerRef
}
```

**Proposito:** Atrapa el foco del teclado dentro de modales (requisito de accesibilidad WCAG). Soporta modales anidados re-consultando elementos focuseables en cada Tab. AbortController cleanup es el enfoque moderno y seguro. Restaura foco al elemento previo al cerrar el modal.

---

#### F11. useKeyboardShortcuts -- Atajos de Teclado Globales

**Nombre:** Global Keyboard Command Registration  
**Tipo:** Hook Custom  
**Ubicacion:** `Dashboard/src/hooks/useKeyboardShortcuts.ts`

**Implementacion:**

```typescript
export function useKeyboardShortcuts() {
  const shortcutsRef = useRef<Map<string, ShortcutConfig>>(new Map())
  const isMacRef = useRef(detectMac())

  const registerShortcut = useCallback((config: ShortcutConfig) => {
    shortcutsRef.current.set(getShortcutKey(config), config)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const inInput = isInputElement(document.activeElement)
      for (const [, config] of shortcutsRef.current) {
        if (inInput && !config.allowInInput && !config.ctrl) continue
        if (event.key.toLowerCase() !== config.key.toLowerCase()) continue
        if (config.ctrl) {
          const modifier = isMacRef.current ? event.metaKey : event.ctrlKey
          if (!modifier) continue
        }
        event.preventDefault()
        config.handler()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return { registerShortcut, unregisterShortcut, getShortcuts, isMac: isMacRef.current }
}
```

**Proposito:** Centraliza el registro de comandos de teclado. Maneja diferencias de plataforma (Cmd en Mac vs Ctrl en Windows). Previene atajos al escribir en inputs (excepto Ctrl+S, etc.). Un solo event listener para todos los atajos (no uno por atajo).

---

#### F12. useOptimisticCart -- Carrito Optimista React 19

**Nombre:** React 19 Cart Optimistic Updates  
**Tipo:** Hook Custom  
**Ubicacion:** `pwaMenu/src/hooks/useOptimisticCart.ts`

**Implementacion:**

```typescript
export function useOptimisticCart({ cartItems, currentDinerId, onAddToCart, ... }) {
  const [isPending, startTransition] = useTransition()
  const [optimisticItems, addOptimistic] = useOptimistic(cartItems, cartReducer)
  const tempIdCounterRef = useRef(0)  // Contador para IDs unicos

  const addToCartOptimistic = useCallback((input) => {
    // Garantizar unicidad: timestamp + counter + random
    const tempId = `temp-${Date.now()}-${++tempIdCounterRef.current}-${Math.random().toString(36).substring(2, 9)}`
    const optimisticItem = { id: tempId, ...input, dinerId: currentDinerId }

    startTransition(() => {
      addOptimistic({ type: 'add', item: optimisticItem })
      onAddToCart(input)
    })
  }, [currentDinerId, addOptimistic, onAddToCart])
}
```

**Proposito:** `useOptimistic` + `useTransition` de React 19 para feedback instantaneo del carrito. Contador garantiza IDs temporales unicos incluso con doble-click rapido. Rollback automatico si la actualizacion del store falla.

---

#### F13. useSystemTheme -- Deteccion de Tema del Sistema

**Nombre:** OS Color Scheme Detection Hook  
**Tipo:** Hook Custom  
**Ubicacion:** `Dashboard/src/hooks/useSystemTheme.ts`

**Implementacion:**

```typescript
export function useSystemTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setTheme(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return theme
}
```

**Proposito:** Sincroniza el tema de la app con la preferencia dark/light del SO. Manejo graceful de SSR y deteccion de soporte del navegador.

---

### Patrones de Comunicacion

#### F14. Token Refresh Mutex -- Mutex para Refresco de Token

**Nombre:** Mutex Pattern for Atomic Token Refresh  
**Tipo:** Comunicacion / Seguridad  
**Ubicacion:** `Dashboard/src/services/api.ts` (lineas 18-110), `pwaWaiter/src/stores/authStore.ts`

**Implementacion:**

```typescript
let refreshPromise: Promise<string | null> | null = null

async function attemptTokenRefresh(): Promise<string | null> {
  // Si ya esta refrescando, retornar la promesa existente (sin race condition)
  if (refreshPromise) return refreshPromise

  // Crear la promesa ANTES de cualquier trabajo async
  refreshPromise = (async () => {
    try {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 10000)

      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',  // HttpOnly cookie
        signal: controller.signal,
      })
      if (!response.ok) return null

      const data = await response.json()
      if (!data.access_token || data.access_token.length < 10) return null

      authToken = data.access_token
      onTokenRefreshed?.(data.access_token)
      return data.access_token
    } catch { return null }
    finally { refreshPromise = null }  // Limpiar mutex
  })()

  return refreshPromise
}
```

**Proposito:** Todas las respuestas 401 concurrentes esperan el mismo intento de refresh. Previene multiples requests de token refresh simultaneos (race condition comun). La promesa se crea antes del trabajo async para asegurar que todos los llamadores referencien la misma promesa.

---

#### F15. 401 Retry -- Reintento Automatico en 401

**Nombre:** Automatic 401 Retry with Token Refresh  
**Tipo:** Comunicacion  
**Ubicacion:** `Dashboard/src/services/api.ts` (lineas 162-175)

**Implementacion:**

```typescript
async function fetchAPI<T>(endpoint, options = {}, retryOnUnauthorized = true): Promise<T> {
  const response = await fetch(...)

  if (response.status === 401 && retryOnUnauthorized) {
    const newToken = await attemptTokenRefresh()
    if (newToken) {
      return fetchAPI<T>(endpoint, options, false)  // false previene loop infinito
    } else {
      onTokenExpired?.()
      throw new Error('Sesion expirada')
    }
  }
}
```

**Proposito:** Reintento transparente en 401 (token expirado). `retryOnUnauthorized = false` en el segundo intento previene loop infinito de retry. Si el refresh falla, notifica authStore para hacer logout.

---

#### F16. AbortController Timeout -- Timeout con AbortController

**Nombre:** AbortController + AbortSignal  
**Tipo:** Comunicacion  
**Ubicacion:** `Dashboard/src/services/api.ts`, `pwaMenu/src/services/api.ts`

**Implementacion:**

```typescript
async function fetchAPI<T>(endpoint, options: FetchAPIOptions = {}) {
  const { timeout = 30000, signal: externalSignal, ...rest } = options
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  // Permitir que signal externo tambien cancele
  if (externalSignal) {
    externalSignal.addEventListener('abort', () => controller.abort())
  }

  try {
    const response = await fetch(url, { ...rest, signal: controller.signal })
    clearTimeout(timeoutId)
    return response
  } catch (err) {
    clearTimeout(timeoutId)
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('La solicitud fue cancelada o excedio el tiempo limite')
    }
    throw err
  }
}
```

**Proposito:** AbortController es la forma moderna y estandarizada de cancelar fetch requests. Composabilidad de AbortSignal: signals externos pueden cancelar (util para unmount de componentes). Previene requests colgados de consumir memoria.

---

#### F17. Request Deduplication -- Deduplicacion de Peticiones

**Nombre:** In-Flight Request Deduplication  
**Tipo:** Comunicacion  
**Ubicacion:** `pwaMenu/src/services/api.ts`

**Implementacion:**

```typescript
const pendingRequests = new Map<string, {
  body: string | undefined
  promise: Promise<unknown>
  startTime: number
}>()

// Antes de hacer un request:
// 1. Verificar si un request identico ya esta en vuelo
// 2. Si existe, retornar la promesa existente (no hacer request nuevo)
// 3. Si no, hacer el request y almacenar en el map
// 4. Limpiar requests completados (con verificacion de edad)
```

**Proposito:** Previene requests duplicados de doble-clicks rapidos o reintentos de red. Retorna la misma promesa a todos los llamadores. Limpieza basada en edad previene crecimiento ilimitado del map.

---

#### F18. SSRF Prevention -- Prevencion de SSRF

**Nombre:** Strict API Base URL Validation  
**Tipo:** Seguridad  
**Ubicacion:** `pwaMenu/src/services/api.ts` (lineas 88-172)

**Implementacion:**

```typescript
const ALLOWED_HOSTS = new Set(API_CONFIG.ALLOWED_HOSTS)
const ALLOWED_PORTS = new Set(API_CONFIG.ALLOWED_PORTS)

function isValidApiBase(url: string): boolean {
  const parsed = new URL(url)

  // Solo HTTP/HTTPS
  if (!['http:', 'https:'].includes(parsed.protocol)) return false

  // Bloquear IPs (IPv4 e IPv6) - prevenir SSRF
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(parsed.hostname)) return false
  if (/^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i.test(parsed.hostname)) return false

  // Bloquear credenciales en URL
  if (parsed.username || parsed.password) return false

  // Verificar host Y puerto exactos
  return ALLOWED_HOSTS.has(parsed.hostname) && ALLOWED_PORTS.has(normalizedPort)
}
```

**Proposito:** Previene ataques Server-Side Request Forgery (SSRF). Bloquea IPs (localhost, 127.0.0.1, IPv6). Bloquea credenciales en URL. Whitelist de hosts/puertos permitidos. Verifica al inicio y lanza error en produccion.

---

#### F19. WebSocket Singleton con Reconexion y Backoff Exponencial

**Nombre:** WebSocket Singleton + Auto-Reconnect + Exponential Backoff  
**Tipo:** Comunicacion  
**Ubicacion:** `Dashboard/src/services/websocket.ts` (lineas 164-268)

**Implementacion:**

```typescript
const BASE_RECONNECT_DELAY = 1000
const MAX_RECONNECT_DELAY = 30000
const JITTER_FACTOR = 0.3
const MAX_RECONNECT_ATTEMPTS = 50
const NON_RECOVERABLE_CLOSE_CODES = new Set([4001, 4003, 4029])

class DashboardWebSocket {
  private ws: WebSocket | null = null
  private listeners: Map<WSEventType | '*', Set<EventCallback>> = new Map()
  private reconnectAttempts = 0

  connect(endpoint: 'admin' | 'kitchen' = 'admin') {
    if (this.ws?.readyState === WebSocket.OPEN) return  // Ya conectado

    this.ws = new WebSocket(`${WS_BASE}/ws/${endpoint}?token=${token}`)
    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.startHeartbeat()
    }
    this.ws.onclose = (event) => {
      if (NON_RECOVERABLE_CLOSE_CODES.has(event.code)) {
        // Codigos permanentes (4001=auth, 4003=forbidden, 4029=rate limit)
        this.onMaxReconnectReached?.()
        return
      }
      if (!this.isIntentionallyClosed) this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return

    const delay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY
    )
    const jitteredDelay = delay * (1 - JITTER_FACTOR + Math.random() * JITTER_FACTOR * 2)
    this.reconnectAttempts++
    this.reconnectTimeout = setTimeout(() => this.connect(this.endpoint), jitteredDelay)
  }
}

export const dashboardWS = new DashboardWebSocket()  // Singleton
```

**Proposito:** Singleton asegura una unica instancia de conexion por aplicacion. Backoff exponencial previene martillear el servidor en fallos repetidos. Jitter previene thundering herd. Heartbeat/ping-pong detecta conexiones muertas. Distingue codigos recuperables (red) vs permanentes (auth).

---

#### F20. Observer -- Suscripcion a Eventos WebSocket

**Nombre:** Observer Pattern con Suscripciones Filtradas  
**Tipo:** Comunicacion  
**Ubicacion:** `Dashboard/src/services/websocket.ts` (lineas 323-399)

**Implementacion:**

```typescript
class DashboardWebSocket {
  private listeners: Map<WSEventType | '*', Set<EventCallback>> = new Map()

  // Suscripcion basica
  on(eventType: WSEventType | '*', callback: EventCallback): () => void {
    if (!this.listeners.has(eventType)) this.listeners.set(eventType, new Set())
    this.listeners.get(eventType)!.add(callback)
    return () => {  // Retorna funcion de unsuscribe
      const set = this.listeners.get(eventType)
      set?.delete(callback)
      if (set?.size === 0) this.listeners.delete(eventType)  // Cleanup de sets vacios
    }
  }

  // Suscripcion filtrada por sucursal
  onFiltered(branchId: number, eventType, callback): () => void {
    const filtered = (event) => { if (event.branch_id === branchId) callback(event) }
    return this.on(eventType, filtered)
  }

  // Suscripcion filtrada por multiples sucursales
  onFilteredMultiple(branchIds: number[], eventType, callback): () => void {
    const branchSet = new Set(branchIds)
    const filtered = (event) => { if (branchSet.has(event.branch_id)) callback(event) }
    return this.on(eventType, filtered)
  }

  private notifyListeners(event: WSEvent) {
    // Notificar listeners de tipo especifico
    this.listeners.get(event.type)?.forEach(cb => cb(event))
    // Notificar listeners wildcard
    this.listeners.get('*')?.forEach(cb => cb(event))
  }
}
```

**Proposito:** Multi-cast: un mensaje entrante llega a todos los listeners interesados. Filtrado type-safe al momento de suscripcion reduce trabajo de filtrado. Funciones de unsuscribe permiten cleanup sin almacenar objetos de suscripcion. Cleanup de Sets vacios previene memory leaks.

---

#### F30. Refresco Proactivo de Token con Jitter

**Nombre:** Scheduled Token Refresh with Jitter  
**Tipo:** Seguridad  
**Ubicacion:** `Dashboard/src/stores/authStore.ts` (lineas 19-72)

**Implementacion:**

```typescript
const BASE_REFRESH_INTERVAL_MS = 14 * 60 * 1000  // 14 min (1 min antes de expiracion de 15 min)
const JITTER_RANGE_MS = 2 * 60 * 1000  // +/-2 minutos

function getRefreshIntervalWithJitter(): number {
  const jitter = (Math.random() - 0.5) * 2 * JITTER_RANGE_MS
  return Math.max(BASE_REFRESH_INTERVAL_MS + jitter, 60000)  // Minimo 1 minuto
}

function startTokenRefreshInterval(refreshFn) {
  const scheduleNextRefresh = () => {
    const interval = getRefreshIntervalWithJitter()
    refreshTimeoutId = setTimeout(async () => {
      const success = await refreshFn()
      if (success) authBroadcast.postMessage({ type: 'TOKEN_REFRESHED' })
      scheduleNextRefresh()  // Programar siguiente independientemente del resultado
    }, interval)
  }
  scheduleNextRefresh()
}
```

**Proposito:** Refresco proactivo antes de que expire el token previene 401s durante uso activo. Jitter previene que todos los clientes refresquen simultaneamente. setTimeout en vez de setInterval permite scheduling variable. Continua refrescando incluso si un intento falla.

---

#### F31. HttpOnly Cookie para Refresh Token

**Nombre:** HttpOnly Cookie + credentials:include  
**Tipo:** Seguridad  
**Ubicacion:** `Dashboard/src/services/api.ts`, `Dashboard/src/stores/authStore.ts`

**Implementacion:**

```typescript
// api.ts - enviar cookie HttpOnly con el request
const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
  method: 'POST',
  credentials: 'include',  // Incluir cookies HttpOnly
})

// authStore.ts - solo persistir access token, NO refresh token
partialize: (state) => ({
  token: state.token,       // Access token en localStorage (corta vida)
  user: state.user,
  isAuthenticated: state.isAuthenticated,
  // refreshToken NO se persiste - esta en HttpOnly cookie
})
```

**Proposito:** HttpOnly cookies previenen acceso desde JavaScript (protege contra XSS). `credentials: include` envia cookies con todos los requests. Access token en localStorage (corta vida, 15 min). Refresh token en HttpOnly cookie (larga vida, inaccesible a JS).

---

### Patrones de Componentes

#### F24. useActionState -- Formularios con React 19

**Nombre:** React 19 useActionState  
**Tipo:** Formularios  
**Ubicacion:** `Dashboard/src/pages/Categories.tsx`

**Implementacion:**

```typescript
const submitAction = useCallback(
  async (_prevState: FormState<T>, formData: FormData): Promise<FormState<T>> => {
    const data = {
      name: formData.get('name') as string,
      branch_id: parseInt(formData.get('branch_id') as string, 10),
    }
    const validation = validateCategory(data)
    if (!validation.isValid) return { errors: validation.errors, isSuccess: false }

    try {
      if (modal.selectedItem) {
        updateItem(modal.selectedItem.id, data)
      } else {
        addItem(data)
      }
      return { isSuccess: true }
    } catch (error) {
      return { isSuccess: false, message: handleError(error) }
    }
  },
  [modal.selectedItem]
)

const [state, formAction, isPending] = useActionState(submitAction, { isSuccess: false })

// En JSX:
<form action={formAction}>
  <input name="name" />
  <Button type="submit" isLoading={isPending}>Guardar</Button>
</form>
```

**Proposito:** Feature de React 19: estado pending automatico sin useState. Envio declarativo via atributo `action`. FormData API para extraccion nativa de datos. Validacion antes de la mutacion. Modal se cierra automaticamente en exito.

---

#### F25. Validacion Centralizada con Type Guards

**Nombre:** Centralized Validators + Number Type Guards  
**Tipo:** Validacion  
**Ubicacion:** `Dashboard/src/utils/validation.ts`

**Implementacion:**

```typescript
export function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && Number.isFinite(value)
}

export function isPositiveNumber(value: unknown): value is number {
  return isValidNumber(value) && value > 0
}

export function validateCategory(data, options = {}): ValidationResult<CategoryFormData> {
  const errors: ValidationErrors<CategoryFormData> = {}
  const trimmedName = data.name.trim()

  if (!trimmedName) errors.name = 'El nombre es requerido'
  else if (trimmedName.length < 2) errors.name = 'Minimo 2 caracteres'
  else if (options.existingCategories) {
    const duplicate = options.existingCategories.find(
      c => c.name.toLowerCase() === trimmedName.toLowerCase() && c.id !== options.editingId
    )
    if (duplicate) errors.name = `Ya existe "${trimmedName}" en esta sucursal`
  }

  return { isValid: Object.keys(errors).length === 0, errors }
}
```

**Proposito:** Type guards (`isValidNumber`, `isPositiveNumber`) atrapan NaN e Infinity. Validadores centralizados aseguran logica consistente. `ValidationResult<T>` provee objetos de error type-safe. Trim de strings previene inputs de solo espacios.

---

#### F26. Claves i18n para Errores de Validacion

**Nombre:** i18n Keys for Validation Errors  
**Tipo:** i18n / Validacion  
**Ubicacion:** `pwaMenu/src/utils/validation.ts`

**Implementacion:**

```typescript
// Las funciones de validacion retornan claves i18n, NO mensajes en ingles
const error = validateTableNumber(tableNumber)
if (error) {
  showError(t(error))  // error es 'validation.tableRequired'
}
```

**Proposito:** Los mensajes de error soportan automaticamente todos los idiomas (es, en, pt). Traducciones centralizadas en archivos JSON de i18n. Sin texto hardcodeado en codigo de validacion.

---

#### F27. Logger Estructurado con Mensajes Seguros

**Nombre:** Structured Logger  
**Tipo:** Error Handling  
**Ubicacion:** `Dashboard/src/utils/logger.ts`

**Implementacion:**

```typescript
const USER_FRIENDLY_MESSAGES: Record<string, string> = {
  network: 'Error de conexion. Verifica tu internet.',
  validation: 'Los datos ingresados no son validos.',
  notfound: 'El recurso solicitado no existe.',
  unauthorized: 'No tienes permisos para esta accion.',
  timeout: 'La operacion tardo demasiado. Intenta nuevamente.',
  server: 'Error en el servidor. Intenta mas tarde.',
  default: 'Ocurrio un error. Intenta nuevamente.',
}

// Uso:
const message = handleError(error, 'ComponentName.functionName')
toast.error(message)  // Mensaje seguro en espanol, nunca errores internos
```

**Proposito:** Errores internos nunca se exponen a los usuarios. Logging estructurado para debugging (con timestamps, contexto, stacks). Mapeo centralizado de errores. Niveles de logging ajustados segun desarrollo vs produccion.

---

#### F28. Clases de Error Unificadas con i18n

**Nombre:** Error Hierarchy con i18n y metadata de retry  
**Tipo:** Error Handling  
**Ubicacion:** `pwaMenu/src/utils/errors.ts`

**Implementacion:**

```typescript
// Clase base con propiedad i18nKey
class ApiError extends Error {
  code: string
  i18nKey: string
  isRetryable: boolean
}

// Uso: catch(err) { t(err.i18nKey) } para traducir automaticamente
```

**Proposito:** Los errores llevan claves i18n para traduccion automatica. `isRetryable` permite logica inteligente de reintento. `code` habilita manejo granular de errores.

---

#### F29. i18n con Cadena de Fallback

**Nombre:** i18next with Validated Language Detector  
**Tipo:** i18n  
**Ubicacion:** `pwaMenu/src/i18n/index.ts`

**Implementacion:**

```typescript
const SUPPORTED_LANGUAGES = ['es', 'en', 'pt'] as const

// Detector validado previene XSS via localStorage
const validatedLanguageDetector = new LanguageDetector()
validatedLanguageDetector.addDetector({
  name: 'validatedLocalStorage',
  lookup() {
    const stored = localStorage.getItem('pwamenu-language')
    if (stored && SUPPORTED_LANGUAGES.includes(stored)) return stored
    return undefined
  },
})

i18n.init({
  fallbackLng: {
    en: ['es'],      // Ingles cae a espanol
    pt: ['es'],      // Portugues cae a espanol
    default: ['es'], // Todos caen a espanol
  },
  supportedLngs: SUPPORTED_LANGUAGES,
  // Log claves faltantes en desarrollo
  saveMissing: import.meta.env.DEV,
  missingKeyHandler: import.meta.env.DEV
    ? (lngs, _ns, key) => console.warn(`Missing: ${key} for ${lngs}`)
    : undefined,
})
```

**Proposito:** Detector validado previene XSS via localStorage. Cadena de fallback (en->es, pt->es) muestra espanol completo en vez de claves sin traducir. Warnings de claves faltantes ayudan a detectar gaps de traduccion en desarrollo.

---

#### F32. Capa de Conversion de Tipos Backend <-> Frontend

**Nombre:** Type Conversion Layer  
**Tipo:** Datos  
**Ubicacion:** `pwaMenu/src/stores/tableStore/store.ts` (lineas 40-81)

**Implementacion:**

```typescript
function mapAPIProductToFrontend(apiProduct: APIProduct): Product {
  // Precios: backend cents -> frontend pesos
  const branchPrices = apiProduct.branch_prices.map(bp => ({
    branch_id: String(bp.branch_id),     // IDs: number -> string
    price: bp.price_cents / 100,          // 12550 -> 125.50
    is_active: bp.is_available,
  }))

  return {
    id: String(apiProduct.id),            // IDs: number -> string
    name: apiProduct.name,
    description: apiProduct.description ?? '',
    price: branchPrices[0]?.price ?? 0,
    allergen_ids: apiProduct.allergen_ids.map(String),
    // ... mas campos
  }
}
```

**Proposito:** Backend almacena precios en centavos; frontend usa pesos. Backend usa IDs numericos; frontend usa strings para consistencia. Desacopla formatos de datos de backend y frontend. Maneja campos nullable/opcionales con nullish coalescing.

---

### Patrones de Rendimiento

#### F21. Throttle -- Limitacion de Frecuencia de Eventos

**Nombre:** Throttling Function  
**Tipo:** Rendimiento  
**Ubicacion:** `Dashboard/src/services/websocket.ts` (lineas 17-49)

**Implementacion:**

```typescript
function throttle<T extends (...args: unknown[]) => void>(func: T, limit: number): T {
  let lastCall = 0
  let timeout: ReturnType<typeof setTimeout> | null = null

  return ((...args: unknown[]) => {
    const now = Date.now()
    const remaining = limit - (now - lastCall)

    if (remaining <= 0) {
      if (timeout) { clearTimeout(timeout); timeout = null }
      lastCall = now
      func(...args)
    } else if (!timeout) {
      timeout = setTimeout(() => {
        lastCall = Date.now()
        timeout = null
        func(...args)
      }, remaining)
    }
  }) as T
}

const DEFAULT_THROTTLE_DELAY = 100  // 100ms
```

**Proposito:** Previene re-renders excesivos de eventos WebSocket de alta frecuencia. Asegura que el callback se llame como maximo una vez por intervalo. Llamadas pendientes se programan si llega otra antes del intervalo.

---

#### F33. Maps Acotados para Cleanup de Timeouts

**Nombre:** Bounded Maps for Throttling  
**Tipo:** Rendimiento / Memoria  
**Ubicacion:** `pwaWaiter/src/stores/tablesStore.ts` (lineas 33-40)

**Implementacion:**

```typescript
const statusBlinkTimeouts = new Map<number, ReturnType<typeof setTimeout>>()
const newOrderTimeouts = new Map<number, ReturnType<typeof setTimeout>>()
const serviceCallTimeouts = new Map<number, ReturnType<typeof setTimeout>>()

// Prevenir crecimiento ilimitado
const seenServiceCallIds = new Set<number>()
const MAX_SEEN_SERVICE_CALLS = 100

function clearAllAnimationTimeouts(): void {
  statusBlinkTimeouts.forEach(timeout => clearTimeout(timeout))
  statusBlinkTimeouts.clear()
  newOrderTimeouts.forEach(timeout => clearTimeout(timeout))
  newOrderTimeouts.clear()
  // ... mas cleanup
}
```

**Proposito:** Maps rastrean timeouts por mesa/entidad (previene animaciones duplicadas). MAX_SEEN limita el tamano del Set para prevenir crecimiento ilimitado. `clearAllAnimationTimeouts()` asegura cleanup en logout/page unload.

---

#### F34. Cleanup de Sets Vacios en Observers

**Nombre:** Self-Cleaning Empty Sets  
**Tipo:** Rendimiento / Memoria  
**Ubicacion:** `Dashboard/src/services/websocket.ts` (lineas 333-336)

**Implementacion:**

```typescript
// Al unsuscribirse:
return () => {
  const listeners = this.listeners.get(eventType)
  listeners?.delete(callback)
  // Limpiar Sets vacios para prevenir memory leak
  if (listeners?.size === 0) {
    this.listeners.delete(eventType)
  }
}
```

**Proposito:** Las funciones de unsuscribe eliminan Sets vacios. Previene crecimiento ilimitado de entradas del Map. Cada cleanup de listener dispara su propia remocion de Set.

---

### Patrones de Offline/PWA

#### F22. Retry Queue -- Cola de Reintentos Offline (pwaWaiter)

**Nombre:** Offline-First Retry Queue con localStorage  
**Tipo:** Offline / PWA  
**Ubicacion:** `pwaWaiter/src/stores/retryQueueStore.ts`

**Implementacion:**

```typescript
const STORAGE_KEY = 'waiter-retry-queue'
const MAX_RETRIES = 3

export const useRetryQueueStore = create<RetryQueueState>()(
  persist(
    (set, get) => ({
      queue: [],
      isProcessing: false,

      enqueue: (type, payload) => {
        // Deduplicar por type + entity ID
        const entityId = payload.id || payload.roundId || payload.tableId
        const key = `${type}_${entityId}`
        const exists = get().queue.some(item => `${item.type}_${item.payload.id}` === key)
        if (exists) return

        set(state => ({
          queue: [...state.queue, {
            id: crypto.randomUUID(),
            type, payload,
            createdAt: new Date().toISOString(),
            retryCount: 0,
          }]
        }))

        // Procesar con debounce si online
        if (navigator.onLine && !get().isProcessing) {
          setTimeout(() => get().processQueue(), 100)
        }
      },

      processQueue: async () => {
        if (!navigator.onLine) return
        set({ isProcessing: true })
        const failedActions = []
        for (const action of get().queue) {
          try {
            await executeAction(action)
          } catch (error) {
            if (error.code === 'NETWORK_ERROR' && action.retryCount < MAX_RETRIES) {
              failedActions.push({ ...action, retryCount: action.retryCount + 1 })
            }
          }
        }
        set({ queue: failedActions, isProcessing: false })
      },
    }),
    { name: STORAGE_KEY }
  )
)
```

**Proposito:** Persiste operaciones fallidas en localStorage para sobrevivir reinicios de la app. Deduplica acciones por tipo + entity ID. Procesa la cola al restaurar conexion y al iniciar la app. Max retries previene loops infinitos. Procesamiento con debounce previene race conditions.

---

#### F23. IndexedDB Queue -- Cola Offline con IndexedDB (pwaMenu)

**Nombre:** IndexedDB-Based Offline Order Queue  
**Tipo:** Offline / PWA  
**Ubicacion:** `pwaMenu/src/hooks/useOfflineQueue.ts`

**Implementacion:**

```typescript
const DB_NAME = 'sabor-offline-queue'
const DB_VERSION = 1
const STORE_NAME = 'orders'
const MAX_RETRIES = 3

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

export function useOfflineQueue(submitOrderFn?) {
  const dbRef = useRef<IDBDatabase | null>(null)
  const syncInProgressRef = useRef(false)

  // Auto-sync cuando se restaura la conexion
  useEffect(() => {
    const handleOnline = () => syncOrders()
    window.addEventListener('online', handleOnline)
    if (navigator.onLine && pendingOrders.length > 0) syncOrders()
    return () => window.removeEventListener('online', handleOnline)
  }, [])
}
```

**Proposito:** IndexedDB sobrevive reinicios de la app (mejor que sessionStorage). Mayor cuota de almacenamiento que localStorage. Indice por timestamp habilita procesamiento FIFO (ordenes mas antiguas primero). Auto-sync en evento online. Max retries + cleanup basado en edad.

---

## Tabla Resumen

| Patron | Tipo (GoF/Moderno) | Componente | Archivo(s) Principal(es) |
|--------|-------------------|-----------|--------------------------|
| Template Method | GoF - Comportamiento | Backend | `rest_api/services/base_service.py` |
| Repository | DDD - Datos | Backend | `rest_api/services/crud/repository.py` |
| Specification | DDD - Datos | Backend | `rest_api/services/crud/repository.py` |
| Strategy (Permisos) | GoF - Comportamiento | Backend | `rest_api/services/permissions/strategies.py` |
| Mixin | Python - Estructural | Backend | `rest_api/services/permissions/strategies.py` |
| Soft Delete | Moderno - Datos | Backend | `rest_api/models/base.py`, `services/crud/soft_delete.py` |
| Transactional Outbox | Microservicios - Datos | Backend | `rest_api/services/events/outbox_service.py` |
| Dependency Injection | IoC - Arquitectonico | Backend | `shared/infrastructure/db.py` |
| Middleware Chain | GoF - Comportamiento | Backend | `rest_api/main.py`, `rest_api/core/middlewares.py` |
| Exception Hierarchy | OOP - Comportamiento | Backend | `shared/utils/exceptions.py` |
| Singleton | GoF - Creacional | Backend | `shared/config/settings.py` |
| Connection Pool | Moderno - Recursos | Backend | `shared/infrastructure/db.py` |
| Strategy (Auth) | GoF - Comportamiento | WS Gateway | `ws_gateway/components/auth/strategies.py` |
| Circuit Breaker | Moderno - Resiliencia | WS Gateway | `ws_gateway/components/resilience/circuit_breaker.py` |
| Sliding Window Rate Limiter | Moderno - Concurrencia | WS Gateway | `ws_gateway/components/connection/rate_limiter.py` |
| Multi-Dimensional Index | Moderno - Datos | WS Gateway | `ws_gateway/components/connection/index.py` |
| Sharded Locks | Moderno - Concurrencia | WS Gateway | `ws_gateway/components/connection/locks.py` |
| Heartbeat Tracker | Moderno - Monitoreo | WS Gateway | `ws_gateway/components/connection/heartbeat.py` |
| Template Method (Endpoints) | GoF - Comportamiento | WS Gateway | `ws_gateway/components/endpoints/base.py` |
| Event Router | Moderno - Comunicacion | WS Gateway | `ws_gateway/components/events/router.py` |
| Worker Pool | Moderno - Concurrencia | WS Gateway | `ws_gateway/core/connection/broadcaster.py` |
| Drop Rate Tracker | Moderno - Monitoreo | WS Gateway | `ws_gateway/core/subscriber/drop_tracker.py` |
| Retry + Backoff | Moderno - Resiliencia | WS Gateway | `ws_gateway/components/resilience/retry.py` |
| Zustand Selectors + EMPTY_ARRAY | Moderno - Estado | Frontend (todos) | `stores/authStore.ts`, `stores/productStore.ts`, `tableStore/selectors.ts` |
| Zustand Persist + Migration | Moderno - Estado | Dashboard | `stores/authStore.ts` |
| useShallow | Moderno - Estado | pwaMenu | `tableStore/selectors.ts` |
| useMemo Derived State | Moderno - Estado | pwaMenu | `tableStore/selectors.ts` |
| BroadcastChannel | Moderno - Estado | Dashboard | `stores/authStore.ts` |
| useFormModal | Moderno - Hook | Dashboard | `hooks/useFormModal.ts` |
| useConfirmDialog | Moderno - Hook | Dashboard | `hooks/useConfirmDialog.ts` |
| usePagination | Moderno - Hook | Dashboard | `hooks/usePagination.ts` |
| useOptimisticMutation | React 19 - Hook | Dashboard | `hooks/useOptimisticMutation.ts` |
| useFocusTrap | Moderno - Accesibilidad | Dashboard | `hooks/useFocusTrap.ts` |
| useKeyboardShortcuts | Moderno - Hook | Dashboard | `hooks/useKeyboardShortcuts.ts` |
| useOptimisticCart | React 19 - Hook | pwaMenu | `hooks/useOptimisticCart.ts` |
| useSystemTheme | Moderno - Hook | Dashboard | `hooks/useSystemTheme.ts` |
| Token Refresh Mutex | Moderno - Comunicacion | Dashboard, pwaWaiter | `services/api.ts`, `stores/authStore.ts` |
| 401 Retry | Moderno - Comunicacion | Dashboard | `services/api.ts` |
| AbortController Timeout | Moderno - Comunicacion | Dashboard, pwaMenu | `services/api.ts` |
| Request Deduplication | Moderno - Comunicacion | pwaMenu | `services/api.ts` |
| SSRF Prevention | Moderno - Seguridad | pwaMenu | `services/api.ts` |
| WebSocket Singleton + Reconnect | Moderno - Comunicacion | Dashboard | `services/websocket.ts` |
| Observer (Event Subscription) | GoF - Comunicacion | Dashboard | `services/websocket.ts` |
| Throttle | Moderno - Rendimiento | Dashboard | `services/websocket.ts` |
| Retry Queue (localStorage) | Moderno - Offline | pwaWaiter | `stores/retryQueueStore.ts` |
| IndexedDB Queue | Moderno - Offline | pwaMenu | `hooks/useOfflineQueue.ts` |
| useActionState | React 19 - Formularios | Dashboard | `pages/Categories.tsx` |
| Centralized Validation | Moderno - Validacion | Dashboard | `utils/validation.ts` |
| i18n Validation Keys | Moderno - i18n | pwaMenu | `utils/validation.ts` |
| Structured Logger | Moderno - Error Handling | Dashboard | `utils/logger.ts` |
| Unified Error Classes | Moderno - Error Handling | pwaMenu | `utils/errors.ts` |
| i18n Fallback Chain | Moderno - i18n | pwaMenu | `i18n/index.ts` |
| Proactive Token Refresh | Moderno - Seguridad | Dashboard | `stores/authStore.ts` |
| HttpOnly Cookie | Moderno - Seguridad | Dashboard | `services/api.ts`, `stores/authStore.ts` |
| Type Conversion Layer | Moderno - Datos | pwaMenu | `tableStore/store.ts` |
| Bounded Maps Cleanup | Moderno - Rendimiento | pwaWaiter | `stores/tablesStore.ts` |
| Empty Set Cleanup | Moderno - Rendimiento | Dashboard | `services/websocket.ts` |

---

> **Total: 57 patrones de diseno documentados** a traves de Backend (REST API + Shared), WebSocket Gateway y 3 aplicaciones Frontend (Dashboard, pwaMenu, pwaWaiter).
