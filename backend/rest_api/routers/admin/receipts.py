"""
Receipt/Ticket endpoints for printing kitchen tickets, customer receipts, and daily reports.

All endpoints return text/html content for browser printing or future ESC/POS integration.
"""

from datetime import date

from fastapi import APIRouter, Response

from rest_api.routers.admin._base import (
    Depends,
    HTTPException,
    Session,
    get_db,
    current_user,
    require_any_staff,
    validate_branch_access,
)
from rest_api.services.domain.receipt_service import ReceiptService
from shared.utils.exceptions import NotFoundError

router = APIRouter(tags=["admin-receipts"])


@router.get("/receipts/kitchen-ticket/{round_id}")
def get_kitchen_ticket(
    round_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_any_staff),
) -> Response:
    """Get kitchen ticket HTML for a round. Suitable for thermal printer output."""
    try:
        service = ReceiptService(db)
        html = service.generate_kitchen_ticket(round_id)
        return Response(content=html, media_type="text/html")
    except NotFoundError:
        raise HTTPException(status_code=404, detail=f"Round {round_id} not found")


@router.get("/receipts/customer-receipt/{check_id}")
def get_customer_receipt(
    check_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_any_staff),
) -> Response:
    """Get customer receipt HTML for a check. Includes items, payments, and fiscal info."""
    try:
        service = ReceiptService(db)
        html = service.generate_customer_receipt(check_id)
        return Response(content=html, media_type="text/html")
    except NotFoundError:
        raise HTTPException(status_code=404, detail=f"Check {check_id} not found")


@router.get("/receipts/daily-report/{branch_id}")
def get_daily_report(
    branch_id: int,
    report_date: date | None = None,
    db: Session = Depends(get_db),
    user: dict = Depends(require_any_staff),
) -> Response:
    """
    Get daily closing report HTML for a branch.

    Query params:
        report_date: Date in YYYY-MM-DD format. Defaults to today.
    """
    validate_branch_access(user, branch_id)

    try:
        service = ReceiptService(db)
        html = service.generate_closing_report(branch_id, report_date)
        return Response(content=html, media_type="text/html")
    except NotFoundError:
        raise HTTPException(status_code=404, detail=f"Branch {branch_id} not found")
