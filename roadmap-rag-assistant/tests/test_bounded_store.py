"""Per-process conversation state stays bounded: thread count and idle time."""

from __future__ import annotations

import sqlite3

from rag_service.core import bounded
from rag_service.core.augmentation.history import HISTORY_RETENTION_SECONDS, InMemoryHistoryStore, SqliteHistoryStore
from rag_service.core.bounded import BoundedStore


def test_least_recently_used_threads_are_dropped_past_the_limit():
    store = BoundedStore(max_items=3)
    for key in "abcd":
        store.set(key, key)
    assert "a" not in store and len(store) == 3


def test_reading_a_thread_keeps_it():
    store = BoundedStore(max_items=2)
    store.set("a", 1)
    store.set("b", 2)
    store.get("a")
    store.set("c", 3)
    assert "a" in store and "b" not in store


def test_idle_threads_expire(monkeypatch):
    clock = [0.0]
    monkeypatch.setattr(bounded, "_now", lambda: clock[0])
    store = BoundedStore(ttl=10)
    store.set("a", 1)
    clock[0] = 11
    assert store.get("a") is None
    store.set("b", 2)
    assert len(store) == 1


def test_twenty_thousand_threads_never_exceed_the_limit():
    history = InMemoryHistoryStore()
    for i in range(20_000):
        history.append(f"t{i}", "user", "hi")
    assert len(history._threads) == bounded.DEFAULT_MAX_ITEMS


def test_session_store_is_bounded():
    from rag_service.state.session_store import SessionStore

    store = SessionStore()
    for i in range(bounded.DEFAULT_MAX_ITEMS + 50):
        store.get_or_create(f"s{i}")
    assert len(store._sessions) == bounded.DEFAULT_MAX_ITEMS


def test_sqlite_history_purges_old_turns_and_migrates_old_files(tmp_path):
    path = tmp_path / "history.db"
    db = sqlite3.connect(path)
    db.execute("CREATE TABLE chat_turn (id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT NOT NULL, "
               "role TEXT NOT NULL, content TEXT NOT NULL)")
    db.execute("INSERT INTO chat_turn (thread_id, role, content) VALUES ('old-file', 'user', 'kept')")
    db.commit()
    db.close()

    store = SqliteHistoryStore(str(path))  # adds created_at; NULL rows are kept
    store.append("t", "user", "recent")
    store._db.execute("INSERT INTO chat_turn (thread_id, role, content, created_at) VALUES ('t', 'user', 'stale', 1)")
    store._db.commit()

    reopened = SqliteHistoryStore(str(path))
    contents = {row[0] for row in reopened._db.execute("SELECT content FROM chat_turn")}
    assert contents == {"kept", "recent"}
    assert HISTORY_RETENTION_SECONDS == 30 * 24 * 3600
