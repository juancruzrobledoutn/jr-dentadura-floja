# API y Endpoints

Este documento detalla todos los endpoints disponibles en la REST API (puerto 8000) y el WebSocket Gateway (puerto 8001).

---

## Convenciones Generales

### Autenticación

| Método | Header/Cookie | Usado por |
|--------|---------------|-----------|
| JWT Bearer | `Authorization: Bearer {access_token}` | Dashboard, pwaWaiter, Kitchen |
| Table Token | `X-Table-Token: {token}` | pwaMenu (comensales) |
| Cookie HttpOnly | `refresh_token` cookie | Refresh silencioso |

### Tokens y Tiempos de Vida

| Token | Duración | Almacenamiento |
|-------|----------|----------------|
| Access Token (JWT) | 15 minutos | Memoria (frontend) |
| Refresh Token | 7 días | Cookie HttpOnly |
| Table Token (HMAC) | 3 horas | localStorage (pwaMenu) |

### Formato de Respuesta

- Respuestas exitosas: JSON directo (sin wrapper)
- Errores: `{"detail": "mensaje"}` o `{"detail": [{"loc": [...], "msg": "...", "type": "..."}]}`
- Paginación: query params `?limit=50&offset=0` (valores por defecto)
- IDs: `BigInteger` (numéricos)
- Precios: enteros en centavos (ej: $125.50 = `12550`)

### Códigos de Estado HTTP

| Código | Significado |
|--------|-------------|
| 200 | Operación exitosa |
| 201 | Recurso creado |
| 204 | Eliminación exitosa |
| 400 | Request inválida / Error de validación de negocio |
| 401 | No autenticado / Token expirado |
| 403 | Sin permisos para la operación |
| 404 | Recurso no encontrado |
| 422 | Error de validación de datos (Pydantic) |
| 429 | Rate limit excedido |
| 500 | Error interno del servidor |

---

## Autenticación (/api/auth/)

| Método | Endpoint | Auth | Descripción | Body/Params |
|--------|----------|------|-------------|-------------|
| POST | `/api/auth/login` | Ninguna | Iniciar sesión | `{"email": "...", "password": "..."}` |
| POST | `/api/auth/refresh` | Cookie | Renovar access token | Cookie `refresh_token` (automático) |
| POST | `/api/auth/logout` | JWT | Cerrar sesión e invalidar tokens | - |
| GET | `/api/auth/me` | JWT | Obtener info del usuario actual | - |
| POST | `/api/auth/2fa/setup` | JWT | Generar secreto TOTP y QR para configurar 2FA | - |
| POST | `/api/auth/2fa/verify` | JWT | Verificar codigo TOTP y activar 2FA en la cuenta | `{"code": "123456"}` |
| DELETE | `/api/auth/2fa/disable` | JWT | Desactivar 2FA (requiere confirmacion) | `{"code": "123456"}` |

