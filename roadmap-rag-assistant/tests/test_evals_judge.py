"""LLM-as-judge scorer: prompt, pass rule, baseline, calibration, metrics and the roadmap judge client (no network)."""

from __future__ import annotations

import json

import pytest

import evals.target as roadmap_target
from evals.kit import judge, metrics
from evals.kit.acl import AclGuard
from evals.kit.scorers import score_judge
from evals.kit.target import Answer, TargetUnavailable
from evals.target import RoadmapTarget, build_target


def verdict(faithfulness=5, relevance=5, facts=(), refused=False) -> str:
    return json.dumps({
        "faithfulness": {"score": faithfulness, "reason": "r"},
        "relevance": {"score": relevance, "reason": "r"},
        "facts": [{"fact": fact, "covered": covered} for fact, covered in facts],
        "refused": {"value": refused, "reason": "r"},
    })


class FakeJudgeTarget:
    name = "fake"
    capabilities = frozenset({"answer", "judge"})

    def __init__(self, answer: Answer, replies: list[str]):
        self._answer = answer
        self.replies = list(replies)
        self.prompts: list[str] = []

    def answer(self, text, history, run_as=None):
        return self._answer

    def contexts(self, section_ids):
        return [f"text of {section_id}" for section_id in section_ids]

    def judge(self, prompt):
        self.prompts.append(prompt)
        return self.replies.pop(0)


def sample(expected: dict, **metadata) -> dict:
    return {"id": "answer-001", "input": "Hybrid Search là gì?", "expected": expected,
            "metadata": {"status": "active", **metadata}}


def test_prompt_carries_question_history_contexts_answer_and_facts():
    s = {**sample({"facts": ["BM25"]}), "history": [{"role": "user", "content": "chào"}]}
    prompt = judge.build_prompt(s, Answer(text="dùng BM25", behavior="answer"), ["ctx one"])
    for part in ("Hybrid Search là gì?", "user: chào", "[1] ctx one", "dùng BM25", '["BM25"]'):
        assert part in prompt


def test_all_criteria_pass_and_substring_baseline_is_reported_next_to_the_judge():
    answer = Answer(text="Kết hợp từ khóa và vector", behavior="answer", citations=["hybrid"])
    target = FakeJudgeTarget(answer, [verdict(facts=[("BM25", True)])])
    row = score_judge(sample({"behavior": "answer", "facts": ["BM25"]}), target, 5, None)
    assert row["passed"]
    assert set(row["criteria"]) == {"faithfulness", "relevance", "facts", "refusal"}
    # Worded differently: the judge accepts it, the substring baseline does not
    assert row["baseline"] == {"facts": False}
    assert "text of hybrid" in target.prompts[0]


@pytest.mark.parametrize("reply,failed", [
    (verdict(faithfulness=3, facts=[("BM25", True)]), "faithfulness"),
    (verdict(relevance=2, facts=[("BM25", True)]), "relevance"),
    (verdict(facts=[("BM25", False)]), "facts"),
    (verdict(refused=True, facts=[("BM25", True)]), "refusal"),
])
def test_each_criterion_can_fail_the_sample(reply, failed):
    target = FakeJudgeTarget(Answer(text="x", behavior="answer"), [reply])
    row = score_judge(sample({"behavior": "answer", "facts": ["BM25"]}), target, 5, None)
    assert not row["passed"]
    assert [name for name, c in row["criteria"].items() if not c["passed"]] == [failed]


def test_a_reworded_fact_counts_by_its_position():
    reply = json.loads(verdict(facts=[("Langfuse tracing.", True), ("Something else", False)]))
    graded = judge.grade(reply, sample({"behavior": "answer", "facts": ["Langfuse tracing", "BM25"]}))
    assert graded["criteria"]["facts"] == {"passed": False, "missing": ["BM25"]}


