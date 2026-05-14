"""
Seed module: Tenants and Branches.
Creates the initial tenant and branch for development.
"""

from sqlalchemy.orm import Session

from rest_api.models import Tenant, Branch
from shared.config.logging import rest_api_logger as logger


def seed(db: Session) -> dict:
    """
    Seed tenant and branch data.
    Returns dict with created objects for use by other seeders.
    """
    existing_tenant = db.query(Tenant).filter(Tenant.slug == "buen-sabor").first()
    if existing_tenant:
        logger.info("Tenant 'buen-sabor' already exists, skipping tenant seed")
        # Return existing objects for other seeders
        branch = db.query(Branch).filter(
            Branch.tenant_id == existing_tenant.id,
            Branch.slug == "centro"
        ).first()
        return {"tenant": existing_tenant, "branch": branch}

    logger.info("Seeding tenants and branches...")

    tenant = Tenant(
        name="Buen Sabor",
        slug="buen-sabor",
        description="Restaurante de comida tradicional argentina",
        theme_color="#f97316",
    )
    db.add(tenant)
    db.flush()

    branch = Branch(
        tenant_id=tenant.id,
        name="Sucursal Centro",
        slug="centro",
        address="Av. San Martín 1234, Mendoza",
        phone="+54 261 123-4567",
        timezone="America/Argentina/Mendoza",
        opening_time="09:00",
        closing_time="23:00",
    )
    db.add(branch)
    db.flush()

    logger.info("Tenants and branches seeded")
    return {"tenant": tenant, "branch": branch}
