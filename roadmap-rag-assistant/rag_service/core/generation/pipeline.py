"""GenerationPipeline: S1 → S5 for every LLM answer, behind one singleton.

    S1 context.select_documents  relative score cut-off, one <document id=…> per source
       context.build_prompt      persona + rules + <conversation_history> + <context> + <user_query>
    S2 generate.astream          stream tokens from the chat model
    S3 citation.citation_filter  drop links to unknown sources while streaming
    S4 guardrails                mask PII while streaming; grounding check on the finished answer,
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
from rag_service.core.generation import citation, guardrails
from rag_service.core.augmentation.context import GenerationRequest, build_prompt, select_documents
from rag_service.core.generation.delivery import metadata_event, token_event
from rag_service.core.generation.profile import DomainProfile
from rag_service.core.generation.generate import StreamResult, astream
from rag_service.llm_breaker import llm_breaker
from rag_service.observability import current_trace, end_step, start_step, usage_from_langchain
from rag_service.steps import step_event


class GenerationFailed(Exception):
    """No LLM answer to show. reason: "llm_error" (call failed, breaker counted) or "grounding"."""

    def __init__(self, reason: str, detail: str = "") -> None:
        super().__init__(detail or reason)
        self.reason = reason


class GenerationPipeline:
    def __init__(self, profile: DomainProfile) -> None:
        self.profile = profile

    def available(self, llm: Any) -> bool:
        return llm is not None and not llm_breaker.is_open

    async def astream(self, llm: Any, req: GenerationRequest) -> AsyncGenerator[dict, None]:
        profile = self.profile
        is_rag = req.mode == "rag"
        documents = select_documents(req, profile) if is_rag else []  # S1
        prompt = build_prompt(req, profile, documents=documents)
        known = profile.known_links() if is_rag and profile.known_links else None
        links = citation.citation_filter(known)  # S3
        pii = guardrails.PiiStreamFilter() if profile.mask_output_pii else guardrails.NoFilter()  # S4
        # Under "fallback" a RAG answer is held until the grounding check passes.
        hold = is_rag and profile.grounding_policy == "fallback"
        held: list[str] = []

        yield step_event("answer", "generation", "running")
        gen = start_step(
            profile.trace_names.get(req.mode, f"{req.mode}-answer"),
            "generation",
            model=settings.llm_model,
            input=prompt,
        )
        result = StreamResult()
        try:
            async for delta in astream(llm, prompt, result):  # S2
                if safe := pii.feed(links.feed(delta)):
                    if hold:
                        held.append(safe)
                    else:
                        yield token_event(safe)  # S5
            if rest := pii.feed(links.flush()) + pii.flush():
                if hold:
                    held.append(rest)
                else:
                    yield token_event(rest)
        except Exception as exc:
            print(f"[Generation] {req.mode} LLM error ({type(exc).__name__}: {exc}). Falling back.")
            llm_breaker.record_failure(exc)
            end_step(gen, level="ERROR", status_message=f"{type(exc).__name__}: {exc}", metadata={"mode": req.mode})
            if (trace := current_trace()) is not None:
                trace.flags["llm_fallback"] = True
            raise GenerationFailed("llm_error", str(exc)) from exc

        answer = result.text
        usage = usage_from_langchain(result.merged)
        sections = {
            "history_turns": prompt.count("<turn "),
            "documents": [d.id for d in documents],
            "dropped_documents": len(req.sources) - len(documents),
            "removed_links": links.removed,
        }
        report = None
        if is_rag:  # S4
            context_text = "\n".join(f"{d.title}\n{d.body}" for d in documents)
            report = guardrails.check(answer, context_text, req.query, links.removed, profile.grounding_fail_on)
            sections["grounding"] = report.grounding
            if (trace := current_trace()) is not None:
                trace.flags["grounding"] = "issues" if report.issues else "ok"
                trace.flags.update(report.found)

        def guard_step() -> dict:
            return step_event("guard", "guard", "done", grounding="issues" if report.issues else "ok", **report.found)

        if report is not None and report.failed and hold:
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
                yield guard_step()
            raise GenerationFailed("grounding", ", ".join(report.issues))

        if held:
            yield token_event("".join(held))
        if report is not None and report.failed and profile.grounding_note:
            yield token_event(profile.grounding_note)

        level = (
            {"level": "WARNING", "status_message": f"grounding: {', '.join(report.issues)}"}
            if report is not None and report.issues
            else {}
        )
        end_step(
            gen,
            output=answer,
            usage_details=usage,
            metadata={"grounding": report.grounding, "sections": sections} if report else {"sections": sections},
            **level,
        )
        yield step_event("answer", "generation", "done", mode="llm")
        if report is not None and is_owner():
            yield guard_step()
        yield metadata_event(  # S5
            req.mode,
            answer,
            documents,
            usage,
            ("issues" if report.issues else "ok") if report is not None else None,
            show_scores=is_owner(),
        )