**Respuesta de login:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "email": "admin@demo.com",
    "full_name": "Admin",
    "tenant_id": 1,
    "branch_ids": [1, 2],
    "roles": ["ADMIN"]
  }
}
```

**Nota sobre refresh:** El refresh token se envía como cookie HttpOnly. El frontend debe usar `credentials: 'include'` en todas las requests. Dashboard y pwaWaiter refrescan proactivamente cada 14 minutos.

---

## Endpoints Públicos (/api/public/)

No requieren autenticación.

| Método | Endpoint | Auth | Descripción | Params |
|--------|----------|------|-------------|--------|
| GET | `/api/public/menu/{slug}` | Ninguna | Menú completo por slug de sucursal | `slug`: identificador de sucursal |
| GET | `/api/public/branches` | Ninguna | Listado de sucursales activas | - |

**Uso de `/api/public/branches`:** Lo utiliza pwaWaiter en el flujo pre-login para que el mozo seleccione su sucursal ANTES de autenticarse.

**Respuesta de menú público:** Incluye categorías, subcategorías, productos con precios, imágenes, alérgenos y disponibilidad.

---

## Sesión de Mesa (/api/tables/)

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| GET | `/api/tables/{id}/session` | JWT o Token | Obtener sesión por ID numérico de mesa |
| GET | `/api/tables/code/{code}/session` | JWT o Token | Obtener sesión por código alfanumérico |

**Importante sobre códigos de mesa:**
- Los códigos son alfanuméricos (ej: "INT-01", "TER-05")
- Los códigos NO son únicos entre sucursales
- El `branch_slug` es necesario para desambiguar

---

## Operaciones del Comensal (/api/diner/)

Autenticación vía `X-Table-Token`.

| Método | Endpoint | Auth | Descripción | Body |
|--------|----------|------|-------------|------|
| POST | `/api/diner/register` | X-Table-Token | Registrar comensal en la sesión | `{"name": "...", "color": "#..."}` |
| GET | `/api/diner/session` | X-Table-Token | Obtener info de la sesión actual | - |
| POST | `/api/diner/rounds/submit` | X-Table-Token | Enviar ronda de pedidos | `{"items": [...]}` |
| GET | `/api/diner/rounds` | X-Table-Token | Obtener rondas de la sesión | - |
| POST | `/api/diner/cart/add` | X-Table-Token | Agregar item al carrito compartido | `{"product_id": ..., "quantity": ..., "notes": "..."}` |
| PUT | `/api/diner/cart/{item_id}` | X-Table-Token | Actualizar item del carrito | `{"quantity": ..., "notes": "..."}` |
| DELETE | `/api/diner/cart/{item_id}` | X-Table-Token | Eliminar item del carrito | - |
| POST | `/api/diner/service-call` | X-Table-Token | Llamar al mozo | `{"type": "waiter_call"}` |
| POST | `/api/diner/feedback` | X-Table-Token | Enviar feedback del cliente (1-5 estrellas) con comentario opcional | `{"rating": 5, "comment": "..."}` |

---

## Fidelización de Cliente (/api/customer/)

Autenticación vía `X-Table-Token`.

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| GET | `/api/customer/profile` | X-Table-Token | Perfil del cliente (si existe) |
| POST | `/api/customer/opt-in` | X-Table-Token | Registro voluntario con consentimiento GDPR |
| GET | `/api/customer/preferences` | X-Table-Token | Preferencias implícitas acumuladas |
| GET | `/api/customer/history` | X-Table-Token | Historial de visitas |

**Fases del sistema de fidelización:**
1. Device tracking (automático, sin datos personales)
2. Preferencias implícitas (basadas en pedidos anteriores)
3. (Futuro) Opt-in con consentimiento GDPR

---

## Operaciones de Cocina (/api/kitchen/)

Autenticación JWT con rol KITCHEN requerido.

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| GET | `/api/kitchen/rounds` | JWT (KITCHEN) | Rondas pendientes para cocina (solo SUBMITTED+) |
| PUT | `/api/kitchen/rounds/{id}/status` | JWT (KITCHEN) | Actualizar estado de ronda |
| GET | `/api/kitchen/tickets` | JWT (KITCHEN) | Tickets de cocina activos |
| PUT | `/api/kitchen/tickets/{id}/status` | JWT (KITCHEN) | Actualizar estado de ticket |
| GET | `/api/kitchen/estimated-wait` | JWT (KITCHEN) | Estimador de tiempo de espera segun carga actual de cocina |

**Importante:** La cocina NO ve pedidos en estado PENDING ni CONFIRMED. Solo los pedidos con estado SUBMITTED o superior aparecen en la vista de cocina.

**Flujo de estados visibles por cocina:**
```
SUBMITTED → IN_KITCHEN → READY → SERVED
```

---

## Recetas (/api/recipes/)

Autenticación JWT con rol KITCHEN, MANAGER o ADMIN.

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| GET | `/api/recipes/` | JWT (K/M/A) | Listar recetas |
| GET | `/api/recipes/{id}` | JWT (K/M/A) | Detalle de receta con ingredientes |
| POST | `/api/recipes/` | JWT (K/M/A) | Crear receta |
| PUT | `/api/recipes/{id}` | JWT (K/M/A) | Actualizar receta |
| DELETE | `/api/recipes/{id}` | JWT (A) | Eliminar receta (soft delete) |

---

## Facturación (/api/billing/)

Endpoints protegidos con rate limiting (5-20 requests/minuto según endpoint).

| Método | Endpoint | Auth | Descripción | Rate Limit |
|--------|----------|------|-------------|------------|
| POST | `/api/billing/check/request` | JWT/Token | Solicitar la cuenta | 5/min |
| GET | `/api/billing/check/{session_id}` | JWT/Token | Obtener estado de la cuenta | 20/min |
| POST | `/api/billing/payment/preference` | JWT/Token | Crear preferencia Mercado Pago | 5/min |
| POST | `/api/billing/payment/webhook` | Ninguna | Webhook de Mercado Pago (IPN) | - |
| GET | `/api/billing/payment/{id}/status` | JWT/Token | Estado de un pago | 20/min |

**Modelo de facturación:**
```
Check (cuenta)
  └── Charge (cargo por item/ronda)
        └── Allocation (asignación FIFO)
              └── Payment (pago parcial o total)