def test_fact_left_out_by_the_judge_counts_as_missing():
    graded = judge.grade(json.loads(verdict(facts=[("BM25", True)])), sample({"facts": ["BM25", "vector"]}))
    assert graded["criteria"]["facts"] == {"passed": False, "missing": ["vector"]}


def test_no_match_sample_must_refuse_and_null_faithfulness_is_skipped():
    s = sample({"contexts": []})
    passed = judge.grade(json.loads(verdict(faithfulness=None, refused=True)), s)
    assert passed["passed"] and "faithfulness" not in passed["criteria"]
    answered = judge.grade(json.loads(verdict(faithfulness=None, refused=False)), s)
    assert not answered["passed"] and answered["criteria"]["refusal"]["expected"] is True


def test_clarify_sample_has_no_refusal_expectation():
    assert "refusal" not in judge.grade(json.loads(verdict()), sample({"behavior": "clarify"}))["criteria"]


def test_parse_tolerates_a_code_fence_and_rejects_unreadable_replies():
    assert judge.parse("```json\n" + verdict() + "\n```")["relevance"]["score"] == 5
    for raw in ("not json", '{"relevance": 5}', "[]"):
        with pytest.raises(TargetUnavailable):
            judge.parse(raw)


def test_parse_rejects_scores_the_pass_rule_cannot_compare():
    assert judge.parse(verdict(faithfulness=None))["faithfulness"]["score"] is None
    no_facts = json.dumps({**json.loads(verdict()), "facts": None})
    fact_strings = json.dumps({**json.loads(verdict()), "facts": ["BM25"]})
    for raw in (verdict(relevance=None), verdict(relevance="4"), verdict(relevance=True), verdict(faithfulness="5"),
                no_facts, fact_strings):
        with pytest.raises(TargetUnavailable) as exc:
            judge.parse(raw)
        assert exc.value.reason == "judge_invalid_json"


def test_calibration_judges_the_frozen_answer_and_compares_with_the_human_label():
    label = {"answer": {"text": "sai", "behavior": "answer", "citations": []}, "passed": False}
    live = Answer(text="đúng", behavior="answer")
    target = FakeJudgeTarget(live, [verdict(), verdict(faithfulness=1)])
    row = score_judge(sample({"behavior": "answer"}, judge_label=label), target, 5, None)
    assert row["passed"]
    assert row["calibration"] == {"human": False, "judge": False, "agree": True}
    assert "sai" in target.prompts[1]


def test_scorer_goes_through_the_acl_guard():
    target = FakeJudgeTarget(Answer(text="x", behavior="answer", citations=["private"]), [verdict()])
    guard = AclGuard(target, {"private": ["staff"]})
    score_judge(sample({"behavior": "answer"}), guard, 5, None)
    assert [leak["section_id"] for leak in guard.leaks] == ["private"]


def test_judge_metrics_report_criteria_baseline_and_human_agreement():
    def row(passed, human=None, judged=None):
        r = {"scorer": "judge", "passed": passed, "tags": [],
             "criteria": {"relevance": {"score": 5 if passed else 2, "passed": passed},
                          "facts": {"passed": passed, "missing": []}},
             "baseline": {"facts": False}}
        if human is not None:
            r["calibration"] = {"human": human, "judge": judged, "agree": human == judged}
        return r

    rows = [row(True, human=True, judged=True), row(True, human=False, judged=True), row(False)]
    got = metrics.summarize(rows, 5)["metrics"]["judge"]
    assert got["accuracy"] == 0.6667 and got["relevance_mean"] == 4.0
    assert got["facts_pass"] == 0.6667 and got["facts_pass_substring"] == 0.0
    assert got["faithfulness_mean"] is None and got["refusal_pass"] is None
    assert (got["human_n"], got["human_agreement"], got["judge_false_pass"], got["judge_false_fail"]) == (2, 0.5, 1, 0)


# ── Roadmap judge client ──

