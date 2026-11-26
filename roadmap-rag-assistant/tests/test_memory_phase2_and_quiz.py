"""Tests for Owner Memory Phase 2 (auto-suggest extractor + consolidation) and Active Recall Quiz & Review."""

from __future__ import annotations

import json
import sys
import uuid

import httpx
import pytest

from rag_service.api import routes as routes_mod
from rag_service.api.server import app
from rag_service.auth import OWNER_ONLY_MESSAGE, current_actor
from rag_service.core.memory import (
    MAX_PENDING_MEMORIES,
    OwnerMemoryStore,
    extract_memory_suggestions,
    has_memory_signal,
    maybe_suggest_memories,
    owner_memory_store,
)
from rag_service.domains.roadmap.quiz_commands import is_quiz_exit, parse_quiz_request, strip_html_for_quiz
from rag_service.state import session_store

session_module = sys.modules["rag_service.state.session_store"]


class ScriptedLLM:
    """Minimal async LLM stub that returns scripted string responses in sequence."""

    def __init__(self, responses: list[str] | Exception) -> None:
        self._responses = list(responses) if isinstance(responses, list) else responses
        self.prompts: list[str] = []

    async def ainvoke(self, prompt: str):
        self.prompts.append(prompt)
        if isinstance(self._responses, Exception):
            raise self._responses
        text = self._responses.pop(0) if self._responses else "[]"
        return type("Resp", (), {"content": text})()


# ── Owner Memory Phase 2: Auto-suggest extractor ─────────────────────────────


def test_has_memory_signal_filters_noise_and_catches_durable_owner_facts():
    assert has_memory_signal("ok") is False
    assert has_memory_signal("Docker là gì?") is False
    assert has_memory_signal("bài nào cần ôn lại?") is False
    assert has_memory_signal("Mình vừa chuyển dự án sang Next.js 15 và Turso rồi") is True
    assert has_memory_signal("Mục tiêu Q4 là hoàn thành lộ trình AI Architecture") is True
    assert has_memory_signal("Mình hay nhầm giữa RRF và cross-encoder rerank") is True


@pytest.mark.asyncio
async def test_extractor_creates_pending_suggestions_with_replaces_id_and_filters_low_confidence():
    store = OwnerMemoryStore(api=None)
    old_mem = await store.create(kind="techstack", content="Đang dùng Next.js 14", status="active")

    llm_output = json.dumps([
        {
            "kind": "techstack",
            "content": "Đã nâng cấp sang Next.js 15 và FastAPI",
            "scoped": False,
            "replaces_memory_id": old_mem.id,
            "confidence": 0.92,
        },
        {
            "kind": "learning_note",
            "content": "Hay nhầm RRF với cross-encoder",
            "scoped": True,
            "replaces_memory_id": "nonexistent-id",
            "confidence": 0.81,
        },
        {
            "kind": "goal",
            "content": "Suy đoán yếu",
            "scoped": False,
            "confidence": 0.4,
        },
    ])
    llm = ScriptedLLM([llm_output])

    created = await maybe_suggest_memories(
        llm,
        user_message="Mình vừa nâng cấp lên Next.js 15 và hay nhầm RRF với cross-encoder",
        assistant_reply="Tuyệt vời, mình đã ghi nhận ngữ cảnh này.",
        scope="ai-architecture",
        store=store,
    )

    assert len(created) == 2
    assert all(m.status == "pending" and m.source == "suggested" for m in created)
    # Active list remains untouched until Owner approves
    assert [m.id for m in await store.list_active()] == [old_mem.id]

    pending = await store.list_pending()
    assert len(pending) == 2
    tech = next(m for m in pending if m.kind == "techstack")
    note = next(m for m in pending if m.kind == "learning_note")
    assert tech.replaces_memory_id == old_mem.id
    assert tech.scope is None
    assert note.replaces_memory_id is None  # invalid ID stripped
    assert note.scope == "ai-architecture"


