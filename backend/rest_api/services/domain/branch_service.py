"""
Branch Service - Clean Architecture Implementation.
"""

from __future__ import annotations

from typing import Any, TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.orm import Session

from rest_api.models import Branch
from shared.utils.admin_schemas import BranchOutput
from shared.utils.exceptions import DuplicateEntityError
from rest_api.services.base_service import BaseCRUDService
from rest_api.services.events import publish_entity_deleted

if TYPE_CHECKING:
    from fastapi import BackgroundTasks


class BranchService(BaseCRUDService[Branch, BranchOutput]):
    """Service for branch management."""

    def __init__(self, db: Session):
        super().__init__(
            db=db,
            model=Branch,
            output_schema=BranchOutput,
            entity_name="Sucursal",
            has_branch_id=False,  # Branches don't have branch_id
        )

    def get_by_slug(self, tenant_id: int, slug: str) -> BranchOutput | None:
        """Get branch by slug."""
        entities = self._repo.find_all(tenant_id)
        for entity in entities:
            if entity.slug == slug:
                return self.to_output(entity)
        return None

    # =========================================================================
    # Validation Hooks
    # =========================================================================

    def _validate_create(self, data: dict[str, Any], tenant_id: int) -> None:
        """Ensure slug is unique within the tenant (active branches only)."""
        slug = data.get("slug")
        if slug:
            self._ensure_slug_unique(tenant_id, slug, exclude_id=None)

    def _validate_update(
        self,
        entity: Branch,
        data: dict[str, Any],
        tenant_id: int,
    ) -> None:
        """Ensure slug remains unique within the tenant on rename."""
        new_slug = data.get("slug")
        if new_slug and new_slug != entity.slug:
            self._ensure_slug_unique(tenant_id, new_slug, exclude_id=entity.id)

    # =========================================================================
    # Internal helpers
    # =========================================================================

    def _ensure_slug_unique(
        self,
        tenant_id: int,
        slug: str,
        *,
        exclude_id: int | None,
    ) -> None:
        """
        Raise DuplicateEntityError if another active branch in the same tenant
        already uses ``slug``.

        Slug uniqueness is scoped per-tenant (multiple tenants may reuse the
        same branch slug). Soft-deleted branches do not block reuse.
        """
        stmt = select(Branch.id).where(
            Branch.tenant_id == tenant_id,
            Branch.slug == slug,
            Branch.is_active.is_(True),
        )
        if exclude_id is not None:
            stmt = stmt.where(Branch.id != exclude_id)

        if self._db.execute(stmt).first() is not None:
            # NOTE: DuplicateEntityError builds its own detail from (entity, identifier).
            # The resulting Spanish message is:
            #   "Sucursal con identificador '<slug>' ya existe"
            # which conveys the same intent as the spec text
            # ("Ya existe una sucursal con ese slug en este restaurante").
            raise DuplicateEntityError(
                "Sucursal",
                identifier=slug,
                tenant_id=tenant_id,
            )

    def _after_delete(
        self,
        entity_info: dict[str, Any],
        user_id: int,
        user_email: str,
        *,
        background_tasks: "BackgroundTasks | None" = None,
    ) -> None:
        """Publish deletion event."""
        publish_entity_deleted(
            tenant_id=entity_info["tenant_id"],
            entity_type="branch",
            entity_id=entity_info["id"],
            entity_name=entity_info.get("name"),
            branch_id=entity_info["id"],  # Branch is its own branch
            actor_user_id=user_id,
            background_tasks=background_tasks,
        )
