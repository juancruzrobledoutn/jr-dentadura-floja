"""Floor plan models for visual table layout."""
from __future__ import annotations

from typing import Optional

from sqlalchemy import BigInteger, Boolean, Float, Integer, Text, String, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, AuditMixin, BigIntPK


class FloorPlan(AuditMixin, Base):
    """A floor plan layout for a branch."""
    __tablename__ = "floor_plan"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant.id"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("branch.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    width: Mapped[int] = mapped_column(Integer, default=800, nullable=False)
    height: Mapped[int] = mapped_column(Integer, default=600, nullable=False)
    background_image: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sector_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("branch_sector.id"), nullable=True
    )

    # Relationships
    tables: Mapped[list["FloorPlanTable"]] = relationship(
        back_populates="floor_plan", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_floor_plan_branch", "branch_id"),
        Index("ix_floor_plan_sector", "sector_id"),
    )


class FloorPlanTable(AuditMixin, Base):
    """Position of a table on a floor plan."""
    __tablename__ = "floor_plan_table"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    floor_plan_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("floor_plan.id"), nullable=False, index=True
    )
    table_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("restaurant_table.id"), nullable=False, index=True
    )
    x: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    y: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    width: Mapped[float] = mapped_column(Float, default=60, nullable=False)
    height: Mapped[float] = mapped_column(Float, default=60, nullable=False)
    rotation: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    shape: Mapped[str] = mapped_column(
        String(20), default="RECTANGLE", nullable=False
    )  # RECTANGLE, CIRCLE, SQUARE
    label: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    floor_plan: Mapped["FloorPlan"] = relationship(back_populates="tables")

    __table_args__ = (
        Index("ix_floor_plan_table_plan", "floor_plan_id"),
        Index("ix_floor_plan_table_table", "table_id"),
    )