@pytest.mark.asyncio
async def test_extractor_is_strictly_owner_only_respects_pending_cap_and_fails_open():
    store = OwnerMemoryStore(api=None)
    llm = ScriptedLLM(['[{"kind":"profile","content":"Should never save","confidence":0.99}]'])

    # 1. Visitor never calls LLM or writes anything
    token = current_actor.set("visitor")
    try:
        res = await maybe_suggest_memories(
            llm,
            user_message="Mình là senior engineer dùng Rust và Next.js 15",
            store=store,
        )
        assert res == []
        assert llm.prompts == []
    finally:
        current_actor.reset(token)

    # 2. Fail-open when LLM raises
    broken_llm = ScriptedLLM(RuntimeError("rate limit 429"))
    assert await extract_memory_suggestions(broken_llm, user_message="Mình đang dùng Rust") == []

    # 3. Respects MAX_PENDING_MEMORIES cap (no LLM call once full)
    for i in range(MAX_PENDING_MEMORIES):
        await store.create(kind="learning_note", content=f"Pending item {i}", source="suggested", status="pending")
    cap_llm = ScriptedLLM(['[{"kind":"goal","content":"Extra goal","confidence":0.95}]'])
    assert (
        await maybe_suggest_memories(
            cap_llm,
            user_message="Mục tiêu Q4 là học xong Kubernetes và Docker",
            store=store,
        )
        == []
    )
    assert cap_llm.prompts == []


# ── Active Recall: Quiz & Review ─────────────────────────────────────────────


def test_parse_quiz_request_handles_variants_and_ignores_non_quiz_questions():
    assert parse_quiz_request("bài nào cần ôn lại?") is None
    assert parse_quiz_request("Hybrid Search là gì?") is None
    assert parse_quiz_request("nhớ giúp mình là mình dùng FastAPI") is None
    assert parse_quiz_request("đổi tên topic Test Topic thành New Topic") is None
    assert parse_quiz_request("đổi sang tiếng Anh") is None

    r1 = parse_quiz_request("quiz bài Hybrid Search")
    assert r1 is not None and r1.lesson == "Hybrid Search" and r1.num_questions == 3 and not r1.use_overdue_review

    r2 = parse_quiz_request("ôn nhanh 2 câu bài cần ôn nhất")
    assert r2 is not None and r2.use_overdue_review is True and r2.num_questions == 2

    r3 = parse_quiz_request("kiểm tra mình bài này")
    assert r3 is not None and r3.lesson == "" and not r3.use_overdue_review

    r4 = parse_quiz_request("quiz bài RAG trong topic AI Architecture")
    assert r4 is not None and r4.lesson == "RAG" and r4.topic_hint == "AI Architecture"

    assert is_quiz_exit("dừng quiz") is True
    assert is_quiz_exit("Hybrid Search kết hợp BM25 và vector") is False
    assert "BM25" in strip_html_for_quiz("<h2>Tổng quan</h2><p>Hybrid kết hợp <b>BM25</b> &amp; vector.</p>")


@pytest.mark.asyncio
async def test_visitor_cannot_start_quiz_or_read_owner_review_state(visitor_headers, mock_adapter):
    tid = f"visitor:{uuid.uuid4()}"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", headers=visitor_headers) as client:
        for msg in ("quiz bài Hybrid Search", "quiz bài cần ôn nhất"):
            res = await client.post("/chat/stream", json={"message": msg, "thread_id": tid})
            assert res.status_code == 200
            assert OWNER_ONLY_MESSAGE in res.text
    assert session_store.get_or_create(tid).active_quiz is None


