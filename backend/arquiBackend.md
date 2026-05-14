# Arquitectura del Backend

Este documento describe la arquitectura técnica del backend de Integrador, un sistema de gestión de restaurantes multi-tenant construido sobre FastAPI, PostgreSQL y Redis. A lo largo de estas páginas se detallan los principios de diseño, la organización en capas, los patrones implementados, los flujos de datos críticos y las decisiones arquitectónicas que dan forma al sistema.

---

## Visión General

El backend de Integrador se compone de dos servicios independientes que comparten un módulo común: la **REST API** (puerto 8000), que expone operaciones CRUD y lógica de negocio a través de HTTP, y el **WebSocket Gateway** (puerto 8001), que gestiona conexiones en tiempo real para notificar a dashboards, meseros, cocina y comensales sobre eventos del sistema. Ambos servicios se conectan a una base de datos PostgreSQL 16 con la extensión pgvector y a un servidor Redis 7 que sirve como bus de eventos, caché de tokens revocados y motor de rate limiting.

La arquitectura sigue los principios de Clean Architecture: las dependencias fluyen desde las capas externas (HTTP, bases de datos) hacia las capas internas (lógica de negocio, entidades de dominio). Esto permite que la lógica de negocio permanezca aislada de los detalles de infraestructura, facilitando tanto el testing como la evolución del sistema.

```
                         HTTP Request
                              │
                              ▼
┌──────────────────────────────────────────────────────────┐
│                  PRESENTATION LAYER                       │
│        Routers · Middlewares · Pydantic Schemas            │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                   APPLICATION LAYER                       │
│     Domain Services · PermissionContext · Event Publishers │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                     DOMAIN LAYER                          │
│          Models (SQLAlchemy) · Value Objects · Enums       │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                 INFRASTRUCTURE LAYER                      │
│     Repositories · Redis Pools · DB Sessions · Outbox     │
└──────────────────────────────────────────────────────────┘
```

---

## Principios Arquitectónicos

### Clean Architecture y SOLID

El backend organiza el código en capas concéntricas. Las capas externas conocen a las internas, pero nunca al revés. Un router puede invocar un servicio de dominio, pero un servicio de dominio jamás importa de un router. Cada capa tiene una responsabilidad clara y un conjunto acotado de dependencias.

**Single Responsibility** se manifiesta en la separación estricta entre routers (que solo manejan HTTP), servicios de dominio (que contienen lógica de negocio) y repositorios (que acceden a datos). Un router nunca ejecuta una query SQL; un repositorio nunca valida permisos.

**Open/Closed** se implementa a través de las clases base de servicios, que definen hooks extensibles (`_validate_create`, `_after_delete`, `_after_update`) sin requerir modificación del flujo CRUD base. Cada servicio de dominio sobreescribe únicamente los hooks que necesita.

**Interface Segregation** se refleja en el sistema de permisos, donde los protocolos `CanRead`, `CanCreate`, `CanUpdate`, `CanDelete` y `QueryFilter` permiten que cada estrategia de rol implemente solo las capacidades que necesita. Los mixins `NoCreateMixin`, `NoDeleteMixin` y `NoUpdateMixin` eliminan la obligación de implementar métodos que un rol no requiere.

**Dependency Inversion** se practica a través del Repository Pattern: los servicios de dominio operan sobre `TenantRepository` y `BranchRepository`, abstracciones genéricas que encapsulan los detalles de SQLAlchemy. Esto permite testear servicios con repositorios mock sin necesidad de una base de datos real.

### Multi-Tenancy

Cada registro en el sistema pertenece a un tenant (restaurante). La clase `TenantRepository` inyecta automáticamente el filtro `tenant_id` en toda consulta, garantizando que un restaurante nunca pueda ver ni modificar datos de otro. Este aislamiento se aplica tanto en lecturas como en escrituras, y constituye una invariante que el sistema nunca viola.

---

## La Capa de Presentación

### Routers

La capa de presentación actúa como frontera del sistema. Los routers de FastAPI reciben peticiones HTTP, validan la entrada mediante esquemas Pydantic, verifican permisos a través de `PermissionContext` y delegan la ejecución a un servicio de dominio. Son deliberadamente delgados: no contienen lógica de negocio, no ejecutan queries y no publican eventos.

El sistema organiza sus 47 archivos de routers en nueve módulos funcionales. El módulo `admin/` agrupa 16 sub-routers para operaciones CRUD del dashboard administrativo (categorías, productos, personal, mesas, alérgenos, promociones, sectores, entre otros). El módulo `auth/` gestiona login, refresh y logout. Los módulos `diner/`, `kitchen/`, `waiter/` y `billing/` exponen operaciones específicas para cada rol del sistema. El módulo `public/` ofrece endpoints sin autenticación para el menú público y health checks. Finalmente, `content/` agrupa catálogos, ingredientes, recetas, promociones y el servicio RAG.

