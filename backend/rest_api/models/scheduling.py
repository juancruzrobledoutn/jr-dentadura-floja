"""Employee scheduling and attendance tracking."""
from __future__ import annotations

from datetime import date, time, datetime
from typing import Optional

from sqlalchemy import BigInteger, Float, Integer, Text, Date, Time, DateTime, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, AuditMixin, BigIntPK


class ShiftTemplate(AuditMixin, Base):
    """Reusable weekly shift template."""
    __tablename__ = "shift_template"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("branch.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)  # e.g. "Semana estándar"

    # Relationships
    items: Mapped[list["ShiftTemplateItem"]] = relationship(
        back_populates="template", cascade="all, delete-orphan"
    )


class ShiftTemplateItem(AuditMixin, Base):
    """Single day/time slot in a template."""
    __tablename__ = "shift_template_item"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    template_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("shift_template.id"), nullable=False, index=True
    )
    # 0=Monday, 6=Sunday
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    # Role: WAITER, KITCHEN, MANAGER
    role: Mapped[str] = mapped_column(Text, nullable=False)
    # Minimum staff needed for this slot
    min_staff: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Relationships
    template: Mapped["ShiftTemplate"] = relationship(back_populates="items")


class Shift(AuditMixin, Base):
    """A scheduled shift for an employee."""
    __tablename__ = "shift"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("branch.id"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("app_user.id"), nullable=False, index=True
    )

    shift_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    # Role: WAITER, KITCHEN, MANAGER
    role: Mapped[str] = mapped_column(Text, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Status: SCHEDULED, CONFIRMED, IN_PROGRESS, COMPLETED, ABSENT
    status: Mapped[str] = mapped_column(Text, default="SCHEDULED", nullable=False)

    __table_args__ = (
        Index("ix_shift_branch_date", "branch_id", "shift_date"),
        Index("ix_shift_user_date", "user_id", "shift_date"),
    )


class AttendanceLog(AuditMixin, Base):
    """Actual clock-in/clock-out record."""
    __tablename__ = "attendance_log"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("branch.id"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("app_user.id"), nullable=False, index=True
    )
    # FK to shift (optional — attendance may not correspond to a scheduled shift)
    shift_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("shift.id"), nullable=True
    )

    clock_in: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    clock_out: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Calculated on clock-out
    hours_worked: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # Hours beyond 8h standard shift
    overtime_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Status: CLOCKED_IN, CLOCKED_OUT, ADJUSTED
    status: Mapped[str] = mapped_column(Text, default="CLOCKED_IN", nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_attendance_branch_date", "branch_id", "clock_in"),
        Index("ix_attendance_user", "user_id", "clock_in"),
    )
