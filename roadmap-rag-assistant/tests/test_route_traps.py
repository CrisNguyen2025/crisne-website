"""Garbage in, garbage out: messages that look like a change, a plan or a command but are not.

Each case comes from a probe run against the agent's decision order (2026-10-25). The write gate is checked
with and without conversation history, since a follow-up is where a verb alone used to count as a change.
"""

from __future__ import annotations

import asyncio

import pytest

from rag_service.domains.roadmap import agent as agent_module
from rag_service.domains.roadmap.agent import NextGenRoadmapAgent
from rag_service.domains.roadmap.retrieval.engine import rag_engine
from rag_service.domains.roadmap.router.intent_router import IntentRouter
from rag_service.domains.roadmap.router.policy import WRITE_DENY, slash_command
from rag_service.domains.roadmap.router.schemas import IntentClassificationResult, IntentType
from rag_service.domains.roadmap.router.write_gate import gate_route

# Entity words in everyday or technical phrases: never a roadmap change, even mid-conversation
FALSE_FRIENDS = [
    "tạo mạng neural đơn giản bằng PyTorch",
    "thêm mục tiêu học tập cho tháng này",
    "xoa muc tieu cu di",
    "cách tạo topic trong Kafka",
    "cách xóa item khỏi list trong Python",
    "giải bài toán tối ưu bằng gradient descent",
    "layer normalization khác batch normalization thế nào",
]

# Real changes still carry their own evidence
REAL_CHANGES = [
    "tạo topic Kafka",
    "thêm item trong mảng kiến thức RAG",
    "xóa bài Semantic Caching",
    "thêm bài toán tối ưu vào layer 1",
    "bỏ bớt cái topic docker swarm ra đi",
]

# Phrases that used to start /plan or /goal as substrings, before the router saw them
NOT_COMMANDS = [
    "bài nào nên xem trước khi học RAG?",
    "prompt template là gì, cách tạo prompt template tốt",
    "có bài nào về template cho lộ trình học không",
    "làm sao để mô hình sinh nhanh hơn",
    "lập kế hoạch học backend trong 3 tháng",
]


@pytest.mark.parametrize("text", FALSE_FRIENDS)
@pytest.mark.parametrize("follow_up", [False, True])
def test_false_friend_is_never_change_evidence(text, follow_up):
    router = IntentRouter()
    assert not router.has_change_request(text, follow_up=follow_up)
    result = router.classify_heuristics(text)
    assert result is None or result.intent != IntentType.ROADMAP_CUD


@pytest.mark.parametrize("text", FALSE_FRIENDS)
def test_llm_guessing_a_change_on_a_false_friend_is_denied(text):
    router = IntentRouter()
    guess = IntentClassificationResult(intent=IntentType.ROADMAP_CUD, confidence=0.95, needs_cud_extraction=True)
    gate = gate_route(guess, "llm", router.has_change_request(text, follow_up=True), router.decide(text).write)
    assert gate.mode == WRITE_DENY


@pytest.mark.parametrize("text", REAL_CHANGES)
def test_real_change_keeps_its_evidence(text):
    router = IntentRouter()
    assert router.has_change_request(text)
    assert router.classify_heuristics(text).intent == IntentType.ROADMAP_CUD


@pytest.mark.parametrize("text", ["xóa nó đi", "sửa bài đó thành RAG nâng cao", "delete it"])
def test_follow_up_pointing_back_borrows_the_earlier_object(text):
    assert IntentRouter().has_change_request(text, follow_up=True)


def test_english_pointer_is_read_on_accented_text():
    # Folded, "thêm" is "them": it must not count as a pointer back
    assert not IntentRouter().has_change_request("thêm mục tiêu học tập", follow_up=True)


@pytest.mark.parametrize("text", NOT_COMMANDS)
def test_only_a_leading_slash_is_a_command(text):
    assert slash_command(text.lower()) is None