Un router típico luce así:

```python
@router.post("/categories")
def create_category(body: CategoryCreate, db: Session = Depends(get_db), user: dict = Depends(current_user_context)):
    ctx = PermissionContext(user)
    ctx.require_management()
    service = CategoryService(db)
    return service.create(body.model_dump(), ctx.tenant_id, ctx.user_id, ctx.user_email)
```

La delgadez del router no es accidental. Al concentrar toda la lógica en los servicios de dominio, el sistema garantiza que la misma regla de negocio se aplique independientemente de si el consumidor es un endpoint HTTP, un procesador de outbox o un job de background.

### Middlewares

Tres middlewares transversales se ejecutan antes y después de cada request:

**SecurityHeadersMiddleware** inyecta cabeceras de seguridad en todas las respuestas: `Content-Security-Policy` con directivas estrictas, `Strict-Transport-Security` en producción (con `max-age` de un año), `X-Frame-Options: DENY` contra clickjacking, `X-Content-Type-Options: nosniff` contra MIME sniffing, y `Permissions-Policy` que deshabilita geolocalización, micrófono y cámara. Además, elimina la cabecera `Server` para no revelar información del framework.

**ContentTypeValidationMiddleware** verifica que las peticiones con cuerpo (POST, PUT, PATCH) utilicen `application/json` o `application/x-www-form-urlencoded`. Las peticiones con un Content-Type inválido reciben un 415 Unsupported Media Type. Se exceptúan rutas específicas como el webhook de Mercado Pago y el health check.

**CorrelationIdMiddleware** asigna un `X-Request-ID` único a cada petición, propagándolo en los logs para facilitar el rastreo distribuido entre la REST API y el WebSocket Gateway.

### CORS

La configuración CORS distingue entre desarrollo y producción. En desarrollo, acepta automáticamente peticiones desde los puertos locales de los tres frontends (5176, 5177, 5178) y sus variantes en `127.0.0.1`. En producción, las origenes permitidos se cargan desde la variable de entorno `ALLOWED_ORIGINS`. La configuración habilita `credentials: true` para el envío de cookies HttpOnly con refresh tokens. En desarrollo, `max_age` se establece en 0 para evitar cacheo de preflights durante la depuración; en producción asciende a 600 segundos.

### Esquemas Pydantic

Los esquemas de entrada y salida residen en el módulo compartido `shared/utils/`. Dos archivos concentran la mayor parte de las definiciones: `schemas.py` (948 líneas) contiene los tipos fundamentales del sistema — aliases de tipos literales para roles, estados de mesa, estados de sesión, estados de ronda, y esquemas de autenticación. `admin_schemas.py` (810 líneas) define los DTOs de entrada y salida para todas las operaciones administrativas: `CategoryOutput`, `ProductCreate`, `StaffUpdate`, entre otros. Esta ubicación en el módulo compartido (no en los routers) permite que los servicios de dominio importen esquemas sin violar la dirección de dependencias de Clean Architecture.

Cada esquema de creación y actualización que incluye una URL de imagen ejecuta un `@field_validator` que invoca `validate_image_url()`, una función que previene ataques SSRF bloqueando esquemas no HTTP, direcciones IP internas y endpoints de metadatos de proveedores cloud.

---

## La Capa de Aplicación

### Servicios de Dominio

Los servicios de dominio constituyen el corazón del sistema. Residen en `rest_api/services/domain/` y encapsulan la lógica de negocio completa para cada entidad del dominio. Actualmente existen catorce servicios: `CategoryService`, `SubcategoryService`, `BranchService`, `TableService`, `SectorService`, `ProductService`, `AllergenService`, `StaffService`, `PromotionService`, `TicketService`, `RoundService`, `ServiceCallService`, `BillingService` y `DinerService`.

La jerarquía de herencia se sustenta en tres clases base definidas en `base_service.py` (569 líneas):

**`BaseService[ModelT]`** proporciona acceso a la sesión de base de datos y al repositorio correspondiente. Es la base abstracta de la que heredan todas las demás.

**`BaseCRUDService[ModelT, OutputT]`** extiende BaseService con operaciones CRUD completas tipadas genéricamente. Recibe como parámetros de constructor el modelo SQLAlchemy, el esquema Pydantic de salida, el nombre de la entidad en español (para mensajes de error) y configuraciones opcionales como soporte de soft delete y campos de URL de imagen. Implementa el patrón Template Method: los métodos `create()`, `update()` y `delete()` definen un flujo invariable que invoca hooks extensibles en momentos precisos:

