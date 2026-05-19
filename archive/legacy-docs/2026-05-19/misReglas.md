# Reglas de Negocio — Integrador / Buen Sabor

> Extraídas del código fuente real. Organizadas por módulo.
> Última actualización: 2026-04-06

---

## 1. Autenticación y Seguridad

### Login
- Rate limiting: **5 intentos por 60 segundos** (por IP y por email, Redis + Lua atómico)
- Fail-closed: si Redis no responde, se deniega el acceso
- Si el usuario tiene 2FA habilitado y no envía código TOTP, retorna `requires_2fa: true`

### Tokens
| Token | Duración | Almacenamiento |
|-------|----------|----------------|
| Access JWT | 15 minutos | Header Authorization |
| Refresh JWT | 7 días | Cookie HttpOnly (secure, samesite=lax, path=/api/auth) |
| Table Token (diner) | 3 horas | Header X-Table-Token |

### Campos del JWT
`sub`, `tenant_id`, `branch_ids`, `roles`, `email`, `jti` (ID único), `type`, `iss`, `aud`, `iat`, `exp`

### Rotación de Refresh Token
1. Se emite nuevo refresh token
2. Se blacklistea el anterior ANTES de emitir el nuevo
3. Si se detecta reuso de token blacklisteado → se revocan TODOS los tokens del usuario

### 2FA (TOTP)
- Setup: genera secreto, almacena como `"pending:{secret}"` hasta verificación
- Verificación: acepta código con `valid_window=1` (permite 30s de desfase)
- Login: requiere código TOTP si `totp_secret` existe y no empieza con `"pending:"`
- Desactivar: requiere código TOTP válido actual

---

## 2. Multi-tenancy y Permisos

### Aislamiento de Tenant
- Toda entidad tiene `tenant_id`
- Usuarios solo acceden a branches de su tenant
- Login valida que todas las branches del usuario pertenezcan al mismo tenant

### Matriz RBAC

| Rol | Crear | Leer | Editar | Eliminar |
|-----|-------|------|--------|----------|
| **ADMIN** | Todo | Todo | Todo | Todo |
| **MANAGER** | Staff, Tables, Allergens, Promotions, Sectors, Assignments, ServiceCalls | Todo (branch-filtered) | Staff, Tables, Allergens, Promotions, Sectors, Assignments, Rounds, Sessions, ServiceCalls, Tickets | Nada |
| **KITCHEN** | Nada | Rounds, Items, Tickets, Products, Categories, Subcategories, Recipes | Rounds, Tickets | Nada |
| **WAITER** | ServiceCalls, Rounds, Items, Diners | Tables, Sessions, Rounds, Items, ServiceCalls, Products, Categories, Subcategories, Checks, Diners, Sectors, Assignments | Rounds, ServiceCalls | Nada |

---

## 3. Rondas y Pedidos

### Máquina de Estados
```
PENDING → CONFIRMED → SUBMITTED → IN_KITCHEN → READY → SERVED
              ↓            ↓           ↓          ↓
          CANCELED      CANCELED    CANCELED   CANCELED
```

### Quién puede transicionar
| Transición | Roles permitidos |
|------------|-----------------|
| PENDING → CONFIRMED | WAITER, ADMIN, MANAGER |
| CONFIRMED → SUBMITTED | ADMIN, MANAGER |
| SUBMITTED → IN_KITCHEN | ADMIN, MANAGER |
| IN_KITCHEN → READY | KITCHEN |
| READY → SERVED | ADMIN, MANAGER, WAITER |
| Cualquiera → CANCELED | ADMIN, MANAGER |

### Reglas de Envío
- La sesión debe estar en estado `OPEN` (no `PAYING` ni `CLOSED`)
- Se bloquea con `FOR UPDATE` ANTES de verificar idempotencia (previene race conditions)
- Todos los productos deben tener `is_active=True` en la branch
- **Validación de stock**: todos los productos deben tener stock suficiente en inventario
- Si stock insuficiente → HTTP 409 con lista de productos faltantes

