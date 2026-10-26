"""Questions never become roadmap writes: implicit questions, the LLM router's guesses, and question-like titles.

Production case: "có thể thao tác gì ở dự án này" went to the LLM router, came back as ROADMAP_CUD,
and was created as a topic with that sentence as its name.
"""

from __future__ import annotations

import asyncio

import pytest

from rag_service.agent import NextGenRoadmapAgent
from rag_service.auth import set_actor
from rag_service.core.augmentation.history import Turn, history_store
from rag_service.domains.roadmap.router.intent_router import IntentRouter, build_router_prompt
from rag_service.domains.roadmap.router.understanding import echoes_question
from rag_service.domains.roadmap.router.schemas import IntentClassificationResult, IntentType
from rag_service.steps import with_steps

@pytest.fixture(autouse=True)
def roadmap_data(mock_adapter):
    """Agent turns here read topics and layers: give them the mock roadmap (conftest blocks the live API)."""
    return mock_adapter


IMPLICIT_QUESTIONS = [
    ("có thể thao tác gì ở dự án này", IntentType.CHITCHAT),
    ("dự án này làm được những gì", IntentType.CHITCHAT),
    ("co the thao tac gi o day", IntentType.CHITCHAT),
    ("topic này có mấy bài", IntentType.KNOWLEDGE_QUERY),
    ("layer Backend có bao nhiêu bài học", IntentType.KNOWLEDGE_QUERY),
    ("bài Docker nằm ở đâu", IntentType.KNOWLEDGE_QUERY),
]

# Change requests that must stay changes: "não" is not "nào", and a polite question keeps its verb
CHANGES = ["tạo topic AI Engineering", "tạo topic về não bộ", "thêm bài Caching vào layer Backend"]


@pytest.mark.parametrize("text,intent", IMPLICIT_QUESTIONS)
def test_implicit_questions_are_never_changes(text, intent):
    res = IntentRouter().classify_heuristics(text)
    assert res is not None and res.intent == intent


@pytest.mark.parametrize("text", CHANGES)
def test_change_requests_still_route_to_cud(text):
    res = IntentRouter().classify_heuristics(text)
    assert res is not None and res.intent == IntentType.ROADMAP_CUD


# Sentence shapes that fooled the router: (message, intent, needs confirmation before the write)
TRICKY_SHAPES = [
    # 1. How-to question with a change verb: asks how to use the assistant, answered with the help card
    # (a knowledge search finds nothing: the knowledge base holds lessons, not usage docs)
    ("cách thêm bài vào layer", IntentType.CHITCHAT, False),
    ("các bước xóa một topic", IntentType.CHITCHAT, False),
    ("làm thế nào để tạo layer mới", IntentType.CHITCHAT, False),
    ("muốn xóa topic thì làm sao", IntentType.CHITCHAT, False),
    ("hướng dẫn chunking", IntentType.KNOWLEDGE_QUERY, False),
    ("tạo topic Cách mạng công nghiệp", IntentType.ROADMAP_CUD, False),
    # 2. Change asked politely as a question
    ("có thể thêm bài Kafka vào layer Backend không", IntentType.ROADMAP_CUD, True),
    ("bạn tạo topic AI được không", IntentType.ROADMAP_CUD, True),
    # 3. Question words inside the name
    ("tạo topic tên là Tại sao Docker", IntentType.ROADMAP_CUD, False),
    ("thêm bài Làm sao deploy Next.js vào layer DevOps", IntentType.ROADMAP_CUD, False),
    ('thêm bài "Docker là gì" vào layer DevOps', IntentType.ROADMAP_CUD, False),
    ("tạo topic như thế nào", IntentType.CHITCHAT, False),
    # 4. Change on a condition
    ("topic AI có bài Docker chưa, chưa thì thêm vào", IntentType.ROADMAP_CUD, True),
    ("nếu chưa có bài Redis thì thêm vào layer Backend", IntentType.ROADMAP_CUD, True),
]

# 5. Too little to decide: left to the LLM router, whose guessed changes the write guard stops
UNDERSPECIFIED = ["Kafka", "cái đó", "đổi sang tiếng Anh", "tôi muốn học về Docker"]


