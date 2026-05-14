"""
Reports endpoints for sales analytics and statistics.
"""

from datetime import datetime, timedelta, timezone
from fastapi import APIRouter

from rest_api.routers.admin._base import (
    Depends, HTTPException, Session, select, func,
    get_db, current_user, Round, RoundItem, Product, Table, TableSession,
    Payment, User, UserBranchRole,
)
from rest_api.models import Tip, ServiceCall
from shared.utils.admin_schemas import (
    ReportsSummaryOutput, DailySalesOutput, TopProductOutput, HourlyOrdersOutput,
    WaiterPerformanceOutput,
)


router = APIRouter(tags=["admin-reports"])


@router.get("/reports/summary", response_model=ReportsSummaryOutput)
def get_reports_summary(
    branch_id: int | None = None,
    days: int = 30,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
) -> ReportsSummaryOutput:
    """Get summary statistics for reports."""
    # Get user's branches
    user_branch_ids = user.get("branch_ids", [])
    if branch_id and branch_id not in user_branch_ids:
        raise HTTPException(status_code=403, detail="No access to this branch")
    branch_ids = [branch_id] if branch_id else user_branch_ids

    # Date range
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=days)

    # Get total revenue from paid payments
    total_revenue = db.scalar(
        select(func.sum(Payment.amount_cents))
        .where(
            Payment.branch_id.in_(branch_ids),
            Payment.status == "APPROVED",
            Payment.created_at >= start_date,
        )
    ) or 0

    # Get total orders (rounds with status != DRAFT, CANCELED)
    total_orders = db.scalar(
        select(func.count(Round.id))
        .where(
            Round.branch_id.in_(branch_ids),
            Round.status.in_(["SUBMITTED", "IN_KITCHEN", "READY", "SERVED"]),
            Round.submitted_at >= start_date,
        )
    ) or 0

    # Calculate average order value
    avg_order = total_revenue // total_orders if total_orders > 0 else 0

    # Get total sessions
    total_sessions = db.scalar(
        select(func.count(TableSession.id))
        .join(Table, TableSession.table_id == Table.id)
        .where(
            Table.branch_id.in_(branch_ids),
            TableSession.opened_at >= start_date,
        )
    ) or 0

    # Get busiest hour (most orders)
    busiest_hour = db.scalar(
        select(func.extract("hour", Round.submitted_at))
        .where(
            Round.branch_id.in_(branch_ids),
            Round.submitted_at >= start_date,
            Round.submitted_at.isnot(None),
        )
        .group_by(func.extract("hour", Round.submitted_at))
        .order_by(func.count().desc())
        .limit(1)
    )

    return ReportsSummaryOutput(
        total_revenue_cents=total_revenue,
        total_orders=total_orders,
        avg_order_value_cents=avg_order,
        total_sessions=total_sessions,
        busiest_hour=int(busiest_hour) if busiest_hour is not None else None,
    )


