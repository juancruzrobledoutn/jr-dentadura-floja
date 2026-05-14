"""
Inventory management endpoints: stock, movements, alerts, suppliers, purchase orders, waste, food cost.
"""

from datetime import date, datetime, timezone

from fastapi import APIRouter

from rest_api.routers.admin._base import (
    Depends,
    Session,
    select,
    get_db,
    current_user,
    get_user_id,
    get_user_email,
    require_admin_or_manager,
    validate_branch_access,
    is_admin,
    selectinload,
)
from rest_api.models.inventory import (
    StockMovement,
    StockAlert,
    Supplier,
    PurchaseOrder,
    WasteLog,
)
from rest_api.services.domain.inventory_service import (
    InventoryService,
    SupplierService,
    PurchaseOrderService,
)
from shared.utils.admin_schemas import (
    StockItemOutput,
    StockItemCreate,
    StockItemUpdate,
    StockMovementOutput,
    StockMovementCreate,
    StockAlertOutput,
    SupplierOutput,
    SupplierCreate,
    SupplierUpdate,
    PurchaseOrderOutput,
    PurchaseOrderCreate,
    PurchaseOrderReceive,
    WasteLogOutput,
    WasteLogCreate,
    RecipeCostOutput,
    FoodCostReportItem,
)
from shared.infrastructure.db import safe_commit
from shared.config.logging import rest_api_logger as logger


router = APIRouter(tags=["admin-inventory"])


# =============================================================================
# Stock Items
# =============================================================================