```
create(data, tenant_id, user_id, user_email):
    1. _validate_create(data, tenant_id)         ← hook de validación
    2. _validate_image_urls(data)                 ← seguridad automática
    3. Construir entidad, asignar created_by
    4. db.add(), safe_commit()
    5. _after_create(entity_info, user_id, email) ← hook de efectos secundarios
    6. return to_output(entity)
```

Cada servicio concreto sobreescribe solo los hooks que necesita. Por ejemplo, `CategoryService` sobreescribe `_validate_create()` para verificar que el `branch_id` exista, y `_validate_delete()` para impedir la eliminación de categorías que contienen subcategorías activas. `ProductService`, el servicio más complejo del sistema con 957 líneas, sobreescribe prácticamente todos los hooks para gestionar relaciones con precios por sucursal, alérgenos, ingredientes, perfiles dietarios, métodos de cocción, perfiles sensoriales, modificaciones y alertas.

**`BranchScopedService[ModelT, OutputT]`** extiende BaseCRUDService para entidades que pertenecen a una sucursal específica. Agrega métodos `list_by_branch()` y `list_by_branches()` que filtran por `branch_id`, y un método `validate_branch_access()` que verifica que el usuario tenga acceso a la sucursal de la entidad.

Los servicios de dominio más especializados, como `StaffService` y `RoundService`, no heredan directamente de las clases base genéricas sino que implementan su propia lógica. `StaffService` (476 líneas) implementa control de acceso granular: un ADMIN ve todo el personal del tenant, mientras que un MANAGER solo ve personal de sus sucursales asignadas y no puede crear usuarios con rol ADMIN. `RoundService` implementa la creación de pedidos con verificación de idempotencia, bloqueo FOR UPDATE de la sesión para prevenir condiciones de carrera, y cálculo de precios en el momento de la orden.

### Sistema de Permisos

El sistema de permisos implementa el patrón Strategy con Interface Segregation. La clase `PermissionContext` actúa como fachada: recibe el diccionario del usuario JWT, selecciona la estrategia apropiada según su rol más privilegiado, y expone métodos de verificación como `can()`, `require_management()`, `require_branch_access()` y `filter_query()`.

Cinco estrategias concretas implementan las políticas de cada rol:

**AdminStrategy** otorga acceso total a todas las operaciones. No filtra queries ni restringe acciones.

**ManagerStrategy** permite crear y editar personal, mesas, alérgenos, promociones y sectores, pero solo dentro de las sucursales asignadas al usuario. No puede eliminar entidades ni crear usuarios ADMIN. Sus queries se filtran automáticamente por `branch_ids`.

**KitchenStrategy** es de solo lectura con una excepción: puede actualizar rondas y tickets de cocina para marcar progreso. No puede crear ni eliminar nada. Sus entidades legibles se limitan a lo que la cocina necesita ver: rondas, items, tickets, productos, categorías y recetas.

**WaiterStrategy** puede crear llamadas de servicio, rondas y registrar comensales. Puede leer mesas, sesiones, rondas, productos y cuentas. Puede actualizar rondas y llamadas de servicio. No puede eliminar entidades.

**ReadOnlyStrategy** implementa los tres mixins de negación (NoCreate, NoUpdate, NoDelete) y solo permite lectura de entidades públicas.

La función `get_highest_privilege_strategy()` resuelve el caso de usuarios con múltiples roles (por ejemplo, un usuario que es WAITER y KITCHEN) seleccionando la estrategia del rol con mayor privilegio según la jerarquía ADMIN > MANAGER > KITCHEN > WAITER > READ_ONLY.

### Publicación de Eventos

El sistema de eventos opera en dos modos según la criticidad del evento.

**Publicación directa a Redis** se utiliza para eventos no críticos donde la baja latencia es prioritaria: confirmación de rondas, actualización de carrito, cambios de estado de mesa y notificaciones CRUD del dashboard. Estos eventos se publican mediante `publish_event()`, una función que incorpora reintentos con backoff exponencial y jitter, y un circuit breaker que abre el circuito tras cinco fallos consecutivos para evitar cascadas de errores.