```

**Métodos de pago soportados:**
- Mercado Pago (online via preferencia de pago)
- Efectivo (registro manual por mozo)
- Tarjeta (registro manual por mozo)
- Transferencia (registro manual por mozo)

---

## Operaciones del Mozo (/api/waiter/)

Autenticación JWT con rol WAITER requerido.

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| GET | `/api/waiter/verify-branch-assignment` | JWT (WAITER) | Verificar asignación diaria |
| GET | `/api/waiter/tables` | JWT (WAITER) | Mesas del sector asignado |
| POST | `/api/waiter/tables/{id}/activate` | JWT (WAITER) | Activar mesa (crear sesión) |
| POST | `/api/waiter/tables/{id}/close` | JWT (WAITER) | Cerrar mesa (post-pago) |
| POST | `/api/waiter/sessions/{id}/rounds` | JWT (WAITER) | Enviar ronda (comanda rápida) |
| POST | `/api/waiter/sessions/{id}/check` | JWT (WAITER) | Solicitar la cuenta |
| POST | `/api/waiter/payments/manual` | JWT (WAITER) | Registrar pago manual |
| GET | `/api/waiter/branches/{id}/menu` | JWT (WAITER) | Menú compacto (sin imágenes) |
| GET | `/api/waiter/service-calls` | JWT (WAITER) | Llamadas de servicio pendientes |
| PUT | `/api/waiter/service-calls/{id}/ack` | JWT (WAITER) | Acusar recibo de llamada |
| PUT | `/api/waiter/service-calls/{id}/close` | JWT (WAITER) | Cerrar llamada de servicio |
| POST | `/api/waiter/tables/{id}/transfer` | JWT (WAITER) | Transferir mesa a otro mozo (shift handoff) |
| POST | `/api/waiter/tables/{id}/move-to/{target}` | JWT (WAITER) | Mover sesion a otra mesa (table transfer) |
| POST | `/api/waiter/sessions/{id}/discount` | JWT (WAITER) | Aplicar descuento ad-hoc a la sesion |
| PATCH | `/api/waiter/rounds/items/{item_id}/void` | JWT (WAITER) | Anular un item individual de una ronda (requiere motivo) |

**Flujo pre-login del mozo:**
1. `GET /api/public/branches` → seleccionar sucursal (SIN autenticación)
2. Login con credenciales
3. `GET /api/waiter/verify-branch-assignment?branch_id={id}` → verificar asignación HOY
4. Si no está asignado → pantalla "Acceso Denegado"
5. Si está asignado → acceso a la aplicación

**Comanda rápida:** El endpoint `GET /api/waiter/branches/{id}/menu` retorna un menú compacto sin imágenes, optimizado para que el mozo tome pedidos de clientes sin teléfono.

**Pago manual:**
```json
POST /api/waiter/payments/manual
{
  "session_id": 123,
  "amount_cents": 15000,
  "method": "cash",
  "reference": "opcional"
}
```

---

## Administración (/api/admin/)

Autenticación JWT con roles según la operación (ver tabla RBAC).

### CRUD Genérico

Todos los endpoints admin siguen el mismo patrón:

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| GET | `/api/admin/{entity}` | JWT (según rol) | Listar con paginación (`?limit=50&offset=0`) |
| GET | `/api/admin/{entity}/{id}` | JWT (según rol) | Obtener por ID |
| POST | `/api/admin/{entity}` | JWT (ADMIN/MANAGER) | Crear entidad |
| PUT | `/api/admin/{entity}/{id}` | JWT (ADMIN/MANAGER) | Actualizar entidad |
| DELETE | `/api/admin/{entity}/{id}` | JWT (ADMIN) | Soft delete con preview de cascada |

### Entidades Administrables

| Entidad | Endpoint | Roles que pueden crear | Roles que pueden eliminar |
|---------|----------|----------------------|--------------------------|
| Categories | `/api/admin/categories` | ADMIN, MANAGER | ADMIN |
| Subcategories | `/api/admin/subcategories` | ADMIN, MANAGER | ADMIN |
| Products | `/api/admin/products` | ADMIN, MANAGER | ADMIN |
| Branches | `/api/admin/branches` | ADMIN | ADMIN |
| Sectors | `/api/admin/sectors` | ADMIN, MANAGER | ADMIN |
| Tables | `/api/admin/tables` | ADMIN, MANAGER | ADMIN |
| Staff | `/api/admin/staff` | ADMIN, MANAGER | ADMIN |
| Allergens | `/api/admin/allergens` | ADMIN, MANAGER | ADMIN |
| Promotions | `/api/admin/promotions` | ADMIN, MANAGER | ADMIN |
| Ingredients | `/api/admin/ingredients` | ADMIN | ADMIN |
| Customizations | `/api/admin/customizations` | ADMIN, MANAGER | ADMIN |

### Customizaciones de Producto

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| GET | `/api/admin/customizations` | JWT (ADMIN/MANAGER) | Listar opciones de personalización |
| POST | `/api/admin/customizations` | JWT (ADMIN/MANAGER) | Crear opción de personalización |
| GET | `/api/admin/customizations/{id}` | JWT (ADMIN/MANAGER) | Obtener opción por ID |
| PUT | `/api/admin/customizations/{id}` | JWT (ADMIN/MANAGER) | Actualizar opción |
| DELETE | `/api/admin/customizations/{id}` | JWT (ADMIN) | Eliminar opción (soft delete) |
| POST | `/api/admin/customizations/{id}/products/{pid}` | JWT (ADMIN/MANAGER) | Vincular producto a opción |
| DELETE | `/api/admin/customizations/{id}/products/{pid}` | JWT (ADMIN/MANAGER) | Desvincular producto de opción |
| PUT | `/api/admin/customizations/{id}/products` | JWT (ADMIN/MANAGER) | Establecer vínculos de producto en lote |

**Eventos WebSocket:** Toda operación CRUD emite eventos `ENTITY_CREATED`, `ENTITY_UPDATED` o `ENTITY_DELETED` para que los clientes conectados actualicen su UI en tiempo real.

**Preview de cascada en DELETE:** Antes de eliminar, se puede consultar qué entidades dependientes serán afectadas:
```json
{
  "message": "Categoría eliminada",
  "affected": {
    "Subcategory": 3,
    "Product": 12,
    "BranchProduct": 24
  }
}
```

### Data Export y GDPR

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| GET | `/api/admin/data-export/customer/{id}` | JWT (ADMIN) | Exportar datos del cliente en formato JSON (GDPR data portability) |
| DELETE | `/api/admin/data-export/customer/{id}` | JWT (ADMIN) | Anonimizar PII del cliente (GDPR right to be forgotten) |
| GET | `/api/admin/data-export/audit-log` | JWT (ADMIN) | Exportar entradas del audit log con filtros |

### Manager Overrides

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| GET | `/api/admin/overrides` | JWT (ADMIN/MANAGER) | Listar overrides con filtros (tipo, fecha, usuario) |
| POST | `/api/admin/overrides/void-item` | JWT (ADMIN/MANAGER) | Anular un item de ronda con motivo y auditoria |
| POST | `/api/admin/overrides/discount` | JWT (ADMIN/MANAGER) | Aplicar descuento con aprobacion de manager |

Todas las operaciones generan una entrada en la tabla `manager_override` con snapshots `old_values`/`new_values` para auditoria completa.

### Recibos y Reportes

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| GET | `/api/admin/receipts/kitchen-ticket/{round_id}` | JWT (ADMIN/MANAGER/KITCHEN) | HTML imprimible del ticket de cocina de una ronda |
| GET | `/api/admin/receipts/customer-receipt/{check_id}` | JWT (ADMIN/MANAGER/WAITER) | HTML imprimible del recibo del cliente |
| GET | `/api/admin/receipts/daily-report/{branch_id}` | JWT (ADMIN/MANAGER) | Reporte de cierre diario por sucursal (HTML) |
| GET | `/api/admin/reports/waiter-performance` | JWT (ADMIN/MANAGER) | Analiticas de performance por mozo (ventas, tiempos, propinas) |

### Mesas - QR Code

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| GET | `/api/admin/tables/{table_id}/qr-url` | JWT (ADMIN/MANAGER) | Genera la URL del QR code de la mesa para impresion |

### Tabla RBAC Completa

| Rol | Crear | Editar | Eliminar |
|-----|-------|--------|----------|
| ADMIN | Todo | Todo | Todo |
| MANAGER | Staff, Mesas, Alérgenos, Promociones (sus sucursales) | Lo mismo | Nada |
| KITCHEN | Nada | Nada | Nada |
| WAITER | Nada | Nada | Nada |

---

## Health Checks

### REST API

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| GET | `/api/health` | Ninguna | Health check básico |
| GET | `/api/health/detailed` | Ninguna | Health check con estado de dependencias |

**Respuesta detallada:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "dependencies": {
    "database": "healthy",
    "redis": "healthy"
  }
}
```

