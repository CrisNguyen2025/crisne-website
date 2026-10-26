"""BoundedStore — a per-process map that cannot grow without limit.

Conversation state is kept per thread, and every chat gets a new thread id: a plain dict grows for as long
as the process runs. This keeps the most recently used `max_items` and drops entries unused for `ttl`
seconds. Expired entries are swept on write, so there is no background task.
"""

from __future__ import annotations

import time
from collections import OrderedDict
from typing import Callable, Generic, Iterator, Optional, TypeVar

V = TypeVar("V")

DEFAULT_MAX_ITEMS = 10_000
DEFAULT_TTL_SECONDS = 24 * 3600.0


def _now() -> float:
    return time.monotonic()


class BoundedStore(Generic[V]):
    def __init__(self, max_items: int = DEFAULT_MAX_ITEMS, ttl: float = DEFAULT_TTL_SECONDS) -> None:
        self._max = max_items
        self._ttl = ttl
        self._items: "OrderedDict[str, tuple[float, V]]" = OrderedDict()

    def __len__(self) -> int:
        return len(self._items)

    def __contains__(self, key: str) -> bool:
        return self.get(key) is not None

    def __iter__(self) -> Iterator[str]:
        return iter(list(self._items))

    def get(self, key: str, default: Optional[V] = None) -> Optional[V]:
        entry = self._items.get(key)
        if entry is None:
            return default
        used, value = entry
        if _now() - used > self._ttl:
            del self._items[key]
            return default
        self._items[key] = (_now(), value)
        self._items.move_to_end(key)
        return value

    def set(self, key: str, value: V) -> None:
        self._items[key] = (_now(), value)
        self._items.move_to_end(key)
        self._sweep()

    def get_or_create(self, key: str, factory: Callable[[], V]) -> V:
        value = self.get(key)
        if value is None:
            value = factory()
            self.set(key, value)
        return value

    def pop(self, key: str, default: Optional[V] = None) -> Optional[V]:
        entry = self._items.pop(key, None)
        return default if entry is None else entry[1]

    def _sweep(self) -> None:
        cutoff = _now() - self._ttl
        # Least recently used first: stop at the first entry still in use
        while self._items:
            key, (used, _) = next(iter(self._items.items()))
            if used >= cutoff and len(self._items) <= self._max:
                break
            del self._items[key]
