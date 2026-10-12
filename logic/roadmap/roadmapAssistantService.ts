/**
 * Roadmap Assistant Client Service (Next.js logic layer)
 *
 * Wraps the RoadmapChatClient SDK so UI components (e.g. FloatingChatBot, Modals)
 * can invoke natural language CUD operations and Mini-RAG generation without
 * dealing with raw fetch() calls.
 */

import { RoadmapChatClient } from '@/roadmap-rag-assistant/sdk/typescript/src';
import type { ChatResponse, ToolCallResult } from '@/roadmap-rag-assistant/sdk/typescript/src';

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