**Transactional Outbox** se utiliza para eventos financieros y de flujo de trabajo crítico que no pueden perderse: solicitudes de cuenta (`CHECK_REQUESTED`), confirmaciones de pago (`PAYMENT_APPROVED`, `PAYMENT_REJECTED`), envío de pedidos a cocina (`ROUND_SUBMITTED`), y creación de llamadas de servicio (`SERVICE_CALL_CREATED`). En este patrón, el evento se escribe como un registro `OutboxEvent` en la base de datos dentro de la misma transacción que la operación de negocio. Un procesador de fondo (`OutboxProcessor`) sondea la tabla cada segundo, toma lotes de hasta 50 eventos pendientes con bloqueo FOR UPDATE, los publica en Redis, y los marca como publicados o fallidos. Los eventos fallidos se reintentan hasta cinco veces con backoff exponencial antes de ser descartados al dead letter queue.

```
Servicio de dominio
    │
    ├─ write_billing_outbox_event(db, ...)  ← misma transacción
    │
    └─ db.commit()  ← evento y datos de negocio atómicos
                          │
                  OutboxProcessor (background)
                          │
                    Redis Pub/Sub
                          │
                  WebSocket Gateway → Clientes
```

Los canales Redis siguen una convención de nombres consistente: `branch:{id}:waiters` para meseros de una sucursal, `branch:{id}:kitchen` para cocina, `branch:{id}:admin` para el dashboard, `sector:{id}:waiters` para meseros de un sector específico, y `session:{id}` para comensales de una mesa.

---

## La Capa de Dominio

### Modelo de Datos

El sistema gestiona 52 modelos SQLAlchemy organizados en 17 archivos por dominio funcional. Todos los modelos heredan de `Base` (la base declarativa de SQLAlchemy 2.0) y de `AuditMixin`, un mixin que proporciona soft delete y trazabilidad de auditoría.

`AuditMixin` agrega diez campos a cada entidad: `is_active` (flag de soft delete, indexado), `created_at` y `updated_at` (timestamps con zona horaria UTC), `deleted_at` (timestamp de eliminación lógica), y seis campos de auditoría que registran el ID y email del usuario que creó, modificó o eliminó el registro. La desnormalización del email junto al ID es deliberada: evita dependencias circulares de foreign keys y permite auditar incluso si el usuario original es eliminado posteriormente.

La jerarquía central del modelo de datos se organiza alrededor del concepto de **Tenant** (restaurante), que posee sucursales (**Branch**), y cada sucursal contiene la cascada de entidades operativas:

```
Tenant (Restaurant)
  ├── Catálogos tenant-scoped: CookingMethod, FlavorProfile, TextureProfile, CuisineType
  ├── IngredientGroup → Ingredient → SubIngredient
  └── Branch (N)
        ├── Category → Subcategory → Product
        │     └── BranchProduct (precio por sucursal, en centavos)
        │     └── ProductAllergen (M:N con presence_type y risk_level)
        ├── BranchSector → Table → TableSession → Diner
        │     └── WaiterSectorAssignment (asignaciones diarias)
        │     └── Round → RoundItem → KitchenTicket → KitchenTicketItem
        ├── Check ("app_check") → Charge → Allocation ← Payment
        └── ServiceCall
```

Varias decisiones de modelado merecen mención. Los **precios se almacenan en centavos** como enteros (`price_cents`), eliminando errores de punto flotante. Las **tablas many-to-many** (`ProductCookingMethod`, `ProductFlavor`, `ProductTexture`) incluyen `AuditMixin` para trazabilidad completa, no son simples tablas de asociación. El modelo `Check` utiliza `__tablename__ = "app_check"` porque `CHECK` es una palabra reservada de SQL. El modelo `Round` incluye un `idempotency_key` con restricción de unicidad compuesta `(table_session_id, idempotency_key)` para prevenir pedidos duplicados. Los `CheckConstraints` garantizan invariantes a nivel de base de datos: cantidades positivas, precios no negativos, y pagados nunca mayores que el total.

Las relaciones entre modelos están cuidadosamente diseñadas con `back_populates` bidireccional. Product, por ejemplo, mantiene relaciones con once entidades asociadas: branch_products, product_allergens, product_ingredients, dietary_profile, cooking_info, modifications, warnings, rag_config, cooking_methods, flavors y textures. Cada relación usa `selectinload` o `joinedload` en los repositorios para prevenir el problema N+1.

### Customer y Diner

El sistema de fidelización vincula visitas anónimas con clientes registrados. El modelo `Diner` representa una visita individual a una mesa, identificada por `device_id` y `device_fingerprint` para reconocimiento cross-session. El campo `implicit_preferences` (JSON) almacena filtros de alérgenos, dieta y métodos de cocción capturados implícitamente durante el uso. El modelo `Customer` representa un cliente registrado con consentimiento GDPR, métricas de comportamiento y preferencias para personalización con IA. La relación `Customer ←→ Diner (1:N)` permite trazar el historial de visitas de un cliente a lo largo del tiempo.

---

## La Capa de Infraestructura