@pytest.mark.asyncio
async def test_quiz_pass_on_learning_lesson_proposes_known_upgrade_and_records_gap_as_pending_memory(
    owner_headers, mock_adapter, monkeypatch
):
    lesson_html = (
        "<h2>Hybrid Search</h2>"
        "<p>Hybrid Search kết hợp tìm kiếm từ khóa BM25 và tìm kiếm ngữ nghĩa Vector Embeddings "
        "bằng thuật toán Reciprocal Rank Fusion (RRF) để tăng độ chính xác truy xuất.</p>"
    )
    mock_adapter.get_topic.return_value = {
        "id": "t-ai",
        "slug": "ai-architecture",
        "title": "AI Architecture",
        "items": [
            {
                "id": "lesson-hs",
                "title": "Hybrid Search",
                "section": "RAG",
                "status": "learning",
                "content": lesson_html,
                "order": 1,
            }
        ],
        "sections": ["RAG"],
    }
    mock_adapter.update_item.return_value = {"id": "lesson-hs", "title": "Hybrid Search", "status": "known"}

    quiz_llm = ScriptedLLM([
        json.dumps([
            {"question": "Hybrid Search kết hợp hai cơ chế nào?", "expected_points": "BM25 và Vector Embeddings"},
            {"question": "Thuật toán nào thường dùng để gộp thứ hạng hai danh sách?", "expected_points": "RRF"},
            {"question": "Khi nào nên dùng reranker sau RRF?", "expected_points": "Khi cần sắp xếp lại top-k chính xác hơn"},
        ]),
        json.dumps({"passed": True, "feedback": "Chính xác, kết hợp BM25 và Vector.", "gap": None}),
        json.dumps({"passed": True, "feedback": "Đúng, RRF gộp thứ hạng.", "gap": None}),
        json.dumps({
            "passed": False,
            "feedback": "Còn thiếu vai trò cross-encoder rerank trên top-k.",
            "gap": "Hay nhầm bước gộp RRF với bước cross-encoder rerank",
        }),
    ])
    monkeypatch.setattr(routes_mod._get_agent(), "llm", quiz_llm)

    tid = f"owner:{uuid.uuid4()}"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", headers=owner_headers) as client:
        # Start quiz
        r_start = await client.post(
            "/chat/stream",
            json={"message": "quiz bài Hybrid Search", "thread_id": tid, "context": {"roadmapSlug": "ai-architecture"}},
        )
        assert r_start.status_code == 200
        assert "start_lesson_quiz" in r_start.text
        assert "Câu 1/3" in r_start.text

        # Answer Q1, Q2, Q3 (2/3 pass + 1 knowledge gap)
        r1 = await client.post("/chat/stream", json={"message": "BM25 và Vector Embeddings", "thread_id": tid})
        assert "Câu 2/3" in r1.text

        r2 = await client.post("/chat/stream", json={"message": "Reciprocal Rank Fusion (RRF)", "thread_id": tid})
        assert "Câu 3/3" in r2.text

        r3 = await client.post("/chat/stream", json={"message": "Không rõ lắm", "thread_id": tid})
        assert "2/3" in r3.text
        assert "Chờ duyệt" in r3.text
        assert "event: action_preview" in r3.text
        assert "Xác nhận thực hiện" in r3.text
        assert session_store.get_or_create(tid).active_quiz is None

        # Pending learning_note memory was created automatically for Owner approval (never active)
        token = current_actor.set("owner")
        try:
            assert await owner_memory_store.list_active() == []
            pending = await owner_memory_store.list_pending()
            assert len(pending) == 1
            assert pending[0].kind == "learning_note"
            assert pending[0].scope == "ai-architecture"
            assert pending[0].source == "suggested"
            assert "cross-encoder" in pending[0].content
        finally:
            current_actor.reset(token)

        # Confirm Preview -> upgrades status to `known`
        r_ok = await client.post("/chat/stream", json={"message": "ok", "thread_id": tid})
        assert r_ok.status_code == 200
        mock_adapter.update_item.assert_awaited_once_with("lesson-hs", status="known")


@pytest.mark.asyncio
async def test_quiz_overdue_known_lesson_triggers_mark_reviewed_and_exit_works(
    owner_headers, mock_adapter, monkeypatch
):
    content_html = "<p>Docker đóng gói ứng dụng cùng toàn bộ thư viện phụ thuộc vào container nhẹ, chạy nhất quán trên mọi môi trường.</p>"
    mock_adapter.get_topic.return_value = {
        "id": "t-devops",
        "slug": "devops",
        "title": "DevOps",
        "items": [
            {
                "id": "lesson-old",
                "title": "Docker Container",
                "status": "known",
                "statusUpdatedAt": "2025-01-01T00:00:00.000Z",
                "content": content_html,
                "order": 1,
            },
            {
                "id": "lesson-recent",
                "title": "Kubernetes",
                "status": "known",
                "statusUpdatedAt": "2026-11-20T00:00:00.000Z",
                "content": content_html,
                "order": 2,
            },
        ],
        "sections": [],
    }
    mock_adapter.update_item.return_value = {"id": "lesson-old", "title": "Docker Container", "status": "known"}

    quiz_llm = ScriptedLLM([
        json.dumps([{"question": "Docker giải quyết vấn đề gì?", "expected_points": "Đóng gói môi trường nhất quán"}]),
        json.dumps({"passed": True, "feedback": "Chuẩn xác.", "gap": None}),
        json.dumps([{"question": "Câu 1?", "expected_points": "Đáp án"}]),
    ])
    monkeypatch.setattr(routes_mod._get_agent(), "llm", quiz_llm)

    tid = f"owner:{uuid.uuid4()}"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", headers=owner_headers) as client:
        # 1. Start overdue 1-question quiz -> picks Docker Container (oldest statusUpdatedAt)
        r_start = await client.post(
            "/chat/stream",
            json={"message": "ôn nhanh 1 câu bài cần ôn nhất", "thread_id": tid, "context": {"roadmapSlug": "devops"}},
        )
        assert "Docker Container" in r_start.text
        assert "Câu 1/1" in r_start.text

        # 2. Pass -> Preview to mark reviewed today
        r_ans = await client.post("/chat/stream", json={"message": "Đóng gói ứng dụng và môi trường nhất quán", "thread_id": tid})
        assert "Đánh dấu đã ôn hôm nay" in r_ans.text
        assert "event: action_preview" in r_ans.text

        # 3. Confirm -> calls update_item(markReviewed=True)
        r_ok = await client.post("/chat/stream", json={"message": "ok", "thread_id": tid})
        assert "mark_lesson_reviewed" in r_ok.text
        mock_adapter.update_item.assert_awaited_once_with("lesson-old", markReviewed=True)

        # 4. Start another quiz and exit mid-way with "dừng quiz"
        await client.post(
            "/chat/stream",
            json={"message": "quiz 1 câu bài Docker Container", "thread_id": tid, "context": {"roadmapSlug": "devops"}},
        )
        assert session_store.get_or_create(tid).active_quiz is not None
        r_exit = await client.post("/chat/stream", json={"message": "dừng quiz", "thread_id": tid})
        assert "Đã dừng phiên ôn tập" in r_exit.text
        assert session_store.get_or_create(tid).active_quiz is None


