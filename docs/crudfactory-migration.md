# Estado de Migracion: CRUDFactory a Domain Services

## Resumen

`CRUDFactory` fue el mecanismo original para generar operaciones CRUD genericas con aislamiento por tenant. Esta marcado como **deprecado** en favor de Domain Services que ofrecen mayor flexibilidad y mejor separacion de responsabilidades.

**Estado actual: La migracion ya esta completa en los routers.** Ningun router importa ni utiliza `CRUDFactory` directamente.

---

## Analisis de Routers

### Routers que usan Domain Services (migrados)

Todos los routers activos delegan a servicios de dominio ubicados en `rest_api/services/domain/`:

| Router | Domain Service |
|--------|---------------|
| `admin/categories.py` | `CategoryService` |
| `admin/subcategories.py` | `SubcategoryService` |
| `admin/products.py` | `ProductService` |
| `admin/branches.py` | `BranchService` |
| `admin/sectors.py` | `SectorService` |
| `admin/tables.py` | `TableService` |
| `admin/staff.py` | `StaffService` |
| `admin/allergens.py` | `AllergenService` |
| `content/promotions.py` | `PromotionService` |
| `diner/orders.py` | `RoundService` |
| `billing/routes.py` | `BillingService` |
| `diner/customer.py` | `DinerService` |
| `kitchen/tickets.py` | `TicketService` |
| `waiter/routes.py` | `ServiceCallService`, `RoundService`, `BillingService` |

### Routers sin CRUDFactory ni Domain Service (logica directa o especial)

Estos routers tienen logica propia que no encaja en el patron CRUD generico:

| Router | Motivo |
|--------|--------|
| `auth/routes.py` | Autenticacion (JWT, refresh, login) — no es CRUD |
| `public/catalog.py` | Solo lectura publica, queries directas |
| `public/health.py` | Health check, sin modelo |
| `tables/routes.py` | Sesiones de mesa, logica especifica |
| `content/catalogs.py` | Catalogos de cocina/sabor/textura |
| `content/ingredients.py` | Ingredientes con jerarquia |
| `content/recipes.py` | Recetas con relaciones complejas |
| `content/rag.py` | RAG knowledge base, logica especial |
| `admin/orders.py` | Administracion de rondas |
| `admin/audit.py` | Solo lectura de logs |
| `admin/restore.py` | Restauracion de soft deletes |
| `admin/exclusions.py` | Exclusiones branch-categoria |
| `admin/assignments.py` | Asignaciones de mozo a sector |
| `admin/tenant.py` | Configuracion de tenant |
| `admin/reports.py` | Reportes (solo lectura, agregaciones) |
| `diner/cart.py` | Carrito en tiempo real (Redis) |
| `kitchen/rounds.py` | Gestion de rondas en cocina |
| `kitchen/availability.py` | Disponibilidad de productos |
| `waiter/notifications.py` | Notificaciones de mozo |

---

## Codigo CRUDFactory Restante

El codigo de `CRUDFactory` sigue existiendo en:

| Archivo | Contenido |
|---------|-----------|
| `rest_api/services/crud/factory.py` | Clase `CRUDFactory`, `CRUDConfig`, y ejemplo `get_category_crud()` |
| `rest_api/services/crud/__init__.py` | Re-exporta `CRUDFactory` y `CRUDConfig` |
| `rest_api/services/__init__.py` | Re-exporta `CRUDFactory` (marcado como DEPRECATED) |

### Recomendacion

El codigo de `CRUDFactory` puede eliminarse de forma segura ya que:
1. Ningun router lo importa
2. Ningun test lo referencia directamente
3. La funcion `get_category_crud()` es solo un ejemplo sin uso real

**Pasos para eliminar:**
1. Borrar `rest_api/services/crud/factory.py`
2. Remover imports de `CRUDFactory` y `CRUDConfig` de `rest_api/services/crud/__init__.py`
3. Remover imports deprecados de `rest_api/services/__init__.py`
4. Actualizar `backend/api.md` para remover referencia a CRUDFactory

---

## Patron de Migracion (referencia)

Para quien necesite migrar codigo legacy que use `CRUDFactory`, este es el patron:

### Antes (CRUDFactory)

```python
# En el router
from rest_api.services.crud import CRUDFactory, CRUDConfig

crud = CRUDFactory(CRUDConfig(
    model=Category,
    output_schema=CategoryOutput,
    create_schema=CategoryCreate,
    update_schema=CategoryUpdate,
    entity_name="Categoria",
    has_branch_id=False,
))

@router.get("/categories")
def list_categories(db: Session = Depends(get_db), user: dict = Depends(current_user)):
    return crud.list_all(db, user["tenant_id"])
```

### Despues (Domain Service)

```python
# 1. Crear servicio en rest_api/services/domain/category_service.py
from rest_api.services.base_service import BranchScopedService  # o BaseCRUDService

class CategoryService(BranchScopedService[Category, CategoryOutput]):
    def __init__(self, db: Session):
        super().__init__(
            db=db,
            model=Category,
            output_schema=CategoryOutput,
            entity_name="Categoria"
        )

    def _validate_create(self, data: dict, tenant_id: int) -> None:
        # Validaciones de negocio
        ...

# 2. Exportar en rest_api/services/domain/__init__.py

# 3. Usar en el router (thin controller)
from rest_api.services.domain import CategoryService
from rest_api.services.permissions import PermissionContext

@router.get("/categories")
def list_categories(db: Session = Depends(get_db), user: dict = Depends(current_user)):
    ctx = PermissionContext(user)
    service = CategoryService(db)
    return service.list_by_branch(ctx.tenant_id, branch_id)
```

### Ventajas del Domain Service

1. **Validacion de negocio centralizada** — `_validate_create`, `_validate_update`
2. **Hooks de ciclo de vida** — `_after_create`, `_after_delete` (emitir eventos WS)
3. **Permisos granulares** — via `PermissionContext` en el router
4. **Testeable** — se puede instanciar el servicio sin HTTP
5. **Extensible** — metodos custom ademas del CRUD basico
