"""The router policy (policy.py), the decision it produces and the write gate that guards the database.

The last test runs the router contract (evals/router): any routing change must be reviewed and accepted with
`python -m evals router-check --accept`, which updates the committed decision snapshot.
"""

from __future__ import annotations

import pytest

from rag_service.domains.roadmap.router.intent_router import IntentRouter
from rag_service.domains.roadmap.router.policy import (
    DECISION_TABLE,
    WRITE_ALLOW,
    WRITE_CONFIRM,
    WRITE_DENY,
    WRITE_NONE,
)
from rag_service.domains.roadmap.router.schemas import (
    ActionType,
    EntityLevel,
    IntentClassificationResult,
    IntentType,
    SingleEntity,
    StructuredRoadmapAction,
)
from rag_service.domains.roadmap.router.write_gate import (
    BULK_DELETE_REQUEST,
    QUESTION_AS_TITLE,
    UNCONFIRMED_GUESS,
    WriteGate,
    gate_action,
    gate_route,
)


def test_decision_table_rows_are_named_once_and_use_known_write_modes():
    names = [row.name for row in DECISION_TABLE]
    assert len(names) == len(set(names))
    assert {row.write for row in DECISION_TABLE} <= {WRITE_NONE, WRITE_ALLOW, WRITE_CONFIRM, WRITE_DENY}
    # Only change rows may write; a deny row never decides an intent (the LLM reads it, the gate still denies)
    assert all(row.write in (WRITE_NONE, WRITE_DENY) for row in DECISION_TABLE if row.intent != IntentType.ROADMAP_CUD)
    assert all(row.intent is None for row in DECISION_TABLE if row.write == WRITE_DENY)


@pytest.mark.parametrize(
    "text,blocker",
    [
        ("đừng xóa bài Kafka", "negation"),
        ("không cần tạo topic ZZ Test", "negation"),
        ("khoan, chưa thêm bài Redis vội", "negation"),
        ("lỡ xóa nhầm bài Kafka thì khôi phục được không", "hypothetical"),
        ("hôm qua tôi đã tạo topic Test Router", "past_report"),
        ("tôi vừa thêm bài Redis vào layer DevOps rồi", "past_report"),
        ("dung xoa bai Kafka", "negation"),
        ("hom qua toi da tao topic AI", "past_report"),
    ],
)
def test_named_but_not_requested_changes_are_never_written(text, blocker):
    decision = IntentRouter().decide(text)
    assert decision.write == WRITE_DENY and decision.intent is None
    assert f"blocker={blocker}" in decision.rules
    # Even if the LLM router then calls it a change, the gate denies it
    assert gate_route(_result(), "llm", True, decision.write).mode == WRITE_DENY


@pytest.mark.parametrize(
    "text",
    [
        "chưa có bài Redis thì thêm vào layer General",
        "nếu chưa có AI Engineering thì tạo topic AI",
        "dạ tạo topic AI",
        "tạo topic C++",
    ],
)
def test_real_changes_are_not_blocked(text):
    assert IntentRouter().decide(text).intent == IntentType.ROADMAP_CUD


@pytest.mark.parametrize(
    "noisy,clean",
    [
        ("ê bạn ơi, cách thêm bài vào layer", "cách thêm bài vào layer"),
        ("Hi\ntạo topic Redis", "tạo topic Redis"),
        ("Việc cần làm: tạo topic như thế nào", "tạo topic như thế nào"),
        ("tạo topic như thế nào nhé ạ", "tạo topic như thế nào"),
        ("pls tạo topic Redis thanks", "tạo topic Redis"),
        ("tạo topic như thế nào 🙏", "tạo topic như thế nào"),
    ],
)
def test_noise_does_not_change_the_decision(noisy, clean):
    router = IntentRouter()
    a, b = router.decide(noisy), router.decide(clean)
    assert (a.intent, a.write) == (b.intent, b.write)


def test_unaccented_cues_do_not_misread_accented_words():
    # "đầu" (front) must not read as "đâu" (where): a move command stays a command
    assert IntentRouter().decide("Chuyển topic Docker lên đầu").intent == IntentType.ROADMAP_CUD
    # Unaccented how-to is still a usage question
    assert IntentRouter().decide("tao topic nhu the nao").intent == IntentType.CHITCHAT


