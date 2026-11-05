"""Lesson content drafts through the chat: "thêm nội dung chi tiết cho bài X" (owner only).

2026-11-05, live (trace 860725dcb48c6cd83b5de8ca4be0cb36): "thêm nội dung chi tiết cho bài “viết mặc định” trong
Frontend" was read as "add a lesson" with no name, and the ask-back named UI/UX Design, the topic the thread had
open before, while the page showed Frontend. The page's lesson slug was "viet-mac-inh": slugify dropped "đ".
"""

from __future__ import annotations

import asyncio
import uuid
from types import SimpleNamespace

from rag_service.auth import set_actor
from rag_service.domains.roadmap.agent import NextGenRoadmapAgent
from rag_service.domains.roadmap.lesson_content import lesson_slugs, markdown_to_html, parse_content_request
from rag_service.state import session_store

TOPICS = [
    {"slug": "frontend", "title": "Frontend"},
    {"slug": "uiux-design", "title": "UI/UX Design"},
]
FRONTEND = {
    "slug": "frontend",
    "title": "Frontend",
    "items": [{"id": "l-1", "title": "viết mặc định", "section": None, "description": "", "content": ""}],
    "sections": [None],
}
DRAFT = "## Giá trị mặc định\n\n- Một **ý** chính\n- `code` ngắn\n\n```js\nconst a = 1 < 2;\n```"


class FakeLLM:
    def __init__(self, text: str = DRAFT) -> None:
        self.text, self.prompts = text, []

    async def ainvoke(self, prompt):
        self.prompts.append(prompt)
        return SimpleNamespace(content=self.text)


def _turn(agent, text: str, thread: str, context: dict | None = None) -> tuple[str, list[dict]]:
    async def run():
        out = []
        payload = {"messages": [{"role": "user", "content": text}], "fast": True}
        if context:
            payload["context"] = context
        async for ev in agent.astream_events(payload, config={"configurable": {"thread_id": thread}}):
            out.append(ev)
        return out

    events = asyncio.run(run())
    return "".join(e.get("delta", "") for e in events if e.get("type") == "token"), events


def _setup(adapter, topic=FRONTEND):
    adapter.list_topics.return_value = TOPICS
    adapter.get_topic.return_value = topic
    adapter.update_item_content.return_value = {"id": "l-1"}


# ── Parsing ──


def test_the_live_message_names_the_lesson_and_the_topic():
    req = parse_content_request("thêm nội dung chi tiết cho bài “viết mặc định” trong Frontend")
    assert req is not None and req.lesson == "viết mặc định" and req.topic == "Frontend"


def test_other_wordings_and_the_page_lesson():
    assert parse_content_request("viết nội dung cho bài Kafka Basics").lesson == "Kafka Basics"
    assert parse_content_request("bổ sung chi tiết bài React Hooks trong topic Frontend").lesson == "React Hooks"
    assert parse_content_request("them noi dung cho bai nay").lesson == ""


def test_adding_a_lesson_or_vague_topic_content_is_not_a_draft_request():
    for text in ["thêm bài Kafka vào topic Frontend", "thêm nội dung cho topic Frontend", "nội dung bài Kafka là gì?"]:
        assert parse_content_request(text) is None, text


def test_lesson_slugs_cover_the_old_slug_that_dropped_d():
    assert {"viet-mac-dinh", "viet-mac-inh"} <= lesson_slugs("viết mặc định")


def test_markdown_becomes_safe_html():
    html = markdown_to_html(DRAFT + "\n\n# Tiêu đề\n\n<script>x</script>")
    assert "<h2>Giá trị mặc định</h2>" in html and "<ul><li>Một <strong>ý</strong> chính</li>" in html
    assert '<pre><code class="language-js">const a = 1 &lt; 2;</code></pre>' in html
    assert "<h2>Tiêu đề</h2>" in html  # no second h1 under the lesson title
    assert "<script>" not in html


# ── Chat ──


