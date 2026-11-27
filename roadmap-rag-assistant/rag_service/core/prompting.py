"""Core prompt security, role separation (`SystemMessage` / `HumanMessage`), and prompt registry."""

from __future__ import annotations

from dataclasses import dataclass
import logging
import re
from typing import Any, AsyncIterator, Dict, Optional, Tuple

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_core.runnables import Runnable

from rag_service import observability
from rag_service.config import settings

log = logging.getLogger(__name__)

_OPEN_CONTROL_TAG_RE = re.compile(
    r"<(owner_memory|conversation_history|user_memory|context|document|turn|system|instructions?"
    r"|prompt|developer|assistant|tool|tools|current_page|user_query|question|candidates?|lesson_content"
    r"|lesson_excerpt|expected_points|owner_answer|subject_context|existing_content|message|page_context"
    r"|documents|answer)\b",
    re.IGNORECASE,
)


def escape_prompt_data(text: str) -> str:
    """Neutralize closing tags and spoofed control-section tags inside untrusted prompt data."""
    escaped = (text or "").replace("</", "<\\/")
    return _OPEN_CONTROL_TAG_RE.sub(r"<\\\1", escaped)


@dataclass(frozen=True)
class PromptSpec:
    id: str
    version: str
    description: str = ""


_PROMPT_REGISTRY: Dict[str, PromptSpec] = {}


def register_prompt(prompt_id: str, version: str, description: str = "") -> PromptSpec:
    """Register a versioned prompt spec in the in-process registry."""
    spec = PromptSpec(id=prompt_id, version=version, description=description)
    _PROMPT_REGISTRY[prompt_id] = spec
    return spec


def get_prompt_spec(prompt_id: str) -> Optional[PromptSpec]:
    return _PROMPT_REGISTRY.get(prompt_id)


def all_prompt_specs() -> Dict[str, PromptSpec]:
    return dict(_PROMPT_REGISTRY)


def resolve_system_text(spec: PromptSpec, default_text: str) -> Tuple[str, str]:
    """Return `(system_text, version)` using Langfuse Prompt Management when enabled, fail-open to local SSOT."""
    if not settings.langfuse_prompt_sync:
        return default_text, spec.version
    lf = observability.get_langfuse()
    if lf is None or not hasattr(lf, "get_prompt"):
        return default_text, spec.version
    try:
        label = (settings.langfuse_prompt_label or "production").strip() or "production"
        remote = lf.get_prompt(spec.id, label=label, fallback=default_text)
        remote_text = getattr(remote, "prompt", None)
        if isinstance(remote_text, str) and remote_text.strip():
            remote_version = getattr(remote, "version", None)
            version_str = f"langfuse:{remote_version}" if remote_version is not None else spec.version
            return remote_text.strip(), version_str
    except Exception as exc:
        log.debug("prompting: Langfuse prompt lookup failed for %s (%s); using local SSOT", spec.id, exc)
    return default_text, spec.version


@dataclass(frozen=True)
class PromptParts:
    """Prompt split cleanly between authoritative system instructions and isolated user/data payload."""

    system_text: str
    user_text: str
    prompt_id: str = ""
    prompt_version: str = ""

    def as_prompt(self) -> str:
        """Render the combined XML-tagged string representation (for context sizing & string-only test stubs)."""
        if not self.system_text:
            return self.user_text
        if not self.user_text:
            return self.system_text
        return f"<system>\n{self.system_text}\n</system>\n\n{self.user_text}"

    def to_messages(self) -> list[BaseMessage]:
        """Render LangChain messages so providers map `SystemMessage` to native system channel."""
        messages: list[BaseMessage] = []
        if self.system_text:
            messages.append(SystemMessage(content=self.system_text))
        messages.append(HumanMessage(content=self.user_text))
        return messages

    def trace_metadata(self) -> Dict[str, str]:
        meta: Dict[str, str] = {}
        if self.prompt_id:
            meta["prompt_id"] = self.prompt_id
        if self.prompt_version:
            meta["prompt_version"] = self.prompt_version
        return meta


def supports_chat_messages(llm: Any) -> bool:
    """True when `llm` (or a wrapped `KeyRotatingLLM` model) accepts `list[BaseMessage]`."""
    if llm is None:
        return False
    if isinstance(llm, Runnable) or bool(getattr(llm, "supports_chat_messages", False)):
        return True
    models = getattr(llm, "models", None)
    if isinstance(models, (list, tuple)) and models:
        return supports_chat_messages(models[0])
    return False


def llm_input(llm: Any, prompt: str | PromptParts) -> Any:
    """Convert `PromptParts` to `[SystemMessage, HumanMessage]` for chat models, or str for legacy mocks."""
    if isinstance(prompt, str):
        return prompt
    return prompt.to_messages() if supports_chat_messages(llm) else prompt.as_prompt()


async def ainvoke_prompt(llm: Any, prompt: str | PromptParts) -> Any:
    """Invoke `llm` with proper role separation when supported."""
    payload = llm_input(llm, prompt)
    return await llm.ainvoke(payload)


async def astream_prompt(llm: Any, prompt: str | PromptParts) -> AsyncIterator[Any]:
    """Stream from `llm` with proper role separation when supported."""
    payload = llm_input(llm, prompt)
    async for chunk in llm.astream(payload):
        yield chunk