### Repositorios

El patrón Repository abstrae todo acceso a datos detrás de interfaces genéricas, permitiendo que los servicios de dominio trabajen con colecciones de objetos sin conocer los detalles de SQLAlchemy. La jerarquía se compone de cuatro clases en `repository.py` (645 líneas):

**`BaseRepository[ModelT]`** proporciona operaciones fundamentales: `find_by_id()`, `find_all()`, `count()`, `exists()`, `add()`, `delete()`. Internamente construye queries con filtros de `is_active` y soporte de eager loading configurable.

**`TenantRepository[ModelT]`** extiende la base inyectando automáticamente `tenant_id` en toda consulta. Es imposible obtener datos de otro tenant a través de este repositorio. Agrega `find_by_ids()` para carga por lotes.

**`BranchRepository[ModelT]`** extiende TenantRepository añadiendo filtrado por `branch_id`. Proporciona `find_by_branch()` y `find_by_branches()` para consultas multi-sucursal.

**`SpecificationRepository[ModelT]`** extiende TenantRepository con el patrón Specification, permitiendo componer consultas complejas mediante operadores lógicos:

```python
active_and_cheap = ActiveSpec() & PriceRangeSpec(1000, 5000)
products = repo.find_by_spec(active_and_cheap, tenant_id=1)
```

### Soft Delete y Cascade Delete

Toda eliminación en el sistema es lógica (soft delete). La función `soft_delete()` marca `is_active = False`, registra `deleted_at` con timestamp UTC y asigna `deleted_by_id/email`. La función inversa `restore_entity()` revierte estos cambios.

Para eliminaciones en cascada, el sistema define relaciones padre-hijo en un diccionario `CASCADE_RELATIONSHIPS` que mapea cada tipo de entidad a sus dependientes. La función `cascade_soft_delete()` recorre recursivamente estas relaciones eliminando lógicamente todos los hijos antes de eliminar al padre. Esto preserva la integridad referencial sin perder datos: un producto eliminado retiene sus alérgenos, ingredientes y precios por sucursal en estado inactivo, disponibles para restauración.

El `CascadeDeleteService` (378 líneas) implementa eliminaciones especializadas para entidades con relaciones complejas no cubiertas por el diccionario genérico. `soft_delete_product()`, por ejemplo, elimina en cascada product_allergens, product_ingredients, branch_products, dietary_profiles, cooking_methods, modifications y warnings — relaciones demasiado numerosas y específicas para el mecanismo genérico.

### PostgreSQL

La conexión a PostgreSQL se gestiona mediante SQLAlchemy 2.0 con un pool de conexiones configurado dinámicamente. El tamaño del pool se calcula como `min(2 * núcleos_CPU + 1, 20)`, con un overflow máximo de 15 conexiones adicionales para picos de carga. Las conexiones inactivas se reciclan cada 30 minutos y se verifican antes de cada uso (`pool_pre_ping`). La función `safe_commit()` envuelve el commit en un try/except que ejecuta rollback automático ante cualquier error, garantizando que las sesiones nunca queden en un estado inconsistente.

La base de datos incluye la extensión pgvector para almacenar embeddings vectoriales utilizados por el servicio RAG (chatbot con IA). Las tablas se crean automáticamente al iniciar el servicio mediante `Base.metadata.create_all()`, y los datos de seed se insertan en el primer arranque.

### Redis

Redis cumple tres funciones arquitectónicas distintas, cada una atendida por un pool de conexiones especializado:

**Pool asíncrono** (50 conexiones máximas) gestiona la publicación de eventos vía Pub/Sub. Lo utilizan los servicios de dominio y el procesador de outbox para notificar cambios en tiempo real. El pool se inicializa como singleton con double-check locking y se comparte entre todos los workers de uvicorn.

**Pool síncrono** (20 conexiones) atiende operaciones bloqueantes que ocurren en el hilo de request: verificación de tokens revocados y rate limiting de login. Usar un pool separado evita que estas operaciones bloqueantes agoten las conexiones del pool asíncrono.

**Canales Pub/Sub** siguen convenciones de nombrado que reflejan la topología del sistema: `branch:{id}:waiters`, `branch:{id}:kitchen`, `branch:{id}:admin`, `sector:{id}:waiters`, `session:{id}`. La nomenclatura permite que el WebSocket Gateway suscriba únicamente a los canales relevantes para cada conexión, minimizando el tráfico de red.

