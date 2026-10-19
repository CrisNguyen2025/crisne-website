"""Port between the eval kit and the system under test.

A domain implements Target in its own module; the kit only ever sees this Protocol,
so it never imports domain code (enforced by tests/test_evals_kit.py).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True)
class Hit:
    doc_id: str
    section_id: str  # must be a corpus section_id so it can be matched against dataset contexts
    score: float = 0.0


@dataclass(frozen=True)
class RouteResult:
    behavior: str  # answer | clarify | refuse
    route: list[str] = field(default_factory=list)  # empty = no decision (e.g. deferred to an LLM router)


@dataclass(frozen=True)
class Answer:
    text: str
    behavior: str
    citations: list[str] = field(default_factory=list)  # section_ids the answer cites


class Target(Protocol):
    name: str
    # Subset of {"retrieve", "route", "answer"}; scorers needing a missing capability are skipped
    capabilities: frozenset[str]

    def retrieve(self, text: str, k: int, run_as: str | None = None) -> list[Hit]: ...

    def route(self, text: str, run_as: str | None = None) -> RouteResult: ...

    def answer(self, text: str, history: list[dict], run_as: str | None = None) -> Answer: ...

    def corpus_fingerprint(self) -> dict:
        """{"source", "doc_count", "sha256"}; sha256 = kit.corpus.content_hash(documents the target serves),
        compared with the static corpus before a run."""
        ...