### WebSocket Gateway

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| GET | `/ws/health` | Ninguna | Health check básico del gateway |
| GET | `/ws/health/detailed` | Ninguna | Health check con estado de Redis y conexiones |
| GET | `/ws/metrics` | Ninguna | Métricas en formato Prometheus |

---

## WebSocket Endpoints (Puerto 8001)

### Conexiones

| Endpoint | Auth | Rol | Descripción |
|----------|------|-----|-------------|
| `/ws/waiter?token=JWT` | JWT | WAITER | Notificaciones del mozo |
| `/ws/kitchen?token=JWT` | JWT | KITCHEN | Notificaciones de cocina |
| `/ws/admin?token=JWT` | JWT | ADMIN/MANAGER | Notificaciones admin |
| `/ws/diner?table_token=TOKEN` | Table Token | Comensal | Actualizaciones en tiempo real |

### Event Catch-up (Recuperación post-reconexión)

| Método | Endpoint | Auth | Descripción | Params |
|--------|----------|------|-------------|--------|
| GET | `/ws/catchup` | JWT | Catch-up de eventos para staff | `branch_id`, `since` (timestamp) |
| GET | `/ws/catchup/session` | Table Token | Catch-up de eventos para comensales | `session_id`, `since` (timestamp) |

### Tipos de Eventos

