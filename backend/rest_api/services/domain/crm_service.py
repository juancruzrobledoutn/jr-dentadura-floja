"""
CRM Service - Customer Relationship Management.

CLEAN-ARCH: Handles customer profiles, visit tracking,
loyalty points, tier management, and customer analytics.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Optional

from sqlalchemy import select, func, and_, or_
from sqlalchemy.orm import Session, selectinload

from rest_api.models.crm import CustomerProfile, CustomerVisit, LoyaltyTransaction, LoyaltyRule
from shared.infrastructure.db import safe_commit
from shared.config.logging import get_logger
from shared.utils.exceptions import NotFoundError, ValidationError

logger = get_logger(__name__)

# Loyalty tier thresholds (defaults, overridden by LoyaltyRule)
DEFAULT_SILVER = 500
DEFAULT_GOLD = 2000
DEFAULT_PLATINUM = 5000


class CRMService:
    """Customer CRM, loyalty program, and visit tracking."""

    def __init__(self, db: Session):
        self._db = db

    # =========================================================================
    # Customer Profile CRUD
    # =========================================================================

    def get_or_create_profile(
        self,
        tenant_id: int,
        name: str,
        *,
        device_id: str | None = None,
        email: str | None = None,
        phone: str | None = None,
        actor_user_id: int | None = None,
        actor_email: str | None = None,
    ) -> dict[str, Any]:
        """Find existing profile by email/device_id or create new one."""
        profile = None

        # Try to find by email first (most reliable identifier)
        if email:
            profile = self._db.scalar(
                select(CustomerProfile).where(
                    CustomerProfile.tenant_id == tenant_id,
                    CustomerProfile.email == email,
                    CustomerProfile.is_active.is_(True),
                )
            )

        # Try by device_id if no email match
        if not profile and device_id:
            profile = self._db.scalar(
                select(CustomerProfile).where(
                    CustomerProfile.tenant_id == tenant_id,
                    CustomerProfile.device_id == device_id,
                    CustomerProfile.is_active.is_(True),
                )
            )

        if profile:
            return self._profile_to_dict(profile)

        # Create new profile
        profile = CustomerProfile(
            tenant_id=tenant_id,
            name=name,
            email=email,
            phone=phone,
            device_id=device_id,
            loyalty_points=0,
            loyalty_tier="BRONZE",
            total_visits=0,
            total_spent_cents=0,
        )
        if actor_user_id and actor_email:
            profile.set_created_by(actor_user_id, actor_email)
        self._db.add(profile)
        safe_commit(self._db)
        self._db.refresh(profile)

        logger.info(
            "Customer profile created",
            extra={"profile_id": profile.id, "tenant_id": tenant_id},
        )
        return self._profile_to_dict(profile)

    def get_profile(self, profile_id: int, tenant_id: int) -> dict[str, Any]:
        """Get a customer profile by ID."""
        profile = self._db.scalar(
            select(CustomerProfile).where(
                CustomerProfile.id == profile_id,
                CustomerProfile.tenant_id == tenant_id,
                CustomerProfile.is_active.is_(True),
            )
        )
        if not profile:
            raise NotFoundError("Perfil de cliente", profile_id, tenant_id=tenant_id)
        return self._profile_to_dict(profile)

    def update_profile(
        self,
        profile_id: int,
        data: dict[str, Any],
        tenant_id: int,
        actor_user_id: int,
        actor_email: str,
    ) -> dict[str, Any]:
        """Update a customer profile."""
        profile = self._db.scalar(
            select(CustomerProfile).where(
                CustomerProfile.id == profile_id,
                CustomerProfile.tenant_id == tenant_id,
                CustomerProfile.is_active.is_(True),
            )
        )
        if not profile:
            raise NotFoundError("Perfil de cliente", profile_id, tenant_id=tenant_id)

        allowed_fields = {
            "name", "email", "phone", "device_id", "dietary_preferences",
            "allergen_ids", "preferred_language", "notes",
            "marketing_consent", "data_consent",
        }
        for key, value in data.items():
            if key in allowed_fields:
                setattr(profile, key, value)

        # Track consent date when consent changes
        if "marketing_consent" in data or "data_consent" in data:
            profile.consent_date = datetime.now(timezone.utc)

        profile.set_updated_by(actor_user_id, actor_email)
        safe_commit(self._db)
        self._db.refresh(profile)
        return self._profile_to_dict(profile)

    def delete_profile(
        self,
        profile_id: int,
        tenant_id: int,
        actor_user_id: int,
        actor_email: str,
    ) -> None:
        """Soft delete a customer profile."""
        profile = self._db.scalar(
            select(CustomerProfile).where(
                CustomerProfile.id == profile_id,
                CustomerProfile.tenant_id == tenant_id,
                CustomerProfile.is_active.is_(True),
            )
        )
        if not profile:
            raise NotFoundError("Perfil de cliente", profile_id, tenant_id=tenant_id)
        profile.soft_delete(actor_user_id, actor_email)
        safe_commit(self._db)

    def list_profiles(
        self,
        tenant_id: int,
        *,
        search: str | None = None,
        tier: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """List customer profiles with optional filters."""
        stmt = select(CustomerProfile).where(
            CustomerProfile.tenant_id == tenant_id,
            CustomerProfile.is_active.is_(True),
        )
        if search:
            pattern = f"%{search}%"
            stmt = stmt.where(
                or_(
                    CustomerProfile.name.ilike(pattern),
                    CustomerProfile.email.ilike(pattern),
                    CustomerProfile.phone.ilike(pattern),
                )
            )
        if tier:
            stmt = stmt.where(CustomerProfile.loyalty_tier == tier)

        stmt = stmt.order_by(CustomerProfile.name)
        stmt = stmt.offset(offset).limit(limit)

        profiles = self._db.scalars(stmt).all()
        return [self._profile_to_dict(p) for p in profiles]

    # =========================================================================
    # Visit Tracking
    # =========================================================================

    def record_visit(
        self,
        profile_id: int,
        branch_id: int,
        tenant_id: int,
        *,
        session_id: int | None = None,
        total_cents: int = 0,
        party_size: int | None = None,
        actor_user_id: int | None = None,
        actor_email: str | None = None,
    ) -> dict[str, Any]:
        """Record a customer visit and update profile stats."""
        profile = self._db.scalar(
            select(CustomerProfile).where(
                CustomerProfile.id == profile_id,
                CustomerProfile.tenant_id == tenant_id,
                CustomerProfile.is_active.is_(True),
            )
        )
        if not profile:
            raise NotFoundError("Perfil de cliente", profile_id, tenant_id=tenant_id)

        visit = CustomerVisit(
            tenant_id=tenant_id,
            branch_id=branch_id,
            customer_profile_id=profile_id,
            table_session_id=session_id,
            visit_date=date.today(),
            party_size=party_size,
            total_spent_cents=total_cents,
        )
        if actor_user_id and actor_email:
            visit.set_created_by(actor_user_id, actor_email)
        self._db.add(visit)

        # Update profile aggregates
        profile.total_visits += 1
        profile.total_spent_cents += total_cents
        profile.last_visit_at = datetime.now(timezone.utc)

        safe_commit(self._db)
        self._db.refresh(visit)

        logger.info(
            "Visit recorded",
            extra={"profile_id": profile_id, "visit_id": visit.id, "total_cents": total_cents},
        )
        return self._visit_to_dict(visit)

    def get_customer_history(
        self,
        profile_id: int,
        tenant_id: int,
        *,
        limit: int = 50,
        offset: int = 0,
    ) -> dict[str, Any]:
        """Full visit history for a customer."""
        profile = self._db.scalar(
            select(CustomerProfile).where(
                CustomerProfile.id == profile_id,
                CustomerProfile.tenant_id == tenant_id,
                CustomerProfile.is_active.is_(True),
            )
        )
        if not profile:
            raise NotFoundError("Perfil de cliente", profile_id, tenant_id=tenant_id)

        stmt = (
            select(CustomerVisit)
            .where(
                CustomerVisit.customer_profile_id == profile_id,
                CustomerVisit.is_active.is_(True),
            )
            .order_by(CustomerVisit.visit_date.desc())
            .offset(offset)
            .limit(limit)
        )
        visits = self._db.scalars(stmt).all()

        # Average spend
        avg_stmt = select(func.avg(CustomerVisit.total_spent_cents)).where(
            CustomerVisit.customer_profile_id == profile_id,
            CustomerVisit.is_active.is_(True),
        )
        avg_spend = self._db.scalar(avg_stmt) or 0

        return {
            "profile": self._profile_to_dict(profile),
            "visits": [self._visit_to_dict(v) for v in visits],
            "stats": {
                "total_visits": profile.total_visits,
                "total_spent_cents": profile.total_spent_cents,
                "average_spend_cents": int(avg_spend),
            },
        }

    # =========================================================================
    # Loyalty Points
    # =========================================================================

    def earn_points(
        self,
        profile_id: int,
        check_total_cents: int,
        tenant_id: int,
        *,
        reference_type: str | None = None,
        reference_id: int | None = None,
    ) -> dict[str, Any]:
        """Calculate and award loyalty points based on active rules."""
        profile = self._db.scalar(
            select(CustomerProfile).where(
                CustomerProfile.id == profile_id,
                CustomerProfile.tenant_id == tenant_id,
                CustomerProfile.is_active.is_(True),
            )
        )
        if not profile:
            raise NotFoundError("Perfil de cliente", profile_id, tenant_id=tenant_id)

        # Get active spend-based rule
        rule = self._db.scalar(
            select(LoyaltyRule).where(
                LoyaltyRule.tenant_id == tenant_id,
                LoyaltyRule.rule_type == "SPEND_BASED",
                LoyaltyRule.is_active.is_(True),
            )
        )

        if not rule:
            # No active rule, no points
            return {"points_earned": 0, "new_balance": profile.loyalty_points}

        # Check minimum spend
        if rule.min_spend_cents and check_total_cents < rule.min_spend_cents:
            return {"points_earned": 0, "new_balance": profile.loyalty_points}

        # Calculate points: points_per_unit per each unit_amount_cents spent
        unit = rule.unit_amount_cents or 10000  # Default: 1 point per $100
        points_earned = (check_total_cents // unit) * rule.points_per_unit

        if points_earned <= 0:
            return {"points_earned": 0, "new_balance": profile.loyalty_points}

        # Award points
        profile.loyalty_points += points_earned
        new_balance = profile.loyalty_points

        tx = LoyaltyTransaction(
            tenant_id=tenant_id,
            customer_profile_id=profile_id,
            transaction_type="EARN",
            points=points_earned,
            balance_after=new_balance,
            description=f"Puntos por consumo de ${check_total_cents / 100:.2f}",
            reference_type=reference_type,
            reference_id=reference_id,
        )
        self._db.add(tx)
        safe_commit(self._db)

        # Update tier after earning
        self.update_tier(profile_id, tenant_id)

        logger.info(
            "Points earned",
            extra={"profile_id": profile_id, "points": points_earned, "balance": new_balance},
        )
        return {"points_earned": points_earned, "new_balance": new_balance}

    def redeem_points(
        self,
        profile_id: int,
        points: int,
        tenant_id: int,
        *,
        description: str | None = None,
    ) -> dict[str, Any]:
        """Redeem points. Returns discount amount in cents."""
        if points <= 0:
            raise ValidationError("La cantidad de puntos debe ser mayor a 0.", field="points")

        profile = self._db.scalar(
            select(CustomerProfile).where(
                CustomerProfile.id == profile_id,
                CustomerProfile.tenant_id == tenant_id,
                CustomerProfile.is_active.is_(True),
            )
        )
        if not profile:
            raise NotFoundError("Perfil de cliente", profile_id, tenant_id=tenant_id)

        if profile.loyalty_points < points:
            raise ValidationError(
                f"Puntos insuficientes. Disponible: {profile.loyalty_points}, solicitado: {points}.",
                field="points",
            )

        profile.loyalty_points -= points
        new_balance = profile.loyalty_points

        # Default: 1 point = $1 (100 cents)
        discount_cents = points * 100

        tx = LoyaltyTransaction(
            tenant_id=tenant_id,
            customer_profile_id=profile_id,
            transaction_type="REDEEM",
            points=-points,
            balance_after=new_balance,
            description=description or f"Canje de {points} puntos",
        )
        self._db.add(tx)
        safe_commit(self._db)

        logger.info(
            "Points redeemed",
            extra={"profile_id": profile_id, "points": points, "discount_cents": discount_cents},
        )
        return {
            "points_redeemed": points,
            "new_balance": new_balance,
            "discount_cents": discount_cents,
        }

    def adjust_points(
        self,
        profile_id: int,
        points: int,
        tenant_id: int,
        description: str,
        actor_user_id: int,
        actor_email: str,
    ) -> dict[str, Any]:
        """Manual point adjustment (admin action)."""
        profile = self._db.scalar(
            select(CustomerProfile).where(
                CustomerProfile.id == profile_id,
                CustomerProfile.tenant_id == tenant_id,
                CustomerProfile.is_active.is_(True),
            )
        )
        if not profile:
            raise NotFoundError("Perfil de cliente", profile_id, tenant_id=tenant_id)

        profile.loyalty_points += points
        if profile.loyalty_points < 0:
            profile.loyalty_points = 0
        new_balance = profile.loyalty_points

        tx = LoyaltyTransaction(
            tenant_id=tenant_id,
            customer_profile_id=profile_id,
            transaction_type="ADJUST",
            points=points,
            balance_after=new_balance,
            description=description,
        )
        tx.set_created_by(actor_user_id, actor_email)
        self._db.add(tx)
        safe_commit(self._db)

        # Update tier
        self.update_tier(profile_id, tenant_id)

        return {"points_adjusted": points, "new_balance": new_balance}

    def update_tier(self, profile_id: int, tenant_id: int) -> str:
        """Recalculate tier based on total points."""
        profile = self._db.scalar(
            select(CustomerProfile).where(
                CustomerProfile.id == profile_id,
                CustomerProfile.tenant_id == tenant_id,
                CustomerProfile.is_active.is_(True),
            )
        )
        if not profile:
            raise NotFoundError("Perfil de cliente", profile_id, tenant_id=tenant_id)

        # Get thresholds from active rule or use defaults
        rule = self._db.scalar(
            select(LoyaltyRule).where(
                LoyaltyRule.tenant_id == tenant_id,
                LoyaltyRule.is_active.is_(True),
            )
        )

        silver = rule.silver_threshold if rule else DEFAULT_SILVER
        gold = rule.gold_threshold if rule else DEFAULT_GOLD
        platinum = rule.platinum_threshold if rule else DEFAULT_PLATINUM

        total_points = profile.loyalty_points
        if total_points >= platinum:
            new_tier = "PLATINUM"
        elif total_points >= gold:
            new_tier = "GOLD"
        elif total_points >= silver:
            new_tier = "SILVER"
        else:
            new_tier = "BRONZE"

        if profile.loyalty_tier != new_tier:
            old_tier = profile.loyalty_tier
            profile.loyalty_tier = new_tier
            safe_commit(self._db)
            logger.info(
                "Tier updated",
                extra={"profile_id": profile_id, "old_tier": old_tier, "new_tier": new_tier},
            )

        return new_tier

    def get_loyalty_history(
        self,
        profile_id: int,
        tenant_id: int,
        *,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Points transaction history for a customer."""
        stmt = (
            select(LoyaltyTransaction)
            .where(
                LoyaltyTransaction.customer_profile_id == profile_id,
                LoyaltyTransaction.tenant_id == tenant_id,
                LoyaltyTransaction.is_active.is_(True),
            )
            .order_by(LoyaltyTransaction.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        transactions = self._db.scalars(stmt).all()
        return [self._transaction_to_dict(t) for t in transactions]

    # =========================================================================
    # Reports
    # =========================================================================

    def get_top_customers(
        self,
        tenant_id: int,
        *,
        sort_by: str = "total_spent_cents",
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Top customers by spending or visits."""
        stmt = select(CustomerProfile).where(
            CustomerProfile.tenant_id == tenant_id,
            CustomerProfile.is_active.is_(True),
        )

        if sort_by == "total_visits":
            stmt = stmt.order_by(CustomerProfile.total_visits.desc())
        else:
            stmt = stmt.order_by(CustomerProfile.total_spent_cents.desc())

        stmt = stmt.limit(limit)
        profiles = self._db.scalars(stmt).all()
        return [self._profile_to_dict(p) for p in profiles]

    def get_loyalty_report(self, tenant_id: int) -> dict[str, Any]:
        """Loyalty program statistics."""
        base = select(CustomerProfile).where(
            CustomerProfile.tenant_id == tenant_id,
            CustomerProfile.is_active.is_(True),
        )

        total_customers = self._db.scalar(
            select(func.count(CustomerProfile.id)).where(
                CustomerProfile.tenant_id == tenant_id,
                CustomerProfile.is_active.is_(True),
            )
        ) or 0

        # Tier distribution
        tier_stmt = (
            select(
                CustomerProfile.loyalty_tier,
                func.count(CustomerProfile.id).label("count"),
            )
            .where(
                CustomerProfile.tenant_id == tenant_id,
                CustomerProfile.is_active.is_(True),
            )
            .group_by(CustomerProfile.loyalty_tier)
        )
        tier_rows = self._db.execute(tier_stmt).all()
        tier_distribution = {row.loyalty_tier: row.count for row in tier_rows}

        # Total points in circulation
        total_points = self._db.scalar(
            select(func.sum(CustomerProfile.loyalty_points)).where(
                CustomerProfile.tenant_id == tenant_id,
                CustomerProfile.is_active.is_(True),
            )
        ) or 0

        # Average spend
        avg_spend = self._db.scalar(
            select(func.avg(CustomerProfile.total_spent_cents)).where(
                CustomerProfile.tenant_id == tenant_id,
                CustomerProfile.is_active.is_(True),
                CustomerProfile.total_visits > 0,
            )
        ) or 0

        return {
            "total_customers": total_customers,
            "tier_distribution": tier_distribution,
            "total_points_in_circulation": total_points,
            "average_spend_cents": int(avg_spend),
        }

    # =========================================================================
    # Loyalty Rules CRUD
    # =========================================================================

    def create_rule(
        self,
        tenant_id: int,
        data: dict[str, Any],
        actor_user_id: int,
        actor_email: str,
    ) -> dict[str, Any]:
        """Create a loyalty rule."""
        rule = LoyaltyRule(
            tenant_id=tenant_id,
            name=data["name"],
            rule_type=data["rule_type"],
            points_per_unit=data["points_per_unit"],
            unit_amount_cents=data.get("unit_amount_cents"),
            min_spend_cents=data.get("min_spend_cents"),
            silver_threshold=data.get("silver_threshold", DEFAULT_SILVER),
            gold_threshold=data.get("gold_threshold", DEFAULT_GOLD),
            platinum_threshold=data.get("platinum_threshold", DEFAULT_PLATINUM),
        )
        rule.set_created_by(actor_user_id, actor_email)
        self._db.add(rule)
        safe_commit(self._db)
        self._db.refresh(rule)
        return self._rule_to_dict(rule)

    def update_rule(
        self,
        rule_id: int,
        data: dict[str, Any],
        tenant_id: int,
        actor_user_id: int,
        actor_email: str,
    ) -> dict[str, Any]:
        """Update a loyalty rule."""
        rule = self._db.scalar(
            select(LoyaltyRule).where(
                LoyaltyRule.id == rule_id,
                LoyaltyRule.tenant_id == tenant_id,
                LoyaltyRule.is_active.is_(True),
            )
        )
        if not rule:
            raise NotFoundError("Regla de fidelidad", rule_id, tenant_id=tenant_id)

        allowed_fields = {
            "name", "rule_type", "points_per_unit", "unit_amount_cents",
            "min_spend_cents", "silver_threshold", "gold_threshold", "platinum_threshold",
        }
        for key, value in data.items():
            if key in allowed_fields:
                setattr(rule, key, value)

        rule.set_updated_by(actor_user_id, actor_email)
        safe_commit(self._db)
        self._db.refresh(rule)
        return self._rule_to_dict(rule)

    def delete_rule(
        self,
        rule_id: int,
        tenant_id: int,
        actor_user_id: int,
        actor_email: str,
    ) -> None:
        """Soft delete a loyalty rule."""
        rule = self._db.scalar(
            select(LoyaltyRule).where(
                LoyaltyRule.id == rule_id,
                LoyaltyRule.tenant_id == tenant_id,
                LoyaltyRule.is_active.is_(True),
            )
        )
        if not rule:
            raise NotFoundError("Regla de fidelidad", rule_id, tenant_id=tenant_id)
        rule.soft_delete(actor_user_id, actor_email)
        safe_commit(self._db)

    def list_rules(self, tenant_id: int) -> list[dict[str, Any]]:
        """List loyalty rules for a tenant."""
        stmt = select(LoyaltyRule).where(
            LoyaltyRule.tenant_id == tenant_id,
            LoyaltyRule.is_active.is_(True),
        )
        rules = self._db.scalars(stmt).all()
        return [self._rule_to_dict(r) for r in rules]

    # =========================================================================
    # Serialization Helpers
    # =========================================================================

    def _profile_to_dict(self, profile: CustomerProfile) -> dict[str, Any]:
        return {
            "id": profile.id,
            "tenant_id": profile.tenant_id,
            "name": profile.name,
            "email": profile.email,
            "phone": profile.phone,
            "device_id": profile.device_id,
            "customer_id": profile.customer_id,
            "dietary_preferences": profile.dietary_preferences,
            "allergen_ids": profile.allergen_ids,
            "preferred_language": profile.preferred_language,
            "notes": profile.notes,
            "loyalty_points": profile.loyalty_points,
            "loyalty_tier": profile.loyalty_tier,
            "total_visits": profile.total_visits,
            "total_spent_cents": profile.total_spent_cents,
            "last_visit_at": profile.last_visit_at.isoformat() if profile.last_visit_at else None,
            "marketing_consent": profile.marketing_consent,
            "data_consent": profile.data_consent,
            "consent_date": profile.consent_date.isoformat() if profile.consent_date else None,
            "is_active": profile.is_active,
            "created_at": profile.created_at.isoformat() if profile.created_at else None,
        }

    def _visit_to_dict(self, visit: CustomerVisit) -> dict[str, Any]:
        return {
            "id": visit.id,
            "tenant_id": visit.tenant_id,
            "branch_id": visit.branch_id,
            "customer_profile_id": visit.customer_profile_id,
            "table_session_id": visit.table_session_id,
            "visit_date": visit.visit_date.isoformat(),
            "party_size": visit.party_size,
            "total_spent_cents": visit.total_spent_cents,
            "rating": visit.rating,
            "feedback": visit.feedback,
            "is_active": visit.is_active,
            "created_at": visit.created_at.isoformat() if visit.created_at else None,
        }

    def _transaction_to_dict(self, tx: LoyaltyTransaction) -> dict[str, Any]:
        return {
            "id": tx.id,
            "tenant_id": tx.tenant_id,
            "customer_profile_id": tx.customer_profile_id,
            "transaction_type": tx.transaction_type,
            "points": tx.points,
            "balance_after": tx.balance_after,
            "description": tx.description,
            "reference_type": tx.reference_type,
            "reference_id": tx.reference_id,
            "created_at": tx.created_at.isoformat() if tx.created_at else None,
        }

    def _rule_to_dict(self, rule: LoyaltyRule) -> dict[str, Any]:
        return {
            "id": rule.id,
            "tenant_id": rule.tenant_id,
            "name": rule.name,
            "rule_type": rule.rule_type,
            "points_per_unit": rule.points_per_unit,
            "unit_amount_cents": rule.unit_amount_cents,
            "min_spend_cents": rule.min_spend_cents,
            "silver_threshold": rule.silver_threshold,
            "gold_threshold": rule.gold_threshold,
            "platinum_threshold": rule.platinum_threshold,
            "is_active": rule.is_active,
            "created_at": rule.created_at.isoformat() if rule.created_at else None,
        }
