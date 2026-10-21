"""ACL leak check that runs on every retrieve and answer, whatever scorer made the call.

A section is readable by role R when its document's acl contains R or PUBLIC_ROLE. A sample without
run_as is treated as an anonymous caller, so it may only see PUBLIC_ROLE documents.
"""

from __future__ import annotations

from evals.kit.target import Answer, Hit, RouteResult, Target

PUBLIC_ROLE = "everyone"


class AclGuard:
    """Wraps a Target and records every section it returns to a caller that may not read it."""

    def __init__(self, target: Target, section_acl: dict[str, list[str]]):
        self.target = target
        self.section_acl = section_acl
        self.leaks: list[dict] = []
        self.sample_id: str | None = None  # set by the runner before scoring each sample
        self.name = target.name
        self.capabilities = target.capabilities

    def _check(self, section_ids: list[str], run_as: str | None, via: str) -> None:
        for section_id in section_ids:
            # Sections missing from the corpus are reported by validation/staleness, not as leaks
            allowed = self.section_acl.get(section_id)
            if allowed is not None and PUBLIC_ROLE not in allowed and run_as not in allowed:
                self.leaks.append({"id": self.sample_id, "section_id": section_id, "run_as": run_as, "via": via})

    def retrieve(self, text: str, k: int, run_as: str | None = None) -> list[Hit]:
        hits = self.target.retrieve(text, k, run_as)
        self._check([hit.section_id for hit in hits], run_as, "retrieve")
        return hits

    def route(self, text: str, run_as: str | None = None) -> RouteResult:
        return self.target.route(text, run_as)

    def answer(self, text: str, history: list[dict], run_as: str | None = None) -> Answer:
        answer = self.target.answer(text, history, run_as)
        self._check(answer.citations, run_as, "answer")
        return answer

    def judge(self, prompt: str) -> str:
        return self.target.judge(prompt)

    def contexts(self, section_ids: list[str]) -> list[str]:
        return self.target.contexts(section_ids)

    def corpus_fingerprint(self) -> dict:
        return self.target.corpus_fingerprint()
