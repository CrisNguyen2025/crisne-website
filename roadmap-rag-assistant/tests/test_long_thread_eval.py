"""Long-thread conversation eval & budget regression suite for Abot (offline, ADR-0012 & ADR-0020).

Measures the real sliding-window limits (`history_turns * 2`, `history_total_chars`),
query-transform history horizon (`HISTORY_TURNS = 4`), Owner Memory persistence across
25+ turns after old raw history is evicted, and strict Visitor isolation.
"""

from __future__ import annotations

import uuid

import pytest

from rag_service.auth import current_actor
from rag_service.context_usage import conversation_context, split_prompt
from rag_service.core.augmentation.context import GenerationRequest, build_prompt, format_history, synthesize_prompt
from rag_service.core.augmentation.history import InMemoryHistoryStore, Turn
from rag_service.core.memory import OwnerMemoryItem, OwnerMemoryStore
from rag_service.core.retrieval.transform import HISTORY_TURNS, build_prompt as build_transform_prompt, needs_plan
from rag_service.domains.roadmap.pipeline import generation_pipeline
from rag_service.domains.roadmap.profile import PROFILE
from tests.test_generation_pipeline import DOC, RecordingLLM


def _seed_turns(store: InMemoryHistoryStore, thread_id: str, pairs: list[tuple[str, str]]) -> None:
    for user_msg, assistant_msg in pairs:
        store.append(thread_id, "user", user_msg)
        store.append(thread_id, "assistant", assistant_msg)


def test_long_thread_eviction_and_context_usage_reporting():
    """After 15 turns (30 messages), window keeps newest 20 and reports 10 omitted within budget."""
    store = InMemoryHistoryStore(max_messages=50)
    thread_id = f"owner:{uuid.uuid4()}"
    pairs = [
        (f"Lượt hỏi số {i}: thảo luận về chủ đề phụ {i}", f"Trả lời lượt {i} về chủ đề phụ {i}.")
        for i in range(15)
    ]
    _seed_turns(store, thread_id, pairs)

    ctx = conversation_context(thread_id, PROFILE, model="gemini-2.5-flash", history=store)
    msg_part = next(p for p in ctx["parts"] if p["key"] == "messages")

    assert msg_part["count"] == PROFILE.history_turns * 2 == 20
    assert ctx["omitted"] == [{"key": "history_outside", "label": "Tin nhắn ngoài cửa sổ", "count": 10}]
    assert ctx["used"] <= ctx["budget"]

    prompt = build_prompt(
        GenerationRequest(mode="rag", query="Hybrid Search là gì?", thread_id=thread_id, sources=[(DOC, 0.9)]),
        PROFILE,
        history=store,
    )
    history_block = split_prompt(prompt)["history"]
    assert "Lượt hỏi số 0" not in history_block
    assert "Lượt hỏi số 4" not in history_block
    assert "Lượt hỏi số 5" in history_block
    assert "Lượt hỏi số 14" in history_block


def test_long_thread_char_budget_clips_long_turns_before_dropping_newest():
    """Large assistant/user pastes are clipped at history_max_chars=1000 so recent turns survive within 8000 chars."""
    turns = [Turn("user", "Mở đầu buổi học: mục tiêu là RAGAS")]
    for i in range(10):
        turns.append(Turn("assistant", f"MSG_{i}_" + ("a" * 1500)))
    turns.append(Turn("user", "Câu hỏi cuối cùng cần giữ lại"))

    rendered = format_history(turns, PROFILE)
    assert "Mở đầu buổi học: mục tiêu là RAGAS" not in rendered
    assert "Câu hỏi cuối cùng cần giữ lại" in rendered
    assert rendered.count("…") >= 7
    assert len(rendered) <= PROFILE.history_total_chars + 400


