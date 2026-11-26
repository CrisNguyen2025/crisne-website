/**
 * Roadmap Assistant Client Service (Next.js logic layer)
 *
 * Wraps the RoadmapChatClient SDK so UI components (e.g. FloatingChatBot, Modals)
 * can invoke natural language CUD operations and Mini-RAG generation without
 * dealing with raw fetch() calls.
 */

import { RoadmapChatClient } from '@/roadmap-rag-assistant/sdk/typescript/src/client';
import type { ChatResponse, PageContext, ToolCallResult } from '@/roadmap-rag-assistant/sdk/typescript/src/types';
import { isReservedTopicSlug } from '@/lib/roadmap/paths';

// Same-origin proxy (app/api/roadmap-assistant): the browser never calls the Python service
// directly; the proxy decides whether the caller is the owner before forwarding.
export const ROADMAP_ASSISTANT_BASE_URL = '/api/roadmap-assistant';

export const roadmapChatClient = new RoadmapChatClient({
  baseUrl: ROADMAP_ASSISTANT_BASE_URL,
});

export type { ChatResponse, ToolCallResult };

const ROADMAP_WRITE_TOOL_RE =
  /^(create|update|delete|generate|reorder|rename)_|^(import_items_from_text|mark_lesson_reviewed|promote_concept_to_lesson|save_owner_memory|archive_owner_memory)$/;

export function isRoadmapWriteTool(toolName: string): boolean {
  return ROADMAP_WRITE_TOOL_RE.test(toolName);
}

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
  if (isRoadmapWriteTool(plan.tool)) {
    window.dispatchEvent(
      new CustomEvent('roadmap:updated', {
        detail: { toolName: plan.tool, result },
      })
    );
  }
  const body = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  const note = plan.reply ? `\n\n${plan.reply}` : '';
  return `✅ Đã chạy \`${plan.tool}\`${note}\n\n\`\`\`json\n${body}\n\`\`\``;
}

/**
 * Page the user is viewing: `/[topicSlug]` or `/[topicSlug]/[lessonSlug]` (ADR-0014), with the
 * Lesson page's DOM dataset for its Topic and Section. Returns undefined on the server so SSR
 * never reads window, and on pages that are not a Topic or Lesson (`/news`, `/portfolio`, ...).
 */
export function getRoadmapPageContext(): PageContext | undefined {
  if (typeof window === 'undefined') return undefined;
  const params = new URLSearchParams(window.location.search);
  const querySection = params.get('section') || undefined;
  const [first, second] = window.location.pathname.split('/').filter(Boolean).map(decodeURIComponent);

  if (first && !isReservedTopicSlug(first)) {
    if (second) {
      const contextEl =
        typeof document !== 'undefined'
          ? document.querySelector<HTMLElement>('[data-roadmap-context]')
          : null;
      return {
        roadmapSlug: contextEl?.dataset.roadmapSlug || first,
        itemId: second,
        section: contextEl?.dataset.section || querySection,
      };
    }
    return { roadmapSlug: first, itemId: undefined, section: querySection };
  }

  const roadmapSlug = params.get('topic') || undefined;
  const itemId = params.get('item') || undefined;
  if (!roadmapSlug && !itemId && !querySection) return undefined;
  return { roadmapSlug, itemId, section: querySection };
}
