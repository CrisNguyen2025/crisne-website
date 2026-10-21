"""Query understanding reads two independent axes: speech act (what the user does) and target (what it is about).

The intent comes from act × target, so these tests pin each axis on its own: look-alike messages that share
keywords must differ on exactly the axis that separates them.
"""

from __future__ import annotations

import asyncio

import pytest

import rag_service.tools as rag_tools
from rag_service.agent import NextGenRoadmapAgent
from rag_service.auth import set_actor
from rag_service.domains.roadmap.router.intent_router import IntentRouter
from rag_service.domains.roadmap.router.schemas import IntentType
from rag_service.domains.roadmap.router.understanding import SpeechAct, Target, understand
from rag_service.steps import with_steps

@pytest.fixture(autouse=True)
def no_live_database(mock_adapter):
    """Agent turns here must never reach the running Next.js: a CUD path would write to the real database."""
    yield mock_adapter
    rag_tools._adapter = None


ACTS = [
    ("/plan học backend", SpeechAct.PLAN),
    ("tôi tên gì?", SpeechAct.RECALL),
    ("xin chào", SpeechAct.GREETING),
    ("bạn tạo topic AI được không", SpeechAct.REQUEST),
    ("chưa có bài Redis thì thêm vào layer Backend", SpeechAct.REQUEST),
    ("cách thêm bài vào layer", SpeechAct.QUESTION),
    ("tạo topic như thế nào", SpeechAct.QUESTION),
    ("thêm bài Caching vào layer Backend", SpeechAct.COMMAND),
    ("tạo topic tên là Tại sao Docker", SpeechAct.COMMAND),
    ("xóa nó đi", SpeechAct.COMMAND),
    ("Kafka", SpeechAct.STATEMENT),
]

TARGETS = [
    ("giá vàng hôm nay", Target.OFF_TOPIC),
    ("viết bài thơ về topic AI", Target.OFF_TOPIC),
    ("có thể thao tác gì ở dự án này", Target.ASSISTANT),
    ("bạn là ai", Target.ASSISTANT),
    ("gợi ý vài prompt", Target.ASSISTANT),
    # How to make a change is a question about using the assistant, not about roadmap content
    ("cách thêm bài vào layer", Target.ASSISTANT),
    ("tạo topic như thế nào", Target.ASSISTANT),
    ("thêm bài Làm sao deploy Next.js vào layer DevOps", Target.ROADMAP),
    ("topic này có mấy bài", Target.ROADMAP),
    ("xoa bai kafka", Target.ROADMAP),
    ("Kafka", Target.NONE),
]


@pytest.mark.parametrize("text,act", ACTS)
def test_speech_act(text, act):
    assert understand(text).act == act


@pytest.mark.parametrize("text,target", TARGETS)
def test_target(text, target):
    assert understand(text).target == target


# Pairs with the same keywords: the axis that separates them, and the intents they must reach
LOOK_ALIKES = [
    # Same verb and object, different act
    ("cách thêm bài vào layer", "thêm bài Caching vào layer Backend",
     (SpeechAct.QUESTION, SpeechAct.COMMAND), (IntentType.CHITCHAT, IntentType.ROADMAP_CUD)),
    # Same question shape, different target
    ("có thể thao tác gì ở dự án này", "topic AI có những bài gì",
     (Target.ASSISTANT, Target.ROADMAP), (IntentType.CHITCHAT, IntentType.KNOWLEDGE_QUERY)),
    # Same "có thể ... không", but only one asks for a change
    ("có thể thêm bài Kafka vào layer Backend không", "topic AI có bài Kafka không",
     (SpeechAct.REQUEST, SpeechAct.QUESTION), (IntentType.ROADMAP_CUD, IntentType.KNOWLEDGE_QUERY)),
]


@pytest.mark.parametrize("a,b,axis,intents", LOOK_ALIKES)
def test_look_alikes_differ_on_one_axis(a, b, axis, intents):
    ua, ub = understand(a), understand(b)
    field = "act" if isinstance(axis[0], SpeechAct) else "target"
    assert (getattr(ua, field), getattr(ub, field)) == axis
    router = IntentRouter()
    assert (router.classify_heuristics(a).intent, router.classify_heuristics(b).intent) == intents


def test_question_words_inside_a_quoted_name_are_not_read():
    u = understand('thêm bài "Docker là gì" vào layer DevOps')
    assert u.act == SpeechAct.COMMAND and "docker là gì" not in u.head


@pytest.mark.parametrize("text", ["có thể thao tác gì ở dự án này", "cách thêm bài vào layer"])
def test_usage_questions_get_the_help_card_not_the_llm(text):
    async def run():
        steps, out = {}, ""
        async for ev in with_steps(NextGenRoadmapAgent(llm_model=None).astream_events(
            {"messages": [{"role": "user", "content": text}], "fast": True},
            config={"configurable": {"thread_id": f"understanding-help-{text}"}},
        )):
            if ev.get("type") == "step" and ev["status"] != "running":
                steps[ev["id"]] = ev
            elif ev.get("type") == "token":
                out += ev.get("delta", "")
        return steps, out

    steps, out = asyncio.run(run())
    assert steps["answer"]["mode"] == "help"
    assert "thêm bài" in out and "tạo topic" in out and "Xin lỗi" not in out


def test_route_step_reports_both_axes():
    set_actor("visitor")

    async def run():
        async for ev in with_steps(NextGenRoadmapAgent(llm_model=None).astream_events(
            {"messages": [{"role": "user", "content": "có thể thao tác gì ở dự án này"}], "fast": True},
            config={"configurable": {"thread_id": "understanding-route-step"}},
        )):
            if ev.get("type") == "step" and ev["id"] == "route" and ev["status"] == "done":
                return ev

    step = asyncio.run(run())
    assert (step["act"], step["target"], step["intent"]) == ("question", "assistant", "chitchat")


# Noisy list queries: a listing is answered only when it is the whole request
@pytest.mark.parametrize("text", ["liệt kê topic", "list all topics được không", "danh sách các topic"])
def test_plain_listing_is_a_listing(text):
    from rag_service.domains.roadmap.router.understanding import is_plain_listing

    assert is_plain_listing(text)


@pytest.mark.parametrize(
    "text",
    [
        "danh sách topic có bài Docker không, tạo layer mới cũng được",
        "cho tôi xem danh sách topic, cách thêm bài như thế nào",
        "list topic đi, không phải, tìm bài RAG",
    ],
)
def test_listing_mixed_with_other_requests_is_not_a_listing(text):
    from rag_service.domains.roadmap.router.understanding import is_plain_listing

    assert not is_plain_listing(text)


def test_label_before_colon_is_read_by_its_command():
    u = understand("danh sách việc cần làm: thêm bài Redis vào layer Backend")
    assert u.act == SpeechAct.COMMAND and u.target == Target.ROADMAP
    assert IntentRouter().classify_heuristics(
        "danh sách việc cần làm: thêm bài Redis vào layer Backend"
    ).intent == IntentType.ROADMAP_CUD


def test_recall_does_not_hijack_a_roadmap_request():
    u = understand("liệt kê bài học trong layer General của topic ZZ Test, tôi tên gì nhỉ")
    assert u.act != SpeechAct.RECALL and u.target == Target.ROADMAP
    # Plain recall still works
    assert understand("tôi tên gì nhỉ").act == SpeechAct.RECALL