@router.get("/reports/daily-sales", response_model=list[DailySalesOutput])
def get_daily_sales(
    branch_id: int | None = None,
    days: int = 30,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
) -> list[DailySalesOutput]:
    """Get daily sales breakdown."""
    # Get user's branches
    user_branch_ids = user.get("branch_ids", [])
    if branch_id and branch_id not in user_branch_ids:
        raise HTTPException(status_code=403, detail="No access to this branch")
    branch_ids = [branch_id] if branch_id else user_branch_ids

    # Date range
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=days)

    # Get daily totals
    daily_stats = db.execute(
        select(
            func.date(Payment.created_at).label("date"),
            func.sum(Payment.amount_cents).label("total"),
            func.count(Payment.id).label("count"),
        )
        .where(
            Payment.branch_id.in_(branch_ids),
            Payment.status == "APPROVED",
            Payment.created_at >= start_date,
        )
        .group_by(func.date(Payment.created_at))
        .order_by(func.date(Payment.created_at))
    ).all()

    return [
        DailySalesOutput(
            date=str(row.date),
            total_sales_cents=row.total or 0,
            order_count=row.count or 0,
            avg_order_cents=(row.total // row.count) if row.count > 0 else 0,
        )
        for row in daily_stats
    ]


@router.get("/reports/top-products", response_model=list[TopProductOutput])
def get_top_products(
    branch_id: int | None = None,
    days: int = 30,
    limit: int = 10,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
) -> list[TopProductOutput]:
    """Get top selling products."""
    # Get user's branches
    user_branch_ids = user.get("branch_ids", [])
    if branch_id and branch_id not in user_branch_ids:
        raise HTTPException(status_code=403, detail="No access to this branch")
    branch_ids = [branch_id] if branch_id else user_branch_ids

    # Date range
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=days)

    # Get top products by quantity sold
    top_products = db.execute(
        select(
            RoundItem.product_id,
            Product.name.label("product_name"),
            func.sum(RoundItem.qty).label("quantity"),
            func.sum(RoundItem.qty * RoundItem.unit_price_cents).label("revenue"),
        )
        .join(Round, RoundItem.round_id == Round.id)
        .join(Product, RoundItem.product_id == Product.id)
        .where(
            Round.branch_id.in_(branch_ids),
            Round.status.in_(["SUBMITTED", "IN_KITCHEN", "READY", "SERVED"]),
            Round.submitted_at >= start_date,
        )
        .group_by(RoundItem.product_id, Product.name)
        .order_by(func.sum(RoundItem.qty).desc())
        .limit(limit)
    ).all()

    return [
        TopProductOutput(
            product_id=row.product_id,
            product_name=row.product_name,
            quantity_sold=row.quantity or 0,
            total_revenue_cents=row.revenue or 0,
        )
        for row in top_products
    ]


@router.get("/reports/orders-by-hour", response_model=list[HourlyOrdersOutput])
def get_orders_by_hour(
    branch_id: int | None = None,
    days: int = 30,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
) -> list[HourlyOrdersOutput]:
    """Get order distribution by hour of day."""
    user_branch_ids = user.get("branch_ids", [])
    if branch_id and branch_id not in user_branch_ids:
        raise HTTPException(status_code=403, detail="No access to this branch")
    branch_ids = [branch_id] if branch_id else user_branch_ids

    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=days)

    hourly_stats = db.execute(
        select(
            func.extract("hour", Round.submitted_at).label("hour"),
            func.count(Round.id).label("count"),
        )
        .where(
            Round.branch_id.in_(branch_ids),
            Round.status.in_(["SUBMITTED", "IN_KITCHEN", "READY", "SERVED"]),
            Round.submitted_at >= start_date,
            Round.submitted_at.isnot(None),
        )
        .group_by(func.extract("hour", Round.submitted_at))
        .order_by(func.extract("hour", Round.submitted_at))
    ).all()

    return [
        HourlyOrdersOutput(
            hour=int(row.hour),
            order_count=row.count or 0,
        )
        for row in hourly_stats
    ]