@pytest.mark.parametrize("text,intent,confirm", TRICKY_SHAPES)
def test_tricky_shapes_route_correctly(text, intent, confirm):
    res = IntentRouter().classify_heuristics(text)
    assert res is not None and res.intent == intent
    assert res.needs_confirmation == confirm


@pytest.mark.parametrize("text", UNDERSPECIFIED)
def test_underspecified_messages_are_left_to_the_llm(text):
    assert IntentRouter().classify_heuristics(text) is None


@pytest.mark.parametrize("text", UNDERSPECIFIED)
def test_llm_change_guess_on_underspecified_message_is_stopped(text):
    set_actor("owner")
    llm = _FixedLlm(IntentClassificationResult(intent=IntentType.ROADMAP_CUD, confidence=0.95))
    thread = f"safety-underspecified-{text}"
    history_store.clear(thread)
    steps, _ = _run(NextGenRoadmapAgent(llm_model=llm), text, thread)
    assert steps["answer"]["mode"] == "unclear" and not llm.extracted


def test_polite_request_shows_a_confirmation_card_instead_of_writing():
    set_actor("owner")

    async def run():
        events = []
        async for ev in NextGenRoadmapAgent(llm_model=None).astream_events(
            {"messages": [{"role": "user", "content": "bạn tạo topic Kafka Streams được không"}], "fast": True},
            config={"configurable": {"thread_id": "safety-polite"}},
        ):
            events.append(ev)
        return events

    events = asyncio.run(run())
    assert any(e.get("type") == "action_preview" for e in events)
    assert not any(e.get("type") == "tool_start" for e in events)


def test_change_request_needs_verb_and_object_unless_follow_up():
    router = IntentRouter()
    assert router.has_change_request("tạo topic AI")
    assert not router.has_change_request("có thể thao tác gì ở dự án này")
    assert not router.has_change_request("xóa nó đi")
    assert router.has_change_request("xóa nó đi", follow_up=True)
    assert not router.has_change_request("abc xyz", follow_up=True)


def test_question_echoed_as_title_is_caught_but_real_titles_are_kept():
    message = "có thể thao tác gì ở dự án này"
    assert echoes_question(message, message)
    assert not echoes_question("Docker là gì", "thêm bài Docker là gì vào layer Backend")
    assert not echoes_question("AI Engineering", "tạo topic AI Engineering")


def test_router_prompt_has_unclear_label_examples_and_history():
    prompt = build_router_prompt("xóa nó đi", [Turn("user", "tìm bài Kafka"), Turn("assistant", "Bài Kafka ...")])
    assert "UNCLEAR" in prompt and "có thể thao tác gì ở dự án này" in prompt
    assert "user: tìm bài Kafka" in prompt and 'Tin nhắn: "xóa nó đi"' in prompt
    assert "(chưa có)" in build_router_prompt("abc")


class _FixedLlm:
    """The router's LLM returns a fixed intent; any other call (the CUD extractor) is counted."""

    def __init__(self, result: IntentClassificationResult):
        self.result = result
        self.calls = 0
        self.schemas: list[str] = []

    def with_structured_output(self, schema):
        outer = self

        class _Bound:
            async def ainvoke(self, prompt):
                outer.schemas.append(schema.__name__)  # recorded when called, not when the client is built
                return await outer.ainvoke(prompt)

        return _Bound()

    @property
    def extracted(self) -> bool:
        """The CUD extractor ran: a change was about to be written."""
        return "StructuredRoadmapAction" in self.schemas

    async def ainvoke(self, prompt):
        self.calls += 1
        return self.result

    async def astream(self, prompt):
        self.calls += 1
        yield type("Chunk", (), {"content": "ok"})()


