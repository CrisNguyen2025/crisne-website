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
from rag_service.core.generation import citation, guardrails
from rag_service.core.generation.sources_channel import SourceChannel
from rag_service.core.generation.cite_channel import CiteChannel, CitationTracker, strip_marks
from rag_service.core.augmentation.context import GenerationRequest, build_prompt, select_documents
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
        channel = SourceChannel(d.id for d in documents) if is_rag else None  # S3b
        cite = CiteChannel(d.id for d in documents) if is_rag else None  # S3c
        tracker = CitationTracker(cite) if cite else None
        clean: list[str] = []  # the answer without the sources line and source labels

        def track(text: str) -> str:
            # Last before sending: the citation ranges are measured on exactly what the client gets
            return tracker.feed(text) if tracker else text

        pii = guardrails.PiiStreamFilter() if profile.mask_output_pii else guardrails.NoFilter()  # S4
        # Under "fallback" a RAG answer is held until the grounding check passes; under "sentence" each sentence
        # streams once it ends, and one making a fail_on claim is dropped.
        hold = is_rag and profile.grounding_policy == "fallback"
        held: list[str] = []
        claims = (
            guardrails.ClaimStreamFilter({k: FAIL_PATTERNS[k] for k in profile.grounding_fail_on if k in FAIL_PATTERNS})
            if is_rag and profile.grounding_policy == "sentence"
            else guardrails.NoFilter()
        )

        yield step_event("answer", "generation", "running")
        gen = start_step(
            profile.trace_names.get(req.mode, f"{req.mode}-answer"),
            "generation",
            model=settings.llm_model,
            input=prompt,
        )
        result = StreamResult()
        emitted = False  # any text sent yet (outside "fallback")
        try:
            async for delta in astream(llm, prompt, result):  # S2
                text = channel.feed(delta) if channel else delta
                if cite:
                    text = cite.feed(text)
                clean.append(text)
                if safe := track(claims.feed(pii.feed(links.feed(text)))):
                    if hold:
                        held.append(safe)
                    else:
                        emitted = True
                        yield token_event(safe)  # S5
            if channel:
                tail = channel.flush()
                if cite:
                    tail = cite.feed(tail) + cite.flush()
                clean.append(tail)
                links_tail = links.feed(tail)
            else:
                links_tail = ""
            if rest := track(claims.feed(pii.feed(links_tail + links.flush()) + pii.flush()) + claims.flush()):
                if hold:
                    held.append(rest)
                else:
                    emitted = True
                    yield token_event(rest)
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

        answer = strip_marks("".join(clean)) if channel else result.text
        usage = usage_from_langchain(result.merged)
        sections = {
            "history_turns": prompt.count("<turn "),
            "documents": [d.id for d in documents],
            "dropped_documents": len(req.sources) - len(documents),
            "removed_links": links.removed,
        }
        if getattr(claims, "dropped", None):
            sections["dropped_claims"] = claims.dropped
        if cite and tracker:
            sections["citations"] = len(tracker.citations)
            sections["invalid_citations"] = cite.invalid
        report = None
        if is_rag:  # S4
            context_text = "\n".join(f"{d.title}\n{d.body}" for d in documents)
            report = guardrails.check(answer, context_text, req.query, links.removed, profile.grounding_fail_on)
            if settings.rag_semantic_grounding:
                claims = await unsupported_claims(llm, answer, context_text, req.query)
                if claims is not None:
                    report.grounding["unsupported_claims"] = claims
                    report.fail_on = report.fail_on + ("unsupported_claims",)
            sections["grounding"] = report.grounding
            if (trace := current_trace()) is not None:
                trace.flags["grounding"] = "issues" if report.issues else "ok"
                trace.flags.update(report.found)

        def guard_step() -> dict:
            return step_event("guard", "guard", "done", grounding="issues" if report.issues else "ok", **report.found)

        # "sentence" with every sentence dropped sent nothing: the caller's fallback replaces it cleanly
        withheld = hold or (getattr(claims, "dropped", None) and not emitted)
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
                yield guard_step()
            raise GenerationFailed("grounding", ", ".join(report.issues))

        level = (
            {"level": "WARNING", "status_message": f"grounding: {', '.join(report.issues)}"}
            if report is not None and report.issues
            else {}
        )
        # Ended before the held text is sent: a disconnect at those yields cannot leave the step open
        end_step(
            gen,
            output=answer,
            usage_details=usage,
            metadata={"grounding": report.grounding, "sections": sections} if report else {"sections": sections},
            **level,
        )
        if held:
            yield token_event("".join(held))
        if report is not None and report.failed and profile.grounding_note:
            yield token_event(profile.grounding_note)
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
            # Ids cited inline come first; the <sources> line only adds the ones never cited inline
            cited_ids=(cite.ids + [i for i in channel.ids if i not in cite.ids]) if channel and cite else [],
            citations=tracker.citations if tracker else None,
        )


