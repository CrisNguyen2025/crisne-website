"""GenerationPipeline: S1 → S5 for every LLM answer, behind one singleton.

    S1 context.build_prompt     persona + rules + <conversation_history> + <context> + <user_query>
    S2 generate.astream         stream tokens from the chat model
    S3 citation.citation_filter drop links to unknown sources while streaming
    S4 guardrails.check         grounding report on the finished answer (mode "rag")
    S5 delivery.token_event     SSE events; memory is written per turn by the agent (delivery.record_turn)

Domain specifics live in domain_profile.PROFILE. On LLM failure the pipeline trips the
circuit breaker and raises GenerationFailed so the caller runs its own template fallback.
"""

from __future__ import annotations

from typing import Any, AsyncGenerator

from rag_service.auth import is_owner
from rag_service.config import settings
from rag_service.generation import citation, guardrails
from rag_service.generation.context import GenerationRequest, build_prompt
from rag_service.generation.delivery import token_event
from rag_service.generation.domain_profile import PROFILE, DomainProfile
from rag_service.generation.generate import StreamResult, astream
from rag_service.llm_breaker import llm_breaker
from rag_service.observability import current_trace, end_step, start_step, usage_from_langchain
from rag_service.steps import step_event


class GenerationFailed(Exception):
    """The LLM call failed; already traced and counted by the circuit breaker."""


class GenerationPipeline:
    def __init__(self, profile: DomainProfile = PROFILE) -> None:
        self.profile = profile

    def available(self, llm: Any) -> bool:
        return llm is not None and not llm_breaker.is_open

    async def astream(self, llm: Any, req: GenerationRequest) -> AsyncGenerator[dict, None]:
        profile = self.profile
        prompt = build_prompt(req, profile)  # S1
        is_rag = req.mode == "rag"
        known = profile.known_link_slugs() if is_rag and profile.known_link_slugs else None
        links = citation.citation_filter(known)  # S3

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
                if safe := links.feed(delta):
                    yield token_event(delta=safe)  # S5
            if rest := links.flush():
                yield token_event(delta=rest)
        except Exception as exc:
            print(f"[Generation] {req.mode} LLM error ({type(exc).__name__}: {exc}). Falling back.")
            llm_breaker.record_failure(exc)
            end_step(gen, level="ERROR", status_message=f"{type(exc).__name__}: {exc}", metadata={"mode": req.mode})
            if (trace := current_trace()) is not None:
                trace.flags["llm_fallback"] = True
            raise GenerationFailed(str(exc)) from exc

        answer = result.text
        sections = {"history_turns": prompt.count("<turn "), "removed_links": links.removed}
        report = guardrails.check(answer, req.rag_context or "", req.query, links.removed) if is_rag else None  # S4
        level = {}
        if report is not None:
            sections["grounding"] = report.grounding
            if (trace := current_trace()) is not None:
                trace.flags["grounding"] = "issues" if report.issues else "ok"
                trace.flags.update(report.found)
            if report.issues:
                level = {"level": "WARNING", "status_message": f"grounding: {', '.join(report.issues)}"}
        end_step(
            gen,
            output=answer,
            usage_details=usage_from_langchain(result.merged),
            metadata={"grounding": report.grounding, "sections": sections} if report else {"sections": sections},
            **level,
        )
        yield step_event("answer", "generation", "done", mode="llm")
        if report is not None and is_owner():
            yield step_event("guard", "guard", "done", grounding="issues" if report.issues else "ok", **report.found)


generation_pipeline = GenerationPipeline()