@pytest.fixture
def stub_corpus(monkeypatch):
    doc = {"doc_id": "d", "title": "Hybrid Search", "sections": [{"section_id": "d", "text": "BM25 + vector"}],
           "metadata": {"topic": "ai-architecture", "layer_title": "03. Tầng RAG", "level": None}}
    monkeypatch.setattr(RoadmapTarget, "_load", lambda self: ([], [doc]))


class FakeLLM:
    def __init__(self, reply="{}", error: Exception | None = None):
        self.reply, self.error, self.calls = reply, error, 0

    def invoke(self, prompt):
        self.calls += 1
        if self.error:
            raise self.error
        return type("Msg", (), {"content": self.reply})()


def test_judge_is_opt_in_on_top_of_answer_and_has_its_own_model():
    assert "judge" not in build_target(mode="fts", answer="llm").capabilities
    target = build_target(mode="fts", answer="llm", judge="llm", judge_provider="groq", judge_model="judge-m")
    assert "judge" in target.capabilities
    assert (target.judge_provider, target.judge_model) == ("groq", "judge-m")
    with pytest.raises(ValueError):
        build_target(judge="llm")  # nothing to judge without live answers
    with pytest.raises(ValueError):
        build_target(answer="llm", judge="yes")


def test_contexts_carry_title_and_placement(stub_corpus):
    target = RoadmapTarget(mode="fts")
    assert target.contexts(["d", "missing"]) == ["Hybrid Search (ai-architecture, 03. Tầng RAG): BM25 + vector"]


def test_judge_replies_are_cached_per_model_and_prompt(tmp_path, monkeypatch):
    monkeypatch.setattr(roadmap_target, "JUDGE_CACHE_FILE", tmp_path / "judge.json")
    llm = FakeLLM(reply=verdict())
    target = RoadmapTarget(mode="fts", answer="llm", judge="llm", judge_model="m1")
    target._judge_llm = llm
    assert target.judge("p") == verdict()
    assert target.judge("p") == verdict()
    assert llm.calls == 1
    # A fresh target reads the file; another judge model is a cache miss
    other = RoadmapTarget(mode="fts", answer="llm", judge="llm", judge_model="m1")
    other._judge_llm = FakeLLM(reply="never")
    assert other.judge("p") == verdict()
    changed = RoadmapTarget(mode="fts", answer="llm", judge="llm", judge_model="m2")
    changed._judge_llm = FakeLLM(reply=verdict(relevance=3))
    assert changed.judge("p") == verdict(relevance=3)


def test_unreadable_judge_reply_is_not_cached(tmp_path, monkeypatch):
    monkeypatch.setattr(roadmap_target, "JUDGE_CACHE_FILE", tmp_path / "judge.json")
    target = RoadmapTarget(mode="fts", answer="llm", judge="llm")
    target._judge_llm = FakeLLM(reply="sorry, I cannot grade this")
    with pytest.raises(TargetUnavailable) as exc:
        target.judge("p")
    assert exc.value.reason == "judge_invalid_json"
    assert not (tmp_path / "judge.json").exists()
    # The next run asks the judge again instead of replaying the broken reply
    target._judge_llm = FakeLLM(reply=verdict())
    assert target.judge("p") == verdict()


@pytest.mark.parametrize("error,reason", [
    (RuntimeError("429 RESOURCE_EXHAUSTED"), "judge_rate_limited"),
    (ValueError("boom"), "judge_error"),
])
def test_judge_provider_errors_mark_the_sample_unavailable(tmp_path, monkeypatch, error, reason):
    monkeypatch.setattr(roadmap_target, "JUDGE_CACHE_FILE", tmp_path / "judge.json")
    target = RoadmapTarget(mode="fts", answer="llm", judge="llm")
    target._judge_llm = FakeLLM(error=error)
    with pytest.raises(TargetUnavailable) as exc:
        target.judge("p")
    assert exc.value.reason == reason
    assert not (tmp_path / "judge.json").exists()


def test_judge_needs_a_known_provider():
    target = RoadmapTarget(mode="fts", answer="llm", judge="llm", judge_provider="openai")
    with pytest.raises(RuntimeError):
        target.judge("p")


