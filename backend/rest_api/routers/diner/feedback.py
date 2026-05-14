"""
Diner — customer feedback feature router.

Endpoints:
    POST   /feedback

C8 PASS 6 REFACTOR: Split out of `orders.py` to keep modules <500 LoC.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from rest_api.routers.diner._schemas import FeedbackRequest, FeedbackResponse
from shared.infrastructure.db import get_db
from shared.security.auth import current_table_context


router = APIRouter(tags=["diner"])


@router.post("/feedback", response_model=FeedbackResponse)
def submit_feedback(
    body: FeedbackRequest,
    db: Session = Depends(get_db),
    table_ctx: dict = Depends(current_table_context),
) -> FeedbackResponse:
    """
    Submit customer feedback after dining.
    Requires table token authentication.
    Only one feedback per session is allowed.
    """
    from rest_api.models.feedback import Feedback

    session_id = table_ctx["session_id"]
    branch_id = table_ctx["branch_id"]
    tenant_id = table_ctx["tenant_id"]

    # Check if feedback already submitted for this session
    existing = db.scalar(
        select(Feedback).where(
            Feedback.session_id == session_id,
            Feedback.tenant_id == tenant_id,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Feedback already submitted for this session",
        )

    feedback = Feedback(
        tenant_id=tenant_id,
        branch_id=branch_id,
        session_id=session_id,
        rating=body.rating,
        comment=body.comment,
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)

    return FeedbackResponse(
        id=feedback.id,
        rating=feedback.rating,
        comment=feedback.comment,
        created_at=feedback.created_at.isoformat(),
    )


__all__ = ["router"]