@pytest.mark.asyncio
async def test_owner_memory_survives_25_turn_eviction_while_visitor_stays_isolated(monkeypatch):
    """Facts promoted to Owner Memory remain pinned in <owner_memory> past 25 turns (50 msgs),
    even though turn-1 raw history has been evicted; Visitor never sees <owner_memory>."""
    store = InMemoryHistoryStore(max_messages=50)
    monkeypatch.setattr(
        "rag_service.core.generation.pipeline.synthesize_prompt",
        lambda req, profile, documents=None: synthesize_prompt(req, profile, history=store, documents=documents),
    )
    owner_tid = f"owner:{uuid.uuid4()}"
    visitor_tid = f"visitor:{uuid.uuid4()}"

    store.append(owner_tid, "user", "Ngữ cảnh tạm lượt 1: hôm nay chỉ test Docker")
    store.append(owner_tid, "assistant", "Đã hiểu, bắt đầu từ Docker.")
    # Push 24 more user+assistant pairs (50 messages total -> evicts turn 1 outside 20-msg window)
    _seed_turns(
        store,
        owner_tid,
        [(f"Câu hỏi domain gap/quiz lượt {i}", f"Phản hồi lượt {i}") for i in range(2, 26)],
    )
    _seed_turns(
        store,
        visitor_tid,
        [(f"Visitor turn {i}", f"Reply {i}") for i in range(12)],
    )

    mem_store = OwnerMemoryStore(api=None)
    token = current_actor.set("owner")
    try:
        await mem_store.create(kind="techstack", content="Techstack chính: Next.js 16 và FastAPI")
        mem_store._local.append(
            OwnerMemoryItem(
                id="obs-long-1",
                kind="learning_note",
                source="observed",
                status="active",
                content="Hay ôn Hybrid Search và Cross-Encoder Rerank",
                confidence=0.88,
            )
        )
        owner_memories = await mem_store.list_active(query="Hybrid Search trên FastAPI")
    finally:
        current_actor.reset(token)

    llm = RecordingLLM("Hybrid Search kết hợp BM25 và Vector. [[doc-1]]\n<sources>doc-1</sources>")

    # 1. Owner turn after 25 turns: raw turn 1 gone, <owner_memory> intact
    owner_tok = current_actor.set("owner")
    try:
        req_owner = GenerationRequest(
            mode="rag",
            query="Áp dụng Hybrid Search vào backend hiện tại thế nào?",
            thread_id=owner_tid,
            sources=[(DOC, 0.9)],
            owner_memories=owner_memories,
        )
        _ = [ev async for ev in generation_pipeline.astream(llm, req_owner)]
        owner_prompt = llm.prompts[-1]
    finally:
        current_actor.reset(owner_tok)

    owner_parts = split_prompt(owner_prompt)
    assert "Ngữ cảnh tạm lượt 1" not in owner_parts["history"]
    assert "Techstack chính: Next.js 16 và FastAPI" in owner_parts["owner_memory"]
    assert "Hay ôn Hybrid Search và Cross-Encoder Rerank" in owner_parts["owner_memory"]

    # 2. Visitor thread never receives <owner_memory> even if memories exist in process
    visitor_tok = current_actor.set("visitor")
    try:
        req_visitor = GenerationRequest(
            mode="rag",
            query="Hybrid Search là gì?",
            thread_id=visitor_tid,
            sources=[(DOC, 0.9)],
            owner_memories=(),
        )
        _ = [ev async for ev in generation_pipeline.astream(llm, req_visitor)]
        visitor_prompt = llm.prompts[-1]
    finally:
        current_actor.reset(visitor_tok)

    visitor_parts = split_prompt(visitor_prompt)
    assert visitor_parts["owner_memory"] == ""
    assert "Next.js 16" not in visitor_prompt


def test_query_transform_history_horizon_drops_early_anaphora_past_four_messages():
    """Documents the ADR-0012 / transform.py trade-off: plan_queries only sees the last HISTORY_TURNS=4 messages."""
    turns = [
        Turn("user", "Hybrid Search là gì?"),
        Turn("assistant", "Hybrid Search kết hợp BM25 và Dense Vector."),
        Turn("user", "Cảm ơn, giờ chuyển sang RAGAS."),
        Turn("assistant", "RAGAS có 4 chỉ số đánh giá RAG."),
        Turn("user", "Prompt Caching giúp gì?"),
        Turn("assistant", "Prompt Caching giảm chi phí và độ trễ phần prompt tĩnh."),
    ]
    query = "bài đầu tiên đó dùng BM25 thế nào?"
    assert needs_plan(query, turns) is True

    transform_prompt = build_transform_prompt(query, turns)
    # Last 4 messages (turns[2:]) are kept; turns[0..1] ("Hybrid Search") fell outside HISTORY_TURNS=4
    assert HISTORY_TURNS == 4
    assert "Prompt Caching" in transform_prompt
    assert "Hybrid Search" not in transform_prompt
