import type { ChatMessage } from "../types";

// A blank still to fill in: "<tên topic>", "…" or "..."
const PLACEHOLDER = /<[^<>\n]+>|…|\.\.\./;
// A delete: always copied and sent on purpose, never by one tap on an example
const DELETE_COMMAND = /^\s*(?:xóa|xoá|xoa|delete|remove)(?=\s|$)/i;

/** Whether a suggested command can be sent as it is. Otherwise its block offers copy only. */
export function isRunnableSnippet(snippet: string): boolean {
  return !PLACEHOLDER.test(snippet) && !DELETE_COMMAND.test(snippet);
}

/**
 * Maps each assistant message id to `{ [trimmedPrompt]: executedUserMessageId }`
 * for runnable prompts completed after that assistant message appeared in the thread.
 */
export function findExecutedPromptTargets(
  messages: readonly Pick<ChatMessage, "id" | "role" | "content" | "status" | "stopped">[]
): Map<string, Record<string, string>> {
  const completedRuns: Array<{ index: number; id: string; prompt: string }> = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    const prompt = msg.content.trim();
    if (!prompt) continue;

    const reply = messages[i + 1];
    const completed =
      reply?.role === "assistant" &&
      reply.status !== "error" &&
      reply.status !== "streaming" &&
      reply.status !== "sending" &&
      !reply.stopped;

    if (completed) {
      completedRuns.push({ index: i, id: msg.id, prompt });
    }
  }

  const targetsByMsg = new Map<string, Record<string, string>>();
  if (completedRuns.length === 0) return targetsByMsg;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;

    let map: Record<string, string> | undefined;
    for (const run of completedRuns) {
      if (run.index <= i) continue;
      if (!map) map = {};
      // Later completed runs overwrite earlier ones so jumping lands on the latest execution
      map[run.prompt] = run.id;
    }
    if (map) targetsByMsg.set(msg.id, map);
  }

  return targetsByMsg;
}