def test_a_change_must_come_from_one_clause():
    router = IntentRouter()
    decision = router.decide("xóa layer DevOps có ảnh hưởng gì không, rồi tìm bài về Docker")
    assert decision.intent != IntentType.ROADMAP_CUD
    assert router.mixed_intent_steps("tìm bài về RAG rồi tạo topic Agents") == ["tìm bài về RAG", "tạo topic Agents"]
    # Greetings, thanks and blocked changes are not requests of their own
    assert router.mixed_intent_steps("cảm ơn, tạo topic Redis") == []
    assert router.mixed_intent_steps("đừng xóa bài Kafka, rồi tìm bài về Docker") == []
    # "và" between names is one search
    assert router.mixed_intent_steps("liệt kê những bài về Docker và Kafka") == []


@pytest.mark.parametrize(
    "text,row,write",
    [
        ("tạo topic AI Engineering", "change_command", WRITE_ALLOW),
        ("bạn tạo topic AI được không", "change_request", WRITE_CONFIRM),
        ("tìm bài về Docker", "search_word", WRITE_NONE),
        ("topic này có mấy bài", "roadmap_question", WRITE_NONE),
        ("có thể thao tác gì ở dự án này", "about_assistant", WRITE_NONE),
        ("giá vàng hôm nay", "off_topic", WRITE_NONE),
        ("Kafka", None, WRITE_NONE),
    ],
)
def test_decision_names_the_row_that_decided(text, row, write):
    decision = IntentRouter().decide(text)
    assert (decision.row, decision.write) == (row, write)
    rules = decision.rules
    assert rules[0] == f"row={row or '-'}" and rules[1].startswith("act=") and rules[2].startswith("target=")


def _result(intent=IntentType.ROADMAP_CUD, confidence=0.95, confirm=False):
    return IntentClassificationResult(
        intent=intent, confidence=confidence, needs_cud_extraction=intent == IntentType.ROADMAP_CUD,
        needs_confirmation=confirm,
    )


@pytest.mark.parametrize(
    "result,method,has_change,mode",
    [
        (_result(IntentType.KNOWLEDGE_QUERY), "heuristic", False, WRITE_NONE),
        (_result(), "heuristic", True, WRITE_ALLOW),
        (_result(confirm=True), "heuristic", True, WRITE_CONFIRM),
        # Only the LLM chose a change: needs a change verb + object and high confidence
        (_result(), "llm", False, WRITE_DENY),
        (_result(confidence=0.6), "llm", True, WRITE_DENY),
        (_result(), "llm", True, WRITE_ALLOW),
    ],
)
def test_gate_route(result, method, has_change, mode):
    gate = gate_route(result, method, has_change)
    assert gate.mode == mode
    if mode == WRITE_DENY:
        assert gate.reason == UNCONFIRMED_GUESS


def _action(action, title="Kafka", batch=False):
    return StructuredRoadmapAction(
        action=action, entity_level=EntityLevel.ITEM, entities=[SingleEntity(title=title)], is_batch=batch,
    )


@pytest.mark.parametrize(
    "action,message,mode,reason",
    [
        (_action(ActionType.CREATE, "có thể thao tác gì ở dự án này"), "có thể thao tác gì ở dự án này", WRITE_DENY,
         QUESTION_AS_TITLE),
        (_action(ActionType.DELETE), "xóa hết bài trong layer", WRITE_DENY, BULK_DELETE_REQUEST),
        (_action(ActionType.DELETE), "xóa bài Kafka", WRITE_CONFIRM, "delete"),
        (_action(ActionType.DELETE, batch=True), "xóa bài Kafka và Redis luôn", WRITE_CONFIRM, "delete"),
        # A delete is always previewed, even said to run now: it cannot be undone
        (_action(ActionType.DELETE), "xóa bài Kafka ngay", WRITE_CONFIRM, "delete"),
        (_action(ActionType.CREATE), "thêm bài Kafka vào layer Backend", WRITE_ALLOW, None),
    ],
)
def test_gate_action(action, message, mode, reason):
    gate = gate_action(WriteGate(WRITE_ALLOW), action, message, message.lower())
    assert (gate.mode, gate.reason) == (mode, reason)


def test_gate_action_keeps_a_route_level_confirmation():
    gate = gate_action(WriteGate(WRITE_CONFIRM), _action(ActionType.CREATE), "tạo bài Kafka được không", "")
    assert gate.mode == WRITE_CONFIRM


def test_router_contract_is_in_sync(capsys):
    """Routing changes need review: run `python -m evals router-check`, read the diff, then `--accept`."""
    from evals.router.check import main

    assert main([]) == 0, capsys.readouterr().out[-3000:]