def test_judge_auto_switches_provider_and_never_falls_back_to_the_answer_provider(monkeypatch):
    from rag_service.config import settings

    monkeypatch.setattr(settings, "llm_provider", "google_genai")
    target = RoadmapTarget(mode="fts", answer="llm", judge="llm")
    assert target.judge_provider == "groq"
    assert target.judge_model == "llama-3.3-70b-versatile"
    assert (target.fallback_provider, target.fallback_model) == (None, None)

    monkeypatch.setattr(settings, "llm_provider", "groq")
    target2 = RoadmapTarget(mode="fts", answer="llm", judge="llm")
    assert target2.judge_provider == "google_genai"
    assert target2.judge_model == "gemini-3.1-pro-preview"
    assert (target2.fallback_provider, target2.fallback_model) == (None, None)

    # Judge set to the answer provider: the other provider is a safe fallback
    target3 = RoadmapTarget(mode="fts", answer="llm", judge="llm", judge_provider="groq")
    assert (target3.fallback_provider, target3.fallback_model) == ("google_genai", "gemini-3.1-pro-preview")


def test_rate_limited_judge_without_fallback_marks_the_sample_unavailable(tmp_path, monkeypatch):
    from rag_service.config import settings

    monkeypatch.setattr(settings, "llm_provider", "google_genai")
    monkeypatch.setattr(roadmap_target, "JUDGE_CACHE_FILE", tmp_path / "judge.json")
    target = RoadmapTarget(mode="fts", answer="llm", judge="llm")
    target._judge_llm = FakeLLM(error=RuntimeError("429 RESOURCE_EXHAUSTED"))
    answer_model = FakeLLM(reply=verdict())
    target._fallback_judge_llm = answer_model
    with pytest.raises(TargetUnavailable) as exc:
        target.judge("p")
    assert exc.value.reason == "judge_rate_limited"
    assert answer_model.calls == 0


def test_judge_falls_back_when_primary_rate_limited(tmp_path, monkeypatch):
    from rag_service.config import settings

    monkeypatch.setattr(settings, "llm_provider", "google_genai")
    monkeypatch.setattr(roadmap_target, "JUDGE_CACHE_FILE", tmp_path / "judge.json")
    target = RoadmapTarget(mode="fts", answer="llm", judge="llm", judge_provider="google_genai")
    primary = FakeLLM(error=RuntimeError("429 RESOURCE_EXHAUSTED"))
    fallback = FakeLLM(reply=verdict())
    target._judge_llm = primary
    target._fallback_judge_llm = fallback

    res = target.judge("test prompt")
    assert res == verdict()
    assert primary.calls == 1
    assert fallback.calls == 1



def test_a_cached_fallback_verdict_never_hides_a_working_primary(tmp_path, monkeypatch):
    from rag_service.config import settings

    monkeypatch.setattr(settings, "llm_provider", "google_genai")
    monkeypatch.setattr(roadmap_target, "JUDGE_CACHE_FILE", tmp_path / "judge.json")
    target = RoadmapTarget(mode="fts", answer="llm", judge="llm", judge_provider="google_genai")
    fallback_key = target._judge_key(target.fallback_provider, target.fallback_model, "p")
    (tmp_path / "judge.json").write_text(json.dumps({fallback_key: verdict(relevance=2)}), encoding="utf-8")
    target._judge_llm = FakeLLM(reply=verdict(relevance=5))

    assert target.judge("p") == verdict(relevance=5)
    assert target._judge_llm.calls == 1


def test_missing_judge_keys_fail_the_run(monkeypatch):
    from rag_service.config import settings

    monkeypatch.setattr(settings, "llm_provider", "google_genai")
    target = RoadmapTarget(mode="fts", answer="llm", judge="llm", cache="off")
    monkeypatch.setattr(target, "_build_judge_llm", lambda provider, model: None)

    with pytest.raises(roadmap_target.JudgeConfigError):
        target.judge("p")
