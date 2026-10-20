"""Query transformation before retrieval (domain-neutral).

One LLM call turns the user's question into the queries to search:
- rewrite: a self-contained question, when the question refers back to the conversation ("bài đó");
- variants: other phrasings of the question, so a different wording still finds the document;
- parts: sub-questions, only for questions that compare or list several things.

Every query is searched, the results are merged by document id (reciprocal rank fusion), and
the caller checks the merged list against the original question. A failed or slow call leaves
the plan as the original question, so retrieval never does worse than without transformation.
"""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass
from typing import Any, Iterable, List, Optional, Sequence, Tuple

MAX_VARIANTS = 2
MAX_PARTS = 3
REWRITE_TIMEOUT = 8.0
RRF_K = 60.0
HISTORY_TURNS = 4

# Words that point back to something said earlier
REFERENCE = re.compile(
    r"\b(đó|đấy|này|nọ|kia|nó|trên|vừa\s+rồi|vừa\s+nãy|cái\s+đó|cái\s+này|bài\s+đó|bài\s+này|ở\s+trên)\b",
    re.IGNORECASE,
)
# Questions that compare or list several things
COMPOUND = re.compile(r"\b(so\s+sánh|khác\s+nhau|khác\s+gì|giữa|so\s+với|và|vs\.?)\b|\s-\s|/", re.IGNORECASE)
JSON_OBJECT = re.compile(r"\{.*\}", re.DOTALL)


@dataclass(frozen=True)
class QueryPlan:
    query: str
    rewritten: bool = False
    variants: Tuple[str, ...] = ()
    parts: Tuple[str, ...] = ()

    def queries(self) -> List[str]:
        """Every query to search, the original first, without duplicates."""
        out: List[str] = []
        for q in (self.query, *self.variants, *self.parts):
            q = q.strip()
            if q and q not in out:
                out.append(q)
        return out


def needs_plan(query: str, turns: Sequence[Any]) -> bool:
    """Only a question that points back to the conversation ("bài đó") is worth an LLM call.

    Measured on the retrieval eval, other questions gain little (mrr about +0.02) for one extra call each.
    """
    return bool(turns) and bool(REFERENCE.search(query))


def is_compound(query: str) -> bool:
    return bool(COMPOUND.search(query))


def build_prompt(query: str, turns: Sequence[Any]) -> str:
    history = "\n".join(f"{t.role}: {t.content}" for t in turns[-HISTORY_TURNS:]) or "(chưa có)"
    return (
        "Bạn chuẩn bị câu truy vấn tìm kiếm cho một hệ thống tra cứu tài liệu. "
        "Chỉ trả về một JSON object với các khóa:\n"
        '- "rewrite": câu hỏi viết lại đứng độc lập, thay các đại từ như "đó", "này" bằng tên cụ thể '
        "trong lịch sử; nếu câu hỏi đã rõ thì giữ nguyên.\n"
        f'- "variants": tối đa {MAX_VARIANTS} cách diễn đạt khác của cùng câu hỏi (từ đồng nghĩa, tên tiếng Anh).\n'
        f'- "parts": tối đa {MAX_PARTS} câu hỏi con, chỉ khi câu hỏi so sánh hoặc liệt kê nhiều thứ; nếu không thì [].\n'
        "Không giải thích thêm.\n\n"
        f"<conversation_history>\n{history}\n</conversation_history>\n"
        f"<question>{query}</question>"
    )


def _strings(value: Any, limit: int) -> Tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    items = [v.strip() for v in value if isinstance(v, str) and v.strip()]
    return tuple(dict.fromkeys(items))[:limit]


def parse_plan(text: str, query: str) -> QueryPlan:
    """The plan the model wrote, or the original question when the output is not usable.

    A rewrite is searched too, as one more variant, so the original wording still counts.
    """
    match = JSON_OBJECT.search(text or "")
    if not match:
        return QueryPlan(query)
    try:
        data = json.loads(match.group(0))
    except ValueError:
        return QueryPlan(query)
    if not isinstance(data, dict):
        return QueryPlan(query)
    rewrite = data.get("rewrite")
    rewrite = rewrite.strip() if isinstance(rewrite, str) and rewrite.strip() else query
    variants = _strings(data.get("variants"), MAX_VARIANTS)
    if rewrite != query:
        variants = (rewrite, *variants)
    parts = _strings(data.get("parts"), MAX_PARTS) if is_compound(query) else ()
    return QueryPlan(
        query=query,
        rewritten=rewrite != query,
        variants=tuple(dict.fromkeys(v for v in variants if v != query)),
        parts=tuple(dict.fromkeys(p for p in parts if p != query)),
    )


def _text_of(content: Any) -> str:
    """Message content as text; some providers return a list of parts instead of a string."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(p if isinstance(p, str) else str(p.get("text", "")) if isinstance(p, dict) else "" for p in content)
    return ""


async def plan_queries(query: str, turns: Sequence[Any], llm: Any) -> QueryPlan:
    """One LLM call for the plan, only when needs_plan says so.

    No model, no reference to the conversation, a timeout or an error keeps the original query.
    """
    if llm is None or not query.strip() or not needs_plan(query, turns):
        return QueryPlan(query)
    try:
        message = await asyncio.wait_for(llm.ainvoke(build_prompt(query, turns)), REWRITE_TIMEOUT)
    except Exception:
        return QueryPlan(query)
    return parse_plan(_text_of(getattr(message, "content", "")), query)


def merge_ranked(result_lists: Iterable[Sequence[Tuple[Any, float]]], limit: int) -> List[Tuple[Any, float]]:
    """Reciprocal rank fusion over several result lists, keyed by document id."""
    scores: dict[str, float] = {}
    docs: dict[str, Any] = {}
    for results in result_lists:
        for rank, (doc, _score) in enumerate(results):
            key = str(doc.id)
            docs.setdefault(key, doc)
            scores[key] = scores.get(key, 0.0) + 1.0 / (RRF_K + rank + 1.0)
    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    return [(docs[key], score) for key, score in ranked[:limit]]