@pytest.mark.asyncio
async def test_quiz_refuses_empty_lesson_and_expires_after_ttl(owner_headers, mock_adapter, monkeypatch):
    mock_adapter.get_topic.return_value = {
        "id": "t-ai",
        "slug": "ai",
        "title": "AI",
        "items": [
            {"id": "empty-1", "title": "Empty Lesson", "status": "target", "content": "<p>Ngắn</p>", "order": 1}
        ],
        "sections": [],
    }
    tid = f"owner:{uuid.uuid4()}"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", headers=owner_headers) as client:
        r = await client.post(
            "/chat/stream",
            json={"message": "quiz bài Empty Lesson", "thread_id": tid, "context": {"roadmapSlug": "ai"}},
        )
        assert "chưa đủ nội dung" in r.text
        assert session_store.get_or_create(tid).active_quiz is None

    # TTL expiry check
    clock = [5000.0]
    monkeypatch.setattr(session_module, "_now", lambda: clock[0])
    ctx = session_store.get_or_create(tid)
    ctx.active_quiz = {"lesson_id": "x", "lesson_title": "X", "questions": [], "index": 0}
    assert ctx.fresh_pending("active_quiz", ttl=session_module.QUIZ_TTL_SECONDS) is not None
    clock[0] += session_module.QUIZ_TTL_SECONDS + 5
    assert ctx.fresh_pending("active_quiz", ttl=session_module.QUIZ_TTL_SECONDS) is None


def test_classify_quiz_gaps_separates_personal_cues_from_concept_gaps():
    from rag_service.domains.roadmap.quiz_commands import classify_quiz_gaps

    personal, conceptual = classify_quiz_gaps([
        "Hay nhầm bước gộp RRF với bước cross-encoder rerank",
        "Thiếu phần ví dụ cấu hình cross-encoder rerank",
        "Chưa hiểu khái niệm Speculative Decoding",
    ])
    assert personal == ["Hay nhầm bước gộp RRF với bước cross-encoder rerank"]
    assert conceptual == [
        "Thiếu phần ví dụ cấu hình cross-encoder rerank",
        "Chưa hiểu khái niệm Speculative Decoding",
    ]


