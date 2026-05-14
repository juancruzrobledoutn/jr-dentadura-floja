"""Add per-tenant uniqueness for Branch.slug.

Revision ID: 017_branch_slug_unique
Revises: 016_create_backup_codes_2fa
Create Date: 2026-05-14

Bug fix discovered in session #224 (audita14.md sec. 4, item #1):

`BranchService.create()` did not validate slug uniqueness within a tenant,
and `branch.slug` had no DB constraint. Two branches of the same tenant
could share a slug, breaking `/api/public/menu/{slug}` routing
(`first()` would return the alphabetically-first match).

Design decision — partial unique index vs full unique constraint:
We use a **partial unique index** scoped to `is_active = true`. Rationale:
- Branches are soft-deleted (`is_active = false`); a hard-deleted branch
  freeing its slug would otherwise require a hard delete in the future.
- A full constraint would forbid re-using a slug after soft-delete,
  which is too restrictive for a routing key.

Partial indexes are supported by PostgreSQL via `WHERE` and by SQLite via
`WHERE` as well. We declare the index with both `postgresql_where` and
`sqlite_where` so the index is correctly created on both dialects. The
authoritative target is Postgres (production); the SQLite hint keeps
local/dev migrations consistent.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision: str = "017_branch_slug_unique"
down_revision: Union[str, None] = "016_create_backup_codes_2fa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDEX_NAME = "uq_branch_tenant_slug_active"


def upgrade() -> None:
    """Create partial unique index on (tenant_id, slug) WHERE is_active = true."""
    op.create_index(
        INDEX_NAME,
        "branch",
        ["tenant_id", "slug"],
        unique=True,
        postgresql_where=text("is_active = true"),
        sqlite_where=text("is_active = 1"),
    )


def downgrade() -> None:
    """Drop the partial unique index."""
    op.drop_index(INDEX_NAME, table_name="branch")
