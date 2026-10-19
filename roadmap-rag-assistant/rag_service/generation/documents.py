"""Domain-neutral shape of one retrieved source, as the pipeline sees it."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class ContextDocument:
    id: str
    title: str
    body: str  # text the model reads
    score: float = 0.0
    href: Optional[str] = None  # link the model may cite and the UI may open
