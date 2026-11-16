"""Conversation memory behind a small interface, so the in-memory store can be swapped for Redis/DB."""

from __future__ import annotations

import os
import sqlite3
import threading
import time
from collections import deque
from dataclasses import dataclass
from typing import Deque, List, Literal, Protocol

from rag_service.core.bounded import BoundedStore
from rag_service.core.thread_api import ThreadApi, default_thread_api

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

    async def load(self, thread_id: str) -> None:
        """Bring a thread kept elsewhere into memory before its first read; a no-op for a local store."""
        ...


# Conversation turns kept on disk this long; purged when the store opens
HISTORY_RETENTION_SECONDS = 30 * 24 * 3600


class InMemoryHistoryStore:
    """Per-process store; lost on restart. Keeps at most `max_messages` per thread."""

    def __init__(self, max_messages: int = 50) -> None:
        # Bounded by thread count and idle time; each thread keeps its last `max_messages`
        self._threads: BoundedStore[Deque[Turn]] = BoundedStore()
        self._max = max_messages

    def append(self, thread_id: str, role: Role, content: str) -> None:
        if not content:
            return
        sid = thread_id or "default"
        self._threads.get_or_create(sid, lambda: deque(maxlen=self._max)).append(Turn(role, content))

    def get_recent(self, thread_id: str, n: int) -> List[Turn]:
        turns = self._threads.get(thread_id or "default")
        if not turns or n <= 0:
            return []
        return list(turns)[-n:]

    def clear(self, thread_id: str) -> None:
        self._threads.pop(thread_id or "default", None)

    async def load(self, thread_id: str) -> None:
        return None


class SqliteHistoryStore:
    """Conversation memory kept in a SQLite file, so it survives a server restart.

    Same contract as InMemoryHistoryStore. Stdlib only; one short write per turn, so a shared
    connection guarded by a lock is enough for the single-process server.
    """

    def __init__(self, path: str, max_messages: int = 50) -> None:
        self._max = max_messages
        self._lock = threading.Lock()
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.execute(
            """CREATE TABLE IF NOT EXISTS chat_turn (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 thread_id TEXT NOT NULL,
                 role TEXT NOT NULL,
                 content TEXT NOT NULL)"""
        )
        self._db.execute("CREATE INDEX IF NOT EXISTS chat_turn_thread ON chat_turn(thread_id, id)")
        # Older files have no created_at: added here, their rows stay (NULL is never purged)
        columns = {row[1] for row in self._db.execute("PRAGMA table_info(chat_turn)")}
        if "created_at" not in columns:
            self._db.execute("ALTER TABLE chat_turn ADD COLUMN created_at REAL")
        self._db.execute("DELETE FROM chat_turn WHERE created_at < ?", (time.time() - HISTORY_RETENTION_SECONDS,))
        self._db.commit()

    def append(self, thread_id: str, role: Role, content: str) -> None:
        if not content:
            return
        sid = thread_id or "default"
        with self._lock:
            self._db.execute(
                "INSERT INTO chat_turn (thread_id, role, content, created_at) VALUES (?, ?, ?, ?)",
                (sid, role, content, time.time()),
            )
            # Keep only the newest `max_messages` per thread
            self._db.execute(
                """DELETE FROM chat_turn WHERE thread_id = ? AND id NOT IN (
                     SELECT id FROM chat_turn WHERE thread_id = ? ORDER BY id DESC LIMIT ?)""",
                (sid, sid, self._max),
            )
            self._db.commit()

    def get_recent(self, thread_id: str, n: int) -> List[Turn]:
        if n <= 0:
            return []
        with self._lock:
            rows = self._db.execute(
                "SELECT role, content FROM chat_turn WHERE thread_id = ? ORDER BY id DESC LIMIT ?",
                (thread_id or "default", n),
            ).fetchall()
        return [Turn(role, content) for role, content in reversed(rows)]

    def clear(self, thread_id: str) -> None:
        with self._lock:
            self._db.execute("DELETE FROM chat_turn WHERE thread_id = ?", (thread_id or "default",))
            self._db.commit()

    async def load(self, thread_id: str) -> None:
        return None


class HttpHistoryStore:
    """The Owner's conversation memory kept in Turso through the Next.js API (ADR-0012).

    Reads and writes go to RAM, so a turn never waits for the network:
    - `load` fills RAM from the API once, when a thread is first seen after a restart or a spin down
    - `append` and `clear` change RAM at once and send the change in the background, in order

    A Visitor's thread is never sent, and a failed call only logs: the thread keeps working from RAM.
    """

    def __init__(self, api: ThreadApi, max_messages: int = 50) -> None:
        self._cache = InMemoryHistoryStore(max_messages)
        self._api = api

    def append(self, thread_id: str, role: Role, content: str) -> None:
        self._cache.append(thread_id, role, content)
        if content and self._api.stored(thread_id):
            self._api.write_later("POST", thread_id, {"role": role, "content": content})

    def get_recent(self, thread_id: str, n: int) -> List[Turn]:
        return self._cache.get_recent(thread_id, n)

    def clear(self, thread_id: str) -> None:
        self._cache.clear(thread_id)
        if self._api.stored(thread_id):
            self._api.write_later("DELETE", thread_id)

    async def load(self, thread_id: str) -> None:
        # Only a thread RAM knows nothing about: one that RAM already holds is newer than the API
        if not self._api.stored(thread_id) or self._cache.get_recent(thread_id, 1):
            return
        data = await self._api.read(thread_id)
        messages = data.get("messages") if data else None
        # Another turn of this thread may have filled RAM while the call was in flight
        if not isinstance(messages, list) or self._cache.get_recent(thread_id, 1):
            return
        for message in messages:
            if isinstance(message, dict) and message.get("role") in ("user", "assistant"):
                self._cache.append(thread_id, message["role"], str(message.get("content", "")))

    async def flush(self) -> None:
        await self._api.flush()


def _make_default() -> HistoryStore:
    """SQLite when RAG_HISTORY_DB is set (a local file), else the Owner's threads in Turso through the
    Next.js API when it can be reached with the admin key (ADR-0012), else RAM as before."""
    from rag_service.config import settings

    path = settings.rag_history_db.strip()
    if path:
        return SqliteHistoryStore(path)
    api = default_thread_api()
    return HttpHistoryStore(api) if api else InMemoryHistoryStore()


history_store: HistoryStore = _make_default()