Un **circuit breaker** protege las publicaciones contra fallos de Redis. Tras cinco errores consecutivos, el circuito se abre durante 30 segundos, rechazando publicaciones inmediatamente en lugar de esperar timeouts. Pasados los 30 segundos, entra en estado half-open y permite hasta tres intentos de prueba. Si tienen éxito, el circuito se cierra y la operación normal se reanuda. Los reintentos individuales utilizan backoff exponencial con jitter decorrelado para evitar el efecto thundering herd cuando múltiples workers intentan reconectarse simultáneamente.

---

## Seguridad

### Autenticación

El sistema implementa dos mecanismos de autenticación según el contexto del consumidor.

**JWT (JSON Web Tokens)** autentican a usuarios del Dashboard y pwaWaiter. El access token tiene una vida de 15 minutos y se transmite en la cabecera `Authorization: Bearer {token}`. Contiene claims de `sub` (user ID), `email`, `tenant_id`, `branch_ids`, `roles` y un `jti` (JWT ID) único para revocación individual. El refresh token tiene una vida de 7 días y se almacena en una cookie HttpOnly con `SameSite=lax`, `Path=/api/auth` y `Secure=true` en producción, impidiendo que JavaScript acceda al token y mitigando ataques XSS. Los frontends refrescan proactivamente el access token cada 14 minutos, antes de su expiración.

**Table Tokens** autentican a comensales en pwaMenu. Se transmiten en la cabecera `X-Table-Token` y tienen una vida de 3 horas. El sistema soporta dos formatos por compatibilidad: JWT (formato actual, idéntico al de usuarios pero con claims de `table_id` y `session_id`) y HMAC-SHA256 (formato legacy, con estructura `tenant:branch:table:session:expires:signature`). La función `verify_table_token()` detecta automáticamente el formato y lo valida con el método correspondiente.

### Revocación de Tokens

La revocación opera a dos niveles. La **revocación individual** almacena el `jti` del token en Redis con un TTL igual al tiempo restante de vida del token. La **revocación masiva** almacena un timestamp de revocación por usuario; cualquier token cuyo `iat` (issued at) sea anterior a este timestamp se considera revocado. Ambas verificaciones se ejecutan en una sola operación Redis PIPELINE para minimizar la latencia.

El sistema sigue un patrón **fail-closed**: si Redis no está disponible, la verificación de blacklist retorna `True` (token considerado revocado), negando el acceso en lugar de permitirlo. Esta decisión prioriza la seguridad sobre la disponibilidad.

### Rate Limiting

El rate limiting de login utiliza un script Lua que ejecuta `INCR` y `EXPIRE` atómicamente, previniendo condiciones de carrera entre la verificación del contador y su incremento. Los intentos de login se limitan a 5 por ventana de 60 segundos por dirección de email. Los endpoints de billing tienen límites separados: 10 solicitudes de cuenta por minuto, 20 pagos en efectivo por minuto, y 5 operaciones de Mercado Pago por minuto, implementados mediante slowapi.

### Validación de Entrada

La función `validate_image_url()` constituye la primera línea de defensa contra ataques SSRF (Server-Side Request Forgery). Valida que la URL utilice esquema HTTP o HTTPS, bloquea esquemas peligrosos (`javascript:`, `data:`, `file:`), rechaza direcciones IP internas (rangos 127.x, 10.x, 172.16-31.x, 192.168.x), y bloquea endpoints de metadatos de proveedores cloud (169.254.169.254, metadata.google). La función `escape_like_pattern()` escapa caracteres `%` y `_` en patrones LIKE para prevenir inyección en búsquedas SQL. Ambas funciones se invocan automáticamente desde las clases base de servicios, eliminando la posibilidad de olvidar su aplicación en endpoints individuales.

---

## Flujos de Datos Críticos

### Flujo de Autenticación

```
POST /api/auth/login
    │
    ▼
Rate limit check (5 intentos / 60s por email, Lua atómico)
    │
    ▼
Buscar usuario por email → Verificar bcrypt → Verificar is_active
    │
    ▼
Cargar roles y sucursales (UserBranchRole)
    │
    ▼
Generar access_token (JWT, 15 min, incluye jti)
Generar refresh_token (JWT, 7 días, HttpOnly cookie)
    │
    ▼
Response: { access_token, user: { id, email, roles, branch_ids } }
Set-Cookie: refresh_token=...; HttpOnly; SameSite=Lax; Path=/api/auth
```

### Flujo de Pedido (Round)

El flujo de un pedido atraviesa múltiples capas del sistema y dos servicios independientes:

