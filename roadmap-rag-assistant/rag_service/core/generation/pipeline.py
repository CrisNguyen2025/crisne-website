"""GenerationPipeline: S1 → S5 for every LLM answer, behind one singleton.

    S1 context.select_documents  relative score cut-off, one <document id=…> per source
       context.build_prompt      persona + rules + <conversation_history> + <context> + <user_query>
    S2 generate.astream          stream tokens from the chat model
    S3 citation.citation_filter  drop links to unknown sources while streaming
       cite_channel              `[[id]]` markers → citation ranges on the text sent out
    S4 guardrails               mask PII while streaming; grounding check on the finished answer,
                                 then fallback or note per DomainProfile.grounding_policy
    S5 delivery                  SSE tokens + closing metadata event; memory is written per turn
                                 by the agent (delivery.record_turn)

Domain specifics come from a DomainProfile passed in (see rag_service/domains/). When the LLM fails, or the answer fails the
grounding check under policy "fallback", the pipeline raises GenerationFailed and the caller
runs its own fallback.
"""

from __future__ import annotations

from typing import Any, AsyncGenerator

from rag_service.auth import is_owner
from rag_service.config import settings
from rag_service.context_usage import record_last_turn, record_turn_diagnostics, split_prompt
from rag_service.core.generation import citation, guardrails
from rag_service.core.generation.sources_channel import SourceChannel
from rag_service.core.generation.cite_channel import CiteChannel, CitationTracker, strip_marks
from rag_service.core.memory.store import format_owner_memory
from rag_service.core.augmentation.context import (
    GenerationRequest,
    build_prompt,
    format_documents,
    reorder_documents,
    select_documents,
)
from rag_service.core.generation.delivery import metadata_event, token_event
from rag_service.core.generation.faithfulness import unsupported_claims
from rag_service.core.generation.grounding import FAIL_PATTERNS
from rag_service.core.generation.profile import DomainProfile
from rag_service.core.generation.generate import StreamResult, astream
from rag_service.llm_breaker import llm_breaker
from rag_service.observability import current_trace, end_step, end_step_on_error, start_step, usage_from_langchain
from rag_service.steps import step_event


class GenerationFailed(Exception):
    """No LLM answer to show. reason: "llm_error" (call failed, breaker counted) or "grounding"."""

    def __init__(self, reason: str, detail: str = "") -> None:
        super().__init__(detail or reason)
        self.reason = reason


def _flush_stream_tail(
    channel: SourceChannel | None,
    cite: CiteChannel | None,
    links: Any,
    pii: Any,
    claims: Any,
    tracker: CitationTracker | None,
    clean: list[str],
) -> str:
    links_tail = ""
    if channel:
        tail = channel.flush()
        if cite:
            tail = cite.feed(tail) + cite.flush()
        clean.append(tail)
        links_tail = links.feed(tail)
    filtered = claims.feed(pii.feed(links_tail + links.flush()) + pii.flush()) + claims.flush()
    return tracker.feed(filtered) if tracker else filtered


def _clip_history_snippet(prompt: str) -> str:
    history_block = split_prompt(prompt).get("history", "")
    # Keep the newest tail (<= 4 KB) so trace reports see the turns actually sent to the model
    # even when <system> + <owner_memory> exceed the 4000-char input clip.
    if len(history_block) > 4000:
        return "…\n" + history_block[-3998:]
    return history_block


def _build_generation_sections(
    profile: DomainProfile,
    req: GenerationRequest,
    prompt: str,
    documents: list[Any],
    links: Any,
    claims: Any,
    cite: CiteChannel | None,
    tracker: CitationTracker | None,
) -> dict[str, Any]:
    _, selected_memory_ids = (
        format_owner_memory(
            req.owner_memories,
            note=profile.memory_note,
            scope=req.memory_scope,
            max_items=profile.memory_max_items,
            max_chars=profile.memory_total_chars,
        )
        if req.owner_memories
        else ("", [])
    )
    sections: dict[str, Any] = {
        "history_turns": prompt.count("<turn "),
        "documents": [d.id for d in documents],
        "dropped_documents": len(req.sources) - len(documents),
        "removed_links": links.removed,
    }
    history_snippet = _clip_history_snippet(prompt)
    if history_snippet:
        sections["conversation_history"] = history_snippet
    if selected_memory_ids:
        sections["owner_memory_ids"] = selected_memory_ids
        sections["owner_memory_count"] = len(selected_memory_ids)
    if req.lesson_provenances and is_owner():
        sections["provenance_lessons"] = len(req.lesson_provenances)
    dropped_claims = getattr(claims, "dropped", None)
    if dropped_claims:
        sections["dropped_claims"] = dropped_claims
    if cite and tracker:
        sections["citations"] = len(tracker.citations)
        sections["invalid_citations"] = cite.invalid
    return sections


