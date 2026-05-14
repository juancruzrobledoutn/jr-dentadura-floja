"""
Seed module: Sectors, Tables, and Waiter Assignments.
Creates branch sectors with tables and daily waiter-sector assignments.
"""

from datetime import date

from sqlalchemy.orm import Session

from rest_api.models import BranchSector, Table, WaiterSectorAssignment
from shared.config.logging import rest_api_logger as logger


SECTORS_DATA = [
    {"name": "Interior", "prefix": "INT"},
    {"name": "Terraza", "prefix": "TER"},
    {"name": "Barra", "prefix": "BAR"},
]

TABLES_DATA = [
    # Interior tables
    {"code": "INT-01", "sector": "INT", "capacity": 4},
    {"code": "INT-02", "sector": "INT", "capacity": 4},
    {"code": "INT-03", "sector": "INT", "capacity": 6},
    {"code": "INT-04", "sector": "INT", "capacity": 2},
    {"code": "INT-05", "sector": "INT", "capacity": 8},
    # Terraza tables
    {"code": "TER-01", "sector": "TER", "capacity": 4},
    {"code": "TER-02", "sector": "TER", "capacity": 4},
    {"code": "TER-03", "sector": "TER", "capacity": 6},
    # Bar tables
    {"code": "BAR-01", "sector": "BAR", "capacity": 2},
    {"code": "BAR-02", "sector": "BAR", "capacity": 2},
]

WAITER_ASSIGNMENTS = [
    {"waiter": "waiter@demo.com", "sector": "INT"},
    {"waiter": "waiter@demo.com", "sector": "TER"},
    {"waiter": "ana@demo.com", "sector": "INT"},
    {"waiter": "alberto.cortez@demo.com", "sector": "BAR"},
    {"waiter": "alberto.cortez@demo.com", "sector": "TER"},
]


def seed(db: Session, context: dict) -> dict:
    """
    Seed sectors, tables, and waiter assignments.
    Requires context with 'tenant', 'branch', and 'users'.
    Returns dict with sectors.
    """
    tenant = context["tenant"]
    branch = context["branch"]
    users = context.get("users", {})

    existing = db.query(BranchSector).filter(BranchSector.branch_id == branch.id).first()
    if existing:
        logger.info("Sectors already exist, skipping table seed")
        sectors = {s.prefix: s for s in db.query(BranchSector).filter(BranchSector.branch_id == branch.id).all()}
        return {"sectors": sectors}

    logger.info("Seeding sectors and tables...")

    # Create sectors
    sectors = {}
    for sector_data in SECTORS_DATA:
        sector = BranchSector(
            branch_id=branch.id,
            tenant_id=tenant.id,
            name=sector_data["name"],
            prefix=sector_data["prefix"],
        )
        db.add(sector)
        db.flush()
        sectors[sector_data["prefix"]] = sector

    # Create tables
    for table_data in TABLES_DATA:
        table = Table(
            branch_id=branch.id,
            tenant_id=tenant.id,
            sector_id=sectors[table_data["sector"]].id,
            code=table_data["code"],
            capacity=table_data["capacity"],
            status="FREE",
        )
        db.add(table)

    # Create waiter sector assignments for today
    today = date.today()
    for assignment in WAITER_ASSIGNMENTS:
        waiter = users.get(assignment["waiter"])
        sector = sectors.get(assignment["sector"])
        if waiter and sector:
            waiter_assignment = WaiterSectorAssignment(
                tenant_id=tenant.id,
                branch_id=branch.id,
                sector_id=sector.id,
                waiter_id=waiter.id,
                assignment_date=today,
            )
            db.add(waiter_assignment)

    logger.info(f"Seeded {len(sectors)} sectors, {len(TABLES_DATA)} tables, {len(WAITER_ASSIGNMENTS)} assignments")
    return {"sectors": sectors}
