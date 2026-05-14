# La REST API por dentro

Este documento describe, en prosa narrativa y con nivel de detalle arquitectónico, todo el contenido del directorio `rest_api/`. Mientras que `arquiBackend.md` ofrece una vista panorámica del backend completo — REST API, módulo compartido y WebSocket Gateway —, este documento desciende al interior de la API REST para recorrer cada archivo, cada clase y cada decisión de diseño que compone el servicio HTTP del sistema Integrador.

---

## Tabla de Contenidos

- [Visión General](#visión-general)
- [El Punto de Entrada](#el-punto-de-entrada)
- [El Ciclo de Vida](#el-ciclo-de-vida)
- [La Muralla de Middlewares](#la-muralla-de-middlewares)
- [CORS: La Política de Fronteras](#cors-la-política-de-fronteras)
- [Los Modelos: El Vocabulario del Dominio](#los-modelos-el-vocabulario-del-dominio)
- [Los Routers: Las Puertas del Sistema](#los-routers-las-puertas-del-sistema)
- [Los Servicios: El Corazón de la Lógica](#los-servicios-el-corazón-de-la-lógica)
- [El Seed: Los Datos Iniciales](#el-seed-los-datos-iniciales)
- [Referencias](#referencias)

---

## Visión General

El directorio `rest_api/` contiene la aplicación FastAPI que actúa como puerta de entrada HTTP de todo el sistema Integrador. Es el servicio que recibe peticiones de los tres frontends — Dashboard (panel administrativo), pwaMenu (aplicación del comensal) y pwaWaiter (aplicación del mesero) —, las valida, aplica reglas de negocio, persiste cambios en PostgreSQL y, cuando corresponde, publica eventos en Redis para que el WebSocket Gateway los propague en tiempo real.

La estructura interna se organiza en cuatro paquetes principales:

```
rest_api/
├── main.py                # Punto de entrada: creación de la app FastAPI
├── seed.py                # Datos iniciales del sistema
├── core/                  # Configuración del servidor
│   ├── lifespan.py        # Startup y shutdown
│   ├── middlewares.py     # Seguridad HTTP
│   └── cors.py            # Política de orígenes cruzados
├── models/                # 21 archivos, 54+ modelos SQLAlchemy
├── routers/               # 10 módulos, 46 archivos de endpoints
└── services/              # Lógica de negocio, repositorios, permisos, eventos
    ├── base_service.py    # Clases base (Template Method)
    ├── domain/            # 14 servicios de dominio
    ├── crud/              # Repositorios, soft delete, auditoría
    ├── permissions/       # Strategy pattern para RBAC
    ├── events/            # Outbox pattern, publicación de eventos
    ├── payments/          # FIFO allocation, circuit breaker, Mercado Pago
    ├── catalog/           # Vistas de producto, sincronización de recetas
    └── rag/               # Chatbot con IA (Ollama + pgvector)
```

---

## El Punto de Entrada

El archivo `main.py` es breve — 159 líneas — y deliberadamente operativo. Su única responsabilidad es ensamblar las piezas del sistema: crear la instancia de FastAPI, registrar middlewares, montar routers y definir la documentación OpenAPI. No contiene lógica de negocio ni configuración compleja.

La instancia de la aplicación se crea con metadatos que alimentan la documentación interactiva disponible en `/api/docs` (Swagger UI) y `/api/redoc`. La versión de la API es 2.0.0. Se definen siete tags OpenAPI — `auth`, `admin`, `kitchen`, `waiter`, `diner`, `billing`, `public` — que organizan los endpoints en la documentación generada.

El ciclo de vida de la aplicación se delega al `lifespan` definido en `core/lifespan.py`, un async context manager que orquesta startup y shutdown. Este patrón, introducido en versiones recientes de FastAPI, reemplaza los antiguos handlers `on_startup` y `on_shutdown` con un flujo más explícito y robusto.

### Orden de Registro de Middlewares

El orden de registro de middlewares es crítico porque FastAPI los ejecuta en orden inverso al de registro. El código registra cuatro capas en secuencia:

1. **Rate limiter** (`slowapi`): Se adjunta al estado de la app y se registra un handler global para excepciones `RateLimitExceeded`.
2. **CorrelationIdMiddleware**: Asigna un `X-Request-ID` único a cada petición, permitiendo rastreo distribuido.
3. **Security middlewares** (`register_middlewares`): Registra `SecurityHeadersMiddleware` y `ContentTypeValidationMiddleware`.
4. **CORS** (`configure_cors`): Se registra último para ejecutarse primero, asegurando que las peticiones preflight OPTIONS se manejen antes que cualquier otro middleware.

Esta inversión explica el comentario en el código: "CORS configuration — MUST be registered LAST to execute FIRST".

### Los 17 Routers

La aplicación monta diecisiete routers en una lista `_routers` que itera con `app.include_router()`. El orden de la lista determina la prioridad de matching de rutas, aunque en la práctica los prefijos son suficientemente distintos para evitar colisiones:

| Router | Prefijo | Descripción |
|--------|---------|-------------|
| `health_router` | `/api/health` | Health checks |
| `auth_router` | `/api/auth` | Login, refresh, logout |
| `catalog_router` | `/api/public` | Menú público sin auth |
| `tables_router` | `/api/waiter/tables`, `/api/tables` | Gestión de mesas y sesiones |
| `diner_router` | `/api/diner` | Operaciones del comensal |
| `kitchen_router` | `/api/kitchen` | Rondas de cocina |
| `billing_router` | `/api/billing` | Pagos y cuentas |
| `admin_router` | `/api/admin` | 15 sub-routers administrativos |
| `rag_router` | `/api/rag` | Chatbot IA |
| `waiter_router` | `/api/waiter` | Operaciones del mesero |
| `promotions_router` | `/api/admin/promotions` | CRUD de promociones |
| `recipes_router` | `/api/recipes` | CRUD de recetas |
| `ingredients_router` | `/api/admin/ingredients` | CRUD de ingredientes |
| `catalogs_router` | `/api/admin/catalogs` | Catálogos (métodos de cocción, sabores, texturas) |
| `kitchen_tickets_router` | `/api/kitchen/tickets` | Tickets de cocina |
| `customer_router` | `/api/customer` | Fidelización de clientes |
| `cart_router` | `/api/diner/cart` | Carrito compartido en tiempo real |
| `metrics_router` | `/api/metrics` | Métricas Prometheus |

La instrumentación OpenTelemetry (`setup_telemetry`) se aplica al final, auto-instrumentando FastAPI, SQLAlchemy y Redis para trazado distribuido. Solo se activa en producción o staging, a menos que se habilite explícitamente con `OTEL_ENABLED=true`.

---

## El Ciclo de Vida

El archivo `core/lifespan.py` orquesta la secuencia de arranque y apagado del servidor mediante un async context manager decorado con `@asynccontextmanager`. Todo lo que ocurre antes del `yield` es startup; todo lo que ocurre después es shutdown.

### Secuencia de Startup

El arranque sigue una secuencia estricta donde cada paso depende del anterior:

1. **Inicialización de logging** (`setup_logging`): Configura el sistema de logs estructurados antes de cualquier otra operación.

2. **Validación de secretos de producción**: Verifica que `JWT_SECRET`, `TABLE_TOKEN_SECRET` y `ALLOWED_ORIGINS` no sean valores por defecto. En producción, si alguno es inseguro, el servidor se niega a arrancar con un `RuntimeError`. En desarrollo, solo emite una advertencia.

3. **Extensión pgvector**: Ejecuta `CREATE EXTENSION IF NOT EXISTS vector` directamente contra PostgreSQL usando una conexión bruta del engine. Esta extensión es necesaria antes de crear tablas porque varios modelos utilizan columnas de tipo `VECTOR` para embeddings del sistema RAG.

4. **Creación de tablas**: `Base.metadata.create_all(bind=engine)` materializa todos los modelos SQLAlchemy en PostgreSQL. Gracias a la naturaleza idempotente de `create_all`, las tablas existentes no se recrean ni se pierden datos.

5. **Seed de datos iniciales**: Ejecuta `seed(db)` para insertar el tenant, sucursales, usuarios de prueba y datos de catálogo necesarios para el primer arranque.

6. **Webhook handlers de Mercado Pago**: Registra los handlers de retry para webhooks fallidos, seguido del inicio del procesador de retry en background con un intervalo de 30 segundos.

7. **Procesador de Outbox**: Inicia el `OutboxProcessor`, un loop asíncrono que sondea la tabla `outbox_event` cada segundo buscando eventos pendientes para publicar en Redis.

8. **Calentamiento de caché**: Conecta al Redis pool y ejecuta `warm_caches_on_startup` para precargar datos frecuentemente consultados, evitando latencia de cold-start. A continuación, inicia el scheduler `refresh-ahead` para refresco proactivo de caché.

9. **Métricas Prometheus**: Inicializa el sistema de métricas para exposición en `/api/metrics`.

El calentamiento de caché y las métricas están envueltos en un try/except porque su fallo es no fatal — la aplicación puede operar sin ellos, aunque con latencia inicial más alta.

### Secuencia de Shutdown

El apagado es el espejo ordenado del arranque:

1. Detiene el scheduler de refresh-ahead.
2. Detiene el procesador de outbox, dándole oportunidad de completar el lote actual.
3. Cierra el cliente HTTP de Ollama (servicio RAG).
4. Cierra el executor del rate limiter.
5. Cierra el pool de conexiones Redis.

No se cierra explícitamente el pool de PostgreSQL porque SQLAlchemy lo gestiona internamente al destruirse el engine.

---

## La Muralla de Middlewares

El archivo `core/middlewares.py` define dos middlewares de seguridad y una función de registro. Ambos extienden `BaseHTTPMiddleware` de Starlette.

### SecurityHeadersMiddleware

Este middleware inyecta ocho cabeceras de seguridad en cada respuesta HTTP, sin excepción:

- **`X-Content-Type-Options: nosniff`**: Impide que el navegador interprete el tipo MIME de la respuesta de forma diferente a lo declarado, previniendo ataques de MIME sniffing.
- **`X-Frame-Options: DENY`**: Prohíbe que la página se cargue en un iframe, eliminando el vector de clickjacking.
- **`X-XSS-Protection: 1; mode=block`**: Activa el filtro XSS de navegadores legacy que aún soportan esta cabecera.
- **`Referrer-Policy: strict-origin-when-cross-origin`**: Envía el origen completo solo para navegación same-origin; para cross-origin solo envía el esquema y dominio.
- **`Permissions-Policy: geolocation=(), microphone=(), camera=()`**: Deshabilita APIs de navegador potencialmente peligrosas que la aplicación no necesita.
- **`Content-Security-Policy`**: Define directivas estrictas: `default-src 'self'`, `script-src 'self'`, `img-src 'self' data: https:`, `frame-ancestors 'none'`. El `style-src` incluye `'unsafe-inline'` como concesión necesaria para algunos frameworks de UI.
- **`Strict-Transport-Security`**: Solo en producción, con `max-age=31536000` (un año) e `includeSubDomains`, forzando HTTPS para todas las comunicaciones futuras.
- **Eliminación de `Server`**: Remueve la cabecera `Server` si está presente, evitando revelar información del framework al atacante.

### ContentTypeValidationMiddleware

Este middleware actúa como guardián de los formatos de entrada. Para cualquier petición POST, PUT o PATCH, verifica que el `Content-Type` sea `application/json` o `application/x-www-form-urlencoded`. Si no lo es, retorna un `415 Unsupported Media Type` inmediatamente, sin alcanzar el router.

Dos paths están exentos de esta validación: `/api/billing/webhook` (porque Mercado Pago puede enviar formatos variados) y `/api/health` (que no lleva cuerpo).

### Orden de Ejecución

La función `register_middlewares` registra primero `SecurityHeadersMiddleware` y luego `ContentTypeValidationMiddleware`. Dado que los middlewares se ejecutan en orden inverso, esto significa que la validación de Content-Type ocurre antes que la inyección de cabeceras de seguridad — una petición con Content-Type inválido recibe su 415 con las cabeceras de seguridad incluidas.

---

## CORS: La Política de Fronteras

El archivo `core/cors.py` configura la política de Cross-Origin Resource Sharing que determina qué frontends pueden comunicarse con la API.

### Orígenes en Desarrollo

Una lista `DEFAULT_CORS_ORIGINS` define doce orígenes permitidos por defecto: los puertos de los tres frontends (`5176` para pwaMenu, `5177` para Dashboard, `5178` para pwaWaiter), más variantes en `127.0.0.1` y una IP de red local para testing en dispositivos móviles. Se incluyen puertos adicionales (`5173`, `5179`, `5180`) para flexibilidad.

### Orígenes en Producción

En producción, los orígenes se cargan de la variable de entorno `ALLOWED_ORIGINS`, una cadena separada por comas. La función `get_cors_origins()` decide entre ambos modos: si `settings.allowed_origins` tiene valor, se usa; si no, se usan los defaults de desarrollo.

### Configuración del Middleware

El middleware `CORSMiddleware` se configura con:

- **Nueve cabeceras permitidas**: `Authorization`, `Content-Type`, `X-Table-Token`, `X-Request-ID`, `X-Requested-With` (protección CSRF de pwaMenu), `X-Device-Id` (reconocimiento de clientes), `Accept`, `Accept-Language`, `Cache-Control`.
- **Todos los métodos HTTP estándar**: GET, POST, PUT, PATCH, DELETE, OPTIONS.
- **`allow_credentials: True`**: Necesario para que los navegadores envíen la cookie HttpOnly que contiene el refresh token.
- **`expose_headers: ["X-Request-ID"]`**: Permite que los frontends lean el correlation ID de las respuestas.
- **`max_age` diferenciado**: 0 en desarrollo (para que los preflights no se cacheen y las pruebas reflejen cambios inmediatos) y 600 en producción (10 minutos de caché para reducir tráfico de preflight).

---

## Los Modelos: El Vocabulario del Dominio

El paquete `models/` constituye la capa de dominio del sistema. Contiene 21 archivos Python que definen más de 54 modelos SQLAlchemy, organizados por área funcional. Cada modelo hereda de `Base` (la base declarativa de SQLAlchemy 2.0) y de `AuditMixin`, un mixin que agrega soft delete y trazabilidad a cada entidad.

### La Base y el AuditMixin

El archivo `base.py` establece los dos cimientos sobre los que se construyen todos los modelos.

`Base` es la clase declarativa vacía de SQLAlchemy 2.0 — un punto de registro para que `metadata.create_all()` descubra todas las tablas.

`AuditMixin` es más sustancioso. Agrega diez campos a cada modelo:

- **`is_active`** (Boolean, indexado): El flag de soft delete. `True` es activo, `False` es eliminado lógicamente. El índice permite filtrar eficientemente por este campo en toda consulta.
- **`created_at`** (DateTime con timezone): Timestamp de creación, con `server_default=func.now()` para que PostgreSQL lo asigne automáticamente.
- **`updated_at`** (DateTime con timezone, nullable): Se actualiza automáticamente en cada modificación gracias a `onupdate=func.now()`.
- **`deleted_at`** (DateTime con timezone, nullable): Timestamp de eliminación lógica, solo se rellena cuando `is_active` cambia a `False`.
- **`created_by_id`** y **`created_by_email`**: ID y email del usuario que creó el registro.
- **`updated_by_id`** y **`updated_by_email`**: ID y email de la última modificación.
- **`deleted_by_id`** y **`deleted_by_email`**: ID y email de quién ejecutó la eliminación lógica.

La desnormalización del email junto al ID es una decisión deliberada: evita dependencias circulares de foreign keys con la tabla de usuarios y garantiza que el rastro de auditoría persista incluso si el usuario que realizó la acción es eliminado posteriormente.

El mixin proporciona tres métodos de instancia: `soft_delete()` que marca `is_active = False` y rellena los campos de eliminación con timestamps UTC con timezone, `restore()` que revierte la eliminación limpiando `deleted_at` y los campos de borrado, y `set_updated_by()` que actualiza los campos de modificación con timestamp UTC.

### Identidad: Tenant, User, Branch

**`tenant.py`** define `Tenant` (el restaurante) con campos como `name`, `slug`, `timezone` y configuraciones de MercadoPago. La relación `branches` conecta al tenant con sus sucursales. `Branch` pertenece a un tenant y define `name`, `slug`, `address`, `phone`, `capacity` y coordenadas geográficas. Cada sucursal tiene relaciones inversas hacia `branch_products`, `sectors`, `tables`, `categories` y más.

**`user.py`** define `User` con `__tablename__ = "app_user"` (evitando colisión con la palabra reservada `USER` de PostgreSQL). Almacena `email`, `hashed_password`, `first_name`, `last_name` y `tenant_id`. La tabla `UserBranchRole` implementa la relación many-to-many entre usuarios y sucursales, con un campo `role` adicional que puede ser ADMIN, MANAGER, KITCHEN o WAITER. Esta tabla permite que un usuario tenga diferentes roles en diferentes sucursales.

### El Catálogo: Category, Subcategory, Product, BranchProduct

**`catalog.py`** es el corazón del menú del restaurante. Define cuatro modelos en cascada jerárquica:

**`Category`** pertenece a una sucursal (`branch_id`) y tiene `name`, `icon`, `image` y `order` para secuenciación en el menú. Una restricción de unicidad compuesta `(branch_id, name)` impide categorías duplicadas en la misma sucursal. Un índice compuesto `(branch_id, is_active)` acelera las consultas de catálogo más frecuentes.

**`Subcategory`** pertenece a una categoría con restricción de unicidad `(category_id, name)` e índice compuesto `(category_id, is_active)`.

**`Product`** es el modelo más rico del catálogo. Definido a nivel de tenant (no de sucursal), tiene campos descriptivos (`name`, `description`, `image`), flags de UI (`featured`, `popular`, `badge`), y pertenece a una categoría con subcategoría opcional. Campos deprecated como `seal` y `allergen_ids` mantienen compatibilidad con versiones anteriores mientras se migran a las tablas de perfil.

Lo más notable de `Product` es su constelación de relaciones. Mantiene once relaciones bidireccionales con `back_populates`: `branch_products` (precios por sucursal), `product_allergens` (alérgenos con tipo de presencia), `product_ingredients` (ingredientes), `dietary_profile` (perfil dietario, one-to-one), `cooking_info` (información de cocción, one-to-one), `modifications` (modificaciones permitidas), `warnings` (advertencias), `rag_config` (configuración para chatbot IA, one-to-one), `cooking_methods`, `flavors` y `textures` (perfiles sensoriales M:N). Además, se vincula opcionalmente a una `Recipe` para heredar alérgenos e información dietaria.

**`BranchProduct`** vincula un producto con una sucursal, añadiendo `price_cents` (precio en centavos) e `is_available` (toggle de disponibilidad). La restricción de unicidad `(branch_id, product_id)` garantiza que no existan duplicados.

### Alérgenos y Reacciones Cruzadas

**`allergen.py`** define tres modelos. `Allergen` es un catálogo global a nivel de tenant con `name`, `icon`, `severity` y `description`. `ProductAllergen` vincula productos con alérgenos, añadiendo `presence_type` (CONTAINS, MAY_CONTAIN, TRACES, FREE_FROM) y `risk_level` (HIGH, MEDIUM, LOW) — información crucial para la seguridad alimentaria del comensal. `AllergenCrossReaction` implementa una relación self-referential many-to-many entre alérgenos, permitiendo modelar reacciones cruzadas (por ejemplo, alergia a camarones implica posible reacción a cangrejo).

### Ingredientes: Tres Niveles de Granularidad

**`ingredient.py`** modela los ingredientes en tres niveles. `IngredientGroup` agrupa ingredientes por categoría (Lácteos, Carnes, Verduras) a nivel de tenant. `Ingredient` pertenece a un grupo y tiene `name`, `allergen_id` opcional para vincular automáticamente con un alérgeno. `SubIngredient` permite detallar sub-ingredientes dentro de un ingrediente (por ejemplo, el ingrediente "Salsa Boloñesa" contiene sub-ingredientes "Tomate", "Carne", "Cebolla"). `ProductIngredient` vincula productos con ingredientes, con campos de `quantity`, `unit` y `is_main` para distinguir ingredientes principales de secundarios.

### Perfiles de Producto: 12 Modelos de Caracterización

**`product_profile.py`** es el archivo más extenso del paquete de modelos, con doce modelos que caracterizan productos desde múltiples dimensiones:

- **Catálogos tenant-scoped**: `CookingMethod` (Grillado, Frito, Horneado), `FlavorProfile` (Dulce, Salado, Ácido), `TextureProfile` (Crujiente, Cremoso, Tierno), `CuisineType` (Italiana, Japonesa, Argentina). Cada uno tiene restricción de unicidad `(tenant_id, name)`.
- **Tablas M:N con auditoría**: `ProductCookingMethod`, `ProductFlavor`, `ProductTexture` vinculan productos con los catálogos anteriores. A diferencia de tablas de asociación simples, incluyen `AuditMixin` para trazabilidad completa de quién y cuándo se asoció cada perfil.
- **Modelos one-to-one**: `ProductDietaryProfile` (es_vegetariano, es_vegano, es_gluten_free, es_keto, etc.), `ProductCooking` (tiempo, temperatura, método, instrucciones), `ProductModification` (modificaciones permitidas/prohibidas con severidad), `ProductWarning` (advertencias de alérgenos, intolerancia, picante), `ProductRAGConfig` (configuración para ingestión en el chatbot IA).

### Sectores y Asignaciones Diarias

**`sector.py`** define `BranchSector` (sectores dentro de una sucursal: Interior, Terraza, Barra) con `name`, `prefix` (para generar códigos de mesa como "INT-01"), y `capacity`. `WaiterSectorAssignment` registra qué mesero está asignado a qué sector cada día, con campos `assignment_date`, `shift` (MORNING, AFTERNOON, NIGHT) y restricción de unicidad `(sector_id, user_id, assignment_date, shift)` para evitar asignaciones duplicadas.

### Mesas y Sesiones

**`table.py`** define `Table` con un campo `code` alfanumérico (generado a partir del prefijo del sector, por ejemplo "INT-01", "TER-02") que los códigos QR enlazan. La restricción de unicidad `(branch_id, code)` garantiza unicidad dentro de una sucursal, pero permite que diferentes sucursales tengan el mismo código.

`TableSession` representa una sesión activa de comensales en una mesa. Tiene `status` (OPEN, PAYING, CLOSED), `started_at`, `closed_at`, y un `token` para autenticación de comensales. La relación con `Diner` (one-to-many) permite registrar múltiples comensales por sesión. Las relaciones con `rounds` y `checks` conectan la sesión con los pedidos y la cuenta.

### Clientes y Comensales: El Sistema de Fidelización

**`customer.py`** implementa dos modelos para el sistema de reconocimiento de clientes. `Diner` representa una visita individual: un dispositivo que se sentó en una mesa durante una sesión. Tiene `device_id` y `device_fingerprint` para reconocimiento cross-session, `name` y `color` para identificación visual en el carrito compartido, e `implicit_preferences` (JSON) que almacena filtros de alérgenos, dieta y métodos de cocción capturados implícitamente. `Customer` representa un cliente registrado con consentimiento GDPR, que puede tener múltiples visitas (diners) vinculadas por `customer_id`. Incluye campos de preferencias, métricas de comportamiento y flags de personalización con IA.

### Pedidos: Round y RoundItem

**`order.py`** modela el flujo de pedidos. `Round` representa una ronda de pedido dentro de una sesión. Una sesión puede tener múltiples rondas (primera ronda: bebidas; segunda: platos principales; tercera: postres). Los campos clave son:

- **`round_number`**: Secuencia dentro de la sesión.
- **`status`**: PENDING → CONFIRMED → SUBMITTED → IN_KITCHEN → READY → SERVED (o CANCELED).
- **`idempotency_key`**: Con restricción de unicidad compuesta `(table_session_id, idempotency_key)` para prevenir rondas duplicadas.
- **`submitted_by`**: "DINER" o "WAITER", trazando el origen.
- **`confirmed_by_user_id`**: FK al mesero que verificó el pedido.

`RoundItem` es un ítem individual dentro de una ronda: un producto con cantidad, precio unitario y notas opcionales. El `unit_price_cents` captura el precio en el momento de la orden — un snapshot que garantiza que cambios posteriores en el precio no afecten pedidos ya realizados. Dos `CheckConstraints` garantizan `qty > 0` y `unit_price_cents >= 0` a nivel de base de datos. El campo `diner_id` opcional permite rastrear qué comensal pidió cada ítem.

### Carrito Compartido

**`cart.py`** define `CartItem` para el carrito compartido en tiempo real de pwaMenu. Cuando un comensal agrega un producto al carrito, se crea un registro que se sincroniza vía WebSocket a todos los dispositivos en la misma mesa. Los campos incluyen `session_id`, `diner_id` (quién agregó), `product_id`, `quantity` y `notes`.

### Cocina: Tickets y Llamadas de Servicio

**`kitchen.py`** define tres modelos. `KitchenTicket` agrupa items de una ronda para la estación de cocina, con `status` (PENDING, IN_PROGRESS, READY, DELIVERED). `KitchenTicketItem` vincula tickets con round items. `ServiceCall` registra llamadas de servicio (comensal llama al mesero), con `call_type` (WAITER_CALL, CHECK_REQUEST, OTHER), `status` (CREATED, ACKNOWLEDGED, CLOSED), y `acknowledged_by_user_id` para rastrear qué mesero atendió.

### Facturación: El Cuarteto Financiero

**`billing.py`** implementa cuatro modelos que soportan el sistema de pagos flexibles:

**`Check`** (con `__tablename__ = "app_check"` porque CHECK es palabra reservada SQL) representa la cuenta de una sesión. Tiene `total_cents`, `paid_cents` y `status` (OPEN, REQUESTED, IN_PAYMENT, PAID, FAILED). Tres `CheckConstraints` garantizan invariantes financieras a nivel de base de datos: pagado nunca excede el total, y ambos montos son no negativos.

**`Payment`** registra cada pago realizado. Soporta múltiples proveedores (`CASH`, `MERCADO_PAGO`) y categorías (`DIGITAL`, `MANUAL`). Los campos de trazabilidad distinguen quién registró el pago (`SYSTEM`, `DINER`, `WAITER`) y, si fue un mesero, cuál (`registered_by_waiter_id`). Para pagos manuales, `manual_method` indica el medio (CASH, CARD_PHYSICAL, TRANSFER_EXTERNAL) y `manual_notes` permite notas adicionales.

**`Charge`** descompone la cuenta en cargos individuales: un cargo por cada item de ronda. El campo `diner_id` (nullable) identifica al responsable del cargo; cuando es null, el cargo es compartido.

**`Allocation`** implementa la relación M:N entre pagos y cargos. Un pago puede cubrir múltiples cargos, y un cargo puede ser cubierto por múltiples pagos. Esto habilita escenarios de pago dividido: un comensal paga la mitad de su plato con efectivo y la otra mitad con Mercado Pago.

### Promociones y Exclusiones

**`promotion.py`** define `Promotion` (con fechas de vigencia, tipo de descuento y monto), `PromotionBranch` (vincula promoción con sucursales) y `PromotionItem` (vincula promoción con productos, con cantidad mínima).

**`exclusion.py`** define `BranchCategoryExclusion` y `BranchSubcategoryExclusion`, que permiten ocultar categorías o subcategorías específicas del menú de una sucursal sin eliminarlas del catálogo global.

### Conocimiento: RAG con pgvector

**`knowledge.py`** define `KnowledgeDocument` con un campo `embedding` de tipo `Vector(1024)` (requiere la extensión pgvector) para almacenar embeddings de documentos indexados por el chatbot IA. `ChatLog` registra las conversaciones de los usuarios con el chatbot para análisis y mejora.

### Auditoría y Recetas

**`audit.py`** define `AuditLog` con campos para `entity_type`, `entity_id`, `action` (CREATE, UPDATE, DELETE), `old_data` y `new_data` (JSON), proporcionando un registro inmutable de todos los cambios realizados en el sistema.

**`recipe.py`** define `Recipe` (fichas técnicas de cocina) con ingredientes, pasos de preparación y tiempos, y `RecipeAllergen` para vincular recetas con alérgenos.

### El Outbox

**`outbox.py`** define `OutboxEvent` con campos para `event_type`, `aggregate_type`, `aggregate_id`, `payload` (JSON), `status` (PENDING, PROCESSING, PUBLISHED, FAILED) y `retry_count`. El enum `OutboxStatus` tipifica estos estados. Este modelo es la pieza central del Transactional Outbox Pattern que garantiza entrega confiable de eventos.

---

## Los Routers: Las Puertas del Sistema

El paquete `routers/` organiza los endpoints en diez módulos funcionales distribuidos en 46 archivos Python. Cada router implementa el patrón de controlador delgado: valida la entrada con Pydantic, verifica permisos, y delega toda la lógica al servicio de dominio correspondiente.

### Utilidades Compartidas (`_common/`)

El módulo `_common/` contiene dos archivos que proveen funcionalidad reutilizable.

**`base.py`** define funciones auxiliares para extraer información del contexto JWT: `get_user_id(user)` convierte `user["sub"]` a entero (ya que el claim `sub` es string por convención JWT), y `get_user_email(user)` extrae el email con fallback a cadena vacía.

**`pagination.py`** implementa un `Pagination` dataclass con `limit` y `offset`, validación de rangos, y un método `to_dict(total)` que genera metadatos de paginación para las respuestas. La dependencia `get_pagination` de FastAPI lo resuelve automáticamente desde query parameters.

### Autenticación (`auth/`)

El módulo `auth/` expone tres endpoints bajo `/api/auth`:

**`POST /login`** implementa autenticación con doble rate limiting: por IP (5 intentos por minuto vía slowapi) y por email (5 intentos por minuto vía script Lua en Redis, atómico con INCR y EXPIRE). Busca al usuario por email, verifica el hash bcrypt, carga roles y sucursales desde `UserBranchRole`, genera un access token JWT (15 minutos) con claims de `sub`, `tenant_id`, `branch_ids`, `roles` y `email`, y un refresh token (7 días) que se establece como cookie HttpOnly. La respuesta incluye ambos tokens y un objeto `UserInfo`.

Si el hash bcrypt necesita rehash (por actualización del factor de costo), se rehashea transparentemente durante el login.

**`POST /refresh`** acepta el refresh token desde la cookie HttpOnly o desde el body (compatibilidad). Verifica el token, comprueba que no esté en la blacklist, genera nuevos tokens (rotación de refresh token) y establece la nueva cookie.

**`POST /logout`** revoca todos los tokens del usuario llamando a `revoke_all_user_tokens()`, que almacena un timestamp de revocación en Redis. Limpia la cookie de refresh token. Crucialmente, el propio endpoint no dispara reintentos en 401 para evitar un loop infinito cuando el token ya expiró.

### Administración (`admin/`)

El módulo `admin/` es el más extenso, con 15 sub-routers montados bajo `/api/admin` por el `__init__.py` del paquete. Todos requieren autenticación JWT con rol ADMIN o MANAGER.

**`_base.py`** actúa como módulo compartido para todos los sub-routers admin. Define dependencias de FastAPI para verificación de roles (`require_admin`, `require_admin_or_manager`, `require_any_staff`), funciones de utilidad (`validate_branch_access`, `filter_by_accessible_branches`, `is_admin`, `is_manager`) y re-exporta todos los modelos, funciones de soft delete, auditoría y eventos que los sub-routers necesitan.

La función `filter_by_accessible_branches` es particularmente importante: para un ADMIN retorna "sin filtro" (ve todo), mientras que para un MANAGER retorna solo las sucursales a las que tiene acceso, garantizando aislamiento de datos por rol.

Cada sub-router sigue el patrón de controlador delgado. Tomemos **`products.py`** como ejemplo representativo. La docstring declara: "Reduced from 1022 lines to ~200 lines (80% reduction)". El router define una función `_get_service(db)` que instancia el `ProductService`, y cada endpoint se reduce a: validar permisos, llamar al servicio, manejar excepciones. El endpoint `list_products`, por ejemplo, aplica `filter_by_accessible_branches` para aislamiento de MANAGER y delega a `service.list_with_relations()`.

Los 15 sub-routers cubren:

| Sub-Router | Entidades | Notas |
|------------|-----------|-------|
| `tenant.py` | Tenant | Info y configuración del restaurante |
| `branches.py` | Branch | CRUD de sucursales |
| `categories.py` | Category | Delega a CategoryService |
| `subcategories.py` | Subcategory | Delega a SubcategoryService |
| `products.py` | Product, BranchProduct | El más complejo (~200 líneas post-refactor) |
| `allergens.py` | Allergen, AllergenCrossReaction | Incluye cross-reactions |
| `staff.py` | User, UserBranchRole | Delega a StaffService (control MANAGER) |
| `tables.py` | Table | CRUD con creación batch |
| `sectors.py` | BranchSector | Delega a SectorService |
| `orders.py` | Round, RoundItem | Órdenes activas y estadísticas |
| `exclusions.py` | BranchCategory/SubcategoryExclusion | Toggle de visibilidad por sucursal |
| `assignments.py` | WaiterSectorAssignment | Asignaciones diarias mesero-sector |
| `reports.py` | — | Analytics y estadísticas de ventas |
| `audit.py` | AuditLog | Vista de log de auditoría |
| `restore.py` | (genérico) | Restauración de entidades eliminadas |

### Endpoints Públicos (`public/`)

**`catalog.py`** expone el menú completo sin autenticación bajo `/api/public/menu/{slug}`, donde `slug` es el identificador de la sucursal. La respuesta incluye categorías, subcategorías, productos con precios, alérgenos, perfiles dietarios y de cocción — todo lo que pwaMenu necesita para renderizar el menú. Un endpoint adicional `GET /api/public/branches` retorna la lista de sucursales sin autenticación, utilizado por pwaWaiter para su flujo de selección de sucursal pre-login.

**`health.py`** expone `GET /api/health` con health checks del sistema.

### Mesas y Sesiones (`tables/`)

**`routes.py`** es un archivo multifacético que maneja tanto la vista de mesas del mesero como la creación de sesiones. Los endpoints principales son:

- **`GET /api/waiter/tables`**: Retorna un resumen de mesas con estado, sesión activa, rondas abiertas y llamadas de servicio pendientes. Para ADMIN/MANAGER muestra todas las mesas de la sucursal; para WAITER, filtra por sectores asignados hoy.
- **`GET /api/waiter/tables/{tableId}/session`**: Retorna el detalle de la sesión activa de una mesa, incluyendo comensales, rondas con items agrupados por categoría.
- **`POST /api/tables/{id}/session`**: Crea o recupera una sesión para una mesa por ID numérico.
- **`POST /api/tables/code/{code}/session`**: Crea o recupera una sesión por código alfanumérico de mesa (flujo QR de pwaMenu). Requiere `branch_slug` como query parameter porque los códigos no son únicos globalmente.

La creación de sesión genera un table token (JWT o HMAC) que el comensal usa para autenticarse en operaciones posteriores, y publica un evento `TABLE_SESSION_STARTED` vía Redis.

### Operaciones del Comensal (`diner/`)

Tres archivos componen este módulo, todos autenticados mediante `X-Table-Token`:

**`orders.py`** es el más extenso. Incluye:

- **Registro de comensal** (`POST /api/diner/register`): Registra un nuevo comensal en la sesión con `device_id`, `name` y `color`.
- **Envío de pedido** (`POST /api/diner/rounds`): Delega a `RoundService.submit_round()`, que verifica idempotencia, bloquea la sesión con FOR UPDATE, valida productos y precios, crea la ronda con status PENDING, y publica `ROUND_PENDING` a admin y meseros.
- **Llamada de servicio** (`POST /api/diner/service-call`): Crea una llamada de servicio y la persiste vía Outbox para garantizar entrega.
- **Consulta de cuenta** (`GET /api/diner/bill`): Retorna el detalle del check con items y pagos.
- **Preferencias implícitas** (`PATCH /api/diner/preferences`, `GET /api/diner/device/{id}/preferences`): Sincroniza y recupera filtros de alérgenos, dieta y cocción.
- **Historial por dispositivo** (`GET /api/diner/device/{id}/history`): Retorna visitas previas del dispositivo.

**`customer.py`** implementa el sistema de fidelización opt-in: registro de cliente con consentimiento GDPR, reconocimiento de dispositivo, perfil de cliente y sugerencias personalizadas.

**`cart.py`** expone el CRUD del carrito compartido: agregar item, actualizar cantidad, eliminar item, obtener carrito completo y limpiar carrito. Cada operación publica eventos WebSocket (`CART_ITEM_ADDED`, `CART_ITEM_UPDATED`, `CART_ITEM_REMOVED`, `CART_CLEARED`) para sincronizar en tiempo real entre todos los dispositivos en la mesa.

### Cocina (`kitchen/`)

**`rounds.py`** expone dos endpoints principales:

- **`GET /api/kitchen/rounds`**: Retorna rondas con estado SUBMITTED o IN_KITCHEN (las dos columnas de la vista de cocina: "Nuevos" y "En Cocina"). Usa eager loading completo con `selectinload(Round.items).joinedload(RoundItem.product)` y `joinedload(Round.session).joinedload(TableSession.table)` para prevenir N+1.
- **`PATCH /api/kitchen/rounds/{id}/status`**: Actualiza el estado de una ronda. Valida las transiciones permitidas según el rol del usuario y publica el evento correspondiente. Para transiciones críticas (`ROUND_SUBMITTED`, `ROUND_READY`), utiliza el Outbox Pattern; para transiciones no críticas, publica directamente a Redis.

**`tickets.py`** gestiona `KitchenTicket` y `KitchenTicketItem` — la agrupación de items de ronda para la estación de cocina.

### Operaciones del Mesero (`waiter/`)

**`routes.py`** es el archivo más extenso del módulo de routers (~700+ líneas), reflejando la diversidad de operaciones que un mesero puede realizar:

- **Verificación de asignación** (`GET /api/waiter/verify-branch-assignment`): Verifica que el mesero esté asignado a la sucursal solicitada para la fecha actual.
- **Consulta de asignaciones** (`GET /api/waiter/my-assignments`): Retorna los sectores asignados al mesero.
- **Activación de mesa** (`POST /api/waiter/tables/{id}/activate`): Inicia una sesión para una mesa, creando comensales según `diner_count`.
- **Envío de pedido** (`POST /api/waiter/sessions/{id}/rounds`): Crea una ronda desde pwaWaiter con `submitted_by="WAITER"`.
- **Confirmación de pedido** (`PATCH /api/waiter/rounds/{id}/confirm`): Transición PENDING → CONFIRMED.
- **Resolución de llamada de servicio** (`POST /api/waiter/service-calls/{id}/resolve`): Cierra una llamada de servicio.
- **Menú compacto** (`GET /api/waiter/branches/{id}/menu`): Retorna el menú sin imágenes para la funcionalidad de Comanda Rápida.
- **Pago manual** (`POST /api/waiter/sessions/{id}/manual-payment`): Registra un pago en efectivo, tarjeta física o transferencia.
- **Cierre de mesa** (`POST /api/waiter/tables/{id}/close`): Cierra la sesión y libera la mesa.
- **Resumen de sesión** (`GET /api/waiter/sessions/{id}/summary`): Retorna un resumen detallado de la sesión activa.

Cada endpoint que modifica estado publica el evento WebSocket correspondiente para sincronización en tiempo real.

### Facturación (`billing/`)

**`routes.py`** gestiona el flujo financiero con rate limiting específico por endpoint:

- **`POST /api/billing/check/request`** (10/minuto): Solicita la cuenta. Crea el Check, genera Charges para cada RoundItem, calcula el total y publica `CHECK_REQUESTED` vía Outbox.
- **`POST /api/billing/cash/pay`** (20/minuto): Procesa un pago en efectivo. Ejecuta `allocate_payment_fifo()` para distribuir el pago entre cargos, actualiza `paid_cents` en el Check, y publica `PAYMENT_APPROVED` vía Outbox.
- **`POST /api/billing/mercadopago/create-preference`** (5/minuto): Crea una preferencia de pago en Mercado Pago. Utiliza un circuit breaker que abre tras cinco fallos consecutivos, evitando cascadas de errores hacia el proveedor externo.
- **`POST /api/billing/webhook`**: Recibe notificaciones de Mercado Pago. Verifica la firma HMAC del webhook, procesa el pago y publica el evento. Los webhooks fallidos se encolan para retry automático.
- **`POST /api/billing/clear`**: Limpia la mesa, cierra la sesión y publica `TABLE_CLEARED`.
- **`GET /api/billing/check/{id}`**: Retorna el detalle del check con todos los items y pagos.
- **`GET /api/billing/balances`**: Retorna los balances de cada comensal (cuánto consumió vs. cuánto pagó).

### Contenido (`content/`)

Cinco archivos proveen CRUD para entidades de contenido:

**`catalogs.py`** gestiona los catálogos tenant-scoped: métodos de cocción, perfiles de sabor, texturas y tipos de cocina.

**`ingredients.py`** gestiona la jerarquía de ingredientes: grupos, ingredientes y sub-ingredientes.

**`promotions.py`** gestiona promociones con sus relaciones a sucursales y productos.

**`recipes.py`** gestiona recetas (fichas técnicas) con un endpoint especial `POST /api/recipes/{id}/ingest` que ingesta el contenido de una receta en la base de conocimiento del chatbot IA.

**`rag.py`** expone el endpoint del chatbot: envía una consulta del comensal, busca documentos relevantes por similitud de embeddings en pgvector, y genera una respuesta con Ollama.

### Métricas

**`metrics.py`** expone `GET /api/metrics` en formato Prometheus, permitiendo que sistemas de monitoreo como Grafana scrapen métricas del servicio.

---

## Los Servicios: El Corazón de la Lógica

El paquete `services/` contiene toda la lógica de negocio del sistema, organizada en siete submódulos que implementan patrones de diseño bien definidos. La máxima arquitectónica es clara: los routers son delgados, los servicios son gruesos.

### La Jerarquía Base (`base_service.py`)

El archivo `base_service.py` define tres clases abstractas que constituyen la columna vertebral de todos los servicios de dominio:

**`BaseService[ModelT]`** es la clase raíz. Recibe una sesión de base de datos y un modelo SQLAlchemy, creando automáticamente un `TenantRepository` para acceso a datos. Expone propiedades `db` y `repo` para las subclases.

**`BaseCRUDService[ModelT, OutputT]`** extiende BaseService con operaciones CRUD completas tipadas genéricamente. Su constructor acepta el modelo, el esquema Pydantic de salida, el nombre de la entidad en español (para mensajes de error), y configuraciones opcionales como `has_branch_id`, `supports_soft_delete` y `image_url_fields`.

Esta clase implementa el patrón **Template Method**: los métodos `create()`, `update()` y `delete()` definen un flujo invariable que invoca hooks extensibles en momentos precisos. El flujo de creación, por ejemplo:

```
create(data, tenant_id, user_id, user_email):
    1. _validate_create(data, tenant_id)         ← hook de validación pre-creación
    2. _validate_image_urls(data)                 ← seguridad automática anti-SSRF
    3. data["tenant_id"] = tenant_id              ← inyección de tenant
    4. entity = Model(**data)                     ← construcción de entidad
    5. set_created_by(entity, user_id, email)     ← auditoría
    6. db.add(entity), safe_commit(), refresh()   ← persistencia con rollback automático
    7. _after_create(entity, user_id, email)      ← hook de efectos secundarios
    8. return to_output(entity)                   ← transformación a DTO
```

Seis hooks extensibles permiten a las subclases personalizar el comportamiento sin modificar el flujo base: `_validate_create`, `_validate_update`, `_validate_delete` (pre-operación) y `_after_create`, `_after_update`, `_after_delete` (post-operación). Un servicio concreto sobreescribe solo los hooks que necesita.

Los métodos de lectura — `get_by_id`, `get_entity`, `list_all`, `count`, `exists` — delegan al repositorio y transforman los resultados a DTOs con `to_output()`, que por defecto usa `model_validate` de Pydantic.

**`BranchScopedService[ModelT, OutputT]`** extiende BaseCRUDService para entidades que pertenecen a una sucursal. Automáticamente usa un `BranchRepository` en lugar de `TenantRepository`, y agrega `list_by_branch()` y `list_by_branches()` para consultas filtradas por sucursal, más `validate_branch_access()` para verificación de permisos.

### Los 14 Servicios de Dominio (`domain/`)

El directorio `domain/` contiene catorce servicios concretos que heredan de las clases base y encapsulan toda la lógica de negocio:

**`CategoryService`** hereda de `BranchScopedService`. Sobreescribe `_validate_create` para verificar que el `branch_id` exista, `_validate_delete` para impedir eliminación si la categoría contiene subcategorías activas, y `_after_create`/`_after_update`/`_after_delete` para publicar eventos CRUD al dashboard.

**`SubcategoryService`** sigue el mismo patrón, validando que la categoría padre exista y prohibiendo eliminación si contiene productos activos.

**`BranchService`** gestiona sucursales con validación de `slug` único por tenant.

**`TableService`** hereda de `BranchScopedService`. Incluye lógica de generación de códigos de mesa basada en el prefijo del sector (por ejemplo, sector "Interior" con prefix "INT" genera "INT-01", "INT-02") y creación batch de mesas.

**`SectorService`** gestiona sectores de sucursal, validando unicidad de nombre y prefijo dentro de la sucursal.

**`ProductService`** es el servicio más complejo del sistema, con 957 líneas. Sobreescribe prácticamente todos los hooks del Template Method porque un producto es una entidad compuesta: al crear o actualizar un producto, se gestionan simultáneamente precios por sucursal (BranchProduct), alérgenos (ProductAllergen), ingredientes (ProductIngredient), perfil dietario, información de cocción, métodos de cocción, perfiles de sabor y textura, modificaciones, advertencias y configuración RAG. La eliminación ejecuta cascade soft delete sobre todas estas entidades dependientes. El método `list_with_relations` usa una cadena de `selectinload` y `joinedload` cuidadosamente construida para cargar todas las relaciones en una sola query, previniendo el problema N+1.

**`AllergenService`** gestiona alérgenos con su particularidad: las reacciones cruzadas. Al crear o actualizar un alérgeno, se gestionan las relaciones bidireccionales de `AllergenCrossReaction`.

**`StaffService`** (476 líneas) implementa control de acceso granular que va más allá del Template Method. Un ADMIN puede crear y gestionar cualquier usuario del tenant. Un MANAGER solo puede gestionar usuarios de sus sucursales asignadas y no puede crear usuarios con rol ADMIN. La lógica de creación incluye hashing bcrypt de la contraseña y asignación de roles por sucursal vía `UserBranchRole`.

**`PromotionService`** gestiona promociones con sus relaciones a sucursales (PromotionBranch) y productos (PromotionItem), validando fechas de vigencia y consistencia.

**`TicketService`** gestiona tickets de cocina, implementando transiciones de estado y agrupación de items de ronda.

**`RoundService`** implementa la creación y gestión de pedidos. La lógica de `submit_round` es crítica:
1. Verificación de idempotencia: busca si ya existe una ronda con la misma `idempotency_key` para la sesión.
2. Bloqueo de sesión con `FOR UPDATE` para prevenir condiciones de carrera entre pedidos concurrentes del mismo dispositivo.
3. Validación de que la sesión esté activa (status OPEN o PAYING).
4. Carga de productos con precios actuales de la sucursal.
5. Creación de Round (status PENDING) + RoundItems con precio snapshot.
6. Resolución del `sector_id` de la mesa para routing de eventos a los meseros asignados.

**`ServiceCallService`** gestiona llamadas de servicio con transiciones de estado (CREATED → ACKNOWLEDGED → CLOSED) y validación de que solo el mesero asignado al sector puede resolver la llamada.

**`BillingService`** implementa la lógica financiera: cálculo de totales sumando todos los RoundItems no cancelados, creación o recuperación de checks, y coordinación con el servicio de allocation para distribución de pagos.

**`DinerService`** gestiona el registro de comensales, sincronización de preferencias implícitas y reconocimiento de dispositivos para el sistema de fidelización.

### Repositorios y Acceso a Datos (`crud/`)

El directorio `crud/` implementa el patrón Repository en cuatro niveles de abstracción:

**`repository.py`** (645 líneas) define la jerarquía:

- **`BaseRepository[ModelT]`**: Operaciones fundamentales sin filtrado de tenant. Provee `find_by_id`, `find_all`, `count`, `exists`, `add`, `delete`. Internamente aplica filtros de `is_active` y soporte de eager loading configurable.
- **`TenantRepository[ModelT]`**: Extiende BaseRepository inyectando automáticamente `tenant_id` en toda consulta. Es imposible obtener datos de otro tenant. Agrega `find_by_ids` para carga por lotes.
- **`BranchRepository[ModelT]`**: Extiende TenantRepository añadiendo filtrado por `branch_id`. Provee `find_by_branch` y `find_by_branches`.
- **`SpecificationRepository[ModelT]`**: Extiende TenantRepository con el patrón Specification, permitiendo componer consultas complejas con operadores lógicos (`&` y `|`).

**`factory.py`** contiene el `CRUDFactory`, un mecanismo genérico para crear operaciones CRUD estándar. Aunque fue el enfoque original del sistema, está marcado como **deprecado** en favor de los servicios de dominio que ofrecen mayor flexibilidad y mejor separación de responsabilidades.

**`soft_delete.py`** provee funciones para eliminación lógica (`soft_delete`), restauración (`restore_entity`), asignación de campos de auditoría (`set_created_by`, `set_updated_by`), búsqueda de entidades activas y eliminadas, y filtrado.

**`cascade_delete.py`** (378 líneas) implementa eliminaciones en cascada para entidades con relaciones complejas. Define un diccionario `CASCADE_RELATIONSHIPS` que mapea cada tipo de entidad a sus dependientes. La función `cascade_soft_delete` recorre recursivamente estas relaciones eliminando lógicamente todos los hijos antes del padre. Para entidades particularmente complejas como Product, existen funciones especializadas como `soft_delete_product` que manejan la cascada de once relaciones dependientes.

**`audit.py`** proporciona funciones `log_create`, `log_update` y `log_delete` que registran cambios en la tabla `AuditLog` con serializaciones de los datos anteriores y posteriores.

**`entity_builder.py`** provee el `EntityOutputBuilder` para construir DTOs de salida a partir de entidades, con soporte para overrides de campos. Reduce la duplicación de funciones `build_*_output` dispersas por los routers.

### Sistema de Permisos (`permissions/`)

El sistema de permisos implementa el patrón **Strategy** combinado con **Interface Segregation Principle (ISP)**.

**`strategies.py`** define la arquitectura completa:

Cinco protocolos segregados — `CanRead`, `CanCreate`, `CanUpdate`, `CanDelete`, `QueryFilter` — permiten que cada estrategia implemente solo las capacidades que necesita. Tres mixins de negación — `NoCreateMixin`, `NoDeleteMixin`, `NoUpdateMixin` — proporcionan implementaciones por defecto que retornan `False`. Dos mixins auxiliares — `BranchFilterMixin`, `BranchAccessMixin` — encapsulan lógica reutilizable de filtrado y acceso por sucursal.

Cinco estrategias concretas implementan las políticas de cada rol:

- **`AdminStrategy`**: Acceso total. Todos los métodos retornan `True`. No filtra queries.
- **`ManagerStrategy`**: Puede crear y editar personal, mesas, alérgenos, promociones y sectores en sus sucursales. No puede eliminar ni crear usuarios ADMIN. Filtra queries por `branch_ids`.
- **`KitchenStrategy`**: Usa `NoCreateMixin` y `NoDeleteMixin`. Solo puede leer y actualizar rondas, tickets y productos. Filtra por sucursales asignadas.
- **`WaiterStrategy`**: Puede crear rondas, llamadas de servicio y registrar comensales. Puede actualizar rondas y llamadas. No puede eliminar. Filtra por sucursales.
- **`ReadOnlyStrategy`**: Implementa los tres mixins de negación. Solo lectura de entidades públicas.

`get_highest_privilege_strategy()` selecciona la estrategia del rol más privilegiado cuando un usuario tiene múltiples roles, siguiendo la jerarquía ADMIN > MANAGER > KITCHEN > WAITER > READ_ONLY.

**`context.py`** define `PermissionContext`, la fachada que los routers utilizan. Recibe el diccionario del usuario JWT, resuelve la estrategia, y expone métodos como `require_management()`, `require_branch_access()`, `can()` y `filter_query()`.

**`decorators.py`** provee decoradores para verificación declarativa de permisos en los endpoints.

### Eventos y Outbox Pattern (`events/`)

El directorio `events/` orquesta la comunicación asíncrona entre la REST API y el WebSocket Gateway:

**`admin_events.py`** publica eventos CRUD para el dashboard: `ENTITY_CREATED`, `ENTITY_UPDATED`, `ENTITY_DELETED`, `CASCADE_DELETE`. Estos eventos se publican directamente a Redis (sin outbox) porque su pérdida no es crítica — el dashboard puede refrescarse manualmente.

**`publisher.py`** y **`domain_event.py`** proveen funciones de publicación de eventos de dominio especializadas por canal: `publish_round_event` (a admin + cocina + meseros + comensales según el estado), `publish_service_call_event` (a meseros del sector), `publish_check_event` (a admin + meseros + comensales), `publish_table_event` (a admin + meseros).

**`outbox_service.py`** define las funciones que escriben eventos en la tabla de outbox. `write_outbox_event` es la función genérica. Funciones especializadas como `write_billing_outbox_event`, `write_round_outbox_event` y `write_service_call_outbox_event` añaden semántica de dominio y campos pre-configurados. La regla fundamental: la escritura del outbox event DEBE ocurrir dentro de la misma transacción que la operación de negocio, antes del `db.commit()`.

**`outbox_processor.py`** define el `OutboxProcessor`, un loop asíncrono que sondea la tabla `outbox_event` cada segundo. Su flujo de procesamiento:

1. Busca hasta 50 eventos con status PENDING usando `SELECT ... FOR UPDATE SKIP LOCKED` para permitir procesamiento concurrente.
2. Marca cada evento como PROCESSING para prevenir doble publicación.
3. Deserializa el payload y lo publica al canal Redis correspondiente usando la función de publicación apropiada.
4. Marca como PUBLISHED en caso de éxito, o incrementa `retry_count` y marca como FAILED si la publicación falla.
5. Los eventos que alcanzan 5 reintentos se marcan como DEAD_LETTER.

Los reintentos usan backoff exponencial con base de 2 segundos: 2s, 4s, 8s, 16s, 32s.

### Pagos (`payments/`)

El directorio `payments/` contiene la lógica financiera más delicada del sistema:

**`allocation.py`** implementa el algoritmo FIFO de distribución de pagos:

`create_charges_for_check` descompone la cuenta en cargos individuales: un `Charge` por cada `RoundItem` no cancelado. Si el item tiene `diner_id`, el cargo se asigna a ese comensal; si no, queda como cargo compartido.

`allocate_payment_fifo` distribuye un pago entre cargos pendientes en tres pasadas prioritarias:
1. Cargos propios del pagador (items que el comensal pidió).
2. Cargos compartidos (items sin `diner_id`).
3. Cargos de otros comensales (para cubrir la cuenta completa).

Para cada cargo, crea una `Allocation` que vincula payment con charge, anotando el monto asignado. Actualiza `paid_cents` en el Check y verifica si la cuenta está completamente pagada.

`get_all_diner_balances` calcula cuánto consumió y cuánto pagó cada comensal, permitiendo al frontend mostrar quién debe cuánto.

**`circuit_breaker.py`** implementa un circuit breaker para las llamadas a la API de Mercado Pago. Tras cinco fallos consecutivos, el circuito se abre durante 30 segundos, rechazando peticiones inmediatamente. En estado half-open, permite tres intentos de prueba. Este patrón protege al sistema contra cascadas de errores cuando Mercado Pago tiene problemas.

**`mp_webhook.py`** gestiona la recepción y procesamiento de webhooks de Mercado Pago: verificación de firma HMAC, actualización del estado del pago, y publicación del evento correspondiente.

**`webhook_retry.py`** implementa una cola de retry para webhooks fallidos. Los webhooks que no se procesan correctamente se encolan y se reintentan cada 30 segundos con backoff exponencial.

### Catálogo y Vistas (`catalog/`)

**`product_view.py`** provee `get_product_complete()`, una función que carga un producto con todas sus relaciones y lo transforma en una vista completa para el endpoint público de menú. También incluye `generate_product_text_for_rag()` y `generate_recipe_text_for_rag()`, que generan representaciones textuales de productos y recetas optimizadas para ingestión en el sistema RAG.

**`recipe_sync.py`** sincroniza datos entre recetas y productos vinculados. Cuando un producto tiene `inherits_from_recipe = True`, esta función copia alérgenos e información dietaria desde la receta al producto.

### El Chatbot IA (`rag/`)

**`service.py`** implementa el servicio de Retrieval-Augmented Generation que alimenta el chatbot del menú:

**`OllamaClient`** gestiona la comunicación HTTP con Ollama (servidor de modelos de IA). Utiliza connection pooling vía `httpx.AsyncClient` con límites de 10 conexiones máximas y 5 keepalive. La inicialización es lazy y thread-safe con double-check locking protegido por `asyncio.Lock`.

El flujo de una consulta al chatbot:
1. El comensal envía una pregunta ("¿Qué platos son aptos para celíacos?").
2. La pregunta se convierte en un embedding vectorial usando Ollama.
3. Se buscan los documentos más relevantes en `KnowledgeDocument` usando similitud coseno con pgvector.
4. Los documentos relevantes se inyectan como contexto en un prompt para Ollama.
5. Ollama genera una respuesta natural basada en la información real del menú del restaurante.

La ingestión de documentos convierte productos y recetas en texto descriptivo, genera embeddings y los almacena en la base de datos con la extensión pgvector para búsqueda por similitud posterior.

---

## El Seed: Los Datos Iniciales

El archivo `seed.py` se ejecuta durante el startup para poblar la base de datos con datos iniciales cuando está vacía. Incluye la creación del tenant principal, sucursales de ejemplo, usuarios de prueba con diferentes roles (admin, manager, kitchen, waiter), categorías, subcategorías, productos con precios por sucursal, alérgenos, sectores y mesas. El seed es idempotente: verifica si los datos ya existen antes de insertarlos, permitiendo reinicios del servidor sin duplicaciones.

---

## Referencias

- [arquiBackend.md](arquiBackend.md): Visión panorámica del backend completo (REST API + shared + ws_gateway)
- [README.md](README.md): Guía de inicio rápido y comandos
- [shared/README.md](shared/README.md): Documentación del módulo compartido
- [../ws_gateway/arquiws_gateway.md](../ws_gateway/arquiws_gateway.md): Arquitectura del WebSocket Gateway
- [../CLAUDE.md](../CLAUDE.md): Documentación general del proyecto y patrones clave
