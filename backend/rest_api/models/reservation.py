"""Reservation model for table booking."""
from datetime import date, time
from typing import Optional

from sqlalchemy import BigInteger, Integer, Text, Date, Time, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, AuditMixin, BigIntPK


class Reservation(AuditMixin, Base):
    """Table reservation for a future date/time."""
    __tablename__ = "reservation"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenant.id"), index=True)
    branch_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("branch.id"), index=True)

    # Reservation details
    customer_name: Mapped[str] = mapped_column(Text)
    customer_phone: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    customer_email: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    party_size: Mapped[int] = mapped_column(Integer)

    # Schedule
    reservation_date: Mapped[date] = mapped_column(Date, index=True)
    reservation_time: Mapped[time] = mapped_column(Time)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=90)

    # Assignment
    table_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("restaurant_table.id"), nullable=True
    )

    # Status: PENDING, CONFIRMED, SEATED, COMPLETED, CANCELED, NO_SHOW
    status: Mapped[str] = mapped_column(Text, default="PENDING", index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_reservation_branch_date", "branch_id", "reservation_date"),
    )
