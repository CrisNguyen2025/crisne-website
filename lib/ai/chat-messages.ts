// Type-only import: llm-provider imports the adapters at runtime, so a runtime import back
// from here would create a cycle
import type { ChatMessage, LlmGenerateParams, LlmMessage } from "./llm-provider";

export function isChatMessages(contents: LlmGenerateParams["contents"]): contents is ChatMessage[] {
  return Array.isArray(contents) && contents.length > 0 && "content" in contents[0];
}

function appendTurnText(turns: LlmMessage[], role: "user" | "model", text: string): void {
  if (!text || (turns.length === 0 && role === "model")) return;
  const last = turns[turns.length - 1];
  if (last && last.role === role) {
    last.parts.push({ text });
    return;
  }
  turns.push({ role, parts: [{ text }] });
}

/**
 * Text turns starting with a user turn and alternating roles (required by Gemini): drops
 * leading assistant turns and blank text, merges consecutive same-role turns. Non-text
 * parts and tool messages are skipped until tool calling is supported.
 */
export function toAlternatingTurns(messages: ChatMessage[]): LlmMessage[] {
  const turns: LlmMessage[] = [];
  for (const message of messages) {
    if (message.role === "tool") continue;
    const role = message.role === "assistant" ? "model" : "user";
    for (const part of message.content) {
      if (part.type !== "text") continue;
      appendTurnText(turns, role, part.text.trim());
    }
  }
  return turns;
}
