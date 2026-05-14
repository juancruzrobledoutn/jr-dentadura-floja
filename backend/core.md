# El Núcleo de la REST API: `rest_api/core/`

Este documento describe en profundidad el directorio `rest_api/core/`, el módulo que contiene la configuración fundacional de la aplicación FastAPI. Aquí residen los tres archivos que definen cómo arranca el servidor, cómo se detiene, qué defensas de seguridad aplica a cada respuesta HTTP y cómo negocia los orígenes cruzados con los tres frontends del sistema. Aunque el directorio contiene apenas tres archivos sustantivos —`lifespan.py`, `middlewares.py` y `cors.py`— su influencia se extiende a todo el sistema: cada request que entra y cada response que sale pasa por las capas de defensa definidas aquí.

---

## Tabla de Contenidos

1. [Visión General del Directorio](#visión-general-del-directorio)
2. [El Ciclo de Vida: `lifespan.py`](#el-ciclo-de-vida-lifespanpy)
   - [La Fase de Arranque](#la-fase-de-arranque)
   - [La Fase de Apagado](#la-fase-de-apagado)
   - [Filosofía de Resiliencia](#filosofía-de-resiliencia)
3. [Los Middlewares de Seguridad: `middlewares.py`](#los-middlewares-de-seguridad-middlewarespy)
   - [SecurityHeadersMiddleware](#securityheadersmiddleware)
   - [ContentTypeValidationMiddleware](#contenttypevalidationmiddleware)
   - [El Orden de Registro](#el-orden-de-registro)
4. [La Configuración CORS: `cors.py`](#la-configuración-cors-corspy)
   - [Los Orígenes por Defecto](#los-orígenes-por-defecto)
   - [Las Cabeceras Permitidas](#las-cabeceras-permitidas)
   - [La Función `configure_cors`](#la-función-configure_cors)
5. [Integración con `main.py`: El Orden de Ejecución](#integración-con-mainpy-el-orden-de-ejecución)
6. [Los Módulos Satélite del Core](#los-módulos-satélite-del-core)
   - [El Sistema de Logging Estructurado](#el-sistema-de-logging-estructurado)
   - [La Configuración Central: `settings.py`](#la-configuración-central-settingspy)
   - [El Middleware de Correlación](#el-middleware-de-correlación)
   - [La Telemetría OpenTelemetry](#la-telemetría-opentelemetry)
7. [El Seed de Datos Iniciales](#el-seed-de-datos-iniciales)
8. [Diagrama de Flujo Completo](#diagrama-de-flujo-completo)
9. [Referencias](#referencias)

---

## Visión General del Directorio

```
rest_api/core/
├── __init__.py       # Marcador de paquete (comentario descriptivo)
├── lifespan.py       # Startup y shutdown de la aplicación (128 líneas)
├── middlewares.py     # Middlewares de seguridad HTTP (108 líneas)
└── cors.py           # Configuración CORS (84 líneas)
```

Tres archivos. Trescientas veinte líneas de código. Y sin embargo, este directorio es el cimiento sobre el que se construye todo lo demás. Antes de que un router procese una petición, antes de que un servicio de dominio ejecute lógica de negocio, antes de que un modelo ORM toque la base de datos, el request ya ha atravesado las capas definidas aquí: el middleware CORS verificó su origen, el middleware de seguridad validó su Content-Type, el middleware de cabeceras inyectó las protecciones contra clickjacking y XSS, y el middleware de correlación le asignó un identificador único para trazabilidad distribuida.

El directorio `core/` sigue una filosofía de separación de responsabilidades: cada archivo tiene un rol único y acotado. `lifespan.py` gestiona el antes y el después de la vida de la aplicación. `middlewares.py` define las defensas HTTP que se aplican a cada respuesta. `cors.py` negocia qué orígenes pueden comunicarse con la API. Esta separación permite que un desarrollador modifique la configuración CORS sin tocar la secuencia de arranque, o que agregue un nuevo middleware de seguridad sin alterar la lógica de cierre.

---

## El Ciclo de Vida: `lifespan.py`

El archivo `lifespan.py` implementa el patrón de ciclo de vida de ASGI a través de un `asynccontextmanager`. FastAPI invoca este gestor de contexto exactamente una vez: al iniciar el servidor ejecuta todo el código antes del `yield`, y al detenerlo ejecuta todo el código después. Es, en esencia, el director de orquesta que monta el escenario antes de que comience la función y lo desmonta cuando termina.

### La Fase de Arranque

La secuencia de startup sigue un orden deliberado donde cada paso depende del anterior. No se trata de una lista arbitraria de inicializaciones, sino de una cadena de dependencias cuidadosamente ordenada:

**1. Inicialización del Logging**

```python
setup_logging()
```

Lo primero que hace la aplicación es configurar el sistema de logs. Esta decisión no es casual: cualquier error en los pasos siguientes necesita ser registrado, y para ello el sistema de logging debe estar operativo. La función `setup_logging()` configura un `StructuredLogger` personalizado que soporta datos estructurados como argumentos keyword, instala un `CorrelationIdFilter` para trazabilidad distribuida y elige el formateador adecuado según el entorno: `StructuredFormatter` (JSON) para producción, donde los logs deben ser parseables por herramientas de agregación como ELK o Datadog; o `DevelopmentFormatter` (colores ANSI) para desarrollo, donde la legibilidad humana es prioritaria.

El `StructuredFormatter` produce líneas JSON con campos `timestamp`, `level`, `logger`, `message` y, opcionalmente, `request_id` (correlation ID), `data` (datos extra) y `source` (archivo y línea, solo en debug). El `DevelopmentFormatter`, en cambio, produce líneas con colores por nivel: cian para DEBUG, verde para INFO, amarillo para WARNING, rojo para ERROR y magenta para CRITICAL, con los primeros 8 caracteres del correlation ID entre corchetes cuando está disponible.

La función también silencia el ruido de librerías de terceros: `uvicorn.access` se eleva a WARNING, `httpx` y `httpcore` se elevan a WARNING. Esto evita que los logs de la aplicación se ahoguen entre las líneas de acceso HTTP que genera uvicorn con cada request.

**2. Validación de Secretos de Producción**

```python
secret_errors = settings.validate_production_secrets()
if secret_errors:
    for error in secret_errors:
        logger.error("Configuration error: %s", error)
    if settings.environment == "production":
        raise RuntimeError(...)
```

Este paso implementa un principio de seguridad fundamental: **el servidor se niega a arrancar en producción con configuración insegura**. La función `validate_production_secrets()` del objeto `Settings` verifica cinco condiciones críticas:

- Que `JWT_SECRET` no sea uno de los valores por defecto (`"dev-secret-change-me-in-production"`, `"secret"`, `"changeme"`, etc.) y tenga al menos 32 caracteres.
- Que `TABLE_TOKEN_SECRET` cumpla las mismas condiciones.
- Que `DEBUG` esté desactivado.
- Que si Mercado Pago está configurado (`mercadopago_access_token` presente), también esté configurado el `mercadopago_webhook_secret`.
- Que `ALLOWED_ORIGINS` esté configurado para CORS.

En desarrollo, las violaciones se registran como warnings pero la aplicación continúa. En producción, se lanza un `RuntimeError` que detiene el servidor. Este es un ejemplo del patrón **fail-fast**: es mejor no arrancar que arrancar en un estado inseguro.

**3. Habilitación de pgvector**

```python
with engine.begin() as conn:
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
```

La extensión pgvector debe existir en la base de datos antes de que SQLAlchemy intente crear tablas que usen el tipo `VECTOR`. El modelo `KnowledgeDocument` almacena embeddings vectoriales para el chatbot RAG, y sin esta extensión la creación de su tabla fallaría. El uso de `engine.begin()` garantiza que la sentencia se ejecute dentro de una transacción que se commitea automáticamente.

**4. Creación de Tablas**

```python
Base.metadata.create_all(bind=engine)
```

Con pgvector disponible, se puede crear el esquema completo. `Base` es la clase declarativa base de SQLAlchemy que hereda de `AuditMixin`, y su `metadata` contiene las definiciones de las 54+ tablas del sistema. `create_all` es idempotente: crea las tablas que no existen y no toca las que ya están. Esto permite reinicios seguros sin pérdida de datos.

**5. Seed de Datos Iniciales**

```python
with SessionLocal() as db:
    seed(db)
```

La función `seed()` verifica si ya existe un tenant con slug `"buen-sabor"`. Si no existe, crea todo el dataset inicial: un tenant, una branch, seis usuarios de prueba (admin, manager, kitchen, 3 waiters), tres sectores (Interior, Terraza, Barra), diez mesas con códigos alfanuméricos, cuatro categorías con once subcategorías, catálogos de perfiles (métodos de cocción, sabores, texturas, tipos de cocina), seis grupos de ingredientes con treinta ingredientes, catorce alérgenos EU obligatorios, treinta y seis productos con precios por branch y asociaciones de alérgenos, asignaciones de mozos a sectores para el día actual, y ocho recetas detalladas con fichas técnicas completas (ingredientes, pasos, tiempos, costos, rendimiento).

La idempotencia del seed es crítica: si el servidor se reinicia, no debe duplicar datos. La verificación por slug del tenant es la puerta de entrada: si el tenant existe, toda la función retorna inmediatamente.

**6. Registro de Handlers de Webhook**

```python
from rest_api.services.payments.mp_webhook import register_mp_webhook_handler
register_mp_webhook_handler()
```

Este paso conecta el sistema de reintentos de webhooks con el handler de Mercado Pago. La `WebhookRetryQueue` es una cola Redis-backed que almacena webhooks fallidos con backoff exponencial (base 10 segundos, máximo 1 hora, 5 intentos máximos). Al registrar el handler, se le dice a la cola qué función invocar cuando un webhook de tipo `"mercadopago"` esté listo para reintento. Los webhooks que agotan sus reintentos pasan a una cola de dead-letter limitada a 1000 entradas.

**7. Inicio del Procesador de Reintentos**

```python
asyncio.create_task(start_retry_processor(interval_seconds=30.0))
```

Una tarea asíncrona de background que cada 30 segundos consulta la sorted set `webhook_retry:pending` en Redis, extrae los items cuyo `next_retry_at` ha vencido (hasta un batch de 10), y los procesa invocando el handler registrado. El uso de `asyncio.create_task` lo ejecuta de forma no bloqueante: la aplicación no espera a que procese nada antes de continuar con el startup.

**8. Inicio del Procesador Outbox**

```python
from rest_api.services.events.outbox_processor import start_outbox_processor
await start_outbox_processor()
```

El Transactional Outbox Pattern garantiza la entrega de eventos críticos (facturación, pagos, envío de rondas a cocina). El `OutboxProcessor` es un loop de background que cada segundo (`POLL_INTERVAL=1.0s`) busca hasta 50 eventos pendientes en la tabla `outbox_event` con `SELECT ... FOR UPDATE SKIP LOCKED` (para permitir múltiples instancias sin conflictos), los publica a Redis Pub/Sub, y marca su status como `SENT`. Los eventos que fallan se reintentan con backoff exponencial hasta 5 intentos, tras lo cual se marcan como `FAILED`. Este es un `await` —no un `create_task`— porque el procesador internamente crea su propia tarea y retorna inmediatamente.

**9. Calentamiento de Cachés**

```python
redis = await get_redis_client()
await warm_caches_on_startup(redis, SessionLocal)
```

El `CacheWarmer` pre-carga datos de alta frecuencia en Redis para evitar la latencia de cold-start. Para cada branch activo del sistema, consulta los productos disponibles con sus alérgenos (usando `selectinload` para evitar N+1) y los serializa a JSON en Redis con una key específica por branch y TTL definido. El uso de `asyncio.TaskGroup` permite paralelizar el calentamiento de múltiples branches.

La decisión de calentar en startup responde a un escenario real: si el servidor se reinicia durante las horas pico, los primeros requests de catálogo público sufrirían latencia extra al tener que ir a la base de datos. Con el cache warm, la primera consulta de menú ya está servida desde Redis.

**10. Inicio del Refresh-Ahead Scheduler**

```python
await start_refresh_ahead(redis, SessionLocal)
```

El `RefreshAheadScheduler` implementa una estrategia proactiva de cache refresh: cada 60 segundos revisa el TTL de los caches de productos por branch, y si alguno tiene menos de 5 minutos de vida (`refresh_threshold_seconds=300`), lo regenera antes de que expire. Esto garantiza que el cache nunca se quede vacío durante el servicio normal. Es un patrón de cache management que sacrifica un poco de frecuencia de actualización por la garantía de disponibilidad cero-miss.

**11. Inicialización de Métricas Prometheus**

```python
from shared.infrastructure.metrics import init_metrics
await init_metrics(redis)
```

La función `init_metrics` crea una instancia global de `MetricsRegistry` respaldada por Redis (para métricas distribuidas) y una fachada `AppMetrics` que expone contadores, gauges e histogramas específicos de la aplicación. Estas métricas se exponen posteriormente a través del endpoint `/api/metrics` en formato Prometheus scrape-ready.

Este paso está envuelto en un `try/except` que captura cualquier excepción sin detener el servidor:

```python
except Exception as e:
    logger.warning("Cache/metrics initialization failed (non-fatal)", error=str(e))
```

La decisión arquitectónica es clara: **el calentamiento de cachés y la inicialización de métricas son mejoras de rendimiento y observabilidad, no requisitos de funcionamiento**. Si Redis no está disponible momentáneamente, la API puede funcionar sin cachés (con mayor latencia) y sin métricas (con menor observabilidad), pero no debe dejar de servir requests.

### La Fase de Apagado

El `yield` marca la frontera entre startup y shutdown. Cuando FastAPI recibe una señal de terminación (SIGTERM, SIGINT), ejecuta el código posterior al `yield` en orden inverso de dependencia:

**1. Detención del Refresh-Ahead Scheduler**

```python
from shared.infrastructure.cache.warmer import stop_refresh_ahead
await stop_refresh_ahead()
```

El scheduler cancela su tarea de background y espera su finalización con manejo de `CancelledError`. Se detiene primero porque depende de Redis, que se cerrará más adelante.

**2. Detención del Procesador Outbox**

```python
from rest_api.services.events.outbox_processor import stop_outbox_processor
await stop_outbox_processor()
```

El outbox processor debe detenerse antes de cerrar la conexión a Redis, ya que publica eventos ahí. Una parada limpia garantiza que cualquier batch en proceso se complete antes de cerrar.

**3. Cierre del Cliente HTTP de Ollama**

```python
from rest_api.services.rag.service import close_ollama_client
await close_ollama_client()
```

El `OllamaClient` mantiene un pool de conexiones HTTP asíncronas (`httpx.AsyncClient`) hacia el servidor de embeddings y chat. Este pool debe cerrarse explícitamente para liberar sockets. El cliente usa el patrón singleton con double-check locking y `asyncio.Lock` para inicialización thread-safe.

**4. Cierre del Executor de Rate Limiting**

```python
from shared.security.rate_limit import close_rate_limit_executor
close_rate_limit_executor()
```

El módulo de rate limiting mantiene un `ThreadPoolExecutor` con 2 workers (prefijo `rate_limit`) para operaciones síncronas contra Redis. `close_rate_limit_executor()` llama a `shutdown(wait=False)` para no bloquear el cierre, y pone el executor global a `None`. Este executor usa el patrón de double-check locking para inicialización thread-safe.

**5. Cierre del Pool de Redis**

```python
await close_redis_pool()
```

Finalmente, se cierra la conexión a Redis. Este paso es el último porque todos los componentes anteriores que dependen de Redis ya fueron detenidos. Un cierre prematuro del pool causaría excepciones en cualquier componente que intentara publicar un evento o leer del cache.

### Filosofía de Resiliencia

Cada paso de shutdown está envuelto en su propio `try/except`:

```python
try:
    await stop_refresh_ahead()
except Exception as e:
    logger.warning("Failed to stop refresh-ahead scheduler", error=str(e))
```

Esto implementa un principio de resiliencia: **el fallo de un paso de shutdown no debe impedir la ejecución de los demás**. Si el refresh-ahead scheduler falla al detenerse, el outbox processor aún debe cerrarse, y el pool de Redis aún debe liberarse. Un shutdown parcial es mejor que un shutdown interrumpido que deja recursos sin liberar.

---

## Los Middlewares de Seguridad: `middlewares.py`

El archivo `middlewares.py` define dos clases de middleware que implementan defensas HTTP automáticas, más una función `register_middlewares` que las registra en la aplicación. Todos los middlewares heredan de `BaseHTTPMiddleware` de Starlette, que proporciona un patrón `dispatch(request, call_next)` donde se puede interceptar tanto el request como el response.

### SecurityHeadersMiddleware

Este middleware inyecta cabeceras de seguridad en **cada respuesta** que la API devuelve, independientemente del endpoint. Su objetivo es proteger a los clientes (navegadores) contra ataques comunes, incluso cuando los frontends fallan en implementar sus propias defensas.

**Las ocho cabeceras de seguridad:**

| Cabecera | Valor | Propósito |
|----------|-------|-----------|
| `X-Content-Type-Options` | `nosniff` | Impide que el navegador interprete un `text/html` como script. Previene ataques de MIME sniffing. |
| `X-Frame-Options` | `DENY` | Prohíbe que la API sea embebida en un `<iframe>`, eliminando el vector de clickjacking. |
| `X-XSS-Protection` | `1; mode=block` | Activa el filtro XSS de navegadores legacy (Chrome < 78, IE). Aunque obsoleto en navegadores modernos, no daña tenerlo. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Controla qué información de referencia se envía con requests. Para same-origin envía el URL completo; para cross-origin, solo el origen (dominio). |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` | Deshabilita APIs del navegador que la aplicación no necesita: geolocalización, micrófono y cámara. Reduce la superficie de ataque. |
| `Content-Security-Policy` | Ver detalle abajo | Política estricta de seguridad de contenido. Define de dónde pueden cargarse scripts, estilos, imágenes, fuentes y conexiones. |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | **Solo en producción.** Indica al navegador que la API solo debe accederse por HTTPS durante un año. Incluye subdominios. |
| *(Eliminación de `server`)* | *(header removido)* | Si uvicorn incluye un header `server`, se elimina para no revelar información sobre la infraestructura. |

**La Content-Security-Policy en detalle:**

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self';
connect-src 'self';
frame-ancestors 'none';
base-uri 'self';
form-action 'self'
```

Cada directiva tiene un propósito específico:

- `default-src 'self'`: Base restrictiva. Todo lo que no tenga una directiva específica solo puede cargarse del mismo origen.
- `script-src 'self'`: Los scripts solo pueden provenir del mismo dominio. Bloquea scripts inline y de terceros.
- `style-src 'self' 'unsafe-inline'`: Los estilos permiten inline porque algunos frameworks UI (como los que renderizan componentes server-side) inyectan estilos inline.
- `img-src 'self' data: https:`: Las imágenes pueden provenir del mismo origen, de data URIs (para avatares generados en el cliente) o de cualquier URL HTTPS (para imágenes de productos alojadas en CDN).
- `font-src 'self'`: Fuentes solo del mismo origen.
- `connect-src 'self'`: Conexiones XHR/fetch/WebSocket solo al mismo origen. Esto es relevante para la API porque los frontends se conectan a ella vía `fetch`.
- `frame-ancestors 'none'`: Refuerza `X-Frame-Options: DENY`. Ningún sitio puede embeber la API en un iframe.
- `base-uri 'self'`: Previene ataques de base-tag injection que podrían redirigir URLs relativos.
- `form-action 'self'`: Los formularios solo pueden enviarse al mismo origen.

**La distinción desarrollo/producción:**

El HSTS (HTTP Strict Transport Security) se aplica **únicamente en producción**:

```python
if settings.environment == "production":
    response.headers["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains"
    )
```

En desarrollo, los servidores corren sobre HTTP sin TLS, y activar HSTS rompería el acceso local. En producción, HSTS es esencial: fuerza HTTPS y previene ataques de downgrade SSL.

### ContentTypeValidationMiddleware

Este middleware valida que los requests que llevan cuerpo (body) utilicen el Content-Type correcto. Es una defensa contra ataques de inyección de contenido y contra clientes mal configurados.

**Métodos que requieren validación:**

```python
METHODS_WITH_BODY = {"POST", "PUT", "PATCH"}
```

Solo estos tres métodos HTTP envían body. GET, DELETE, OPTIONS y HEAD no llevan body, por lo que no necesitan validación de Content-Type.

**Paths exentos:**

```python
EXEMPT_PATHS = {"/api/billing/webhook", "/api/health"}
```

Dos endpoints están exentos de esta validación:

- `/api/billing/webhook`: Los webhooks de Mercado Pago envían payloads con Content-Types que pueden variar según la versión de su API. Rechazarlos por Content-Type incorrecto causaría pérdida de notificaciones de pago.
- `/api/health`: Los health checks deben ser lo más permisivos posible para que los load balancers y orquestadores puedan verificar el estado del servicio sin complejidad adicional.

**Content-Types aceptados:**

```python
if content_type and not (
    content_type.startswith("application/json")
    or content_type.startswith("application/x-www-form-urlencoded")
):
    return JSONResponse(status_code=415, ...)
```

Se aceptan dos tipos:

- `application/json`: El formato estándar para toda la API REST.
- `application/x-www-form-urlencoded`: Necesario para flujos OAuth y algunos clientes legacy.

Cualquier otro Content-Type recibe un `415 Unsupported Media Type`. Se usa `startswith` en lugar de igualdad exacta para manejar variantes como `application/json; charset=utf-8`.

**La cláusula `if content_type`:**

Si el request no envía cabecera Content-Type, el middleware lo deja pasar. Esta es una decisión deliberada: algunos clientes legítimos (como herramientas CLI o proxies) pueden no incluir Content-Type en requests con body vacío. El framework FastAPI/Pydantic ya rechazará el body si no es válido JSON.

### El Orden de Registro

```python
def register_middlewares(app: FastAPI) -> None:
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(ContentTypeValidationMiddleware)
```

Los middlewares en Starlette/FastAPI se ejecutan en **orden inverso al de registro**. Si se registran `A`, luego `B`, la ejecución es `B → A → endpoint → A → B`. Esto significa que:

1. `ContentTypeValidationMiddleware` se ejecuta **primero** (registrado segundo).
2. `SecurityHeadersMiddleware` se ejecuta **segundo** (registrado primero).

La lógica es:

- **ContentType primero**: Si el Content-Type es inválido, no tiene sentido procesar el request ni agregarle cabeceras de seguridad al response 415. Rechazar temprano ahorra ciclos.
- **SecurityHeaders segundo**: Las cabeceras de seguridad deben estar presentes en **toda** respuesta, incluyendo las respuestas de error del ContentType middleware. Al ejecutarse después, envuelve tanto las respuestas exitosas como las de error.

---

## La Configuración CORS: `cors.py`

Cross-Origin Resource Sharing es el mecanismo del navegador que gobierna qué dominios pueden hacer requests a la API. Sin CORS correctamente configurado, los tres frontends del monorepo (Dashboard en `:5177`, pwaMenu en `:5176`, pwaWaiter en `:5178`) no podrían comunicarse con la API en `:8000`.

### Los Orígenes por Defecto

```python
DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",  # Vite default
    "http://localhost:5176",  # pwaMenu
    "http://localhost:5177",  # Dashboard
    "http://localhost:5178",  # pwaWaiter
    "http://localhost:5179",  # Dashboard alternate port
    "http://localhost:5180",  # Future use
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5176",
    "http://127.0.0.1:5177",
    "http://127.0.0.1:5178",
    "http://127.0.0.1:5179",
    "http://127.0.0.1:5180",
    "http://192.168.1.106:5173",
    "http://192.168.1.106:5176",
    "http://192.168.1.106:5177",
    "http://192.168.1.106:5178",
    "http://192.168.1.106:5179",
    "http://192.168.1.106:5180",
]
```

Dieciocho orígenes, organizados en tres bloques:

1. **`localhost`** (6 orígenes): Para desarrollo local desde el mismo equipo.
2. **`127.0.0.1`** (6 orígenes): Los navegadores tratan `localhost` y `127.0.0.1` como orígenes distintos. Sin ambos, un desarrollador que acceda por IP vería errores CORS.
3. **`192.168.1.106`** (6 orígenes): Para testing desde otros dispositivos en la red local. Cuando un desarrollador prueba pwaMenu desde su teléfono conectado a la misma red WiFi, el origen es la IP del servidor de desarrollo.

Los puertos cubren el ecosistema completo: `5173` es el default de Vite, `5176`-`5178` son los tres frontends, `5179`-`5180` son puertos alternativos cuando los principales están ocupados.

### Las Cabeceras Permitidas

```python
ALLOWED_HEADERS = [
    "Authorization",       # JWT Bearer tokens (Dashboard, pwaWaiter)
    "Content-Type",        # JSON body type
    "X-Table-Token",       # HMAC table tokens (pwaMenu diners)
    "X-Request-ID",        # Correlation ID para trazabilidad distribuida
    "X-Requested-With",    # Header CSRF de pwaMenu (XMLHttpRequest)
    "X-Device-Id",         # Customer recognition (fidelización Fase 1)
    "Accept",              # Content negotiation
    "Accept-Language",     # i18n del pwaMenu (es/en/pt)
    "Cache-Control",       # Control de cache del cliente
]
```

Nueve cabeceras, cada una con un propósito preciso. Las más notables:

- `X-Table-Token`: El sistema de autenticación de comensales no usa JWT sino tokens HMAC por mesa. Este header customizado transporta ese token.
- `X-Device-Id`: La funcionalidad de fidelización (Fase 1) envía un UUID de dispositivo persistido en localStorage para reconocer dispositivos que regresan.
- `X-Requested-With`: Una cabecera de protección CSRF que pwaMenu incluye en sus requests. Su presencia provoca un preflight CORS, lo que añade una capa de protección contra CSRF.
- `Accept-Language`: pwaMenu soporta tres idiomas (español, inglés, portugués) y puede enviar la preferencia del usuario.

### La Función `configure_cors`

```python
def configure_cors(app: FastAPI) -> None:
    max_age = 0 if settings.environment == "development" else 600

    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_cors_origins(),
        allow_credentials=True,
        allow_methods=ALLOWED_METHODS,
        allow_headers=ALLOWED_HEADERS,
        expose_headers=["X-Request-ID"],
        max_age=max_age,
    )
```

**`allow_credentials=True`**: Necesario porque el sistema de refresh tokens usa HttpOnly cookies (`SEC-09`). Sin `allow_credentials=True`, el navegador no enviaría la cookie `refresh_token` en el request a `/api/auth/refresh`, y el refresh silencioso fallaría.

**`expose_headers=["X-Request-ID"]`**: Por defecto, CORS solo expone un conjunto limitado de cabeceras de respuesta al JavaScript del navegador. El `X-Request-ID` (correlation ID) debe exponerse explícitamente para que los frontends puedan leerlo y correlacionarlo con sus propios logs.

**`max_age` diferenciado**: En desarrollo, `max_age=0` significa que el navegador no cachea las respuestas preflight. Cada request CORS dispara un OPTIONS previo. Esto parece ineficiente, pero es intencional: durante el desarrollo, los orígenes, headers y métodos permitidos pueden cambiar frecuentemente, y un cache de preflight obsoleto causaría errores crípticos difíciles de diagnosticar. En producción, `max_age=600` (10 minutos) permite que el navegador cachee el preflight, reduciendo la latencia en requests repetidos.

**`get_cors_origins()`**: La función que decide qué lista de orígenes usar:

```python
def get_cors_origins() -> list[str]:
    if settings.allowed_origins:
        return [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
    return DEFAULT_CORS_ORIGINS
```

Si la variable de entorno `ALLOWED_ORIGINS` está configurada (producción), la parsea como una lista separada por comas. Si no (desarrollo), usa los 18 orígenes por defecto. La validación de producción en `lifespan.py` ya se encarga de rechazar el arranque si `ALLOWED_ORIGINS` no está configurada.

**Los métodos HTTP permitidos:**

```python
ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
```

Los seis métodos que la API utiliza. `OPTIONS` es necesario para los preflights CORS. No se incluye `HEAD` porque la API no tiene endpoints que lo soporten explícitamente, aunque FastAPI lo maneja automáticamente para endpoints GET.

---

## Integración con `main.py`: El Orden de Ejecución

Para comprender cómo los tres archivos de `core/` se integran en la aplicación, hay que examinar el orden de registro en `main.py`:

```python
# 1. Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# 2. Correlation ID middleware (OBS-02)
app.add_middleware(CorrelationIdMiddleware)

# 3. Security middlewares (from core/middlewares.py)
register_middlewares(app)  # Registers SecurityHeaders + ContentType

# 4. CORS configuration (from core/cors.py)
configure_cors(app)  # MUST be registered LAST to execute FIRST

# 5. OpenTelemetry instrumentation
setup_telemetry(app)
```

Dado que los middlewares se ejecutan en orden inverso al de registro, la cadena de ejecución para un request entrante es:

```
Request entrante
    │
    ▼
[1] CORS Middleware (registrado último → ejecuta primero)
    │   • Valida origen
    │   • Para OPTIONS preflight: responde inmediatamente
    │   • Para otros: deja pasar
    ▼
[2] ContentTypeValidationMiddleware
    │   • Valida Content-Type para POST/PUT/PATCH
    │   • Si inválido: responde 415, no llega al endpoint
    ▼
[3] SecurityHeadersMiddleware
    │   • (No modifica el request, solo el response)
    ▼
[4] CorrelationIdMiddleware
    │   • Lee o genera X-Request-ID
    │   • Lo almacena en ContextVar para logging
    ▼
[5] Rate Limiting (slowapi)
    │   • Verifica límites por IP
    ▼
[6] Router / Endpoint
    │   • Procesa la lógica de negocio
    ▼
[5'] Rate Limiting response
[4'] CorrelationIdMiddleware
    │   • Agrega X-Request-ID al response header
    │   • Resetea el ContextVar
[3'] SecurityHeadersMiddleware
    │   • Agrega las 8 cabeceras de seguridad
[2'] ContentTypeValidationMiddleware
    │   • (Passthrough en el response path)
[1'] CORS Middleware
    │   • Agrega cabeceras Access-Control-*
    ▼
Response al cliente
```

El CORS **debe ejecutarse primero** para que las peticiones preflight (OPTIONS) sean respondidas antes de que cualquier otro middleware las rechace. Si el ContentType middleware se ejecutara antes que CORS, rechazaría los preflights por no tener Content-Type, rompiendo toda comunicación cross-origin.

---

## Los Módulos Satélite del Core

Aunque técnicamente residen en `shared/`, varios módulos son utilizados tan íntimamente por `core/` que merecen documentación aquí.

### El Sistema de Logging Estructurado

`shared/config/logging.py` define toda la infraestructura de logging del sistema. Su `StructuredLogger` extiende `logging.Logger` para soportar datos keyword como argumentos naturales:

```python
logger.info("User logged in", user_id=123, email=mask_email("user@example.com"))
```

Estos kwargs se almacenan en `record.extra_data` y se formatean como parte del JSON en producción o como `(key=value | key=value)` en desarrollo.

El módulo también provee funciones de enmascaramiento para proteger PII en logs:

- `mask_email("user@example.com")` → `"us***@example.com"`: Muestra solo los dos primeros caracteres del local part.
- `mask_jti("abc12345-6789-...")` → `"abc12345..."`: Muestra solo los primeros 8 caracteres del JWT ID.
- `mask_user_id(12345)` → `"12***"`: Para contextos security-sensitive.

Adicionalmente, define funciones de auditoría de seguridad (`audit_ws_connection`, `audit_auth_event`, `audit_rate_limit_event`, `audit_token_event`) que usan un logger dedicado `security.audit` para crear trails de auditoría estructurados de eventos de seguridad. Estas funciones aceptan parámetros semánticos (event_type, endpoint, user_id, reason) y producen registros etiquetados con prefijos como `WS_AUDIT:`, `AUTH_AUDIT:`, `RATE_LIMIT_AUDIT:` y `TOKEN_AUDIT:`.

Se incluyen diez loggers pre-configurados para los módulos más comunes: `rest_api`, `ws_gateway`, `rest_api.billing`, `rest_api.kitchen`, `rest_api.diner`, `rest_api.auth`, `rest_api.waiter`, y `security.audit`.

### La Configuración Central: `settings.py`

`shared/config/settings.py` utiliza `pydantic-settings` para cargar configuración desde variables de entorno con tipado fuerte y valores por defecto para desarrollo. La clase `Settings` define más de 40 configuraciones agrupadas por dominio:

- **Base de datos**: `database_url` apuntando a PostgreSQL con psycopg.
- **Redis**: URL, tamaños de pool (50 async, 20 sync), timeouts, reintentos, tamaños de batch.
- **JWT**: Secret, issuer, audience, tiempos de expiración (15 min access, 7 días refresh, 3 horas table token).
- **Cookies**: Configuración HttpOnly para refresh tokens (secure, samesite, domain).
- **CORS**: Orígenes permitidos como string separado por comas.
- **RAG**: URL de Ollama, modelos de embedding y chat.
- **Mercado Pago**: Access token, webhook secret, notification URL.
- **WebSocket**: Límites de conexión (3 por usuario, 500 totales), rate limiting (30 msg/s), batch size de broadcast (50).
- **Entorno**: Environment, debug, puertos.

El singleton se crea con `@lru_cache` y se exporta como `settings = get_settings()`, proporcionando acceso global inmutable a la configuración.

### El Middleware de Correlación

`shared/infrastructure/correlation.py` implementa el `CorrelationIdMiddleware` que `main.py` registra como el primer middleware de aplicación (aunque ejecuta casi al final de la cadena). Este middleware:

1. Lee el header `X-Request-ID` si existe (permite que servicios upstream propaguen un ID).
2. Si no existe, genera un nuevo UUID4.
3. Almacena el ID en un `ContextVar` thread-safe para que cualquier parte del código pueda accederlo vía `get_request_id()`.
4. Lo agrega a `request.state.request_id` para acceso en los endpoints.
5. Lo inyecta en el response header `X-Request-ID` para que el cliente pueda correlacionarlo.
6. Resetea el `ContextVar` en el `finally` para evitar leaks entre requests.

El `CorrelationIdFilter` es un filtro de logging que inyecta el `request_id` en cada `LogRecord`, permitiendo que todos los logs de un request compartan el mismo identificador de correlación.

### La Telemetría OpenTelemetry

`shared/infrastructure/telemetry.py` configura la instrumentación automática de OpenTelemetry para distributed tracing. Solo se activa en producción/staging (o si `OTEL_ENABLED=true`). Instrumenta automáticamente:

- **FastAPI**: Cada request HTTP genera un span, excluyendo endpoints de health, metrics, docs y OpenAPI.
- **SQLAlchemy**: Cada query SQL genera un span hijo, permitiendo identificar N+1 y queries lentas.
- **Redis**: Cada comando Redis genera un span hijo.
- **Logging**: Agrega el trace context a los logs para correlación entre traces y logs.

Los spans se exportan vía OTLP (gRPC) a un collector (Jaeger, Tempo, etc.) configurado en `OTEL_EXPORTER_OTLP_ENDPOINT`. La función es completamente tolerante a fallos: si los paquetes de OpenTelemetry no están instalados, simplemente registra un warning y continúa. Si la instrumentación de un componente falla, continúa con los demás.

---

## El Seed de Datos Iniciales

Aunque `seed.py` no reside en el directorio `core/`, es invocado directamente por `lifespan.py` y constituye una pieza esencial del ciclo de arranque. El seed crea el dataset de desarrollo completo del restaurante "Buen Sabor":

**Entidades creadas (en orden de dependencias):**

| Orden | Entidad | Cantidad | Detalles |
|-------|---------|----------|----------|
| 1 | Tenant | 1 | "Buen Sabor", slug `buen-sabor`, color `#f97316` |
| 2 | Branch | 1 | "Sucursal Centro", timezone `America/Argentina/Mendoza` |
| 3 | Users | 6 | admin, manager, kitchen, 3 waiters (bcrypt passwords) |
| 4 | UserBranchRoles | 6 | ADMIN, MANAGER, KITCHEN, 3×WAITER |
| 5 | BranchSectors | 3 | Interior (INT), Terraza (TER), Barra (BAR) |
| 6 | Tables | 10 | INT-01 a INT-05, TER-01 a TER-03, BAR-01 a BAR-02 |
| 7 | Categories | 4 | Bebidas, Entradas, Principales, Postres |
| 8 | Subcategories | 11 | Gaseosas, Jugos, Cervezas, Vinos, Empanadas, Picadas, Carnes, Pastas, Ensaladas, Helados, Tortas |
| 9 | CookingMethods | 6 | A la parrilla, Frito, Al horno, A la plancha, Hervido, Al vapor |
| 10 | FlavorProfiles | 6 | Salado, Dulce, Ácido, Amargo, Umami, Picante |
| 11 | TextureProfiles | 5 | Crujiente, Cremoso, Tierno, Firme, Suave |
| 12 | CuisineTypes | 4 | Argentina, Italiana, Mediterránea, Internacional |
| 13 | IngredientGroups | 6 | Carnes, Verduras, Lácteos, Condimentos, Harinas, Bebidas |
| 14 | Ingredients | 30 | Distribuidos en los 6 grupos |
| 15 | Allergens | 14 | Los 14 alérgenos obligatorios EU con iconos y severidades |
| 16 | Products | 36 | Desde Coca-Cola hasta Panqueques, con precios en centavos |
| 17 | BranchProducts | 36 | Pricing por branch (todos `is_available=True`) |
| 18 | ProductAllergens | ~40 | Asociaciones producto-alérgeno con `presence_type` y `risk_level` |
| 19 | WaiterSectorAssignments | 5 | waiter→INT+TER, ana→INT, alberto→BAR+TER |
| 20 | Recipes | 8 | Fichas técnicas completas con ingredientes, pasos, costos |
| 21 | RecipeAllergens | ~15 | Asociaciones receta-alérgeno |

Total: ~210+ registros creados en una sola transacción que se commitea al final.

Las recetas son particularmente detalladas: cada una incluye ingredientes con cantidades y unidades, pasos de preparación con tiempos individuales, notas del chef, tips de presentación, alérgenos, métodos de cocción, perfiles de sabor y textura, costos, precios sugeridos, rendimiento y tamaño de porción. Esto permite probar la funcionalidad RAG de ingestión de recetas y el chatbot basado en embeddings.

---

## Diagrama de Flujo Completo

```
┌─────────────────────────────────────────────────────────────┐
│                    STARTUP SEQUENCE                          │
│                                                             │
│  1. setup_logging()           → Logger configurado           │
│  2. validate_production_secrets() → Secretos verificados     │
│  3. CREATE EXTENSION vector   → pgvector habilitado          │
│  4. Base.metadata.create_all  → 54+ tablas creadas           │
│  5. seed(db)                  → Datos iniciales (idempotente) │
│  6. register_mp_webhook_handler() → Handler registrado       │
│  7. start_retry_processor()   → Tarea async (30s interval)   │
│  8. start_outbox_processor()  → Tarea async (1s poll)        │
│  9. warm_caches_on_startup()  → Products en Redis            │
│ 10. start_refresh_ahead()     → Tarea async (60s check)      │
│ 11. init_metrics()            → Prometheus registry           │
│                                                             │
│  ── yield ── (aplicación sirviendo requests) ──              │
│                                                             │
│                    SHUTDOWN SEQUENCE                          │
│                                                             │
│  1. stop_refresh_ahead()      → Scheduler cancelado          │
│  2. stop_outbox_processor()   → Processor detenido           │
│  3. close_ollama_client()     → HTTP pool cerrado            │
│  4. close_rate_limit_executor() → ThreadPool cerrado         │
│  5. close_redis_pool()        → Redis desconectado           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   MIDDLEWARE CHAIN                            │
│           (orden de ejecución, no de registro)               │
│                                                             │
│  Request ──▶ CORS ──▶ ContentType ──▶ SecurityHeaders       │
│                  ──▶ CorrelationId ──▶ RateLimit ──▶ Router  │
│                                                             │
│  Response ◀── CORS ◀── ContentType ◀── SecurityHeaders      │
│                  ◀── CorrelationId ◀── RateLimit ◀── Router  │
└─────────────────────────────────────────────────────────────┘
```

---

## Referencias

- [arquiBackend.md](arquiBackend.md) — Arquitectura general del backend
- [api.md](api.md) — Documentación detallada del directorio `rest_api/`
- [compartidoSha.md](../compartidoSha.md) — Documentación del módulo `shared/`
- [CLAUDE.md](../CLAUDE.md) — Guía de desarrollo del proyecto
