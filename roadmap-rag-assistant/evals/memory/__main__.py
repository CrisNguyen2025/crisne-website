"""Offline runner for the standalone Owner Memory evaluation suite (`python -m evals.memory`)."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
import sys

from evals.memory.cases import EXTRACTION_CASES, RANKING_CASES, ExtractionCase, RankingCase
from rag_service.auth import current_actor
from rag_service.core.memory.extractor import _parse_suggestions, extract_memory_suggestions
from rag_service.core.memory.store import OwnerMemoryItem, OwnerMemoryStore, select_owner_memories


@dataclass
class _EvalResult:
    name: str
    passed: bool
    detail: str = ""


def _to_memory_item(raw: dict) -> OwnerMemoryItem:
    return OwnerMemoryItem(
        id=str(raw["id"]),
        kind=str(raw.get("kind") or "techstack"),
        content=str(raw.get("content") or ""),
        scope=raw.get("scope"),
        source=str(raw.get("source") or "explicit"),
        status=str(raw.get("status") or "active"),
        last_used_at=raw.get("last_used_at"),
        use_count=int(raw.get("use_count", 0)),
        confidence=raw.get("confidence"),
        valid_to=raw.get("valid_to"),
    )


def _eval_extraction_case(case: ExtractionCase) -> _EvalResult:
    active = [_to_memory_item(m) for m in case.existing_active]
    suggestions = _parse_suggestions(
        case.raw_llm_output,
        existing_active=active,
        existing_pending=(),
        scope=case.scope,
    )
    count = len(suggestions)
    if not (case.expected_min_count <= count <= case.expected_max_count):
        return _EvalResult(case.id, False, f"expected {case.expected_min_count}..{case.expected_max_count}, got {count}")
    if case.expected_kind and (not suggestions or suggestions[0].kind != case.expected_kind):
        return _EvalResult(case.id, False, f"expected kind={case.expected_kind}")
    if case.expected_replaces_id and (not suggestions or suggestions[0].replaces_memory_id != case.expected_replaces_id):
        return _EvalResult(case.id, False, f"expected replaces={case.expected_replaces_id}")
    joined = " ".join(s.content for s in suggestions)
    for bad in case.forbidden_substrings:
        if bad in joined:
            return _EvalResult(case.id, False, f"forbidden substring leaked: {bad}")
    return _EvalResult(case.id, True)


def _eval_ranking_case(case: RankingCase) -> _EvalResult:
    items = [_to_memory_item(m) for m in case.items]
    selected = select_owner_memories(items, scope=case.scope, query=case.query, max_items=case.max_items)
    selected_ids = [m.id for m in selected]
    if case.expected_first_ids and tuple(selected_ids[: len(case.expected_first_ids)]) != case.expected_first_ids:
        return _EvalResult(case.id, False, f"expected prefix {case.expected_first_ids}, got {selected_ids}")
    for mid in case.must_include_ids:
        if mid not in selected_ids:
            return _EvalResult(case.id, False, f"missing required id={mid} in {selected_ids}")
    for mid in case.must_exclude_ids:
        if mid in selected_ids:
            return _EvalResult(case.id, False, f"unexpected id={mid} in {selected_ids}")
    return _EvalResult(case.id, True)


async def _eval_visitor_isolation() -> _EvalResult:
    class _NeverCallLlm:
        async def ainvoke(self, _prompt: str) -> str:
            raise AssertionError("LLM must never be called for Visitor")

    store = OwnerMemoryStore(api=None)
    owner_tok = current_actor.set("owner")
    try:
        await store.create(kind="profile", content="Secret owner fact")
    finally:
        current_actor.reset(owner_tok)

    visitor_tok = current_actor.set("visitor")
    try:
        active = await store.list_active(query="Secret")
        extracted = await extract_memory_suggestions(_NeverCallLlm(), user_message="Tôi là dev")
        if active or extracted:
            return _EvalResult("visitor-isolation", False, f"visitor leaked active={len(active)} extracted={len(extracted)}")
        return _EvalResult("visitor-isolation", True)
    finally:
        current_actor.reset(visitor_tok)


def run_memory_evals() -> int:
    results = [_eval_extraction_case(c) for c in EXTRACTION_CASES]
    results.extend(_eval_ranking_case(c) for c in RANKING_CASES)
    results.append(asyncio.run(_eval_visitor_isolation()))

    failed = [r for r in results if not r.passed]
    passed = len(results) - len(failed)
    print(f"Memory evals: {passed}/{len(results)} passed")
    for res in results:
        mark = "PASS" if res.passed else "FAIL"
        suffix = f" ({res.detail})" if res.detail else ""
        print(f"  [{mark}] {res.name}{suffix}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(run_memory_evals())
