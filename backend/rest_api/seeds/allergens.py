"""
Seed module: Allergens.
Creates the 14 EU mandatory allergens.
"""

from sqlalchemy.orm import Session

from rest_api.models import Allergen
from shared.config.logging import rest_api_logger as logger


ALLERGENS_DATA = [
    {"name": "Gluten", "icon": "\U0001f33e", "is_mandatory": True, "severity": "severe"},
    {"name": "Crustáceos", "icon": "\U0001f990", "is_mandatory": True, "severity": "life_threatening"},
    {"name": "Huevos", "icon": "\U0001f95a", "is_mandatory": True, "severity": "severe"},
    {"name": "Pescado", "icon": "\U0001f41f", "is_mandatory": True, "severity": "severe"},
    {"name": "Maní", "icon": "\U0001f95c", "is_mandatory": True, "severity": "life_threatening"},
    {"name": "Soja", "icon": "\U0001fad8", "is_mandatory": True, "severity": "moderate"},
    {"name": "Lácteos", "icon": "\U0001f95b", "is_mandatory": True, "severity": "moderate"},
    {"name": "Frutos secos", "icon": "\U0001f330", "is_mandatory": True, "severity": "life_threatening"},
    {"name": "Apio", "icon": "\U0001f96c", "is_mandatory": True, "severity": "moderate"},
    {"name": "Mostaza", "icon": "\U0001f7e1", "is_mandatory": True, "severity": "moderate"},
    {"name": "Sésamo", "icon": "\u26aa", "is_mandatory": True, "severity": "severe"},
    {"name": "Sulfitos", "icon": "\U0001f377", "is_mandatory": True, "severity": "moderate"},
    {"name": "Altramuces", "icon": "\U0001fadb", "is_mandatory": True, "severity": "moderate"},
    {"name": "Moluscos", "icon": "\U0001f9aa", "is_mandatory": True, "severity": "severe"},
]


def seed(db: Session, context: dict) -> dict:
    """
    Seed allergen data.
    Requires context with 'tenant'.
    Returns dict with allergen objects keyed by name.
    """
    tenant = context["tenant"]

    existing = db.query(Allergen).filter(Allergen.tenant_id == tenant.id).first()
    if existing:
        logger.info("Allergens already exist, skipping allergen seed")
        allergens = {}
        for a in db.query(Allergen).filter(Allergen.tenant_id == tenant.id).all():
            allergens[a.name] = a
        return {"allergens": allergens}

    logger.info("Seeding allergens...")

    allergens = {}
    for allergen_data in ALLERGENS_DATA:
        allergen = Allergen(
            tenant_id=tenant.id,
            name=allergen_data["name"],
            icon=allergen_data["icon"],
            is_mandatory=allergen_data["is_mandatory"],
            severity=allergen_data["severity"],
        )
        db.add(allergen)
        db.flush()
        allergens[allergen_data["name"]] = allergen

    logger.info(f"Seeded {len(allergens)} allergens")
    return {"allergens": allergens}