def _run(agent: NextGenRoadmapAgent, text: str, thread_id: str) -> tuple[dict, str]:
    async def run():
        steps, text_out = {}, ""
        async for ev in with_steps(agent.astream_events(
            {"messages": [{"role": "user", "content": text}], "fast": True},
            config={"configurable": {"thread_id": thread_id}},
        )):
            if ev.get("type") == "step" and ev["status"] != "running":
                steps[ev["id"]] = ev
            elif ev.get("type") == "token":
                text_out += ev.get("delta", "")
        return steps, text_out

    return asyncio.run(run())


@pytest.mark.parametrize(
    "result",
    [
        # Guessed change with no verb or object in the message
        IntentClassificationResult(intent=IntentType.ROADMAP_CUD, confidence=0.95, needs_cud_extraction=True),
        IntentClassificationResult(intent=IntentType.UNCLEAR, confidence=0.4),
    ],
)
def test_llm_guess_without_change_request_asks_back(result):
    set_actor("owner")
    llm = _FixedLlm(result)
    steps, text = _run(NextGenRoadmapAgent(llm_model=llm), "xyz qwerty", f"safety-{result.intent.value}")
    assert steps["route"]["method"] == "llm"
    assert steps["answer"]["mode"] == "unclear"
    assert "chưa hiểu rõ" in text
    # The router (and System 2 for a change guess) read it; nothing was extracted or written
    assert not llm.extracted


def test_low_confidence_llm_change_asks_back():
    # Follow-up "xóa nó đi" passes the verb check through history, so only confidence stops it
    set_actor("owner")
    thread = "safety-low-confidence"
    history_store.clear(thread)
    history_store.append(thread, "user", "tìm bài Kafka")
    history_store.append(thread, "assistant", "Bài Kafka nằm trong layer Backend.")
    llm = _FixedLlm(IntentClassificationResult(intent=IntentType.ROADMAP_CUD, confidence=0.6))
    steps, _ = _run(NextGenRoadmapAgent(llm_model=llm), "xóa nó đi", thread)
    assert steps["route"]["method"] == "llm"
    assert steps["answer"]["mode"] == "unclear" and not llm.extracted


def test_visitor_change_never_calls_system2():
    # A visitor cannot write: System 2 is skipped and the change handler answers "owner only"
    set_actor("visitor")
    llm = _FixedLlm(IntentClassificationResult(intent=IntentType.ROADMAP_CUD, confidence=0.95, needs_cud_extraction=True))
    steps, text = _run(NextGenRoadmapAgent(llm_model=llm), "tạo topic Kubernetes", "safety-visitor-write")
    assert "WriteVerdict" not in llm.schemas and not llm.extracted
    assert "owner" in text.lower() or "chủ" in text.lower()
    set_actor("owner")


class _System2Llm(_FixedLlm):
    """The router decides by heuristics; System 2 returns a full roadmap change; the extractor must not run."""

    def __init__(self, verdict):
        super().__init__(IntentClassificationResult(intent=IntentType.ROADMAP_CUD, confidence=0.95))
        self.verdict = verdict

    async def ainvoke(self, prompt):
        self.calls += 1
        return self.verdict


def test_write_reuses_system2_change_without_a_second_extraction(mock_adapter):
    from rag_service.domains.roadmap.router.schemas import ActionType, EntityLevel, SingleEntity, StructuredRoadmapAction
    from rag_service.domains.roadmap.router.verifier import Act, TargetSystem, WriteVerdict

    set_actor("owner")
    change = StructuredRoadmapAction(
        action=ActionType.CREATE, entity_level=EntityLevel.TOPIC,
        entities=[SingleEntity(title="tạo topic Kubernetes")], raw_intent_summary="Tạo topic Kubernetes",
    )
    verdict = WriteVerdict(
        intent=IntentType.ROADMAP_CUD, act=Act.COMMAND, target_system=TargetSystem.ROADMAP,
        action=ActionType.CREATE, entity_level=EntityLevel.TOPIC, confidence=0.95, change=change,
    )
    llm = _System2Llm(verdict)
    steps, text = _run(NextGenRoadmapAgent(llm_model=llm), 'tạo topic tên là "Kubernetes"', "safety-s2-reuse")
    assert llm.schemas == ["WriteVerdict"]  # one call: System 2; the extractor was not asked
    assert "Kubernetes" in text