@router.get("/inventory/stock", response_model=list[StockItemOutput])
def list_stock(
    branch_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> list[StockItemOutput]:
    """List stock items for a branch."""
    if not is_admin(user):
        validate_branch_access(user, branch_id)

    service = InventoryService(db)
    return service.list_by_branch(user["tenant_id"], branch_id)


@router.get("/inventory/stock/{stock_id}", response_model=StockItemOutput)
def get_stock_item(
    stock_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> StockItemOutput:
    """Get stock item detail."""
    service = InventoryService(db)
    return service.get_by_id(stock_id, user["tenant_id"])


@router.post("/inventory/stock", response_model=StockItemOutput, status_code=201)
def create_stock_item(
    body: StockItemCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> StockItemOutput:
    """Create a new stock item."""
    if not is_admin(user):
        validate_branch_access(user, body.branch_id)

    service = InventoryService(db)
    return service.create(
        data=body.model_dump(),
        tenant_id=user["tenant_id"],
        user_id=get_user_id(user),
        user_email=get_user_email(user),
    )


@router.patch("/inventory/stock/{stock_id}", response_model=StockItemOutput)
def update_stock_item(
    stock_id: int,
    body: StockItemUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> StockItemOutput:
    """Update stock item (min_level, cost, location, etc.)."""
    service = InventoryService(db)
    data = body.model_dump(exclude_unset=True)
    return service.update(
        entity_id=stock_id,
        data=data,
        tenant_id=user["tenant_id"],
        user_id=get_user_id(user),
        user_email=get_user_email(user),
    )


# =============================================================================
# Stock Movements
# =============================================================================


@router.get("/inventory/stock/{stock_id}/movements", response_model=list[StockMovementOutput])
def list_movements(
    stock_id: int,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> list[StockMovementOutput]:
    """List movements for a stock item."""
    movements = (
        db.execute(
            select(StockMovement)
            .where(
                StockMovement.stock_item_id == stock_id,
                StockMovement.tenant_id == user["tenant_id"],
                StockMovement.is_active.is_(True),
            )
            .order_by(StockMovement.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        .scalars()
        .all()
    )
    return [StockMovementOutput.model_validate(m) for m in movements]


@router.post("/inventory/movements", response_model=StockMovementOutput, status_code=201)
def create_movement(
    body: StockMovementCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> StockMovementOutput:
    """Record a manual stock adjustment."""
    valid_types = {"ADJUSTMENT", "WASTE", "TRANSFER", "PURCHASE"}
    if body.movement_type not in valid_types:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tipo de movimiento invalido. Opciones: {', '.join(valid_types)}",
        )

    service = InventoryService(db)
    movement = service.record_movement(
        stock_item_id=body.stock_item_id,
        tenant_id=user["tenant_id"],
        qty_change=body.qty_change,
        movement_type=body.movement_type,
        reason=body.reason,
        user_id=get_user_id(user),
    )
    return StockMovementOutput.model_validate(movement)


# =============================================================================
# Alerts
# =============================================================================


@router.get("/inventory/alerts", response_model=list[StockAlertOutput])
def list_alerts(
    branch_id: int,
    status_filter: str = "ACTIVE",
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> list[StockAlertOutput]:
    """List stock alerts for a branch."""
    if not is_admin(user):
        validate_branch_access(user, branch_id)

    query = (
        select(StockAlert)
        .where(
            StockAlert.branch_id == branch_id,
            StockAlert.tenant_id == user["tenant_id"],
            StockAlert.is_active.is_(True),
        )
    )
    if status_filter:
        query = query.where(StockAlert.status == status_filter)

    alerts = db.execute(query.order_by(StockAlert.created_at.desc())).scalars().all()
    return [StockAlertOutput.model_validate(a) for a in alerts]


@router.patch("/inventory/alerts/{alert_id}/acknowledge", response_model=StockAlertOutput)
def acknowledge_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> StockAlertOutput:
    """Acknowledge a stock alert."""
    alert = db.scalar(
        select(StockAlert).where(
            StockAlert.id == alert_id,
            StockAlert.tenant_id == user["tenant_id"],
            StockAlert.is_active.is_(True),
        )
    )
    if not alert:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alerta no encontrada")

    alert.status = "ACKNOWLEDGED"
    alert.acknowledged_by_id = get_user_id(user)
    alert.acknowledged_at = datetime.now(timezone.utc)
    safe_commit(db)
    db.refresh(alert)
    return StockAlertOutput.model_validate(alert)


@router.post("/inventory/alerts/check", response_model=list[StockAlertOutput])
def check_alerts(
    branch_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> list[StockAlertOutput]:
    """Run alert check for all stock items in a branch."""
    if not is_admin(user):
        validate_branch_access(user, branch_id)

    service = InventoryService(db)
    alerts = service.check_alerts(branch_id, user["tenant_id"])
    return [StockAlertOutput.model_validate(a) for a in alerts]


# =============================================================================
# Food Cost
# =============================================================================


@router.get("/inventory/food-cost", response_model=list[FoodCostReportItem])
def food_cost_report(
    branch_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> list[FoodCostReportItem]:
    """Get food cost report for a branch."""
    if not is_admin(user):
        validate_branch_access(user, branch_id)

    service = InventoryService(db)
    report = service.get_food_cost_report(branch_id, user["tenant_id"])
    return [FoodCostReportItem(**item) for item in report]


@router.post("/inventory/food-cost/calculate", response_model=list[RecipeCostOutput])
def calculate_food_costs(
    branch_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> list[RecipeCostOutput]:
    """Recalculate food costs for all recipes in a branch."""
    if not is_admin(user):
        validate_branch_access(user, branch_id)

    from rest_api.models.recipe import Recipe

    recipes = db.execute(
        select(Recipe).where(
            Recipe.branch_id == branch_id,
            Recipe.tenant_id == user["tenant_id"],
            Recipe.is_active.is_(True),
        )
    ).scalars().all()

    service = InventoryService(db)
    results = []
    for recipe in recipes:
        cost = service.calculate_recipe_cost(recipe.id, user["tenant_id"])
        if cost:
            results.append(RecipeCostOutput.model_validate(cost))

    return results


# =============================================================================
# Waste
# =============================================================================


@router.post("/inventory/waste", response_model=WasteLogOutput, status_code=201)
def log_waste(
    body: WasteLogCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> WasteLogOutput:
    """Log wasted/spoiled ingredients."""
    service = InventoryService(db)
    waste = service.log_waste(
        stock_item_id=body.stock_item_id,
        qty=body.qty,
        reason=body.reason,
        tenant_id=user["tenant_id"],
        user_id=get_user_id(user),
    )
    return WasteLogOutput.model_validate(waste)


@router.get("/inventory/waste", response_model=list[WasteLogOutput])
def list_waste(
    branch_id: int,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> list[WasteLogOutput]:
    """List waste log entries for a branch."""
    if not is_admin(user):
        validate_branch_access(user, branch_id)

    waste_logs = (
        db.execute(
            select(WasteLog)
            .where(
                WasteLog.branch_id == branch_id,
                WasteLog.tenant_id == user["tenant_id"],
                WasteLog.is_active.is_(True),
            )
            .order_by(WasteLog.logged_at.desc())
            .limit(limit)
            .offset(offset)
        )
        .scalars()
        .all()
    )
    return [WasteLogOutput.model_validate(w) for w in waste_logs]


# =============================================================================
# Suppliers
# =============================================================================


@router.get("/suppliers", response_model=list[SupplierOutput])
def list_suppliers(
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> list[SupplierOutput]:
    """List all suppliers for the tenant."""
    service = SupplierService(db)
    return service.list_all(user["tenant_id"])


@router.get("/suppliers/{supplier_id}", response_model=SupplierOutput)
def get_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> SupplierOutput:
    """Get supplier details."""
    service = SupplierService(db)
    return service.get_by_id(supplier_id, user["tenant_id"])


@router.post("/suppliers", response_model=SupplierOutput, status_code=201)
def create_supplier(
    body: SupplierCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> SupplierOutput:
    """Create a new supplier."""
    service = SupplierService(db)
    return service.create(
        data=body.model_dump(),
        tenant_id=user["tenant_id"],
        user_id=get_user_id(user),
        user_email=get_user_email(user),
    )


@router.patch("/suppliers/{supplier_id}", response_model=SupplierOutput)
def update_supplier(
    supplier_id: int,
    body: SupplierUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> SupplierOutput:
    """Update supplier info."""
    service = SupplierService(db)
    return service.update(
        entity_id=supplier_id,
        data=body.model_dump(exclude_unset=True),
        tenant_id=user["tenant_id"],
        user_id=get_user_id(user),
        user_email=get_user_email(user),
    )


@router.delete("/suppliers/{supplier_id}", status_code=204)
def delete_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> None:
    """Soft-delete a supplier."""
    service = SupplierService(db)
    service.delete(
        entity_id=supplier_id,
        tenant_id=user["tenant_id"],
        user_id=get_user_id(user),
        user_email=get_user_email(user),
    )


# =============================================================================
# Purchase Orders
# =============================================================================


@router.get("/purchase-orders", response_model=list[PurchaseOrderOutput])
def list_purchase_orders(
    branch_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> list[PurchaseOrderOutput]:
    """List purchase orders for a branch."""
    if not is_admin(user):
        validate_branch_access(user, branch_id)

    service = PurchaseOrderService(db)
    return service.list_by_branch(user["tenant_id"], branch_id)


@router.get("/purchase-orders/{po_id}", response_model=PurchaseOrderOutput)
def get_purchase_order(
    po_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> PurchaseOrderOutput:
    """Get purchase order details with items."""
    service = PurchaseOrderService(db)
    return service.get_by_id(po_id, user["tenant_id"], options=[selectinload(PurchaseOrder.items)])


@router.post("/purchase-orders", response_model=PurchaseOrderOutput, status_code=201)
def create_purchase_order(
    body: PurchaseOrderCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> PurchaseOrderOutput:
    """Create a new purchase order with line items."""
    if not is_admin(user):
        validate_branch_access(user, body.branch_id)

    service = PurchaseOrderService(db)
    items_data = [item.model_dump() for item in body.items]
    return service.create_with_items(
        data=body.model_dump(exclude={"items"}),
        items_data=items_data,
        tenant_id=user["tenant_id"],
        user_id=get_user_id(user),
        user_email=get_user_email(user),
    )


@router.post("/purchase-orders/{po_id}/receive", response_model=PurchaseOrderOutput)
def receive_purchase_order(
    po_id: int,
    body: PurchaseOrderReceive,
    db: Session = Depends(get_db),
    user: dict = Depends(require_admin_or_manager),
) -> PurchaseOrderOutput:
    """Mark PO items as received and update stock levels."""
    service = PurchaseOrderService(db)
    return service.receive_items(
        po_id=po_id,
        tenant_id=user["tenant_id"],
        receive_data=body.items,
        received_date=body.received_date,
        user_id=get_user_id(user),
        user_email=get_user_email(user),
    )
