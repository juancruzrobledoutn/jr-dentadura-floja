"""
Modular seed system for the Integrador project.

Each module has a seed() function that receives a db session and a context dict.
Context is accumulated across seeders so later ones can reference earlier objects.

Usage:
    from rest_api.seeds import seed_all
    seed_all()

    # Or seed individual modules:
    from rest_api.seeds import seed_only
    seed_only("users")
"""

from shared.infrastructure.db import SessionLocal
from shared.config.logging import rest_api_logger as logger


# Ordered list of available seed modules
SEED_MODULES = ["tenants", "users", "allergens", "menu", "tables"]


def seed_all() -> None:
    """Run all seed modules in dependency order."""
    db = SessionLocal()
    try:
        context = {}

        from .tenants import seed as seed_tenants
        result = seed_tenants(db)
        context.update(result)

        from .users import seed as seed_users
        result = seed_users(db, context)
        context.update(result)

        from .allergens import seed as seed_allergens
        result = seed_allergens(db, context)
        context.update(result)

        from .menu import seed as seed_menu
        result = seed_menu(db, context)
        context.update(result)

        from .tables import seed as seed_tables
        result = seed_tables(db, context)
        context.update(result)

        db.commit()
        logger.info("All seeds completed successfully.")
    except Exception as e:
        db.rollback()
        logger.error(f"Seed failed: {e}")
        raise
    finally:
        db.close()


def seed_only(module_name: str) -> None:
    """
    Run a single seed module with its dependencies.
    Tenants is always required as a dependency.

    Args:
        module_name: One of 'tenants', 'users', 'allergens', 'menu', 'tables'
    """
    if module_name not in SEED_MODULES:
        raise ValueError(f"Unknown seed module: {module_name}. Available: {SEED_MODULES}")

    db = SessionLocal()
    try:
        context = {}

        # Tenants is always needed (provides tenant + branch)
        from .tenants import seed as seed_tenants
        result = seed_tenants(db)
        context.update(result)

        if module_name == "tenants":
            db.commit()
            return

        # Users are needed for tables (waiter assignments)
        if module_name in ("users", "tables"):
            from .users import seed as seed_users
            result = seed_users(db, context)
            context.update(result)

        if module_name == "users":
            db.commit()
            return

        # Allergens are needed for menu (product allergens)
        if module_name in ("allergens", "menu"):
            from .allergens import seed as seed_allergens
            result = seed_allergens(db, context)
            context.update(result)

        if module_name == "allergens":
            db.commit()
            return

        # Menu
        if module_name == "menu":
            from .menu import seed as seed_menu
            result = seed_menu(db, context)
            context.update(result)
            db.commit()
            return

        # Tables (needs users for waiter assignments)
        if module_name == "tables":
            from .tables import seed as seed_tables
            result = seed_tables(db, context)
            context.update(result)
            db.commit()
            return

    except Exception as e:
        db.rollback()
        logger.error(f"Seed module '{module_name}' failed: {e}")
        raise
    finally:
        db.close()
