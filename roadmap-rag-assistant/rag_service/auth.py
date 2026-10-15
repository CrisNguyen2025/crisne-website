"""Who is calling: set per request from the Next.js proxy, checked before every write.

The service is reachable only through the Next.js proxy (`x-internal-key`), which tells it
whether the caller is the signed-in site owner or an anonymous visitor (`x-actor`).
Writes run with the service's ADMIN_API_KEY, so only the owner may trigger them.
"""

from __future__ import annotations

import functools
import hmac
from contextvars import ContextVar
from typing import Any, Awaitable, Callable, Literal, TypeVar

Actor = Literal["owner", "visitor"]

# Fail-closed default: anything not explicitly marked as the owner is a visitor
current_actor: ContextVar[Actor] = ContextVar("current_actor", default="visitor")

OWNER_ONLY_MESSAGE = "🔒 Chỉ owner mới thực hiện được thao tác thay đổi roadmap."


def parse_actor(value: str | None) -> Actor:
    """Only the exact value "owner" grants write access."""
    return "owner" if value == "owner" else "visitor"


def set_actor(actor: Actor) -> None:
    current_actor.set(actor)


def is_owner() -> bool:
    return current_actor.get() == "owner"


def require_owner() -> None:
    """Raise before any write when the caller is not the owner."""
    if not is_owner():
        raise PermissionError(OWNER_ONLY_MESSAGE)


def is_valid_internal_key(provided: str | None, expected: str) -> bool:
    """Constant-time comparison; an unset key never matches (fail-closed)."""
    if not expected or not provided:
        return False
    return hmac.compare_digest(provided.encode(), expected.encode())


T = TypeVar("T")


def owner_only(fn: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
    """Decorator for adapter write methods."""

    @functools.wraps(fn)
    async def wrapper(*args: Any, **kwargs: Any) -> T:
        require_owner()
        return await fn(*args, **kwargs)

    return wrapper
