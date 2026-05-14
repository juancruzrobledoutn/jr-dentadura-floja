"""
Exception-mapping helpers for the waiter router.

C8 PASS 5 REFACTOR: Consolidates the repetitive try/except boilerplate that
translates domain `AppException` subclasses into `HTTPException` while
preserving legacy `detail` strings expected by clients/tests.

Two patterns are supported:

1. Simple flat mapping — one fixed message per exception type
   (`translate_app_exceptions`):

       with translate_app_exceptions(
           not_found="Table 7 not found",
           forbidden="No access to this branch",
           validation_strify=True,
       ):
           service.do_thing(...)

2. Branch-pick on the exception message — needed when the same endpoint can
   raise the same exception type from two different validators and tests
   assert on distinct detail strings (e.g., "Mesa origen ..." vs
   "Mesa destino ..."). Use `pick_detail` to inspect the original message and
   choose a legacy string:

       try:
           ...
       except NotFoundError as e:
           raise HTTPException(404, detail=pick_detail(e, {
               "destino": "Mesa destino X no encontrada",
               "*":       "Mesa origen Y no encontrada",
           }))

Both helpers preserve the existing HTTP status codes and detail strings byte
for byte — the goal of this refactor is purely organizational, not semantic.
"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator, Optional

from fastapi import HTTPException, status

from shared.utils.exceptions import (
    NotFoundError,
    ForbiddenError,
    ValidationError,
)


def _exc_message(exc: Exception) -> str:
    """Best-effort extraction of an exception's user-facing message."""
    detail = getattr(exc, "detail", None)
    return str(detail) if detail is not None else str(exc)


def pick_detail(exc: Exception, branches: dict[str, str]) -> str:
    """
    Choose a legacy detail string by checking case-insensitive substrings of
    the exception's original message against the keys of `branches`.

    A `"*"` key acts as the fallback (used when no substring matches). If no
    `"*"` is provided, the original exception message is returned.
    """
    msg = _exc_message(exc).lower()
    for key, value in branches.items():
        if key == "*":
            continue
        if key.lower() in msg:
            return value
    return branches.get("*", _exc_message(exc))


@contextmanager
def translate_app_exceptions(
    *,
    not_found: Optional[str] = None,
    forbidden: Optional[str] = None,
    validation: Optional[str] = None,
    validation_strify: bool = False,
) -> Iterator[None]:
    """
    Context manager that translates domain exceptions into HTTPException with
    fixed legacy detail strings. Pass `None` for an exception type to let it
    bubble (e.g., to a global handler).

    - `not_found`: detail for `NotFoundError` → 404
    - `forbidden`: detail for `ForbiddenError` → 403
    - `validation`: detail for `ValidationError` → 400 (fixed string)
    - `validation_strify`: if True (and `validation` is None), maps
      `ValidationError` → 400 with detail = str(e) / str(e.detail). Matches
      the most common legacy pattern.
    """
    try:
        yield
    except NotFoundError as e:
        if not_found is None:
            raise
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=not_found
        ) from e
    except ForbiddenError as e:
        if forbidden is None:
            raise
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=forbidden
        ) from e
    except ValidationError as e:
        if validation is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=validation
            ) from e
        if validation_strify:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=_exc_message(e),
            ) from e
        raise


__all__ = [
    "translate_app_exceptions",
    "pick_detail",
]