### Idempotencia
- Clave `idempotency_key` + `session_id` combinados
- Si existe ronda con misma clave y estado ≠ CANCELED → retorna la existente

### Void de Item Individual
- Solo se puede anular en estados: `SUBMITTED`, `IN_KITCHEN`, `READY`
- No se puede anular si ya está `SERVED` o `is_voided=True`
- Requiere `reason` (no puede estar vacío)
- Registra: `void_reason`, `voided_by_user_id`, `voided_at`
- Si TODOS los items de una ronda quedan anulados → la ronda se auto-cancela

### Pricing
- Precios almacenados en **centavos** (enteros)
- `unit_price_cents` se captura al momento del pedido (snapshot)
- Total item = `unit_price_cents × qty`

---

## 4. Mesas y Sesiones

### Estados de Mesa
```
FREE → ACTIVE → PAYING → FREE
         ↓
   OUT_OF_SERVICE
```

### Estados de Sesión
```
OPEN → PAYING → CLOSED
```

| Estado | Puede pedir | Puede pagar | Puede llamar mozo |
|--------|-------------|-------------|-------------------|
| OPEN | Sí | No | Sí |
| PAYING | No | Sí | Sí |
| CLOSED | No | No | No |

### Reglas
- Código de mesa: único dentro de la branch
- Mesa debe tener sector asignado (obligatorio al crear)
- `branch_id` se copia del sector al crear la mesa
- Sesiones expiradas: TTL de 8 horas en localStorage de pwaMenu

### Transferencia de Mesa
- Mueve la sesión a otra mesa física
- Valida: mesa origen tiene sesión activa, mesa destino está FREE
- Actualiza estados de ambas mesas
- Publica evento `TABLE_TRANSFERRED`

---

## 5. Facturación y Pagos

### Check (Cuenta)
- Solo se puede solicitar cuando `session.status = OPEN`
- Idempotente: retorna check existente si ya hay uno para la sesión
- Total calculado: `sum(RoundItem.unit_price_cents × qty)` de rondas no canceladas
- Al solicitar check → sesión pasa a `PAYING`

### Métodos de Pago
`CASH`, `CARD`, `MERCADO_PAGO`, `TRANSFER`

### Asignación FIFO
- Cada RoundItem crea un registro `Charge`
- Los pagos se asignan a Charges en orden FIFO (más antiguo primero)
- Si se especifica `diner_id`: prioriza (1) charges del diner, (2) charges compartidos, (3) otros diners
- Charge lockeado con `FOR UPDATE` durante asignación (previene pagos concurrentes)

### Mercado Pago
- Circuit breaker: 3 fallas consecutivas → circuito OPEN → 30s espera → HALF_OPEN → 1 éxito → CLOSED
- Webhooks con cola de reintento (backoff exponencial)

### Rate Limiting de Billing
| Endpoint | Límite |
|----------|--------|
| Check request | 10/minuto |
| Payment operations | 20/minuto |
| Critical operations | 5/minuto |

---

## 6. Cocina

### Visibilidad
- Cocina solo ve rondas en estado `SUBMITTED` e `IN_KITCHEN`
- `PENDING` y `CONFIRMED` son responsabilidad del mozo/admin
- Ordenadas por `submitted_at` (más antiguo primero)

### Toggle de Disponibilidad de Producto
- `is_available`: temporalmente sin stock (diferente de `is_active` que es soft delete)
- Roles permitidos: KITCHEN, MANAGER, ADMIN
- Publica evento `PRODUCT_AVAILABILITY_CHANGED`
- Invalida todos los caches de menú

### Tickets de Cocina
- Estados: `PENDING → IN_PROGRESS → READY → DELIVERED`
- Soporte multi-estación

### Alertas Sonoras
- Beep audible (Web Audio API) al recibir `ROUND_SUBMITTED` o `ROUND_IN_KITCHEN`
- Flash visual naranja en pantalla Kitchen
- Toggle ON/OFF persistido en localStorage

---

## 7. Mozo

