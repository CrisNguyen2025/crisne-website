/**
 * TypeScript types for the Roadmap RAG Assistant SDK.
 * Mirrors the Python Pydantic schemas from rag_service/api/schemas.py.
 */

export interface ToolCallResult {
  name: string;
  args: Record<string, unknown>;
  result: string;
}

export interface ChatRequest {
  message: string;
  thread_id?: string;
  context?: PageContext;
}

/** Page the user is viewing; lets the assistant resolve "này" / "đây" references. */
export interface PageContext {
  roadmapSlug?: string;
  layerId?: string;
  itemId?: string;
}

export interface ChatResponse {
  message: string;
  tool_calls: ToolCallResult[];
  /** Final state of every step of the turn (streaming endpoint only). */
  steps?: AssistantStepEvent[];
}

/** A document found by the retrieval step. */
export interface AssistantStepItem {
  title: string;
  type?: 'topic' | 'layer' | 'item' | string;
  topic?: string;
  href?: string;
  /** Owner only. Orders the items; its scale depends on the retrieval path, so never show it as %. */
  score?: number;
}

export type AssistantStepKind = 'routing' | 'retrieval' | 'tool' | 'generation' | 'guard';

/**
 * One step of a chat turn, streamed as SSE `event: step` (contract: rag_service/steps.py).
 * Events with the same `id` update the step: `running`, then `done` or `error`.
 * The server sends data only; labels are mapped on the client (see `formatStepLabel`).
 */
export interface AssistantStepEvent {
  id: string;
  kind: AssistantStepKind | (string & {});
  status: 'running' | 'done' | 'error';
  /** Server-measured, on done/error when a running event came first. */
  duration_ms?: number;
  detail?: string;
  // routing
  intent?: string;
  confidence?: number;
  method?: string;
  // retrieval
  count?: number;
  items?: AssistantStepItem[];
  // tool
  name?: string;
  /** Owner only. */
  args?: Record<string, unknown>;
  result?: string;
  // generation
  mode?: 'llm' | 'context' | 'no_match' | 'template' | (string & {});
  fallback_reason?: string;
  // guard (owner only)
  grounding?: 'ok' | 'issues';
  ungrounded_terms?: string[];
  future_promise?: string[];
  invalid_links?: string[];
  /** Client clock (epoch ms), set by the chat hook; not sent by the server. */
  startedAt?: number;
  endedAt?: number;
}

export interface WebMcpToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface PlanResponse {
  tool: string | null;
  args: Record<string, unknown>;
  reply: string;
}

export interface HealthResponse {
  status: string;
  adapter_mode: string;
  llm_model: string;
  tools_count: number;
}

/**
 * Action chip metadata for interactive generative UI.
 * Compatible with the action tag protocol [[action:type|id|label]].
 */
export interface ChatActionChip {
  type: 'project' | 'roadmap' | 'contact' | 'link';
  id: string;
  label: string;
  data?: Record<string, unknown>;
  action?: string;
  payload?: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCallResult[];
  actionChips?: ChatActionChip[];
  status?: 'sending' | 'streaming' | 'complete' | 'error';
  timestamp: Date;
}