#### Ciclo de Vida de Rondas
| Evento | Descripción |
|--------|-------------|
| `ROUND_PENDING` | Ronda creada por comensal |
| `ROUND_CONFIRMED` | Ronda confirmada por mozo |
| `ROUND_SUBMITTED` | Ronda enviada a cocina |
| `ROUND_IN_KITCHEN` | Ronda en preparación |
| `ROUND_READY` | Ronda lista para servir |
| `ROUND_SERVED` | Ronda servida |
| `ROUND_CANCELED` | Ronda cancelada |

#### Carrito Compartido
| Evento | Descripción |
|--------|-------------|
| `CART_ITEM_ADDED` | Item agregado al carrito |
| `CART_ITEM_UPDATED` | Item actualizado (cantidad, notas) |
| `CART_ITEM_REMOVED` | Item eliminado del carrito |
| `CART_CLEARED` | Carrito vaciado |

#### Servicio
| Evento | Descripción |
|--------|-------------|
| `SERVICE_CALL_CREATED` | Comensal llamó al mozo |
| `SERVICE_CALL_ACKED` | Mozo acusó recibo |
| `SERVICE_CALL_CLOSED` | Llamada cerrada |

#### Facturación
| Evento | Descripción |
|--------|-------------|
| `CHECK_REQUESTED` | Se solicitó la cuenta |
| `CHECK_PAID` | Cuenta pagada completamente |
| `PAYMENT_APPROVED` | Pago aprobado |
| `PAYMENT_REJECTED` | Pago rechazado |

#### Mesas
| Evento | Descripción |
|--------|-------------|
| `TABLE_SESSION_STARTED` | Nueva sesión de mesa iniciada |
| `TABLE_CLEARED` | Mesa cerrada y limpia |
| `TABLE_STATUS_CHANGED` | Cambio de estado de mesa |

#### Administración
| Evento | Descripción |
|--------|-------------|
| `ENTITY_CREATED` | Entidad creada via admin |
| `ENTITY_UPDATED` | Entidad actualizada via admin |
| `ENTITY_DELETED` | Entidad eliminada via admin |
| `CASCADE_DELETE` | Eliminación en cascada ejecutada |

### Protocolo de Heartbeat

```
Cliente: {"type": "ping"}     → cada 30 segundos
Servidor: {"type": "pong"}    → respuesta inmediata
Timeout: 60 segundos sin actividad → desconexión
```

### Códigos de Cierre WebSocket

| Código | Significado | Reconexión |
|--------|-------------|------------|
| 1000 | Cierre normal | No |
| 4001 | Autenticación fallida | No |
| 4003 | Prohibido (sin permisos) | No |
| 4029 | Rate limit excedido | No |
| Otros | Error transitorio | Sí (con backoff) |
