/**
 * Roadmap Assistant Client Service (Next.js logic layer)
 *
 * Wraps the RoadmapChatClient SDK so UI components (e.g. FloatingChatBot, Modals)
 * can invoke natural language CUD operations and Mini-RAG generation without
 * dealing with raw fetch() calls.
 */

import { RoadmapChatClient } from '@/roadmap-rag-assistant/sdk/typescript/src';
import type { ChatResponse, PageContext, ToolCallResult } from '@/roadmap-rag-assistant/sdk/typescript/src';

const RAG_SERVICE_URL =
  process.env.NEXT_PUBLIC_RAG_SERVICE_URL || 'http://localhost:8000';

export const roadmapChatClient = new RoadmapChatClient({
  baseUrl: RAG_SERVICE_URL,
});

/**
 * Send natural language prompt to the Roadmap RAG Assistant.
 *
 * Example:
 *   await sendRoadmapAssistantMessage("tạo cho tôi 3 topic A, B và C");
 */
export async function sendRoadmapAssistantMessage(
  message: string,
  threadId: string = 'web-session'
): Promise<ChatResponse> {
  return roadmapChatClient.chat(message, threadId);
}

/**
 * Check if the Python RAG Assistant service is reachable.
 */
export async function checkRoadmapAssistantHealth(): Promise<boolean> {
  try {
    const health = await roadmapChatClient.health();
    return health.status === 'ok';
  } catch {
    return false;
  }
}

export type { ChatResponse, ToolCallResult };

/**
 * Run one WebMCP tool for a "/webmcp <request>" message.
 * The server only picks the tool; this browser executes it, so writes stay in the user's session.
 */
export async function runWebMcpCommand(request: string): Promise<string> {
  const ctx = typeof document !== 'undefined' ? document.modelContext : undefined;
  if (!ctx) {
    return 'WebMCP chưa khả dụng trên trình duyệt này (cần bật flag WebMCP). Hãy chat không có /webmcp để dùng chế độ thường.';
  }
  if (!request) {
    return 'Nhập yêu cầu sau /webmcp, ví dụ: `/webmcp liệt kê các roadmap`.';
  }

  const registered = await ctx.getTools();
  const plan = await roadmapChatClient.plan(
    request,
    registered.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    getRoadmapPageContext()
  );
  if (!plan.tool) {
    return plan.reply || 'Không có tool phù hợp với yêu cầu này.';
  }

  const tool = registered.find((t) => t.name === plan.tool);
  if (!tool) {
    return `Tool \`${plan.tool}\` không còn được đăng ký trên trang.`;
  }

  const result = await ctx.executeTool(tool, plan.args);
  if (/^(create|update|reorder)_/.test(plan.tool)) {
    window.dispatchEvent(new CustomEvent('roadmap:updated'));
  }
  const body = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  const note = plan.reply ? `\n\n${plan.reply}` : '';
  return `✅ Đã chạy \`${plan.tool}\`${note}\n\n\`\`\`json\n${body}\n\`\`\``;
}

/**
 * Page the user is viewing, read from the URL (?topic=<slug>&layer=<id>&item=<id>).
 * Returns undefined on the server so SSR never reads window.
 */
export function getRoadmapPageContext(): PageContext | undefined {
  if (typeof window === 'undefined') return undefined;
  const params = new URLSearchParams(window.location.search);
  const roadmapSlug = params.get('topic') || undefined;
  const itemId = params.get('item') || undefined;
  const layerId = params.get('layer') || undefined;
  if (!roadmapSlug && !itemId && !layerId) return undefined;
  return { roadmapSlug, itemId, layerId };
}