### Asignación por Sector
- Mozos asignados a sectores (no a mesas individuales)
- Turnos: MORNING, AFTERNOON, NIGHT
- Asignación diaria (cambia por día)

### Service Calls
```
OPEN → ACKED → CLOSED
```
- Tipos: `ASSISTANCE`, `PAYMENT_REQUEST`, `COMPLAINT`, `WAITER_CALL`
- Dirigidos al sector del mozo
- Acked = mozo confirma que está atendiendo
- Closed = mozo resuelve

### Comanda Rápida
- Mozo toma pedido para clientes sin celular
- Usa endpoint compacto `GET /waiter/branches/{id}/menu` (sin imágenes)

### Handoff de Turno
- `POST /waiter/tables/{id}/transfer` con `target_waiter_id`
- Requiere MANAGER o ADMIN
- Actualiza `session.assigned_waiter_id`

---

## 8. Categorías y Subcategorías

- Pertenecen a branch (`branch_id`)
- `order` auto-calculado si no se provee: `max(order) + 1`
- Soft delete preserva audit trail
- Listado ordenado por campo `order`
- Subcategorías son opcionales (producto puede tener solo categoría)

---

## 9. Productos y Alérgenos

### Producto
- `is_active`: soft delete (admin remueve del menú)
- `is_available`: toggle temporal de cocina (se agotó un ingrediente)
- Ambos deben ser `True` para aparecer en menú público

### Precios por Branch (BranchProduct)
- Precio almacenado en centavos (aritmética entera)
- Cada producto tiene precio independiente por sucursal
- `stock_qty`: nivel de inventario actual

### Alérgenos
- Relación M:N via `ProductAllergen`
- Niveles de presencia: `CONTAINS`, `MAY_CONTAIN`, `TRACES`, `FREE`
- Reacciones cruzadas documentadas entre alérgenos

### Customizaciones (Modificadores)
- `CustomizationOption`: tenant-level (no branch-specific)
- Relación M:N con productos via `ProductCustomizationLink`
- Categorías: "Tamaño", "Toppings", etc.
- `name + category` único dentro del tenant

---

## 10. Inventario

### Tipos de Movimiento
| Tipo | Descripción |
|------|-------------|
| `PURCHASE` | Ingreso de stock |
| `SALE` | Auto-deducción al servir ronda |
| `REFUND` | Devolución |
| `WASTE` | Pérdida/desperdicio |
| `ADJUSTMENT` | Corrección manual |

### Reglas
- Unidades válidas: `kg`, `lt`, `units`, `g`, `ml`
- No se puede deducir por debajo de 0 (ValidationError)
- Cada movimiento registra: `qty_before`, `qty_after`, `reference_type`, `reference_id`
- Alertas automáticas cuando `qty <= min_qty`

### Auto-deducción por Ronda
- Al servir ronda: deduce stock usando ingredientes de la receta
- Deducción async (falla gracefully)

---

## 11. Caja Registradora

### Ciclo de Sesión
```
Abrir (opening_amount) → Registrar movimientos → Cerrar (contar efectivo)
```

### Tipos de Movimiento
`SALE`, `REFUND`, `EXPENSE`, `DEPOSIT`, `WITHDRAWAL`, `TIP_IN`

### Reconciliación
- `expected = opening_amount + inflows - outflows`
- `actual = conteo manual`
- `variance = actual - expected`
- Solo una sesión abierta por caja a la vez

---

## 12. Propinas

### Registro
- `amount_cents` debe ser > 0
- Métodos: `CASH`, `CARD`, `MERCADOPAGO`
- Opcional: `waiter_id`, `table_session_id`, `check_id`

### Distribución por Pool
- Pool define porcentajes: `kitchen_percent`, `other_percent` (resto al mozo)
- Mozo recibe: `total - kitchen - other` (maneja redondeo)
- No se puede distribuir la misma propina dos veces

---

## 13. Fiscal (AFIP - Argentina)

### Tipos de Factura
| Tipo | Uso |
|------|-----|
| A | IVA Responsable Inscripto |
| B | Consumidor Final, Monotributo |
| C | Exento, exportación |

