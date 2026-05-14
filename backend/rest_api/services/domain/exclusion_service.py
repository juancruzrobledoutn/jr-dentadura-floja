"""
Exclusion Service - Branch-level category / subcategory exclusions.

CLEAN-ARCH: Encapsulates the PUT replace-all semantics for
BranchCategoryExclusion and BranchSubcategoryExclusion, guaranteeing
atomicity. Previously the router executed two phases inline
(soft-delete existing + bulk-create new) with a single commit at the
end; this service preserves that contract behind a typed API.

Atomicity model:
- Soft-delete the existing rows in-memory: we call
  `entity.soft_delete(...)` (model method) directly, NOT the
  `crud.soft_delete.soft_delete()` helper — the helper commits per-row,
  which would break atomicity.
- Stage new rows via `db.add(...)`.
- Single `safe_commit()` at the end: rollback + raise on any failure.
- Pre-validation (branch IDs belong to tenant) happens BEFORE any
  mutation, so a ValidationError leaves the session pristine.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from rest_api.models import (
    Branch,
    BranchCategoryExclusion,
    BranchSubcategoryExclusion,
    Category,
    Subcategory,
)
from rest_api.services.crud.soft_delete import set_created_by
from shared.config.logging import get_logger
from shared.infrastructure.db import safe_commit
from shared.utils.exceptions import (
    DatabaseError,
    NotFoundError,
    ValidationError,
)

logger = get_logger(__name__)


# Entity type discriminator
ENTITY_CATEGORY = "category"
ENTITY_SUBCATEGORY = "subcategory"

# Map from entity_type -> (parent model, exclusion model, fk attr name)
_ENTITY_CONFIG = {
    ENTITY_CATEGORY: {
        "parent_model": Category,
        "exclusion_model": BranchCategoryExclusion,
        "fk_attr": "category_id",
        "label": "Category",
    },
    ENTITY_SUBCATEGORY: {
        "parent_model": Subcategory,
        "exclusion_model": BranchSubcategoryExclusion,
        "fk_attr": "subcategory_id",
        "label": "Subcategory",
    },
}


class ExclusionService:
    """
    Service for branch-level exclusion management (category & subcategory).

    Provides an atomic replace-all operation: soft-delete current
    exclusions for the parent entity, then create new ones for the
    requested branch IDs — all in a single transaction.
    """

    def __init__(self, db: Session):
        self._db = db

    # =========================================================================
    # Public API
    # =========================================================================

    def replace_for_entity(
        self,
        *,
        entity_type: str,
        entity_id: int,
        branch_ids: list[int],
        tenant_id: int,
        user_id: int,
        user_email: str,
    ) -> list[Any]:
        """
        Replace all exclusions for a category or subcategory atomically.

        Steps (single transaction):
            1. Verify parent entity exists in tenant.
            2. Verify each branch_id belongs to tenant.
            3. Soft-delete existing exclusions for this entity.
            4. Create new exclusions for the requested branch IDs.
            5. Commit (or rollback on any error).

        Args:
            entity_type: "category" or "subcategory".
            entity_id: ID of the Category / Subcategory.
            branch_ids: New set of branches to exclude from.
                Empty list means "remove all exclusions".
            tenant_id: Tenant for isolation.
            user_id: Acting user ID (audit).
            user_email: Acting user email (audit).

        Returns:
            list of newly created exclusion entities (refreshed).

        Raises:
            ValidationError: invalid entity_type or unknown branch IDs.
            NotFoundError: parent entity not found in tenant.
            DatabaseError: commit failure (rolled back).
        """
        cfg = _ENTITY_CONFIG.get(entity_type)
        if cfg is None:
            raise ValidationError(
                f"entity_type inválido: '{entity_type}'. Esperado: category | subcategory",
                field="entity_type",
            )

        parent_model = cfg["parent_model"]
        exclusion_model = cfg["exclusion_model"]
        fk_attr = cfg["fk_attr"]
        label = cfg["label"]

        # --- 1. Parent entity exists ----------------------------------------
        parent = self._db.scalar(
            select(parent_model).where(
                parent_model.id == entity_id,
                parent_model.tenant_id == tenant_id,
                parent_model.is_active.is_(True),
            )
        )
        if not parent:
            raise NotFoundError(label, entity_id, tenant_id=tenant_id)

        # --- 2. Validate branch IDs (fail fast before any mutation) ---------
        if branch_ids:
            valid_branches = self._db.execute(
                select(Branch).where(
                    Branch.id.in_(branch_ids),
                    Branch.tenant_id == tenant_id,
                )
            ).scalars().all()
            valid_branch_ids = {b.id for b in valid_branches}
            invalid_ids = set(branch_ids) - valid_branch_ids
            if invalid_ids:
                raise ValidationError(
                    f"Invalid branch IDs: {sorted(invalid_ids)}",
                    field="branch_ids",
                )

        # --- 3. Load existing exclusions ------------------------------------
        existing = self._db.execute(
            select(exclusion_model).where(
                getattr(exclusion_model, fk_attr) == entity_id,
                exclusion_model.tenant_id == tenant_id,
                exclusion_model.is_active.is_(True),
            )
        ).scalars().all()

        # --- 4. Stage soft-deletes IN-MEMORY (NOT crud.soft_delete helper) --
        # AuditMixin.soft_delete() mutates fields only — no commit, safe for
        # transactional batching. The helper in services/crud/soft_delete.py
        # commits per-row, which would break atomicity here.
        now = datetime.now(timezone.utc)  # noqa: F841  (kept for parity / future)
        for exc in existing:
            exc.soft_delete(user_id, user_email)

        # --- 5. Stage new exclusions ----------------------------------------
        new_exclusions: list[Any] = []
        for branch_id in branch_ids:
            new_exc = exclusion_model(
                tenant_id=tenant_id,
                branch_id=branch_id,
                **{fk_attr: entity_id},
            )
            set_created_by(new_exc, user_id, user_email)
            self._db.add(new_exc)
            new_exclusions.append(new_exc)

        # --- 6. Atomic commit (rollback on any error) -----------------------
        try:
            safe_commit(self._db)
        except Exception as e:
            logger.error(
                "Failed to replace exclusions",
                error=str(e),
                tenant_id=tenant_id,
                entity_type=entity_type,
                entity_id=entity_id,
                requested_branch_count=len(branch_ids),
            )
            raise DatabaseError(f"actualizar exclusiones de {label.lower()}")

        for exc in new_exclusions:
            self._db.refresh(exc)

        logger.info(
            "Exclusions replaced",
            extra={
                "tenant_id": tenant_id,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "removed": len(existing),
                "created": len(new_exclusions),
            },
        )

        return new_exclusions

    # =========================================================================
    # Convenience wrappers (preserve router call sites)
    # =========================================================================

    def replace_category_exclusions(
        self,
        *,
        category_id: int,
        branch_ids: list[int],
        tenant_id: int,
        user_id: int,
        user_email: str,
    ) -> list[BranchCategoryExclusion]:
        """Replace all branch exclusions for a category. Returns new exclusions."""
        return self.replace_for_entity(
            entity_type=ENTITY_CATEGORY,
            entity_id=category_id,
            branch_ids=branch_ids,
            tenant_id=tenant_id,
            user_id=user_id,
            user_email=user_email,
        )

    def replace_subcategory_exclusions(
        self,
        *,
        subcategory_id: int,
        branch_ids: list[int],
        tenant_id: int,
        user_id: int,
        user_email: str,
    ) -> list[BranchSubcategoryExclusion]:
        """Replace all branch exclusions for a subcategory. Returns new exclusions."""
        return self.replace_for_entity(
            entity_type=ENTITY_SUBCATEGORY,
            entity_id=subcategory_id,
            branch_ids=branch_ids,
            tenant_id=tenant_id,
            user_id=user_id,
            user_email=user_email,
        )
