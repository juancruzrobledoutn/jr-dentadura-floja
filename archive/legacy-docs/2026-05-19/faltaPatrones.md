# Patrones Faltantes — patronesAusar.md vs UsadoPatrones.md

> Analisis cruzado entre los patrones planificados (`patronesAusar.md`) y los patrones documentados como implementados (`UsadoPatrones.md`).
> Fecha: 2026-04-04

---

## Resumen Ejecutivo

De los **12 patrones** listados en `patronesAusar.md`, se verifico cada uno contra el codigo fuente real y contra `UsadoPatrones.md`:

| # | Patron | En UsadoPatrones.md? | En el codigo? | Estado |
|---|--------|---------------------|---------------|--------|
| 1 | Repository Pattern | SI (#2) | SI | Cubierto |
| 2 | Unit of Work | NO | PARCIAL (implicito via SQLAlchemy Session) | **FALTANTE en doc** |
| 3 | Service Layer | NO (mencionado indirectamente) | SI | **FALTANTE en doc** |
| 4 | Snapshot Pattern | NO | SI | **FALTANTE en doc y codigo** |
| 5 | Soft Delete | SI (#6) | SI | Cubierto |
| 6 | Audit Trail Append-Only | NO | SI | **FALTANTE en doc** |
| 7 | State Machine (FSM) | NO | SI | **FALTANTE en doc** |
| 8 | Idempotent Payments | NO | SI | **FALTANTE en doc** |
| 9 | Feature-Sliced Design | NO | NO | **No implementado** |
| 10 | Custom Hooks | SI (F6-F13) | SI | Cubierto |
| 11 | Optimistic Updates | SI (F9, F12) | SI | Cubierto |
| 12 | Webhook / IPN | NO | SI | **FALTANTE en doc** |

**Resultado**: 4 patrones ya cubiertos, **7 faltantes en la documentacion** (6 existen en el codigo pero no estan en UsadoPatrones.md), y **1 no implementado** (Feature-Sliced Design).

---

## Patrones FALTANTES en UsadoPatrones.md (existen en el codigo)

### 1. Unit of Work (Implicito via SQLAlchemy Session)

**Nombre GoF:** Unit of Work (Martin Fowler / PoEAA)
**Tipo:** Datos / Transaccional
**Capa:** Backend

**Ubicacion:**
- `backend/shared/infrastructure/db.py` — `safe_commit()`, `get_db()`, `SessionLocal`
- Todos los servicios en `rest_api/services/domain/`

**Implementacion:**

No existe una clase `UnitOfWork` explicita. El patron se implementa **implicitamente** a traves de SQLAlchemy Session con un wrapper `safe_commit()`:

```python
# backend/shared/infrastructure/db.py
SessionLocal = sessionmaker(autoflush=False, autocommit=False, bind=engine)

def safe_commit(db: Session) -> None:
    """HIGH-01 FIX: Safe commit with automatic rollback on failure."""
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
```

Cada servicio recibe la sesion via Dependency Injection y opera dentro de una transaccion implicita:

```python
# rest_api/services/domain/round_service.py
class RoundService(BaseCRUDService[Round, RoundOutput]):
    def submit_round(self, ...):
        new_round = Round(...)
        self._db.add(new_round)
        for item in request.items:
            round_item = RoundItem(...)
            self._db.add(round_item)
        safe_commit(self._db)  # Atomico: round + items en una transaccion
```

**Proposito:** Garantiza atomicidad — si falla la creacion de cualquier `RoundItem`, se hace rollback de todo (incluyendo el `Round` padre). La sesion acumula cambios en memoria y los persiste todos juntos en `safe_commit()`.

**Diferencia con el patron clasico:** En el patron clasico (Fowler) hay una clase `UnitOfWork` explicita con `begin()`, `commit()`, `rollback()`. Aqui, SQLAlchemy Session YA implementa este contrato internamente, y `safe_commit()` es el unico punto de confirmacion.

---

### 2. Service Layer

**Nombre:** Service Layer (Martin Fowler / PoEAA)
**Tipo:** Arquitectonico
**Capa:** Backend

**Ubicacion:**
- `backend/rest_api/services/base_service.py` — `BaseService`, `BaseCRUDService`, `BranchScopedService`
- `backend/rest_api/services/domain/` — 14+ servicios especializados

**Implementacion:**

La capa de servicios es el nucleo de la logica de negocio. Los routers son thin controllers que SOLO delegan:

```
Router (HTTP) → Service (Business Logic) → Repository (Data Access) → Model (SQLAlchemy)
```

```python
# base_service.py
class BaseService(ABC, Generic[ModelT]):
    """Abstract base service for domain operations."""
    def __init__(self, db: Session, model: Type[ModelT]):
        self._db = db
        self._repo = TenantRepository(model, db)

class BaseCRUDService(BaseService[ModelT], Generic[ModelT, OutputT]):
    def create(self, data: dict, tenant_id: int, user_id: int, user_email: str) -> OutputT:
        self._validate_create(data, tenant_id)  # Hook
        entity = self._model(**data)
        self._db.add(entity)
        safe_commit(self._db)
        self._after_create(entity, user_id, user_email)  # Hook
        return self.to_output(entity)
```

**Caracteristicas:**
- **Stateless**: Servicios instanciados por request, sin estado propio
- **Framework-independent**: No importan FastAPI ni HTTP — solo reciben `db: Session` y datos
- **Template Method**: Hooks `_validate_create()`, `_after_delete()` permiten personalizacion sin romper el flujo base
- **DTO transformation**: `to_output()` convierte modelos a schemas Pydantic

**Proposito:** Separar la logica de negocio del framework HTTP. Los servicios son testables unitariamente sin levantar FastAPI.

---

### 3. Snapshot Pattern (Inmutabilidad de precios en pedidos)

**Nombre:** Snapshot / Event Sourcing Snapshot
**Tipo:** Datos / Integridad historica
**Capa:** Backend / Base de datos

**Ubicacion:**
- `backend/rest_api/models/order.py` — `RoundItem.unit_price_cents`
- `backend/rest_api/services/domain/round_service.py` — logica de captura

**Implementacion:**

Cuando se crea una ronda, el precio del producto se **captura y congela** en el `RoundItem`. Cambios futuros al precio del producto NO afectan pedidos historicos:

```python
# rest_api/models/order.py
class RoundItem(AuditMixin, Base):
    """A single item within a round.
    Stores the price at the time of order for historical accuracy."""
    
    unit_price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    # ^ Este valor NUNCA se actualiza despues de la creacion
```

```python
# rest_api/services/domain/round_service.py
for item in request.items:
    product, branch_product = product_lookup[item.product_id]
    round_item = RoundItem(
        unit_price_cents=branch_product.price_cents,  # SNAPSHOT del precio actual
        qty=item.qty,
        notes=item.notes,
        ...
    )
```

**Proposito:** Integridad contable. Si un restaurante sube el precio de una hamburguesa de $500 a $600, los pedidos anteriores deben seguir mostrando $500. Sin snapshot, los reportes financieros serian incorrectos.

**Alcance:** Solo se hace snapshot del precio (`unit_price_cents`). El nombre del producto se referencia via FK a `product_id` (no se congela). Si se necesitara congelar el nombre tambien, se deberia agregar un campo `product_name_snapshot`.

---

### 4. Audit Trail Append-Only

**Nombre:** Audit Trail / Append-Only Log
**Tipo:** Datos / Trazabilidad
**Capa:** Backend / Base de datos

**Ubicacion:**
- `backend/rest_api/models/audit.py` — `AuditLog`
- `backend/rest_api/models/outbox.py` — `OutboxEvent` (append-only por status)
- `backend/rest_api/services/events/outbox_processor.py`

**Implementacion:**

**AuditLog** — Registra cambios significativos en entidades:

```python
# rest_api/models/audit.py
class AuditLog(AuditMixin, Base):
    action: Mapped[str]           # CREATE, UPDATE, DELETE, SOFT_DELETE, RESTORE
    entity_type: Mapped[str]      # "Product", "Category", etc.
    entity_id: Mapped[int]
    old_values: Mapped[str]       # JSON del estado anterior
    new_values: Mapped[str]       # JSON del estado nuevo
    changes: Mapped[str]          # JSON de campos modificados
```

**OutboxEvent** — Solo INSERT + UPDATE de status (nunca DELETE):

```python
# rest_api/models/outbox.py
class OutboxEvent(Base):
    status: Mapped[OutboxStatus]  # PENDING → PROCESSING → PUBLISHED | FAILED
    # Transiciones de status SOLO hacia adelante. Nunca se borran eventos.
```

```python
# outbox_processor.py
event.status = OutboxStatus.PUBLISHED
event.processed_at = datetime.now(timezone.utc)
# ^ Solo se actualiza el status, nunca se elimina el registro
```

**Proposito:** Trazabilidad completa de todos los cambios. Cumple con requisitos de auditoria (quien cambio que, cuando, y que valores tenia antes). Los eventos de outbox son append-only para garantizar que nunca se pierda un evento critico.

---

### 5. State Machine (FSM) — Maquina de Estados Finitos

**Nombre GoF:** State (variante: tabla de transiciones)
**Tipo:** Comportamiento
**Capa:** Backend

**Ubicacion:**
- `backend/shared/config/constants.py` — `ROUND_TRANSITIONS`, `ROUND_TRANSITION_ROLES`
- `backend/rest_api/routers/kitchen/rounds.py` — enforcement
- `backend/rest_api/services/domain/round_service.py` — validacion en servicio
- `backend/rest_api/services/domain/ticket_service.py` — FSM de tickets

**Implementacion:**

Mapa de transiciones explicito con restricciones por rol:

```python
# shared/config/constants.py
ROUND_TRANSITIONS: Final[dict[str, list[str]]] = {
    RoundStatus.PENDING:    [RoundStatus.CONFIRMED, RoundStatus.CANCELED],
    RoundStatus.CONFIRMED:  [RoundStatus.SUBMITTED, RoundStatus.CANCELED],
    RoundStatus.SUBMITTED:  [RoundStatus.IN_KITCHEN, RoundStatus.CANCELED],
    RoundStatus.IN_KITCHEN: [RoundStatus.READY, RoundStatus.CANCELED],
    RoundStatus.READY:      [RoundStatus.SERVED],
    RoundStatus.SERVED:     [],  # Estado terminal
    RoundStatus.CANCELED:   [],  # Estado terminal
}

ROUND_TRANSITION_ROLES: Final[dict[tuple[str, str], frozenset[str]]] = {
    (RoundStatus.PENDING, RoundStatus.CONFIRMED): frozenset({Roles.WAITER, Roles.ADMIN, Roles.MANAGER}),
    (RoundStatus.CONFIRMED, RoundStatus.SUBMITTED): MANAGEMENT_ROLES,
    (RoundStatus.SUBMITTED, RoundStatus.IN_KITCHEN): frozenset({Roles.KITCHEN, Roles.ADMIN, Roles.MANAGER}),
    # ...
}
```

Funciones de validacion:

```python
def validate_round_transition(current_status: str, new_status: str) -> bool:
    allowed = ROUND_TRANSITIONS.get(current_status, [])
    return new_status in allowed

def get_allowed_round_transitions(current_status: str, roles: list[str]) -> list[str]:
    """Retorna las transiciones permitidas para el rol del usuario."""
```

**Proposito:** Evita transiciones invalidas (ej: pasar de PENDING directo a SERVED). Cada rol solo puede ejecutar las transiciones que le corresponden. No se usa una libreria FSM externa — el mapa de transiciones como diccionario es suficiente y mas explicito.

**Diagramas de estados cubiertos:**
- Rounds: `PENDING → CONFIRMED → SUBMITTED → IN_KITCHEN → READY → SERVED` (+ CANCELED desde cualquiera)
- Kitchen Tickets: `CREATED → IN_PROGRESS → READY → DELIVERED`
- Service Calls: `CREATED → ACKED → CLOSED`
- Table Sessions: `OPEN → PAYING → CLOSED`
- Payments: `PENDING → APPROVED | REJECTED | FAILED`

---

### 6. Idempotent Payments (Pagos Idempotentes)

**Nombre:** Idempotency Pattern
**Tipo:** Datos / Resiliencia
**Capa:** Backend

**Ubicacion:**
- `backend/rest_api/models/order.py` — `Round.idempotency_key` + unique constraint
- `backend/rest_api/routers/billing/routes.py` — deduplicacion de checks y webhook
- `backend/rest_api/services/payments/mp_webhook.py` — procesamiento idempotente

**Implementacion:**

**Idempotency key en rondas:**

```python
# rest_api/models/order.py
class Round(AuditMixin, Base):
    idempotency_key: Mapped[Optional[str]] = mapped_column(Text, index=True)
    
    __table_args__ = (
        UniqueConstraint("table_session_id", "idempotency_key", 
                         name="uq_round_session_idempotency"),
    )
```

**Deduplicacion de checks:**

```python
# rest_api/routers/billing/routes.py
# HIGH-04 FIX: Previene checks duplicados en reintentos de red
existing_check = db.scalar(
    select(Check).where(
        Check.table_session_id == session_id,
        Check.status.in_(["OPEN", "REQUESTED", "IN_PAYMENT"]),
    )
)
if existing_check:
    return RequestCheckResponse(check_id=existing_check.id, ...)  # Idempotente
```

**Webhook idempotente con SELECT FOR UPDATE:**

```python
# rest_api/services/payments/mp_webhook.py
payment = db.scalar(
    select(Payment).where(
        Payment.check_id == check_id,
        Payment.provider == "MERCADO_PAGO",
        Payment.external_id == str(mp_payment.get("preference_id")),
    ).with_for_update()  # Lock para prevenir race conditions
)
```

**Proposito:** Reintentos de red no deben crear cobros duplicados. Si el frontend envia la misma request 2 veces (timeout, reconexion), el backend retorna el mismo resultado sin efectos secundarios adicionales.

---

### 7. Webhook / IPN (MercadoPago)

**Nombre:** Webhook / Instant Payment Notification
**Tipo:** Comunicacion asincrona
**Capa:** Backend

**Ubicacion:**
- `backend/rest_api/routers/billing/routes.py` — endpoint `/mercadopago/webhook`
- `backend/rest_api/services/payments/mp_webhook.py` — procesador con retry
- `pwaMenu/src/services/mercadoPago.ts` — integracion frontend

**Implementacion:**

**Endpoint webhook:**

```python
# rest_api/routers/billing/routes.py
@router.post("/mercadopago/webhook")
async def mercadopago_webhook(
    request: Request,
    x_signature: str | None = Header(None),
    x_request_id: str | None = Header(None),
):
    # 1. Verificar firma HMAC del webhook
    if not _verify_mp_webhook_signature(x_signature, x_request_id, data_id):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    
    # 2. Obtener datos del pago desde MP API (con circuit breaker)
    async with mercadopago_breaker.call():
        response = await client.get(
            f"https://api.mercadopago.com/v1/payments/{payment_id}",
            headers={"Authorization": f"Bearer {settings.mercadopago_access_token}"},
        )
    
    # 3. Si falla, encolar para retry
    if response.status_code != 200:
        await webhook_retry_queue.enqueue(payload=body, error=...)
        return {"status": "queued_for_retry"}
    
    # 4. Procesar pago con lock pesimista
    check = db.scalar(select(Check).where(...).with_for_update())
    allocate_payment_fifo(db, payment)
```

**Flujo completo:**

```
Cliente paga en MP → MP redirect a /payment/result (frontend)
                   → MP llama POST /mercadopago/webhook (backend, asincrono)
                       → Verificar firma HMAC
                       → Fetch payment desde MP API
                       → Crear/actualizar Payment en BD
                       → Asignar pago a charges (FIFO)
                       → Emitir evento PAYMENT_APPROVED via WebSocket
                       → Si falla → encolar en retry queue
```

**Proposito:** MercadoPago notifica asincronamente el resultado del pago. Esto evita polling y garantiza que el backend se entere del pago incluso si el cliente cierra el navegador antes del redirect.

---

## Patron NO IMPLEMENTADO

### Feature-Sliced Design (Frontend)

**Estado:** NO IMPLEMENTADO

**Lo que dice patronesAusar.md:**
> "Organizacion por features con limites de importacion claros. Cada feature es autocontenida."

**Lo que hay en el codigo:**

Los 3 frontends usan **organizacion por tipo** (type-based), NO por feature:

```
src/
├── components/    ← todos los componentes juntos
├── pages/         ← todas las paginas juntas
├── stores/        ← todos los stores juntos
├── hooks/         ← todos los hooks juntos
├── services/      ← todos los servicios juntos
└── utils/         ← todas las utilidades juntas
```

**Lo que seria Feature-Sliced Design:**

```
src/features/
├── orders/
│   ├── components/OrderCard.tsx
│   ├── hooks/useOrderStatus.ts
│   ├── store/orderStore.ts
│   └── api/orderApi.ts
├── tables/
│   ├── components/TableGrid.tsx
│   ├── hooks/useTableEvents.ts
│   ├── store/tableStore.ts
│   └── api/tableApi.ts
└── billing/
    └── ...
```

**Excepcion parcial:** `pwaMenu/src/stores/tableStore/` esta modularizado (store.ts, types.ts, selectors.ts, helpers.ts), pero esto es modularizacion de un store, no Feature-Sliced Design completo.

**Recomendacion:** Si se decide implementar FSD, el candidato mas natural es pwaMenu (52 componentes, la app mas compleja). Dashboard y pwaWaiter podrian beneficiarse menos dado que son mas pequenios.

---

## Tabla Resumen Final

| Patron | Planificado | Implementado | Documentado en UsadoPatrones.md | Accion |
|--------|:-----------:|:------------:|:-------------------------------:|--------|
| Repository Pattern | SI | SI | SI (#2) | Ninguna |
| Unit of Work | SI | PARCIAL | NO | **Agregar a UsadoPatrones.md** |
| Service Layer | SI | SI | NO (solo indirecto) | **Agregar a UsadoPatrones.md** |
| Snapshot Pattern | SI | SI | NO | **Agregar a UsadoPatrones.md** |
| Soft Delete | SI | SI | SI (#6) | Ninguna |
| Audit Trail Append-Only | SI | SI | NO | **Agregar a UsadoPatrones.md** |
| State Machine (FSM) | SI | SI | NO | **Agregar a UsadoPatrones.md** |
| Idempotent Payments | SI | SI | NO | **Agregar a UsadoPatrones.md** |
| Feature-Sliced Design | SI | NO | NO | **Decidir si implementar** |
| Custom Hooks | SI | SI | SI (F6-F13) | Ninguna |
| Optimistic Updates | SI | SI | SI (F9, F12) | Ninguna |
| Webhook / IPN | SI | SI | NO | **Agregar a UsadoPatrones.md** |

---

## Proximos Pasos

1. **Agregar 7 patrones a UsadoPatrones.md**: Unit of Work, Service Layer, Snapshot, Audit Trail, FSM, Idempotent Payments, Webhook/IPN
2. **Decidir sobre Feature-Sliced Design**: Es el unico patron planificado que NO se implemento. Evaluar si el beneficio justifica el refactor en pwaMenu.
3. **Considerar snapshot de nombre de producto**: Actualmente solo se congela el precio. Si el restaurante renombra un producto, los pedidos historicos mostrarian el nombre nuevo. Agregar `product_name_snapshot` a RoundItem si es necesario.
