"""Conversation memory behind a small interface, so the in-memory store can be swapped for Redis/DB."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Deque, Dict, List, Literal, Protocol

Role = Literal["user", "assistant"]


@dataclass(frozen=True)
class Turn:
    role: Role
    content: str


class HistoryStore(Protocol):
    def append(self, thread_id: str, role: Role, content: str) -> None: ...

    def get_recent(self, thread_id: str, n: int) -> List[Turn]:
        """Last `n` messages of the thread, oldest first."""
        ...

    def clear(self, thread_id: str) -> None: ...


class InMemoryHistoryStore:
    """Per-process store; lost on restart. Keeps at most `max_messages` per thread."""

    def __init__(self, max_messages: int = 50) -> None:
        self._threads: Dict[str, Deque[Turn]] = {}
        self._max = max_messages

    def append(self, thread_id: str, role: Role, content: str) -> None:
        if not content:
            return
        sid = thread_id or "default"
        self._threads.setdefault(sid, deque(maxlen=self._max)).append(Turn(role, content))

    def get_recent(self, thread_id: str, n: int) -> List[Turn]:
        turns = self._threads.get(thread_id or "default")
        if not turns or n <= 0:
            return []
        return list(turns)[-n:]

    def clear(self, thread_id: str) -> None:
        self._threads.pop(thread_id or "default", None)


history_store: HistoryStore = InMemoryHistoryStore()
