// Type-only import: llm-provider imports the adapters at runtime, so a runtime import back
// from here would create a cycle
import type { ChatMessage, LlmGenerateParams, LlmMessage } from "./llm-provider";

export function isChatMessages(contents: LlmGenerateParams["contents"]): contents is ChatMessage[] {
  return Array.isArray(contents) && contents.length > 0 && "content" in contents[0];
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
      const text = part.type === "text" ? part.text.trim() : "";
      if (!text) continue;
      if (turns.length === 0 && role === "model") continue;

      const last = turns[turns.length - 1];
      if (last && last.role === role) {
        last.parts.push({ text });
      } else {
        turns.push({ role, parts: [{ text }] });
      }
    }
  }
  return turns;
}

/** Plain text of every message, for previews and logs. */
export function contentsToText(contents: LlmGenerateParams["contents"]): string {
  if (typeof contents === "string") return contents;
  if (isChatMessages(contents)) {
    return contents
      .map((m) => m.content.map((p) => (p.type === "text" ? p.text : "")).join(" "))
      .join(" ");
  }
  return contents.map((m) => m.parts.map((p) => p.text).join(" ")).join(" ");
}
