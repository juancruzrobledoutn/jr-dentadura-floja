"""
Seed module: Users and Roles.
Creates test users with branch role assignments.
"""

from sqlalchemy.orm import Session

from rest_api.models import User, UserBranchRole
from shared.security.password import hash_password
from shared.config.logging import rest_api_logger as logger


USERS_DATA = [
    {
        "email": "admin@demo.com",
        "password": "admin123",
        "first_name": "Admin",
        "last_name": "Usuario",
        "role": "ADMIN",
    },
    {
        "email": "manager@demo.com",
        "password": "manager123",
        "first_name": "María",
        "last_name": "García",
        "role": "MANAGER",
    },
    {
        "email": "kitchen@demo.com",
        "password": "kitchen123",
        "first_name": "Chef",
        "last_name": "Rodríguez",
        "role": "KITCHEN",
    },
    {
        "email": "waiter@demo.com",
        "password": "waiter123",
        "first_name": "Carlos",
        "last_name": "López",
        "role": "WAITER",
    },
    {
        "email": "ana@demo.com",
        "password": "ana123",
        "first_name": "Ana",
        "last_name": "Martínez",
        "role": "WAITER",
    },
    {
        "email": "alberto.cortez@demo.com",
        "password": "waiter123",
        "first_name": "Alberto",
        "last_name": "Cortez",
        "role": "WAITER",
    },
]


def seed(db: Session, context: dict) -> dict:
    """
    Seed user data.
    Requires context with 'tenant' and 'branch' from tenants seeder.
    Returns dict with created user objects.
    """
    tenant = context["tenant"]
    branch = context["branch"]

    # Check if users already exist
    existing = db.query(User).filter(User.email == "admin@demo.com").first()
    if existing:
        logger.info("Users already exist, skipping user seed")
        users = {}
        for user_data in USERS_DATA:
            user = db.query(User).filter(User.email == user_data["email"]).first()
            if user:
                users[user_data["email"]] = user
        return {"users": users}

    logger.info("Seeding users...")

    users = {}
    for user_data in USERS_DATA:
        user = User(
            tenant_id=tenant.id,
            email=user_data["email"],
            password=hash_password(user_data["password"]),
            first_name=user_data["first_name"],
            last_name=user_data["last_name"],
        )
        db.add(user)
        db.flush()
        users[user_data["email"]] = user

        role = UserBranchRole(
            user_id=user.id,
            tenant_id=tenant.id,
            branch_id=branch.id,
            role=user_data["role"],
        )
        db.add(role)

    logger.info(f"Seeded {len(users)} users")
    return {"users": users}