@pytest.mark.asyncio
async def test_quiz_pass_with_concept_gap_chains_status_then_concept_promotion_preview(
    owner_headers, mock_adapter, monkeypatch
):
    lesson_html = (
        "<h2>Hybrid Search</h2>"
        "<p>Hybrid Search kết hợp tìm kiếm từ khóa BM25 và tìm kiếm ngữ nghĩa Vector Embeddings "
        "bằng thuật toán Reciprocal Rank Fusion (RRF).</p>"
    )
    mock_adapter.get_topic.return_value = {
        "id": "t-ai",
        "slug": "ai-architecture",
        "title": "AI Architecture",
        "items": [
            {
                "id": "lesson-hs",
                "title": "Hybrid Search",
                "section": "RAG",
                "status": "learning",
                "content": lesson_html,
                "order": 1,
            }
        ],
        "sections": ["RAG"],
    }
    mock_adapter.update_item.return_value = {"id": "lesson-hs", "title": "Hybrid Search", "status": "known"}
    mock_adapter.update_item_content.return_value = {"id": "lesson-hs", "title": "Hybrid Search"}

    quiz_llm = ScriptedLLM([
        json.dumps([
            {"question": "Hybrid Search kết hợp gì?", "expected_points": "BM25 và Vector"},
            {"question": "RRF dùng để làm gì?", "expected_points": "Gộp thứ hạng"},
            {"question": "Reranker làm gì sau RRF?", "expected_points": "Sắp xếp lại top-k"},
        ]),
        json.dumps({"passed": True, "feedback": "Chuẩn.", "gap": None}),
        json.dumps({"passed": True, "feedback": "Chuẩn RRF.", "gap": None}),
        json.dumps({
            "passed": False,
            "feedback": "Thiếu phần giải thích cụ thể.",
            "gap": "Thiếu phần ví dụ triển khai cross-encoder rerank",
        }),
        "## Bổ sung: Hybrid Search\n\nVí dụ triển khai cross-encoder rerank trên top-20.",
    ])
    monkeypatch.setattr(routes_mod._get_agent(), "llm", quiz_llm)

    tid = f"owner:{uuid.uuid4()}"
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test", headers=owner_headers
    ) as client:
        await client.post(
            "/chat/stream",
            json={"message": "quiz 3 câu bài Hybrid Search", "thread_id": tid, "context": {"roadmapSlug": "ai-architecture"}},
        )
        await client.post("/chat/stream", json={"message": "BM25 và Vector", "thread_id": tid})
        await client.post("/chat/stream", json={"message": "RRF gộp thứ hạng", "thread_id": tid})
        r_end = await client.post("/chat/stream", json={"message": "Không rõ", "thread_id": tid})
        assert "Đề xuất cập nhật trạng thái bài học" in r_end.text
        assert "event: action_preview" in r_end.text

        ctx = session_store.get_or_create(tid)
        assert ctx.pending_status_change is not None
        assert ctx.pending_concept_promotion is not None
        assert ctx.pending_concept_promotion["mode"] == "append"
        assert ctx.pending_concept_promotion["item_id"] == "lesson-hs"

        # 1st ok: confirms status change first and emits follow-up concept promotion preview
        r_ok1 = await client.post("/chat/stream", json={"message": "ok", "thread_id": tid})
        mock_adapter.update_item.assert_awaited_once_with("lesson-hs", status="known")
        assert "ĐỀ XUẤT BỔ SUNG KIẾN THỨC" in r_ok1.text
        assert "event: action_preview" in r_ok1.text
        mock_adapter.update_item_content.assert_not_awaited()

        # 2nd ok: confirms concept promotion append via update_item_content
        r_ok2 = await client.post("/chat/stream", json={"message": "ok", "thread_id": tid})
        assert "update_item_content" in r_ok2.text
        mock_adapter.update_item_content.assert_awaited_once()
        _, saved_html = mock_adapter.update_item_content.await_args.args
        assert "cross-encoder rerank" in saved_html


@pytest.mark.asyncio
async def test_quiz_memory_cap_full_falls_back_to_concept_promotion_preview(
    owner_headers, mock_adapter, monkeypatch
):
    token = current_actor.set("owner")
    try:
        for i in range(MAX_PENDING_MEMORIES):
            await owner_memory_store.create(kind="learning_note", content=f"Ghi nhớ chờ duyệt {i}", status="pending")
    finally:
        current_actor.reset(token)

    mock_adapter.get_topic.return_value = {
        "id": "t-ai",
        "slug": "ai-architecture",
        "title": "AI Architecture",
        "items": [
            {
                "id": "lesson-chunk",
                "title": "Chunking",
                "section": "RAG",
                "status": "learning",
                "content": "<p>Chunking chia nhỏ tài liệu dài theo token window và overlap phù hợp.</p>",
                "order": 1,
            }
        ],
        "sections": ["RAG"],
    }
    quiz_llm = ScriptedLLM([
        json.dumps([{"question": "Overlap dùng để làm gì?", "expected_points": "Giữ ngữ cảnh biên đoạn"}]),
        json.dumps({"passed": False, "feedback": "Chưa nêu overlap.", "gap": "Hay nhầm kích thước overlap khi chunk"}),
        "## Bổ sung: Chunking\n\nChi tiết chọn kích thước overlap.",
    ])
    monkeypatch.setattr(routes_mod._get_agent(), "llm", quiz_llm)

    tid = f"owner:{uuid.uuid4()}"
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test", headers=owner_headers
    ) as client:
        await client.post(
            "/chat/stream",
            json={"message": "quiz 1 câu bài Chunking", "thread_id": tid, "context": {"roadmapSlug": "ai-architecture"}},
        )
        r_end = await client.post("/chat/stream", json={"message": "Chia nhỏ tài liệu", "thread_id": tid})
        assert "event: action_preview" in r_end.text
        assert "ĐỀ XUẤT BỔ SUNG KIẾN THỨC" in r_end.text
        assert session_store.get_or_create(tid).pending_concept_promotion is not None