def test_owner_gets_a_preview_and_ok_adds_the_draft(mock_adapter):
    set_actor("owner")
    _setup(mock_adapter)
    llm, thread = FakeLLM(), f"s-{uuid.uuid4()}"
    agent = NextGenRoadmapAgent(llm_model=llm)
    text, events = _turn(agent, "thêm nội dung chi tiết cho bài “viết mặc định” trong Frontend", thread,
                         context={"roadmapSlug": "frontend", "itemId": "viet-mac-inh"})
    assert "NHÁP NỘI DUNG" in text and "Giá trị mặc định" in text and "**Frontend**" in text
    assert any(e.get("type") == "action_preview" for e in events)
    assert "viết mặc định" in llm.prompts[0] and "Frontend" in llm.prompts[0]
    mock_adapter.update_item_content.assert_not_awaited()

    text, events = _turn(agent, "ok", thread)
    assert "Đã thêm nội dung" in text
    item_id, html = mock_adapter.update_item_content.await_args.args
    assert item_id == "l-1" and html.startswith("<h2>Giá trị mặc định</h2>")
    assert any(e.get("type") == "tool_end" and e.get("name") == "update_item_content" for e in events)


def test_ok_keeps_the_existing_content_and_adds_after_it(mock_adapter):
    set_actor("owner")
    with_body = {**FRONTEND, "items": [{**FRONTEND["items"][0], "content": "<p>Đã có</p>"}]}
    _setup(mock_adapter, with_body)
    llm, thread = FakeLLM(), f"s-{uuid.uuid4()}"
    agent = NextGenRoadmapAgent(llm_model=llm)
    text, _ = _turn(agent, "thêm nội dung cho bài viết mặc định", thread, context={"roadmapSlug": "frontend"})
    assert "thêm vào cuối nội dung đang có" in text
    assert "KHÔNG lặp lại" in llm.prompts[0] and "Đã có" in llm.prompts[0]
    _turn(agent, "ok", thread)
    _, html = mock_adapter.update_item_content.await_args.args
    assert html.startswith("<p>Đã có</p>\n<h2>")


def test_this_lesson_is_the_page_lesson_even_with_the_old_slug(mock_adapter):
    set_actor("owner")
    _setup(mock_adapter)
    text, _ = _turn(NextGenRoadmapAgent(llm_model=FakeLLM()), "viết nội dung chi tiết cho bài này", f"s-{uuid.uuid4()}",
                    context={"roadmapSlug": "frontend", "itemId": "viet-mac-inh"})
    assert "NHÁP NỘI DUNG" in text and "viết mặc định" in text


def test_cancel_drops_the_draft(mock_adapter):
    set_actor("owner")
    _setup(mock_adapter)
    agent, thread = NextGenRoadmapAgent(llm_model=FakeLLM()), f"s-{uuid.uuid4()}"
    _turn(agent, "thêm nội dung chi tiết cho bài viết mặc định", thread, context={"roadmapSlug": "frontend"})
    text, _ = _turn(agent, "hủy", thread)
    assert "bỏ bản nháp" in text
    assert session_store.get_or_create(thread).pending_content_draft is None
    mock_adapter.update_item_content.assert_not_awaited()


def test_unknown_lesson_lists_the_topic_lessons_and_writes_nothing(mock_adapter):
    set_actor("owner")
    _setup(mock_adapter)
    llm = FakeLLM()
    text, _ = _turn(NextGenRoadmapAgent(llm_model=llm), "thêm nội dung cho bài Kafka", f"s-{uuid.uuid4()}",
                    context={"roadmapSlug": "frontend"})
    assert "không tìm thấy bài **Kafka**" in text and "viết mặc định" in text
    assert llm.prompts == []


def test_visitor_cannot_draft(mock_adapter):
    set_actor("visitor")
    _setup(mock_adapter)
    llm = FakeLLM()
    text, _ = _turn(NextGenRoadmapAgent(llm_model=llm), "thêm nội dung cho bài viết mặc định", f"s-{uuid.uuid4()}",
                    context={"roadmapSlug": "frontend"})
    assert "owner" in text.lower() and llm.prompts == []
    set_actor("owner")


def test_vague_change_names_the_page_topic_not_the_threads_last(mock_adapter):
    set_actor("owner")
    _setup(mock_adapter)
    thread = f"s-{uuid.uuid4()}"
    session_store.set_active_topic(thread, "uiux-design", "UI/UX Design")
    text, _ = _turn(NextGenRoadmapAgent(llm_model=None), "thêm nội dung cho topic này", thread,
                    context={"roadmapSlug": "frontend"})
    assert "Bạn muốn thêm gì vào topic **Frontend**" in text and "UI/UX Design" not in text