@pytest.mark.parametrize("text,command", [("/plan ai engineering", "plan"), ("/goal template ai-engineering", "goal")])
def test_slash_commands_are_read(text, command):
    assert slash_command(text) == command


@pytest.mark.parametrize("goal,template", [
    ("lên lộ trình học DevOps trong 3 tháng", "cloud-devops"),
    ("lộ trình học Kubernetes cho người mới", "cloud-devops"),
    ("Mình muốn học để trở thành AI engineer, lên giúp lộ trình", "ai-engineering"),
    ("e muon di lam frontend dev thi nen hoc theo lo trinh nhu the nao", "nextjs-fullstack"),
    ("Lên cho anh một khung chương trình học Flutter từ căn bản", None),
    # "Architect" is not "AI & LLM Architecture"
    ("study plan for AWS Solutions Architect certification", None),
])
def test_goal_picks_the_blueprint_it_names(goal, template):
    found = rag_engine.template_for_goal(goal)
    assert (found.get("id") if found else None) == template


def _events(message: str) -> list[dict]:
    agent = NextGenRoadmapAgent(llm_model=None)

    async def run():
        return [ev async for ev in agent.astream_events({"messages": [{"role": "user", "content": message}], "fast": True})]

    return asyncio.run(run())


def test_plan_goal_with_a_blueprint_previews_it_read_only():
    tools = [ev.get("name") for ev in _events("lên lộ trình học DevOps trong 3 tháng") if ev.get("type") == "tool_start"]
    assert tools == ["preview_roadmap_plan"]


def test_plan_goal_without_a_blueprint_answers_from_the_lessons(monkeypatch):
    seen = []

    async def fake_answer(**kwargs):
        seen.append(kwargs["query"])
        yield {"type": "token", "content": "ok"}

    monkeypatch.setattr(agent_module, "answer_from_sources", fake_answer)
    _events("Lên cho anh một khung chương trình học Flutter từ căn bản")
    assert seen == ["Lên cho anh một khung chương trình học Flutter từ căn bản"]


# ── A declined change never becomes a preview, and a preview is always the change asked for ──

from rag_service.domains.roadmap.router.schemas import ActionType, EntityLevel, SingleEntity, StructuredRoadmapAction  # noqa: E402
from rag_service.domains.roadmap.router.write_gate import ACTION_NOT_ASKED, BLOCKED_CHANGE, WriteGate, gate_action  # noqa: E402

DECLINED = [
    "thôi khỏi tạo topic System Design nữa",
    "khỏi thêm bài Kafka nhé",
    "không phải xóa, mình chỉ muốn ẩn bài Redis",
    "đừng xóa bài Docker nhé",
]


def _action(kind: str, level: str = "topic", title: str = "System Design") -> StructuredRoadmapAction:
    return StructuredRoadmapAction(
        action=ActionType(kind), entity_level=EntityLevel(level), entities=[SingleEntity(title=title)]
    )


@pytest.mark.parametrize("text", DECLINED)
def test_declined_change_is_blocked_by_the_heuristics(text):
    assert IntentRouter().decide(text).write == WRITE_DENY


@pytest.mark.parametrize("text", DECLINED)
@pytest.mark.parametrize("kind", ["create", "delete", "update"])
def test_declined_change_is_never_previewed_whatever_the_extractor_read(text, kind):
    # e.g. System 2 timed out, so the change went to the extractor, which read "khỏi tạo topic X" as a delete
    gate = gate_action(WriteGate("confirm"), _action(kind), text, text.lower())
    assert gate.mode == WRITE_DENY and gate.reason == BLOCKED_CHANGE


@pytest.mark.parametrize("text,kind", [
    ("tạo topic System Design", "delete"),
    ("thêm bài Kafka vào layer 1", "delete"),
    ("xóa bài Semantic Caching", "create"),
])
def test_preview_must_be_the_change_the_verb_asks_for(text, kind):
    gate = gate_action(WriteGate("confirm"), _action(kind), text, text.lower())
    assert gate.mode == WRITE_DENY and gate.reason == ACTION_NOT_ASKED


