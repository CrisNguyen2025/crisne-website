"""Write grant — the one permission every roadmap write needs, checked where the data changes.

Deciding whether a message may change data happens in many places (write gate, a confirmed preview, /goal,
a bulk import). Checking it there alone leaves any new path free to write: a pre-router shortcut, a tool
bound to an LLM, a future feature. So the adapters check it themselves: every create_* / update_* / delete_*
of a @guard_writes adapter raises unless the call runs inside `write_granted(reason)`, and a grant is only
issued to the owner.

    with write_granted("confirmed"):
        ok, msg = await executor.aexecute(action, ...)

Issue a grant only at a decision point that has evidence for the change: write gate "allow", a preview the
user confirmed, an owner's slash command, a bulk import whose first line asks for it.
"""

from __future__ import annotations

import functools
import inspect
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Iterator, Optional

from rag_service.auth import OWNER_ONLY_MESSAGE, is_owner

WRITE_PREFIXES = ("create_", "update_", "delete_")

_grant: ContextVar[Optional[str]] = ContextVar("write_grant", default=None)


class WriteNotGranted(PermissionError):
    """A roadmap write ran without a grant: a path reached the database without passing a decision point."""


@contextmanager
def write_granted(reason: str) -> Iterator[None]:
    if not is_owner():
        raise PermissionError(OWNER_ONLY_MESSAGE)
    token = _grant.set(reason)
    try:
        yield
    finally:
        _grant.reset(token)


def current_grant() -> Optional[str]:
    return _grant.get()


def require_grant(operation: str) -> None:
    if _grant.get() is None:
        raise WriteNotGranted(f"{operation} ran without a write grant (rag_service/write_grant.py)")


def is_write_method(name: str) -> bool:
    return name.startswith(WRITE_PREFIXES)


def guard_writes(cls: type) -> type:
    """Class decorator for a data adapter: its write methods require a grant."""
    for name, fn in list(vars(cls).items()):
        if not (is_write_method(name) and inspect.iscoroutinefunction(fn)):
            continue

        def wrap(fn=fn, name=name):
            @functools.wraps(fn)
            async def guarded(self, *args, **kwargs):
                require_grant(f"{cls.__name__}.{name}")
                return await fn(self, *args, **kwargs)

            return guarded

        setattr(cls, name, wrap())
    cls.__write_guarded__ = True
    return cls
