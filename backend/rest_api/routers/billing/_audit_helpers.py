"""
Audit-log helpers for the billing router.

C8 PASS 6 REFACTOR (billing): Consolidates the repetitive `try: audit_log.log(...)
except Exception as audit_err: logger.warning(...)` pattern used at the end of
critical billing flows.

DESIGN CONSTRAINT (CRITICO governance):
    This helper is intentionally minimal. It preserves byte-for-byte the legacy
    behavior of the inline code it replaces:
        - Same `await get_audit_log()` lookup
        - Same `await audit_log.log(**kwargs)` invocation
        - Same `except Exception` swallow + `logger.warning(...)` message
        - Same field names ("Failed to write audit log for ...")

    Audit logging is FIRE-AND-FORGET in the original code (errors do not roll
    back the payment/check). This helper preserves that contract. It MUST be
    called AFTER the business `db.commit()` succeeds, never before.

Routes call this helper instead of duplicating the boilerplate. The order of
operations around payments (lock → write outbox → commit → audit) is
unchanged.
"""
from __future__ import annotations

from typing import Any, Optional

from shared.config.logging import billing_logger as logger
from shared.security.audit_log import get_audit_log


async def safe_audit_log(
    *,
    event_type: str,
    action: str,
    data: dict[str, Any],
    resource_type: str,
    resource_id: int,
    failure_message: str,
    failure_extra: dict[str, Any],
    user_id: Optional[int] = None,
    user_email: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> None:
    """
    Write to the tamper-evident audit chain, swallowing transport errors.

    Matches the legacy inline pattern exactly: failures are logged at WARNING
    and do NOT propagate (audit failure must not break a successful payment).
    """
    try:
        audit_log = await get_audit_log()
        await audit_log.log(
            event_type=event_type,
            action=action,
            user_id=user_id,
            user_email=user_email,
            ip_address=ip_address,
            resource_type=resource_type,
            resource_id=resource_id,
            data=data,
        )
    except Exception as audit_err:
        # Don't fail the payment/operation if audit logging fails, just log the error.
        logger.warning(failure_message, error=str(audit_err), **failure_extra)


__all__ = ["safe_audit_log"]