@pytest.mark.parametrize("text,kind", [
    ("tạo topic System Design", "create"),
    ("xoa bai semantic caching", "delete"),
    ("đổi tên topic AI Architecture thành AI Systems", "update"),
    ("chuyển bài RAG sang layer AI", "update"),
    ("bỏ bớt cái topic docker swarm ra đi", "delete"),
    ("could you please delete the lesson about semantic caching?", "delete"),
    ("thôi xóa luôn đi", "delete"),  # "thôi" alone is "go ahead", not a decline
])
def test_matching_verb_keeps_the_change(text, kind):
    assert gate_action(WriteGate("confirm"), _action(kind), text, text.lower()).mode != WRITE_DENY


@pytest.mark.parametrize("text", DECLINED)
def test_declined_change_gets_the_nothing_changed_reply_without_a_model(text):
    from rag_service.domains.roadmap.router.grounding import BLOCKED_CHANGE_REPLY

    events = _events(text)
    reply = "".join(e.get("delta", "") for e in events if e.get("type") == "token")
    assert reply.strip() == BLOCKED_CHANGE_REPLY.strip()
    assert not [e for e in events if e.get("type") in ("tool_start", "action_preview")]


# ── P2 polarity: read by clause, not by listed phrases (router/polarity.py) ──

from rag_service.domains.roadmap.router.polarity import polarity_of, split_affirmed  # noqa: E402


@pytest.mark.parametrize("text,want", [
    ("mình không định xóa bài Redis", "decline"),
    ("bỏ ý định xóa bài Redis đi", "decline"),
    ("hoãn việc tạo topic Data Engineering lại", "decline"),  # tone marks moved by normalization
    ("cam xoa bai docker", "decline"),                        # weak folded negator right before the verb
    ("dau can xoa bai docker", "decline"),                    # … or after modal words
    ("trường hợp thêm bài Kafka vào layer 1 thì thứ tự có đổi không", "hypothetical"),
    ("sếp bảo xóa bài Docker, bạn thấy sao", "report"),
    ("không phải sửa, xóa bài Redis đi", "affirm"),
    ("chưa có bài Kafka thì thêm vào layer 1", "affirm"),
    ("cho mình xóa bài Docker", "affirm"),                    # "cho" here is "let me", not "chớ"
    ("đúng rồi xóa bài Docker đi", "affirm"),
    ("mình bảo xóa bài Docker đi mà", "affirm"),              # the user's own "bảo" is not a report
])
def test_polarity_is_read_by_clause(text, want):
    assert polarity_of(text).value == want


def test_only_the_affirmed_part_carries_the_change_to_write():
    affirmed, declined = split_affirmed("đừng xóa bài Docker, rồi tạo topic Docker Compose")
    assert "tao" in affirmed and "xoa" not in affirmed and "xoa" in declined
    gate = gate_action(WriteGate("confirm"), _action("delete", "item", "Docker"),
                       "đừng xóa bài Docker, rồi tạo topic Docker Compose", "")
    assert gate.mode == WRITE_DENY and gate.reason == ACTION_NOT_ASKED


def test_every_delete_is_previewed():
    for text in ("xóa bài Redis luôn", "xóa bài Redis ngay", "delete the lesson Redis immediately"):
        assert gate_action(WriteGate("allow"), _action("delete", "item", "Redis"), text, text.lower()).mode == "confirm"


def test_route_names_the_phase_that_settled_it():
    from rag_service.domains.roadmap.router.route_decision import decide_route

    outcome = asyncio.run(decide_route(IntentRouter(), "mình không định xóa bài Redis"))
    assert outcome.decided_by == "P2_polarity"
    assert outcome.trace()["P2_polarity"] == "decline" and outcome.write == "none"
