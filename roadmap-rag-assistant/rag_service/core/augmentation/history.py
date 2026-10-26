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


def _make_default() -> HistoryStore:
    """SQLite when RAG_HISTORY_DB is set in .env (e.g. data/history.db), otherwise RAM as before."""
    from rag_service.config import settings

    path = settings.rag_history_db.strip()
    return SqliteHistoryStore(path) if path else InMemoryHistoryStore()


history_store: HistoryStore = _make_default()
