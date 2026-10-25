"""Several API keys for one provider: a rate-limited key hands the call to the next one.

Free tiers cap tokens per day per key (Groq: 200k), so one exhausted key would stop every answer.
KeyRotatingLLM holds one chat model per key and moves to the next key when a call is rate limited;
the key that worked stays current for later calls. Only when every key is limited does the error
reach the caller (and llm_breaker).

with_structured_output / bind return a rotating wrapper too, sharing the same current key.
"""

from __future__ import annotations

import time
from typing import Any, AsyncIterator, Callable, List, Sequence

RATE_LIMIT_MARKS = ("429", "rate_limit", "rate limit", "RESOURCE_EXHAUSTED")


def is_rate_limited(exc: BaseException) -> bool:
    text = f"{type(exc).__name__} {exc}"
    return "RateLimit" in type(exc).__name__ or any(mark in text for mark in RATE_LIMIT_MARKS)


def parse_keys(*values: str) -> List[str]:
    """Comma-separated keys from each value, blanks and repeats dropped, order kept."""
    keys = (k.strip() for v in values for k in (v or "").split(","))
    return list(dict.fromkeys(k for k in keys if k and not k.startswith("your_")))


# After moving off the first model, try it again after this long: its limit may have reset
RETRY_FIRST_AFTER = 600.0


class _Current:
    def __init__(self) -> None:
        self.index = 0
        self.since = 0.0


class KeyRotatingLLM:
    def __init__(self, models: Sequence[Any], make: Callable[[Any], Any] = lambda m: m, current: _Current | None = None):
        if not models:
            raise ValueError("KeyRotatingLLM needs at least one model")
        self._models = list(models)
        self._make = make
        self._current = current or _Current()

    @property
    def models(self) -> List[Any]:
        return list(self._models)

    @property
    def key_count(self) -> int:
        return len(self._models)

    def _order(self) -> List[int]:
        start = self._current.index
        if start and time.monotonic() - self._current.since > RETRY_FIRST_AFTER:
            start = 0
        return [(start + i) % len(self._models) for i in range(len(self._models))]

    def _use(self, index: int) -> None:
        if index != self._current.index:
            print(f"[LLM] Key {self._current.index + 1} rate limited; switched to key {index + 1}/{len(self._models)}.")
            self._current.since = time.monotonic()
        self._current.index = index

    def invoke(self, *args: Any, **kwargs: Any) -> Any:
        last: BaseException | None = None
        for i in self._order():
            try:
                result = self._make(self._models[i]).invoke(*args, **kwargs)
                self._use(i)
                return result
            except Exception as exc:
                if not is_rate_limited(exc):
                    raise
                last = exc
        raise last  # type: ignore[misc]

    async def ainvoke(self, *args: Any, **kwargs: Any) -> Any:
        last: BaseException | None = None
        for i in self._order():
            try:
                result = await self._make(self._models[i]).ainvoke(*args, **kwargs)
                self._use(i)
                return result
            except Exception as exc:
                if not is_rate_limited(exc):
                    raise
                last = exc
        raise last  # type: ignore[misc]

    async def astream(self, *args: Any, **kwargs: Any) -> AsyncIterator[Any]:
        # A key can only be swapped before the first chunk: after that the caller already has text
        last: BaseException | None = None
        for i in self._order():
            started = False
            try:
                async for chunk in self._make(self._models[i]).astream(*args, **kwargs):
                    if not started:
                        started = True
                        self._use(i)
                    yield chunk
                if not started:
                    self._use(i)
                return
            except Exception as exc:
                if started or not is_rate_limited(exc):
                    raise
                last = exc
        raise last  # type: ignore[misc]

    def with_structured_output(self, *args: Any, **kwargs: Any) -> "KeyRotatingLLM":
        make = self._make
        return KeyRotatingLLM(self._models, lambda m: make(m).with_structured_output(*args, **kwargs), self._current)

    def bind(self, **kwargs: Any) -> "KeyRotatingLLM":
        make = self._make
        return KeyRotatingLLM(self._models, lambda m: make(m).bind(**kwargs), self._current)

    def __getattr__(self, name: str) -> Any:
        # Model attributes (model_name, temperature…) are read from the current key's model
        return getattr(self._make(self._models[self._current.index]), name)