### Condiciones de IVA
`IVA Responsable Inscripto`, `IVA Responsable No Inscripto`, `Monotributo`, `Exento`, `No Responsable`, `Consumidor Final`

### Reglas
- Punto de venta (`point_number`) único por branch
- CUIT obligatorio y validado
- CAE (código de autorización) obtenido de AFIP WSFE
- Notas de crédito: misma tipo que factura original
- **STUB**: `_call_afip_wsfe()` retorna CAE simulado (producción requiere `pyafipws` + certificados)

---

## 14. CRM y Loyalty

### Tiers de Lealtad
| Tier | Puntos |
|------|--------|
| BRONZE | 0 — 499 (default) |
| SILVER | 500 — 1.999 |
| GOLD | 2.000 — 4.999 |
| PLATINUM | 5.000+ |

### Reglas
- Upgrade automático al alcanzar umbral
- Puntos configurables por tipo de transacción
- Tracking de visitas: incrementa en cada sesión
- Consentimiento GDPR: `data_consent` y `marketing_consent` separados

### Creación de Perfil
- Busca primero por email, luego por `device_id`
- Si encuentra: retorna existente (opcionalmente actualiza `device_id`)
- Si no: crea con `loyalty_tier=BRONZE`

---

## 15. Reservas

### Máquina de Estados
```
PENDING → CONFIRMED → SEATED → COMPLETED
             ↓           ↓
         CANCELED     CANCELED
         NO_SHOW      NO_SHOW
```

### Validaciones
- Overlap check: no dos reservas para la misma mesa en horarios superpuestos
- `party_size` obligatorio y numérico
- `reservation_date` y `reservation_time` obligatorios
- Si `customer_email` presente y estado pasa a CONFIRMED → envía email de confirmación

---

## 16. Delivery / Takeout

### Tipos de Orden
- `TAKEOUT`: cliente retira
- `DELIVERY`: restaurante entrega

### Máquina de Estados
```
RECEIVED → PREPARING → READY → PICKED_UP (takeout) / OUT_FOR_DELIVERY (delivery) → DELIVERED
                                                                                    ↓
                                                                               CANCELED (desde cualquier estado)
```

### Métodos de Pago
`CASH`, `CARD`, `MP` (Mercado Pago), `TRANSFER`

---

## 17. Promociones

- Pertenecen a tenant, asociables a múltiples branches
- Contienen múltiples items (`PromotionItem`)
- Rango de fecha/hora: `start_date`, `end_date`, `start_time`, `end_time`
- Precio en centavos
- URL de imagen validada por seguridad (anti-SSRF)

---

## 18. Manager Overrides

### Tipos de Override
| Tipo | Descripción |
|------|-------------|
| `ITEM_VOID` | Anular item individual |
| `DISCOUNT` | Descuento ad-hoc |
| `PAYMENT_REVERSAL` | Reversión de pago |
| `ROUND_CANCEL` | Cancelar ronda completa |

### Descuentos
- `PERCENT`: porcentaje (1-100)
- `AMOUNT`: monto fijo en centavos
- Aplicable a check o items individuales

### Audit Trail
- `old_values`: snapshot JSON antes del cambio
- `new_values`: snapshot JSON después del cambio
- `approved_by` + `requested_by`: cadena de aprobación
- Modelo: `ManagerOverride` (migración 014)

---

## 19. Scheduling (Turnos)

### Turnos
- Por usuario, branch, fecha, horarios
- Roles: WAITER, KITCHEN, etc.
- Estados: `SCHEDULED`, `COMPLETED`, `CANCELED`
- Prevención de overlap: no turnos superpuestos para el mismo usuario

### Overtime
- Turno estándar: **8 horas** (`STANDARD_SHIFT_HOURS`)
- Mayor a 8 horas: marcado como overtime

### Asistencia
- `AttendanceLog`: `actual_start`, `actual_end` (vs horarios programados)
- Trackea ausencias y salidas tempranas

---

## 20. Soft Delete y Cascade

