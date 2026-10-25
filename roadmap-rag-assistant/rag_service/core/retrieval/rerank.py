"""LLM reranking of retrieved candidates (domain-neutral).

Hybrid search ranks by word and vector overlap, so "embedding là gì" can put "Embedding Drift" above
"Embedding Model". One LLM call reads the candidates and returns their ids, most relevant first.

Never worse than without it: no model, a timeout, an error or an unreadable reply keeps the original
order, and candidates the reply leaves out stay after the ones it names, in their original order.
"""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any, Callable, List, Sequence, Tuple

from rag_service.core.retrieval.transform import _text_of

RERANK_TIMEOUT = 8.0
# Candidates fetched before reranking; the caller keeps its own limit afterwards
RERANK_POOL = 8
# Characters of each candidate shown to the model
CANDIDATE_CHARS = 300

JSON_LIST = re.compile(r"\[[^\[\]]*\]", re.DOTALL)


def build_prompt(query: str, candidates: Sequence[Tuple[str, str]]) -> str:
    lines = "\n".join(f'- id="{cid}": {text[:CANDIDATE_CHARS]}' for cid, text in candidates)
    return (
        "Sắp xếp các tài liệu dưới đây theo mức độ trả lời đúng câu hỏi, liên quan nhất trước.\n"
        "Chỉ trả về một mảng JSON các id, ví dụ [\"a\", \"b\"]. Bỏ qua tài liệu không liên quan.\n\n"
        f"Câu hỏi: {query}\n\nTài liệu:\n{lines}"
    )


def parse_order(text: str, ids: Sequence[str]) -> List[str]:
    """Ids in the order the reply gives, then the ones it left out; the original order when unreadable."""
    match = JSON_LIST.search(text or "")
    try:
        named = json.loads(match.group(0)) if match else []
    except json.JSONDecodeError:
        named = []
    known = set(ids)
    ordered = list(dict.fromkeys(str(i) for i in named if str(i) in known))
    return ordered + [i for i in ids if i not in ordered]


async def rerank(
    llm: Any,
    query: str,
    matches: List[Tuple[Any, float]],
    describe: Callable[[Any], str],
) -> List[Tuple[Any, float]]:
    """`matches` reordered by the model; `describe(doc)` is the text the model reads for a candidate."""
    if llm is None or len(matches) < 2:
        return matches
    by_id = {str(doc.id): (doc, score) for doc, score in matches}
    candidates = [(cid, describe(doc)) for cid, (doc, _) in by_id.items()]
    try:
        message = await asyncio.wait_for(llm.ainvoke(build_prompt(query, candidates)), RERANK_TIMEOUT)
    except Exception:
        return matches
    order = parse_order(_text_of(getattr(message, "content", "")), list(by_id))
    return [by_id[cid] for cid in order]
