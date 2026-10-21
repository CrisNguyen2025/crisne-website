"""sync-dataset: Langfuse golden set items merged into the committed _answer suite (no network)."""

from __future__ import annotations

import json
import shutil
from types import SimpleNamespace

import pytest

from evals.sync_dataset import CORPUS, DATASETS, merge, sync

ANSWER = DATASETS / "_answer" / "samples.jsonl"


def item(item_id="item-a", input=None, expected=None, metadata=None, status="ACTIVE", trace="trace-a"):
    return SimpleNamespace(
        id=item_id,
        input={"message": "Hybrid Search là gì?", "page_context": None} if input is None else input,
        expected_output=expected,
        metadata=metadata,
        status=status,
        source_trace_id=trace,
    )


def labeled(**kwargs):
    return item(expected={"behavior": "answer", "facts": ["BM25"]}, **kwargs)


def hand_written() -> list[dict]:
    return [json.loads(line) for line in ANSWER.read_text(encoding="utf-8").splitlines() if line.strip()]


@pytest.fixture
def datasets_dir(tmp_path):
    shutil.copytree(DATASETS, tmp_path / "datasets")
    return tmp_path / "datasets"


def read(datasets_dir) -> list[dict]:
    return [json.loads(line) for line in (datasets_dir / "_answer" / "samples.jsonl").read_text(encoding="utf-8").splitlines()]


def test_labeled_item_becomes_the_next_active_sample():
    samples = hand_written()
    merged, changes = merge(samples, [labeled(input={"query": "so sánh", "history": [{"role": "user", "content": "hi"}]})])
    assert merged[:-1] == samples
    new = merged[-1]
    assert changes["added"] == [new["id"]] == [f"answer-{len(samples) + 1:03d}"]
    assert new["input"] == "so sánh" and new["history"] == [{"role": "user", "content": "hi"}]
    assert new["expected"] == {"behavior": "answer", "facts": ["BM25"]}
    assert new["metadata"] == {"status": "active", "langfuse_item_id": "item-a", "source_trace_id": "trace-a"}


@pytest.mark.parametrize("expected", [None, "Hybrid Search kết hợp BM25 và vector", {"answer_text": "x"}, {}])
def test_unlabeled_item_lands_as_needs_review(expected):
    merged, _ = merge([], [item(expected=expected)])
    assert merged[0]["expected"] == {}
    assert merged[0]["metadata"]["status"] == "needs_review"


def test_resync_keeps_the_id_and_updates_only_what_changed():
    first, _ = merge([], [labeled(), labeled(item_id="item-b")])
    again, changes = merge(first, [labeled(), labeled(item_id="item-b", metadata={"tags": ["single-hop"]})])
    assert [s["id"] for s in again] == ["answer-001", "answer-002"]
    assert changes["added"] == [] and changes["updated"] == ["answer-002"]
    assert again[1]["metadata"]["tags"] == ["single-hop"]


def test_archived_or_removed_items_are_deprecated_and_hand_written_samples_are_kept():
    samples = hand_written()
    first, _ = merge(samples, [labeled(), labeled(item_id="item-b")])
    merged, changes = merge(first, [labeled(status="ARCHIVED")])
    assert merged[:len(samples)] == samples
    assert changes["updated"] == [merged[-2]["id"]] and changes["deprecated"] == [merged[-1]["id"]]
    assert {s["metadata"]["status"] for s in merged[-2:]} == {"deprecated"}
    # A later sync does not report the removed item again
    assert merge(merged, [labeled(status="ARCHIVED")])[1]["deprecated"] == []


def test_item_without_a_question_is_skipped():
    merged, changes = merge([], [item(input={"page_context": {}}), item(item_id="item-b", input="  ")])
    assert merged == [] and changes["skipped"] == ["item-a", "item-b"]


def test_sync_writes_valid_samples_and_leaves_the_file_alone_when_nothing_changed(datasets_dir):
    before = (datasets_dir / "_answer" / "samples.jsonl").read_bytes()
    meta_before = (datasets_dir / "_answer" / "meta.json").read_bytes()
    assert sync([], datasets_dir=datasets_dir, corpus_dir=CORPUS) == 0
    assert (datasets_dir / "_answer" / "samples.jsonl").read_bytes() == before
    assert (datasets_dir / "_answer" / "meta.json").read_bytes() == meta_before

    assert sync([labeled()], datasets_dir=datasets_dir, corpus_dir=CORPUS, dry_run=True) == 0
    assert (datasets_dir / "_answer" / "samples.jsonl").read_bytes() == before

    assert sync([labeled()], datasets_dir=datasets_dir, corpus_dir=CORPUS) == 0
    assert read(datasets_dir)[-1]["metadata"]["langfuse_item_id"] == "item-a"
    # The back-office card reads when and from where the golden set was last synced
    stamp = json.loads((datasets_dir / "_answer" / "meta.json").read_text(encoding="utf-8"))["langfuse_sync"]
    assert stamp["dataset"] == "cris-ai-golden-set" and stamp["samples"] == 1 and stamp["synced_at"]


def test_sync_refuses_to_write_samples_that_do_not_validate(datasets_dir, capsys):
    before = (datasets_dir / "_answer" / "samples.jsonl").read_bytes()
    assert sync([labeled(metadata={"tags": ["not-a-tag"]})], datasets_dir=datasets_dir, corpus_dir=CORPUS) == 1
    out = capsys.readouterr().out
    assert "not-a-tag" in out
    # Points at the Langfuse item to fix
    assert "<- Langfuse item item-a" in out
    assert (datasets_dir / "_answer" / "samples.jsonl").read_bytes() == before


def test_item_asking_a_hand_written_question_is_not_added():
    samples = hand_written()
    question = samples[1]  # no history
    item_input = {"message": question["input"].upper()}
    merged, changes = merge(samples, [labeled(input=item_input)])
    assert merged == samples
    assert changes["duplicate"] == ["item-a"] and changes["added"] == []
