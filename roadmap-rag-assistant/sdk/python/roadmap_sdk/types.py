"""Response types for the Roadmap Assistant SDK."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ToolCallResult:
    """Represents a single tool call executed by the agent."""

    name: str
    args: dict
    result: str


@dataclass
class ChatResponse:
    """Response from the /chat endpoint."""

    message: str
    tool_calls: list[ToolCallResult] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict) -> ChatResponse:
        """Parse a raw JSON response dict into a ChatResponse."""
        tool_calls = [
            ToolCallResult(
                name=tc.get("name", ""),
                args=tc.get("args", {}),
                result=tc.get("result", ""),
            )
            for tc in data.get("tool_calls", [])
        ]
        return cls(message=data.get("message", ""), tool_calls=tool_calls)