def _guard_step_event(guard_report: guardrails.GuardReport) -> dict:
    return step_event(
        "guard",
        "guard",
        "done",
        grounding="issues" if guard_report.issues else "ok",
        **guard_report.found,
    )


class GenerationPipeline:
    def __init__(self, profile: DomainProfile) -> None:
        self.profile = profile

    def available(self, llm: Any) -> bool:
        return llm is not None and not llm_breaker.is_open

    async def _run_rag_grounding(
        self,
        llm: Any,
        answer: str,
        documents: list[Any],
        req: GenerationRequest,
        links: Any,
        sections: dict[str, Any],
    ) -> guardrails.GuardReport:
        context_text = "\n".join(f"{d.title}\n{d.body}" for d in documents)
        report = guardrails.check(answer, context_text, req.query, links.removed, self.profile.grounding_fail_on)
        if settings.rag_semantic_grounding:
            unsupported = await unsupported_claims(llm, answer, context_text, req.query)
            if unsupported is not None:
                report.grounding["unsupported_claims"] = unsupported
                report.fail_on = report.fail_on + ("unsupported_claims",)
        sections["grounding"] = report.grounding
        if (trace := current_trace()) is not None:
            trace.flags["grounding"] = "issues" if report.issues else "ok"
            trace.flags.update(report.found)
        return report

    def _record_diagnostics(
        self,
        req: GenerationRequest,
        prompt: str,
        usage: Any,
        documents: list[Any],
        sections: dict[str, Any],
        cite: CiteChannel | None,
        links: Any,
    ) -> None:
        # Read back by POST /chat/context ("last answer" section)
        record_last_turn(
            req.thread_id,
            prompt,
            usage=usage,
            # Each block without the <context> wrapper, so the items add up to the retrieved part
            documents=[
                (d.title, format_documents([d]).removeprefix("<context>\n").removesuffix("\n</context>"))
                for d in documents
            ],
            dropped_documents=sections["dropped_documents"],
        )
        record_turn_diagnostics(
            req.thread_id,
            document_ids=[d.id for d in documents],
            invalid_citations=(len(cite.invalid) if cite else 0) + len(links.removed),
        )

    @staticmethod
    def _build_stream_setup(profile: DomainProfile, req: GenerationRequest) -> dict[str, Any]:
        is_rag = req.mode == "rag"
        documents = reorder_documents(select_documents(req, profile)) if is_rag else []
        prompt = build_prompt(req, profile, documents=documents)
        known = profile.known_links() if is_rag and profile.known_links else None
        links = citation.citation_filter(known)
        channel = SourceChannel(d.id for d in documents) if is_rag else None
        cite = CiteChannel(d.id for d in documents) if is_rag else None
        tracker = CitationTracker(cite) if cite else None
        pii = guardrails.PiiStreamFilter() if profile.mask_output_pii else guardrails.NoFilter()
        hold = is_rag and profile.grounding_policy == "fallback"
        claims = (
            guardrails.ClaimStreamFilter({k: FAIL_PATTERNS[k] for k in profile.grounding_fail_on if k in FAIL_PATTERNS})
            if is_rag and profile.grounding_policy == "sentence"
            else guardrails.NoFilter()
        )
        return {
            "is_rag": is_rag,
            "documents": documents,
            "prompt": prompt,
            "links": links,
            "channel": channel,
            "cite": cite,
            "tracker": tracker,
            "pii": pii,
            "hold": hold,
            "claims": claims,
        }

    @staticmethod
    def _grounding_step_level(report: Any) -> dict[str, str]:
        if report is not None and report.issues:
            return {"level": "WARNING", "status_message": f"grounding: {', '.join(report.issues)}"}
        return {}

    @staticmethod
    def _build_stream_metadata_event(
        req: GenerationRequest,
        answer: str,
        documents: list[Any],
        usage: Any,
        report: Any,
        channel: Any,
        cite: Any,
        tracker: Any,
    ) -> dict:
        grounding_label = ("issues" if report.issues else "ok") if report is not None else None
        cited_ids = (cite.ids + [i for i in channel.ids if i not in cite.ids]) if channel and cite else []
        owner_view = is_owner()
        return metadata_event(  # S5
            req.mode,
            answer,
            documents,
            usage,
            grounding_label,
            show_scores=owner_view,
            # Ids cited inline come first; the <sources> line only adds the ones never cited inline
            cited_ids=cited_ids,
            citations=tracker.citations if tracker else None,
            lesson_provenances=req.lesson_provenances if owner_view else None,
        )

    async def _run_llm_token_stream(
        self,
        llm: Any,
        req: GenerationRequest,
        setup: dict[str, Any],
        clean: list[str],
        held: list[str],
        gen: Any,
    ) -> AsyncGenerator[tuple[bool, dict | None], None]:
        channel, cite, links = setup["channel"], setup["cite"], setup["links"]
        pii, claims, tracker, hold = setup["pii"], setup["claims"], setup["tracker"], setup["hold"]
        result = StreamResult()
        try:
            async for delta in astream(llm, setup["prompt"], result):  # S2
                text = channel.feed(delta) if channel else delta
                if cite:
                    text = cite.feed(text)
                clean.append(text)
                filtered = claims.feed(pii.feed(links.feed(text)))
                safe = tracker.feed(filtered) if tracker else filtered
                if not safe:
                    continue
                if hold:
                    held.append(safe)
                else:
                    yield True, token_event(safe)  # S5
            rest = _flush_stream_tail(channel, cite, links, pii, claims, tracker, clean)
            if rest:
                if hold:
                    held.append(rest)
                else:
                    yield True, token_event(rest)
            setup["result"] = result
        except Exception as exc:
            print(f"[Generation] {req.mode} LLM error ({type(exc).__name__}: {exc}). Falling back.")
            llm_breaker.record_failure(exc)
            end_step(gen, level="ERROR", status_message=f"{type(exc).__name__}: {exc}", metadata={"mode": req.mode})
            if (trace := current_trace()) is not None:
                trace.flags["llm_fallback"] = True
            raise GenerationFailed("llm_error", str(exc)) from exc
        except BaseException as exc:  # client disconnected mid-answer: keep what was generated so far
            end_step_on_error(gen, exc, output="".join(clean), metadata={"mode": req.mode})
            raise

    async def astream(self, llm: Any, req: GenerationRequest) -> AsyncGenerator[dict, None]:
        profile = self.profile
        setup = self._build_stream_setup(profile, req)
        is_rag, documents, prompt = setup["is_rag"], setup["documents"], setup["prompt"]
        links, channel, cite, tracker = setup["links"], setup["channel"], setup["cite"], setup["tracker"]
        hold, claims = setup["hold"], setup["claims"]
        clean: list[str] = []  # the answer without the sources line and source labels
        held: list[str] = []

        yield step_event("answer", "generation", "running")
        gen = start_step(
            profile.trace_names.get(req.mode, f"{req.mode}-answer"),
            "generation",
            model=settings.llm_model,
            input=prompt,
        )
        emitted = False  # any text sent yet (outside "fallback")
        async for did_emit, ev in self._run_llm_token_stream(llm, req, setup, clean, held, gen):
            emitted = emitted or did_emit
            if ev is not None:
                yield ev

        result: StreamResult = setup["result"]
        answer = strip_marks("".join(clean)) if channel else result.text
        usage = usage_from_langchain(result.merged)
        sections = _build_generation_sections(profile, req, prompt, documents, links, claims, cite, tracker)
        report = (
            await self._run_rag_grounding(llm, answer, documents, req, links, sections)
            if is_rag
            else None
        )

        # "sentence" with every sentence dropped sent nothing: the caller's fallback replaces it cleanly
        withheld = hold or (bool(getattr(claims, "dropped", None)) and not emitted)
        if report is not None and report.failed and withheld:
            end_step(
                gen,
                output=answer,
                usage_details=usage,
                level="WARNING",
                status_message=f"grounding failed: {', '.join(report.issues)}; answer withheld",
                metadata={"grounding": report.grounding, "sections": sections, "fallback": "grounding"},
            )
            if (trace := current_trace()) is not None:
                trace.flags["grounding_fallback"] = True
            if is_owner():
                yield _guard_step_event(report)
            raise GenerationFailed("grounding", ", ".join(report.issues))

        # Ended before the held text is sent: a disconnect at those yields cannot leave the step open
        end_step(
            gen,
            output=answer,
            usage_details=usage,
            metadata={"grounding": report.grounding, "sections": sections} if report else {"sections": sections},
            **self._grounding_step_level(report),
        )
        if held:
            yield token_event("".join(held))
        if report is not None and report.failed and profile.grounding_note:
            yield token_event(profile.grounding_note)
        yield step_event("answer", "generation", "done", mode="llm")
        if report is not None and is_owner():
            yield _guard_step_event(report)
        self._record_diagnostics(req, prompt, usage, documents, sections, cite, links)
        yield self._build_stream_metadata_event(req, answer, documents, usage, report, channel, cite, tracker)


