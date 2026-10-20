"""StructuredEntityExtractor: the LLM path must actually run, and the heuristic fallback must keep clean titles."""

from __future__ import annotations

import pytest

from rag_service.domains.roadmap.router import StructuredEntityExtractor, normalize_vietnamese
from rag_service.domains.roadmap.router.entity_extractor import EXTRACTION_PROMPT
from rag_service.domains.roadmap.router.schemas import ActionType, EntityLevel, SingleEntity, StructuredRoadmapAction


class _FakeStructuredLLM:
    def __init__(self, result: StructuredRoadmapAction) -> None:
        self.result = result
        self.prompts: list[str] = []

    async def ainvoke(self, prompt: str) -> StructuredRoadmapAction:
        self.prompts.append(prompt)
        return self.result


class _FakeLLM:
    def __init__(self, result: StructuredRoadmapAction) -> None:
        self.structured = _FakeStructuredLLM(result)

    def with_structured_output(self, schema):
        return self.structured


def test_prompt_formats_with_json_examples():
    # Literal JSON braces in the examples used to raise KeyError('"title"') on every request.
    out = EXTRACTION_PROMPT.format(user_prompt="tạo topic A", page_context="(không có)")
    assert '{"title": "mock 1"}' in out
    assert '"tạo topic A"' in out


@pytest.mark.asyncio
async def test_llm_result_is_used_instead_of_fallback():
    llm_result = StructuredRoadmapAction(
        action=ActionType.CREATE,
        entity_level=EntityLevel.ITEM,
        target_parent_identifier="ai",
        entities=[SingleEntity(title="Xây dựng AI cơ bản")],
    )
    llm = _FakeLLM(llm_result)
    extractor = StructuredEntityExtractor(llm_model=llm)

    res = await extractor.aextract("tạo giúp tôi 1 bài về xây dựng ai cơ bản trong ai topic")

    assert len(llm.structured.prompts) == 1
    assert "xây dựng ai cơ bản" in llm.structured.prompts[0]
    assert [e.title for e in res.entities] == ["Xây dựng AI cơ bản"]
    assert res.target_parent_identifier == "ai"


@pytest.mark.asyncio
async def test_fallback_drops_about_word_from_lesson_title():
    extractor = StructuredEntityExtractor(llm_model=None)
    res = await extractor.aextract(normalize_vietnamese("tạo giúp tôi 1 bài về xây dựng ai cơ bản trong ai topic"))
    assert [e.title for e in res.entities] == ["xây dựng ai cơ bản"]