### Convención
- Todas las entidades usan `is_active` (boolean, default `True`)
- Nunca se hace hard delete (excepto registros efímeros: cart items, sesiones expiradas)
- Queries filtran por `.where(Model.is_active.is_(True))` por defecto

### Cascadas
- Categoría eliminada: subcategorías NO se eliminan (siguen referenciando category_id)
- Producto eliminado: BranchProduct cascade por FK
- Entidad eliminada: publica evento `ENTITY_DELETED`
- Cascade soft delete: `cascade_soft_delete(db, entity, user_id, user_email)` desactiva la entidad y todos sus dependientes

---

## 21. Eventos y WebSocket

### Patrones de Entrega
| Patrón | Eventos | Garantía |
|--------|---------|----------|
| **Outbox** (transaccional) | CHECK_REQUESTED/PAID, PAYMENT_*, ROUND_SUBMITTED/READY, SERVICE_CALL_CREATED | At-least-once |
| **Redis directo** | ROUND_CONFIRMED/IN_KITCHEN/SERVED, CART_*, TABLE_*, ENTITY_* | Best-effort |

### Rate Limits WebSocket
| Parámetro | Valor |
|-----------|-------|
| Conexiones por usuario | 3 |
| Heartbeat timeout | 60 segundos |
| Tamaño máximo mensaje | 64 KB |
| Conexiones globales | 500 |
| Rate limit mensajes | 30/segundo |

### Catch-up tras Reconexión
- Staff: `GET /ws/catchup?branch_id=&since=&token=` (JWT)
- Diners: `GET /ws/catchup/session?session_id=&since=&table_token=` (table token)
- Redis sorted set, máx 100 eventos, TTL 5 minutos
- Los 3 frontends implementan catch-up automático

---

## 22. Diners y Dispositivos

### Registro
- `local_id`: identificador idempotente (app-local)
- `device_id`: identificador de hardware
- `device_fingerprint`: fingerprint del navegador
- `color`: color asignado para UI
- Si `local_id + session_id` coincide → retorna diner existente
- Historial cruzado por `device_id` entre sesiones

---

## 23. Feedback

- Rating: 1 a 5 estrellas
- Comentario: opcional
- Un feedback por sesión (409 si duplicado)
- Auth: table token
- Se muestra después de que la sesión pasa a PAYING/CLOSED

---

## 24. Cache de Menú (Redis)

- Key: `cache:menu:{branch_slug}`
- TTL: **5 minutos**
- Se invalida automáticamente en:
  - CRUD de productos, categorías, subcategorías
  - Toggle de disponibilidad
  - CRUD de alérgenos
- Fail-open: si Redis cae, se consulta la base de datos
- Cliente Redis sync (endpoints de menú son síncronos)

---

## 25. Constantes de Validación

```
MIN_QUANTITY = 1
MAX_QUANTITY = 99
MIN_PRICE_CENTS = 0
MAX_PRICE_CENTS = 10.000.000 ($100.000)
MAX_NAME_LENGTH = 200
MAX_DESCRIPTION_LENGTH = 2000
```

---

## 26. Impresión de Tickets

### Tipos de Ticket
| Tipo | Formato | Uso |
|------|---------|-----|
| Kitchen Ticket | HTML 80mm monospace | Impresora térmica cocina |
| Customer Receipt | HTML con detalles fiscales | Cuenta del cliente |
| Daily Report | HTML resumen | Cierre de caja diario |

### Flujo
- Backend genera HTML vía `ReceiptService`
- Frontend abre ventana de impresión vía browser Print API
- Botones de impresión en Kitchen (por ticket) y Sales (cierre diario)

---

## 27. Email

- Servicio SMTP opcional (no-op si no configurado)
- Usado para: confirmación de reservas
- Envío async en background thread (no bloquea request)
- Variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`

---

## 28. Idle Timeout (Dashboard)

- Warning a los **25 minutos** de inactividad
- Auto-logout a los **30 minutos**
- Se resetea con: mouse move, keypress, click, scroll, touchstart
- Deshabilitado en `/kitchen` (pantalla always-on)