```
POST /api/diner/rounds (desde pwaMenu, con X-Table-Token)
    │
    ▼
Validar table token → Extraer session_id, branch_id, tenant_id
    │
    ▼
RoundService.submit_round():
    1. Verificar idempotencia (UniqueConstraint en idempotency_key)
    2. Bloquear sesión con FOR UPDATE (previene pedidos concurrentes)
    3. Validar sesión activa (status OPEN o PAYING)
    4. Cargar productos con precios actuales de la sucursal
    5. Crear Round (status=PENDING) + RoundItems
    6. Calcular sector_id de la mesa (para routing de eventos)
    7. safe_commit()
    │
    ▼
Publicar ROUND_PENDING vía Redis:
    → branch:{id}:admin      (Dashboard recibe notificación)
    → branch:{id}:waiters    (Todos los meseros de la sucursal)
    [Cocina NO recibe — el pedido requiere verificación del mesero]
    │
    ▼
Mesero verifica pedido → ROUND_CONFIRMED
Admin envía a cocina → ROUND_SUBMITTED (ahora sí llega a cocina)
Cocina prepara → ROUND_IN_KITCHEN → ROUND_READY
Staff entrega → ROUND_SERVED
```

La transición entre estados está controlada por rol. Solo un WAITER puede confirmar un pedido pendiente. Solo un ADMIN o MANAGER puede enviarlo a cocina. Solo KITCHEN puede marcarlo como en preparación o listo. Las transiciones permitidas y los roles autorizados se definen en el diccionario `ROUND_TRANSITION_ROLES` del módulo de constantes.

### Flujo de Pago (FIFO Allocation)

El sistema de pagos implementa asignación FIFO (First In, First Out) para distribuir pagos entre cargos:

```
Solicitud de cuenta:
    1. Crear Check con total calculado de todos los RoundItems no cancelados
    2. Crear Charges (un Charge por RoundItem: producto × cantidad × precio)
    3. write_billing_outbox_event(CHECK_REQUESTED) → Outbox atómico

Pago:
    1. Crear Payment (CASH o MERCADO_PAGO)
    2. allocate_payment_fifo():
       - SELECT FOR UPDATE del Check (previene race condition)
       - Priorizar cargos del propio comensal
       - Luego cargos compartidos (diner_id = NULL)
       - Finalmente cargos de otros comensales
       - Crear Allocations hasta agotar el monto del pago
    3. write_billing_outbox_event(PAYMENT_APPROVED) → Outbox atómico
```

### Flujo de Creación CRUD (Admin)

```
POST /api/admin/products
    │
    ▼
Router: Validar ProductCreate (Pydantic) → PermissionContext.require_management()
    │
    ▼
ProductService.create_full():
    1. _validate_create(): nombre único en sucursal, URL de imagen válida
    2. Crear Product + BranchProducts + ProductAllergens + Ingredients + Profiles
    3. safe_commit()
    4. _after_create(): publish_entity_created("Product", product_info)
    │
    ▼
Redis PUBLISH → WS Gateway → Dashboard (ENTITY_CREATED)
    │
    ▼
Response: ProductOutput (JSON)
```

---

## Observabilidad

### Logging Estructurado

El sistema de logging distingue entre desarrollo y producción. En desarrollo, un `DevelopmentFormatter` genera logs legibles con códigos de color ANSI. En producción, un `StructuredFormatter` emite JSON con campos estándar: timestamp, nivel, logger, mensaje, y datos contextuales. Ambos formatos incluyen el correlation ID (`request_id`) para rastrear una petición a través de múltiples logs.

Funciones de enmascaramiento (`mask_email`, `mask_jti`, `mask_user_id`) protegen datos sensibles en los logs: `admin@demo.com` se registra como `ad***@demo.com`, un JTI de token se trunca a los primeros 8 caracteres, y un user ID se enmascara parcialmente.

Un logger de auditoría de seguridad dedicado (`security_audit_logger`) registra eventos críticos: conexiones WebSocket, operaciones de autenticación, violaciones de rate limit y operaciones de tokens. Estos registros permiten reconstruir el historial de acceso ante incidentes de seguridad.

### Métricas y Telemetría

El sistema integra OpenTelemetry para instrumentación automática de FastAPI, SQLAlchemy y Redis. Un endpoint `/api/metrics` expone métricas en formato Prometheus. El middleware de correlation ID genera identificadores únicos por request que se propagan en headers y logs, habilitando el rastreo distribuido entre la REST API y el WebSocket Gateway.

### Health Checks

El decorador `@health_check_with_timeout` envuelve funciones de verificación de salud con protección contra timeouts y captura de excepciones. La función `aggregate_health_checks()` ejecuta múltiples checks concurrentemente y agrega los resultados en un reporte unificado con estado general (`healthy`, `degraded`, `unhealthy`) y detalle por componente con latencia en milisegundos.

---

## Ciclo de Vida de la Aplicación

