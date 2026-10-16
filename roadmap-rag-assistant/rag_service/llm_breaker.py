"""Circuit breaker for LLM quota errors (HTTP 429 / RESOURCE_EXHAUSTED).

After a 429 the provider says when to retry (Gemini: RetryInfo.retryDelay). Until then every
LLM call fails the same way and adds ~0.5s to the turn, so callers skip the LLM and use their
offline path. One breaker is shared by every caller: the quota is per project, not per call site.
"""

from __future__ import annotations

import re
import time
from typing import Callable, Optional

# Used when the error says "rate limited" but gives no retry delay
DEFAULT_COOLDOWN_SECONDS = 60.0
MAX_COOLDOWN_SECONDS = 24 * 3600.0

_RATE_LIMITED = re.compile(r"\b429\b|RESOURCE_EXHAUSTED|rate[_ ]?limit", re.IGNORECASE)
_RETRY_DELAY = re.compile(r"retryDelay['\"]?\s*:\s*['\"]?(\d+(?:\.\d+)?)s")


def retry_after_seconds(exc: BaseException) -> Optional[float]:
    """Seconds to wait when `exc` is a quota/rate-limit error, else None."""
    text = str(exc)
    if not _RATE_LIMITED.search(text):
        return None
    m = _RETRY_DELAY.search(text)
    delay = float(m.group(1)) if m else DEFAULT_COOLDOWN_SECONDS
    return min(delay, MAX_COOLDOWN_SECONDS)


class LlmCircuitBreaker:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._open_until = 0.0

    @property
    def is_open(self) -> bool:
        """True while LLM calls should be skipped."""
        return self._clock() < self._open_until

    def record_failure(self, exc: BaseException) -> bool:
        """Open the breaker when `exc` is a quota error; returns True if it did."""
        delay = retry_after_seconds(exc)
        if delay is None:
            return False
        self._open_until = max(self._open_until, self._clock() + delay)
        print(f"[LLM] Rate limited, skipping LLM calls for {int(delay)}s.")
        return True

    def reset(self) -> None:
        self._open_until = 0.0


llm_breaker = LlmCircuitBreaker()
