"""Section 1 — Context Engineering & Prompt Synthesis.

Builds one prompt from persona, rules, conversation history, retrieved documents and the
user query, each in its own XML tag so the model can tell data from instructions.
Every retrieved document gets its own <document id=…> so sources can be told apart and
cited, and documents far below the best match are left out.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional, Sequence, Tuple

from rag_service.auth import is_owner
from rag_service.core.augmentation.documents import ContextDocument
from rag_service.core.generation.profile import DomainProfile
from rag_service.core.augmentation.history import HistoryStore, Turn, history_store
from rag_service.core.memory.store import format_owner_memory
from rag_service.core.prompting import PromptParts, escape_prompt_data, get_prompt_spec, register_prompt, resolve_system_text
from rag_service.core.provenance import format_lesson_provenance_lines

Mode = Literal["rag", "chitchat"]

PROMPT_RAG_SPEC = register_prompt("core-rag", "1.0", "Core RAG answer generation")
PROMPT_CHITCHAT_SPEC = register_prompt("core-chitchat", "1.0", "Core chitchat generation")


@dataclass
class GenerationRequest:
    mode: Mode
    query: str
    thread_id: str = "default"
    # Retrieved (source, score) pairs as the retriever returned them; mode "rag" only.
    # DomainProfile.to_document turns each source into a ContextDocument.
    sources: Sequence[Tuple[Any, float]] = field(default_factory=list)
    # Owner-only persistent memories applicable to this turn (ADR-0015); always empty for Visitors.
    owner_memories: Sequence[Any] = field(default_factory=list)
    memory_scope: Optional[str] = None
    lesson_provenances: Dict[str, Sequence[Any]] = field(default_factory=dict)
    # Current open page hint placed adjacent to <user_query> so history about an earlier page cannot hijack 'này'/'đây'.
    page_hint: str = ""


_escape = escape_prompt_data


def _attr(text: str) -> str:
    # "&" stays literal: the model copies href verbatim, and "&amp;" would break the query string
    return text.replace('"', "&quot;").replace("<", "&lt;")


def _clip(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit] + "…"


def select_documents(req: GenerationRequest, profile: DomainProfile) -> List[ContextDocument]:
    """Convert sources to documents and keep those scoring at least `min_relative_score` of the best.

    Relative, because retrievers score on different scales (RRF ≈ 0.016–0.033, cosine 0–1, BM25).
    """
    docs = [profile.to_document(src, score) for src, score in req.sources]
    if not docs:
        return []
    best = max(d.score for d in docs)
    if best > 0:
        docs = [d for d in docs if d.score >= best * profile.min_relative_score]
    selected = docs[: profile.max_documents]
    if req.lesson_provenances and is_owner():
        enriched: List[ContextDocument] = []
        for d in selected:
            prov_items = req.lesson_provenances.get(d.id)
            if prov_items:
                prov_lines = format_lesson_provenance_lines(prov_items)
                if prov_lines:
                    enriched.append(
                        ContextDocument(
                            id=d.id,
                            title=d.title,
                            body=d.body + "\n" + "\n".join(prov_lines),
                            score=d.score,
                            href=d.href,
                        )
                    )
                    continue
            enriched.append(d)
        return enriched
    return selected


def reorder_documents(docs: Sequence[ContextDocument]) -> List[ContextDocument]:
    if len(docs) <= 2:
        return list(docs)
    reordered: List[ContextDocument] = []
    for i, doc in enumerate(reversed(docs)):
        if i % 2 == 1:
            reordered.append(doc)
        else:
            reordered.insert(0, doc)
    return reordered


def format_documents(docs: List[ContextDocument]) -> str:
    if not docs:
        return "<context>\n</context>"
    blocks = []
    for d in docs:
        attrs = f'id="{_attr(d.id)}" title="{_attr(d.title)}"' + (f' href="{_attr(d.href)}"' if d.href else "")
        blocks.append(f"<document {attrs}>\n{_escape(d.body)}\n</document>")
    return "<context>\n" + "\n".join(blocks) + "\n</context>"


def format_history(turns: List[Turn], profile: DomainProfile) -> str:
    """Newest turns kept within history_total_chars; the oldest are dropped first."""
    lines: List[str] = []
    total = 0
    for t in reversed(turns):
        content = _clip(t.content, profile.history_max_chars)
        if lines and total + len(content) > profile.history_total_chars:
            break
        total += len(content)
        lines.append(f'<turn role="{t.role}">{_escape(content)}</turn>')
    if not lines:
        return ""
    lines.reverse()
    return f"{profile.history_note}\n<conversation_history>\n" + "\n".join(lines) + "\n</conversation_history>"


def _has_document_provenance(req: GenerationRequest, docs: Sequence[ContextDocument]) -> bool:
    return bool(req.lesson_provenances) and is_owner() and any(req.lesson_provenances.get(d.id) for d in docs)


def _build_system_text(
    req: GenerationRequest,
    profile: DomainProfile,
    *,
    has_memory: bool,
    has_provenance: bool,
) -> tuple[str, str, str]:
    default_spec = PROMPT_RAG_SPEC if req.mode == "rag" else PROMPT_CHITCHAT_SPEC
    prompt_id = profile.prompt_ids.get(req.mode, default_spec.id)
    prompt_version = profile.prompt_versions.get(req.mode, default_spec.version)
    spec = get_prompt_spec(prompt_id) or register_prompt(prompt_id, prompt_version, f"{req.mode} answer generation")
    persona, rules = (
        (profile.persona_rag, profile.rules_rag)
        if req.mode == "rag"
        else (profile.persona_chitchat, profile.rules_chitchat)
    )
    base_default = "\n".join(s.strip("\n") for s in (persona, rules) if s)
    base_text, version = resolve_system_text(spec, base_default)
    sections = [base_text]
    if has_memory and profile.rules_owner_memory:
        sections.append(profile.rules_owner_memory)
    if req.mode == "rag" and has_provenance and profile.rules_provenance:
        sections.append(profile.rules_provenance)
    if profile.suggestion_format and (
        profile.should_include_suggestion_format is None or profile.should_include_suggestion_format(req.query)
    ):
        sections.append(profile.suggestion_format)
    # Fixed base text first, conditional addenda after: prefix stays stable from turn to turn
    return "\n".join(s.strip("\n") for s in sections if s), spec.id, version


def _build_system_block(
    req: GenerationRequest,
    profile: DomainProfile,
    *,
    has_memory: bool,
    has_provenance: bool,
) -> str:
    system_text, _, _ = _build_system_text(req, profile, has_memory=has_memory, has_provenance=has_provenance)
    return f"<system>\n{system_text}\n</system>"


def synthesize_prompt_parts(
    req: GenerationRequest,
    profile: DomainProfile,
    history: HistoryStore = history_store,
    documents: Optional[List[ContextDocument]] = None,
) -> Tuple[PromptParts, List[str]]:
    docs: List[ContextDocument] = []
    if req.mode == "rag":
        docs = reorder_documents(select_documents(req, profile)) if documents is None else documents
    mem_block, selected_memory_ids = (
        format_owner_memory(
            req.owner_memories,
            note=profile.memory_note,
            scope=req.memory_scope,
            query=req.query,
            max_items=profile.memory_max_items,
            max_chars=profile.memory_total_chars,
        )
        if req.owner_memories
        else ("", [])
    )
    has_provenance = req.mode == "rag" and _has_document_provenance(req, docs)
    system_text, prompt_id, prompt_version = _build_system_text(
        req, profile, has_memory=bool(mem_block), has_provenance=has_provenance
    )
    user_parts: List[str] = []
    if mem_block:
        user_parts.append(mem_block)
    if hist := format_history(history.get_recent(req.thread_id, profile.history_turns * 2), profile):
        user_parts.append(hist)
    if req.mode == "rag":
        user_parts.append(format_documents(docs))
    if req.page_hint:
        user_parts.append(f"<current_page>\n{_escape(req.page_hint)}\n</current_page>")
    user_parts.append(f"{profile.query_note}\n<user_query>\n{_escape(req.query)}\n</user_query>")
    return (
        PromptParts(
            system_text=system_text,
            user_text="\n\n".join(user_parts),
            prompt_id=prompt_id,
            prompt_version=prompt_version,
        ),
        selected_memory_ids,
    )


def synthesize_prompt(
    req: GenerationRequest,
    profile: DomainProfile,
    history: HistoryStore = history_store,
    documents: Optional[List[ContextDocument]] = None,
) -> Tuple[str, List[str]]:
    parts, selected_memory_ids = synthesize_prompt_parts(req, profile, history=history, documents=documents)
    return parts.as_prompt(), selected_memory_ids


def build_prompt(
    req: GenerationRequest,
    profile: DomainProfile,
    history: HistoryStore = history_store,
    documents: Optional[List[ContextDocument]] = None,
) -> str:
    prompt, _ = synthesize_prompt(req, profile, history=history, documents=documents)
    return prompt