@router.get("/reports/waiter-performance", response_model=list[WaiterPerformanceOutput])
def get_waiter_performance(
    branch_id: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    days: int = 30,
    db: Session = Depends(get_db),
    user: dict = Depends(current_user),
) -> list[WaiterPerformanceOutput]:
    """
    Get per-waiter performance analytics.

    Aggregates tables served, rounds processed, revenue, tips,
    service time, and service call response times.
    """
    user_branch_ids = user.get("branch_ids", [])
    if branch_id and branch_id not in user_branch_ids:
        raise HTTPException(status_code=403, detail="No access to this branch")
    branch_ids = [branch_id] if branch_id else user_branch_ids
    tenant_id = user["tenant_id"]

    # Date range
    if date_from:
        start_date = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
    else:
        start_date = datetime.now(timezone.utc) - timedelta(days=days)

    if date_to:
        end_date = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc)
    else:
        end_date = datetime.now(timezone.utc)

    # Get all waiters for the requested branches
    waiter_rows = db.execute(
        select(User.id, User.first_name, User.last_name)
        .join(UserBranchRole, User.id == UserBranchRole.user_id)
        .where(
            UserBranchRole.role == "WAITER",
            UserBranchRole.branch_id.in_(branch_ids),
            UserBranchRole.tenant_id == tenant_id,
            User.is_active.is_(True),
        )
        .distinct()
    ).all()

    results: list[WaiterPerformanceOutput] = []

    for waiter_id, first_name, last_name in waiter_rows:
        waiter_name = f"{first_name or ''} {last_name or ''}".strip() or f"User #{waiter_id}"

        # Tables served (sessions where this waiter was assigned)
        total_tables = db.scalar(
            select(func.count(TableSession.id))
            .where(
                TableSession.assigned_waiter_id == waiter_id,
                TableSession.branch_id.in_(branch_ids),
                TableSession.opened_at >= start_date,
                TableSession.opened_at <= end_date,
            )
        ) or 0

        # Rounds processed (confirmed or submitted by this waiter)
        total_rounds = db.scalar(
            select(func.count(Round.id))
            .where(
                Round.branch_id.in_(branch_ids),
                Round.submitted_at >= start_date,
                Round.submitted_at <= end_date,
                Round.status.in_(["SUBMITTED", "IN_KITCHEN", "READY", "SERVED"]),
                (Round.confirmed_by_user_id == waiter_id)
                | (Round.submitted_by_waiter_id == waiter_id),
            )
        ) or 0

        # Revenue from rounds handled by this waiter
        total_revenue = db.scalar(
            select(func.sum(RoundItem.unit_price_cents * RoundItem.qty))
            .join(Round, RoundItem.round_id == Round.id)
            .where(
                Round.branch_id.in_(branch_ids),
                Round.submitted_at >= start_date,
                Round.submitted_at <= end_date,
                Round.status.in_(["SUBMITTED", "IN_KITCHEN", "READY", "SERVED"]),
                (Round.confirmed_by_user_id == waiter_id)
                | (Round.submitted_by_waiter_id == waiter_id),
            )
        ) or 0

        # Tips for this waiter
        total_tips = db.scalar(
            select(func.sum(Tip.amount_cents))
            .where(
                Tip.waiter_id == waiter_id,
                Tip.branch_id.in_(branch_ids),
                Tip.created_at >= start_date,
                Tip.created_at <= end_date,
                Tip.is_active.is_(True),
            )
        ) or 0

        # Avg service time (minutes) from session open to close
        avg_service_time_result = db.execute(
            select(
                func.avg(
                    func.extract("epoch", TableSession.closed_at)
                    - func.extract("epoch", TableSession.opened_at)
                )
            )
            .where(
                TableSession.assigned_waiter_id == waiter_id,
                TableSession.branch_id.in_(branch_ids),
                TableSession.opened_at >= start_date,
                TableSession.opened_at <= end_date,
                TableSession.closed_at.isnot(None),
            )
        ).scalar()
        avg_service_minutes = round((avg_service_time_result or 0) / 60, 1)

        # Service calls acknowledged by this waiter
        total_service_calls = db.scalar(
            select(func.count(ServiceCall.id))
            .where(
                ServiceCall.acked_by_user_id == waiter_id,
                ServiceCall.branch_id.in_(branch_ids),
                ServiceCall.created_at >= start_date,
                ServiceCall.created_at <= end_date,
            )
        ) or 0

        # Avg response time (seconds) for service calls
        avg_response_result = db.execute(
            select(
                func.avg(
                    func.extract("epoch", ServiceCall.acked_at)
                    - func.extract("epoch", ServiceCall.created_at)
                )
            )
            .where(
                ServiceCall.acked_by_user_id == waiter_id,
                ServiceCall.branch_id.in_(branch_ids),
                ServiceCall.created_at >= start_date,
                ServiceCall.created_at <= end_date,
                ServiceCall.acked_at.isnot(None),
            )
        ).scalar()
        avg_response_seconds = round(avg_response_result or 0, 1)

        results.append(
            WaiterPerformanceOutput(
                user_id=waiter_id,
                user_name=waiter_name,
                total_tables_served=total_tables,
                total_rounds_processed=total_rounds,
                total_revenue_cents=total_revenue,
                total_tips_cents=total_tips,
                avg_service_time_minutes=avg_service_minutes,
                total_service_calls=total_service_calls,
                avg_response_time_seconds=avg_response_seconds,
            )
        )

    # Sort by revenue descending
    results.sort(key=lambda w: w.total_revenue_cents, reverse=True)
    return results
