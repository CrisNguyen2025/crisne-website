"""Offline checks for evals/: the kit stays domain-free, datasets stay valid, scorers behave."""

from __future__ import annotations

import ast
import json
from pathlib import Path

from evals.kit import metrics, report
from evals.kit.acl import AclGuard
from evals.kit.corpus import Corpus, content_hash, load_corpus, validate_corpus, validate_references
from evals.kit.scorers import score_answer, score_retrieval, score_route
from evals.kit.source import Dataset, FileSource, validate
from evals.kit.target import Answer, Hit, RouteResult

EVALS = Path(__file__).resolve().parents[1] / "evals"


def test_kit_does_not_import_domain_code():
    """evals/kit must stay portable: only stdlib and evals.kit imports."""
    offenders = []
    for path in (EVALS / "kit").glob("*.py"):
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom):
                names = [node.module or ""]
            else:
                continue
            offenders += [f"{path.name}: {n}" for n in names if n.startswith(("rag_service", "evals.target", "evals.corpus_export"))]
    assert not offenders, offenders


def test_datasets_and_corpus_are_valid():
    datasets = FileSource(EVALS / "datasets").load()
    corpora = load_corpus(EVALS / "corpus")
    extra_tags = json.loads((EVALS / "datasets" / "tags.json").read_text(encoding="utf-8"))["tags"]
    assert datasets and corpora
    assert validate(datasets, extra_tags) == []
    assert validate_corpus(corpora) == []
    assert validate_references(datasets, corpora) == []


def _doc(doc_id: str, text: str = "t") -> dict:
    return {"doc_id": doc_id, "title": "Title", "doc_type": "item", "acl": ["everyone"],
            "sections": [{"section_id": doc_id, "text": text}]}


def test_content_hash_ignores_ids_and_order():
    assert content_hash([_doc("a"), _doc("b", "x")]) == content_hash([_doc("b", "x"), _doc("renamed")])
    assert content_hash([_doc("a")]) != content_hash([_doc("a", "changed")])


def test_references_must_exist_and_respect_acl_tier():
    corpora = [Corpus("internal/hr", "internal", {}, [_doc("hr/leave")])]
    sample = {"id": "x-001", "input": "q", "metadata": {"status": "active"},
              "expected": {"contexts": [{"section_id": "hr/leave"}, {"section_id": "missing"}]}}
    errors = validate_references([Dataset("public/hr", "hr", "public", {}, [sample])], corpora)
    assert any("not in corpus" in e for e in errors)
    assert any("cites a internal document" in e for e in errors)


def _sample(**expected) -> dict:
    return {"id": "x-001", "input": "q", "expected": expected, "metadata": {"status": "active"}}


class FakeTarget:
    name = "fake"
    capabilities = frozenset({"retrieve", "route", "answer"})

    def __init__(self, hits=(), route=RouteResult("answer"), answer=Answer("", "answer")):
        self.hits, self.route_result, self.answer_result = list(hits), route, answer

    def retrieve(self, text, k, run_as=None):
        return self.hits

    def route(self, text, run_as=None):
        return self.route_result

    def answer(self, text, history, run_as=None):
        return self.answer_result

    def corpus_fingerprint(self):
        return {"source": "fake", "doc_count": 0, "sha256": "0" * 64}


def test_score_retrieval_rank_and_off_topic():
    target = FakeTarget(hits=[Hit("1", "A"), Hit("2", "B")])
    assert score_retrieval(_sample(contexts=[{"section_id": "B"}]), target, 5, None)["rank"] == 2
    assert not score_retrieval(_sample(contexts=[{"section_id": "Z"}]), target, 5, None)["passed"]
    assert not score_retrieval(_sample(contexts=[]), target, 5, None)["passed"]
    assert score_retrieval(_sample(behavior="answer"), target, 5, None) is None


def test_score_retrieval_requires_every_required_context():
    target = FakeTarget(hits=[Hit("1", "A"), Hit("2", "B")])
    both = [{"section_id": "A", "required": True}, {"section_id": "B", "required": True}]
    one_missing = [{"section_id": "A", "required": True}, {"section_id": "Z", "required": True}]
    assert score_retrieval(_sample(contexts=both), target, 5, None)["rank"] == 2
    assert not score_retrieval(_sample(contexts=one_missing), target, 5, None)["passed"]


def test_score_route_checks_behavior_and_route():
    target = FakeTarget(route=RouteResult("answer", ["knowledge_query"]))
    assert score_route(_sample(behavior="answer", route=["knowledge_query"]), target, 5, None)["passed"]
    assert not score_route(_sample(behavior="answer", route=[]), target, 5, None)["passed"]
    assert not score_route(_sample(behavior="refuse"), target, 5, None)["passed"]


def test_score_answer_facts_and_citations():
    target = FakeTarget(answer=Answer("Hủy trước 24 giờ thì không mất phí", "answer", ["cancel"]))
    ok = _sample(behavior="answer", facts=["24 giờ"], contexts=[{"section_id": "cancel"}])
    missing_citation = _sample(facts=["24 giờ"], contexts=[{"section_id": "refund"}])
    assert score_answer(ok, target, 5, None)["passed"]
    assert not score_answer(missing_citation, target, 5, None)["passed"]


def test_thresholds_and_diff(tmp_path):
    rows = [
        {"id": "a-001", "scorer": "route", "tags": [], "passed": True},
        {"id": "a-002", "scorer": "route", "tags": [], "passed": False},
    ]
    summary = metrics.summarize(rows, 5)
    assert summary["metrics"]["route"]["accuracy"] == 0.5
    assert metrics.check_thresholds(summary["metrics"], {"route.accuracy": 1.0})
    assert metrics.check_thresholds(summary["metrics"], {"route.accuracy": 0.5}) == []

    base, head = tmp_path / "base", tmp_path / "head"
    report.write_run(base, {}, rows)
    report.write_run(head, {}, [{**rows[0], "passed": False}, {**rows[1], "passed": True}])
    changes = report.diff(base, head)
    assert changes["regressed"] == ["a-001 [route]"] and changes["fixed"] == ["a-002 [route]"]


def test_acl_guard_records_sections_the_caller_may_not_read():
    acl = {"public": ["everyone"], "staff-only": ["staff"]}
    guard = AclGuard(FakeTarget(hits=[Hit("p", "public"), Hit("s", "staff-only")],
                                answer=Answer("x", "answer", ["staff-only"])), acl)
    guard.sample_id = "x-001"
    guard.retrieve("q", 5, run_as="staff")
    assert guard.leaks == []
    guard.retrieve("q", 5, run_as=None)
    guard.answer("q", [], run_as="customer")
    assert [(leak["via"], leak["section_id"]) for leak in guard.leaks] == [
        ("retrieve", "staff-only"), ("answer", "staff-only"),
    ]
