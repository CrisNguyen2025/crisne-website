"""The Owner's history and open Topic in Turso through the Next.js API (ADR-0012): RAM first, network in the background."""

from __future__ import annotations

import json

import httpx
import pytest

from rag_service.auth import current_actor
from rag_service.config import settings
from rag_service.core import thread_api
from rag_service.core.augmentation import history
from rag_service.core.augmentation.history import HttpHistoryStore, InMemoryHistoryStore, SqliteHistoryStore, Turn
from rag_service.core.thread_api import ThreadApi
from rag_service.state.session_store import SessionStore

THREAD = "owner:t1"
ADMIN_KEY = "test-admin-key"


class FakeApi:
    """Stands in for the Next.js thread routes: records every request, answers with `reply`."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.status = 200
        self.messages: list[dict] = []
        self.state: dict | None = None
        self.fail_with: Exception | None = None

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.fail_with is not None:
            raise self.fail_with
        if request.method == "GET":
            return httpx.Response(self.status, json={"messages": self.messages, "state": self.state})
        return httpx.Response(self.status, json={"ok": True})

    def calls(self) -> list[tuple[str, str]]:
        # The path as sent, so the encoding of the thread id is checked too
        return [(r.method, r.url.raw_path.decode()) for r in self.requests]


@pytest.fixture
def api() -> FakeApi:
    return FakeApi()


@pytest.fixture
def client(api: FakeApi, monkeypatch) -> ThreadApi:
    c = ThreadApi("http://next.test", ADMIN_KEY)
    transport = httpx.MockTransport(api.handle)
    monkeypatch.setattr(
        c, "_client", lambda timeout: httpx.AsyncClient(transport=transport, base_url="http://next.test", headers=c._headers)
    )
    return c


@pytest.fixture
def store(client: ThreadApi) -> HttpHistoryStore:
    return HttpHistoryStore(client)


@pytest.fixture
def sessions(client: ThreadApi) -> SessionStore:
    return SessionStore(client)


async def test_owner_messages_are_sent_in_order_after_going_to_ram(store, api):
    store.append(THREAD, "user", "hỏi")
    store.append(THREAD, "assistant", "đáp")

    # RAM answers at once, before anything was sent
    assert store.get_recent(THREAD, 5) == [Turn("user", "hỏi"), Turn("assistant", "đáp")]
    assert api.requests == []

    await store.flush()

    assert api.calls() == [("POST", "/api/v1/threads/owner%3At1")] * 2
    assert [json.loads(r.read()) for r in api.requests] == [
        {"role": "user", "content": "hỏi"},
        {"role": "assistant", "content": "đáp"},
    ]
    assert all(r.headers["x-admin-key"] == ADMIN_KEY for r in api.requests)


async def test_a_visitor_is_never_sent_even_on_an_owner_thread_id(store, api):
    token = current_actor.set("visitor")
    try:
        store.append(THREAD, "user", "hi")
        store.clear(THREAD)
        await store.load(THREAD)
    finally:
        current_actor.reset(token)
    await store.flush()

    assert api.requests == []
    assert store.get_recent(THREAD, 5) == []  # cleared in RAM, nothing fetched


async def test_a_visitor_thread_id_is_never_sent_even_for_the_owner(store, api):
    store.append("visitor:t1", "user", "hi")
    store.clear("visitor:t1")
    await store.load("visitor:t1")
    await store.flush()

    assert api.requests == []


async def test_load_fills_ram_oldest_first_and_ignores_unknown_roles(store, api):
    api.messages = [
        {"role": "user", "content": "một"},
        {"role": "assistant", "content": "hai"},
        {"role": "system", "content": "bỏ"},
        {"role": "user", "content": "ba"},
    ]

    await store.load(THREAD)

    assert store.get_recent(THREAD, 10) == [Turn("user", "một"), Turn("assistant", "hai"), Turn("user", "ba")]
    assert api.calls() == [("GET", "/api/v1/threads/owner%3At1")]


async def test_load_does_not_replace_a_thread_ram_already_holds(store, api):
    store.append(THREAD, "user", "mới")
    await store.flush()
    api.requests.clear()
    api.messages = [{"role": "user", "content": "cũ"}]

    await store.load(THREAD)

    assert store.get_recent(THREAD, 10) == [Turn("user", "mới")]
    assert api.requests == []


@pytest.mark.parametrize(
    "setup",
    [
        lambda api: setattr(api, "status", 500),
        lambda api: setattr(api, "fail_with", httpx.ConnectError("down")),
        lambda api: setattr(api, "fail_with", httpx.ReadTimeout("slow")),
    ],
    ids=["http-500", "connect-error", "timeout"],
)
async def test_load_failure_leaves_the_thread_working_from_ram(store, api, setup):
    setup(api)

    await store.load(THREAD)
    store.append(THREAD, "user", "vẫn chạy")

    assert store.get_recent(THREAD, 10) == [Turn("user", "vẫn chạy")]


async def test_a_failed_write_is_dropped_and_the_next_one_still_goes(store, api):
    api.fail_with = httpx.ConnectError("down")
    store.append(THREAD, "user", "một")
    await store.flush()
    api.fail_with = None
    store.append(THREAD, "user", "hai")
    await store.flush()

    assert len(api.requests) == 2
    assert json.loads(api.requests[1].read()) == {"role": "user", "content": "hai"}
    assert store.get_recent(THREAD, 10) == [Turn("user", "một"), Turn("user", "hai")]


async def test_clear_empties_ram_and_deletes_after_the_earlier_writes(store, api):
    store.append(THREAD, "user", "hi")
    store.clear(THREAD)
    await store.flush()

    assert api.calls() == [("POST", "/api/v1/threads/owner%3At1"), ("DELETE", "/api/v1/threads/owner%3At1")]
    assert store.get_recent(THREAD, 10) == []


async def test_empty_content_is_neither_kept_nor_sent(store, api):
    store.append(THREAD, "assistant", "")
    await store.flush()

    assert api.requests == []
    assert store.get_recent(THREAD, 10) == []


def test_without_an_event_loop_a_change_stays_in_ram(api):
    s = HttpHistoryStore(ThreadApi("http://next.test", ADMIN_KEY))

    s.append(THREAD, "user", "đồng bộ")

    assert s.get_recent(THREAD, 10) == [Turn("user", "đồng bộ")]
    assert len(s._api._pending) == 0


def test_writes_waiting_for_the_network_are_bounded(monkeypatch):
    monkeypatch.setattr(thread_api, "MAX_PENDING_WRITES", 3)
    assert ThreadApi("http://next.test", ADMIN_KEY)._pending.maxlen == 3


def test_default_store_follows_the_settings(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "rag_history_db", "")
    monkeypatch.setattr(settings, "rag_adapter_mode", "http")
    monkeypatch.setattr(settings, "admin_api_key", ADMIN_KEY)
    assert isinstance(history._make_default(), HttpHistoryStore)

    monkeypatch.setattr(settings, "admin_api_key", "")
    assert isinstance(history._make_default(), InMemoryHistoryStore)

    monkeypatch.setattr(settings, "admin_api_key", ADMIN_KEY)
    monkeypatch.setattr(settings, "rag_adapter_mode", "sqlite")
    assert isinstance(history._make_default(), InMemoryHistoryStore)

    # A local history file wins, so a local run keeps its own trace
    monkeypatch.setattr(settings, "rag_adapter_mode", "http")
    monkeypatch.setattr(settings, "rag_history_db", str(tmp_path / "h.db"))
    assert isinstance(history._make_default(), SqliteHistoryStore)


async def test_local_stores_have_a_no_op_load(tmp_path):
    await InMemoryHistoryStore().load(THREAD)
    await SqliteHistoryStore(str(tmp_path / "h.db")).load(THREAD)


# ── The open Topic ─────────────────────────────────────────────────────────


async def test_an_owner_topic_is_kept_in_ram_and_sent_in_the_background(sessions, api):
    sessions.set_active_topic(THREAD, "ai", "AI")

    assert sessions.get_or_create(THREAD).active_topic_slug == "ai"
    assert api.requests == []

    await sessions._api.flush()

    assert api.calls() == [("PATCH", "/api/v1/threads/owner%3At1")]
    assert json.loads(api.requests[0].read()) == {"activeTopicSlug": "ai", "activeTopicTitle": "AI"}
    assert api.requests[0].headers["x-admin-key"] == ADMIN_KEY


async def test_a_topic_set_without_a_title_sends_the_title_ram_holds(sessions, api):
    sessions.set_active_topic(THREAD, "ai", "AI")
    sessions.set_active_topic(THREAD, "ai")
    await sessions._api.flush()

    assert [json.loads(r.read())["activeTopicTitle"] for r in api.requests] == ["AI", "AI"]


async def test_a_blank_slug_is_not_sent(sessions, api):
    sessions.set_active_topic(THREAD, "", "x")
    await sessions._api.flush()

    assert api.requests == []


async def test_a_visitor_topic_is_never_sent(sessions, api):
    token = current_actor.set("visitor")
    try:
        sessions.set_active_topic(THREAD, "ai", "AI")
        await sessions.load(THREAD)
    finally:
        current_actor.reset(token)
    sessions.set_active_topic("visitor:t1", "ai", "AI")
    await sessions.load("visitor:t1")
    await sessions._api.flush()

    assert api.requests == []
    assert sessions.get_or_create("visitor:t1").active_topic_slug == "ai"


async def test_load_restores_the_open_topic_once(sessions, api):
    api.state = {"activeTopicSlug": "backend", "activeTopicTitle": "Backend"}

    await sessions.load(THREAD)
    await sessions.load(THREAD)

    ctx = sessions.get_or_create(THREAD)
    assert (ctx.active_topic_slug, ctx.active_topic_title) == ("backend", "Backend")
    assert api.calls() == [("GET", "/api/v1/threads/owner%3At1")]  # the second load read nothing


async def test_a_thread_without_a_stored_topic_is_not_read_again(sessions, api):
    await sessions.load(THREAD)
    await sessions.load(THREAD)

    assert sessions.get_or_create(THREAD).active_topic_slug is None
    assert len(api.requests) == 1


async def test_load_keeps_a_topic_ram_already_holds(sessions, api):
    sessions.set_active_topic(THREAD, "ai", "AI")
    await sessions._api.flush()
    api.requests.clear()
    api.state = {"activeTopicSlug": "backend", "activeTopicTitle": "Backend"}

    await sessions.load(THREAD)

    assert sessions.get_or_create(THREAD).active_topic_slug == "ai"


@pytest.mark.parametrize(
    "setup",
    [
        lambda api: setattr(api, "status", 500),
        lambda api: setattr(api, "fail_with", httpx.ConnectError("down")),
    ],
    ids=["http-500", "connect-error"],
)
async def test_topic_load_failure_leaves_the_thread_working_from_ram(sessions, api, setup):
    setup(api)

    await sessions.load(THREAD)
    sessions.set_active_topic(THREAD, "ai", "AI")

    assert sessions.get_or_create(THREAD).active_topic_slug == "ai"


async def test_only_the_topic_is_restored_never_a_pending_change(sessions, api):
    api.state = {"activeTopicSlug": "ai", "activeTopicTitle": "AI", "pendingConfirmation": {"x": 1}}

    await sessions.load(THREAD)

    ctx = sessions.get_or_create(THREAD)
    assert ctx.pending_confirmation is None and ctx.pending_since == {}


def test_a_session_store_without_an_api_stays_in_ram():
    plain = SessionStore()
    plain.set_active_topic(THREAD, "ai", "AI")
    assert plain.get_or_create(THREAD).active_topic_slug == "ai"
