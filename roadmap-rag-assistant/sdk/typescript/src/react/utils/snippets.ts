// A blank still to fill in: "<tên topic>", "…" or "..."
const PLACEHOLDER = /<[^<>\n]+>|…|\.\.\./;
// A delete: always copied and sent on purpose, never by one tap on an example
const DELETE_COMMAND = /^\s*(?:xóa|xoá|xoa|delete|remove)(?=\s|$)/i;

/** Whether a suggested command can be sent as it is. Otherwise its block offers copy only. */
export function isRunnableSnippet(snippet: string): boolean {
  return !PLACEHOLDER.test(snippet) && !DELETE_COMMAND.test(snippet);
}