El archivo `lifespan.py` orquesta el arranque y apagado del servicio. Durante el **startup**, el sistema ejecuta una secuencia ordenada: valida secretos de producción (JWT_SECRET, TABLE_TOKEN_SECRET, ALLOWED_ORIGINS), crea la extensión pgvector en PostgreSQL, inicializa las tablas de la base de datos, ejecuta el seed de datos iniciales, registra handlers de webhook de Mercado Pago, inicia el procesador de outbox para garantizar entrega de eventos, calienta caches para evitar latencia en cold start, inicia el scheduler de refresh-ahead para refresco proactivo de cache, e inicializa el sistema de métricas Prometheus.

Durante el **shutdown**, el sistema detiene ordenadamente todos los procesadores de fondo (refresh-ahead, outbox, executor de rate limit), cierra las conexiones Redis (tanto el pool async como el sync), cierra el cliente Ollama del servicio RAG, y cierra las conexiones de base de datos.

Esta orquestación garantiza que ningún recurso quede sin liberar y que los procesadores de fondo tengan oportunidad de completar su trabajo en curso antes del cierre.

---

## Escalabilidad

### Diseño Stateless

Cada instancia de la REST API es independiente. El estado se almacena en PostgreSQL y Redis, permitiendo agregar instancias detrás de un load balancer sin coordinación entre ellas. El pool de conexiones a base de datos se dimensiona automáticamente según los cores disponibles.

### Optimizaciones de Queries

Los repositorios aplican eager loading obligatorio para prevenir el problema N+1. Índices compuestos en `(tenant_id, is_active)`, `(branch_id, status)` y `(session_id, customer_id)` aceleran las consultas más frecuentes. Los endpoints de listado soportan paginación con límites máximos configurables (500 productos, 200 personal) para evitar respuestas excesivamente grandes.

### Comunicación Asíncrona

La arquitectura event-driven desacopla la REST API del WebSocket Gateway. La REST API publica eventos en Redis y retorna inmediatamente al cliente. El Gateway consume estos eventos y los distribuye a los clientes conectados. Este desacoplamiento permite que ambos servicios escalen independientemente: más instancias de API para más requests HTTP, más instancias de Gateway para más conexiones WebSocket.

---

## Excepciones Centralizadas

El módulo `shared/utils/exceptions.py` define una jerarquía de excepciones HTTP tipadas que se auto-registran en los logs con contexto. La clase base `AppException` extiende `HTTPException` de FastAPI y agrega logging automático al momento de la creación. Las subclases especializadas cubren los códigos HTTP más comunes:

- **404**: `NotFoundError`, `SessionNotFoundError`, `CheckNotFoundError`, `RoundNotFoundError`
- **403**: `ForbiddenError`, `BranchAccessError`, `InsufficientRoleError`
- **400**: `ValidationError`, `InvalidStateError`, `InvalidTransitionError`, `DuplicateEntityError`, `PaymentAmountError`
- **409**: `ConflictError`, `AlreadyPaidError`
- **500**: `InternalError`, `DatabaseError`, `ExternalServiceError` (502/503)
- **429**: `RateLimitError` (incluye cabecera `Retry-After`)

Los mensajes de error se redactan en español para consumo directo del frontend. Los detalles técnicos se registran en el log pero nunca se exponen al usuario.

---

## Constantes y Enumeraciones

El archivo `constants.py` (486 líneas) centraliza todas las constantes del sistema, eliminando strings mágicos del código. Define enumeraciones para roles (`Roles`), estados de ronda (`RoundStatus`), estados de mesa (`TableStatus`), estados de sesión (`SessionStatus`), estados de cuenta (`CheckStatus`), estados de pago (`PaymentStatus`), y estados de tickets y llamadas de servicio.

Las transiciones de estado permitidas se definen en diccionarios que mapean `(estado_origen, estado_destino) → roles_autorizados`, creando una máquina de estados verificable en código. Las funciones `validate_round_transition()` y `get_allowed_round_transitions()` consultan estos diccionarios para determinar si una transición es válida y quién puede ejecutarla.

Constantes adicionales definen límites operativos (`Limits`), tipos de presencia de alérgenos, etiquetas dietarias, métodos de cocción, y todos los tipos de evento del sistema. Los mensajes de error en español se centralizan en `ErrorMessages` para consistencia en toda la API.

---

## Referencias

- [README.md](README.md): Guía de inicio rápido y comandos del backend
- [shared/README.md](shared/README.md): Documentación del módulo compartido
- [../ws_gateway/arquiws_gateway.md](../ws_gateway/arquiws_gateway.md): Arquitectura del WebSocket Gateway
- [../CLAUDE.md](../CLAUDE.md): Documentación general del proyecto
