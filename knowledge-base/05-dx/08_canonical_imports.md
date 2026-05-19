<!-- merged from CLAUDE.md 2026-05-19 (change: agentic-infra-uplift) -->

> Creado: 2026-05-19 | Fuente: migrado desde CLAUDE.md sección "Canonical Import Paths"

# Canonical Import Paths

Referencia rápida de imports canónicos para backend y WebSocket Gateway.
Para patterns de uso (PermissionContext, safe_commit, etc.) ver `05-dx/04_convenciones_y_estandares.md`.

---

## Backend (Python)

```python
# Infraestructura de base de datos
from shared.infrastructure.db import get_db, SessionLocal, safe_commit

# Configuración y settings
from shared.config.settings import settings
from shared.config.logging import get_logger
from shared.config.constants import Roles, RoundStatus, MANAGEMENT_ROLES

# Seguridad y autenticación
from shared.security.auth import current_user_context, verify_jwt

# Eventos y Redis
from shared.infrastructure.events import get_redis_pool, publish_event

# Excepciones centralizadas
from shared.utils.exceptions import NotFoundError, ForbiddenError, ValidationError

# Schemas de output (admin)
from shared.utils.admin_schemas import CategoryOutput, ProductOutput

# Modelos SQLAlchemy
from rest_api.models import Product, Category, Round, RoundItem

# Servicios de dominio (27 servicios total)
from rest_api.services.domain import ProductService, CategoryService, BillingService

# Repositorios
from rest_api.services.crud import TenantRepository, BranchRepository

# Soft delete
from rest_api.services.crud.soft_delete import soft_delete, cascade_soft_delete

# Permisos
from rest_api.services.permissions import PermissionContext

# Outbox pattern (eventos financieros garantizados)
from rest_api.services.events.outbox_service import write_billing_outbox_event
```

## WebSocket Gateway (Python)

```python
# Constantes y códigos de cierre WS
from ws_gateway.components.core.constants import WSCloseCode, WSConstants

# Router de broadcast
from ws_gateway.components.broadcast.router import BroadcastRouter

# Lifecycle y broadcaster de conexiones
from ws_gateway.core.connection import ConnectionLifecycle, ConnectionBroadcaster
```

## Notas de compatibilidad

- Los imports de `ws_gateway.components.*` soportan tanto la ruta antigua (`from ws_gateway.components import X`) como la nueva (`from ws_gateway.components.broadcast.router import X`).
- `BigIntPK` es alias de `BigInteger().with_variant(Integer, "sqlite")` en `rest_api/models/base.py` — usar siempre `BigIntPK` para PKs, nunca `BigInteger` directo (rompe SQLite en tests).
- Los servicios de dominio disponibles (27 total): `CategoryService`, `SubcategoryService`, `BranchService`, `SectorService`, `TableService`, `ProductService`, `AllergenService`, `StaffService`, `PromotionService`, `RoundService`, `BillingService`, `DinerService`, `ServiceCallService`, `TicketService`, `AuditService`, `CashService`, `CrmService`, `CustomizationService`, `DeliveryService`, `FloorPlanService`, `OverrideService`, `ReceiptService`, `ReservationService`, `SchedulingService`, `TipService`, `InventoryService`, `FiscalService`.
