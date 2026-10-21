/**
 * TypeScript types for the Roadmap RAG Assistant SDK.
 * Mirrors the Python Pydantic schemas from rag_service/api/schemas.py.
 */

export interface ToolCallResult {
  name: string;
  args: Record<string, unknown>;
  result: string;
  status?: 'running' | 'success' | 'failed';
  error?: string;
  startedAt?: number;
  endedAt?: number;
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
  thinking?: string;
  tool_calls: ToolCallResult[];
  /** Final state of every step of the turn (streaming endpoint only). */
  steps?: AssistantStepEvent[];
  /** Documents the answer used (streaming endpoint only). */
  sources?: ChatSource[];
  /** Claims in `message` and the sources behind each (streaming endpoint only). */
  citations?: ChatCitation[];
  /** What the turn's actions wrote, one per executed action (streaming endpoint only). */
  changes?: ChangeReview[];
  /** Langfuse trace of the turn, to attach 👍/👎 feedback to (streaming endpoint, only when tracing is on). */
  traceId?: string;
}

/** A row an action created or deleted. */
export interface ChangeEntry {
  op: 'create' | 'delete';
  level: 'topic' | 'layer' | 'group' | 'item' | (string & {});
  title: string;
  id?: string;
  code?: string;
  /** Rows a delete removed with this one (a delete cascades), parents first. */
  children?: { level: string; title: string }[];
}

/**
 * What one executed action actually changed, streamed as SSE `event: change_review`
 * (contract: rag_service/execution/changes.py). Sent only when something was written.
 */
export interface ChangeReview {
  id: string;
  action: 'create' | 'delete' | (string & {});
  level: string;
  /** Where the entries were created (topic slug or layer id). */
  parent?: string;
  /** Rows written / deleted, children included. */
  added: number;
  removed: number;
  entries: ChangeEntry[];
  /** Titles left alone because they already exist. */
  skipped?: string[];
  /** True when children were cut short by the server. */
  truncated?: boolean;
}

/** A document the answer used; `cited` when a claim cites it or the answer links it inline. */
export interface ChatSource {
  id: string;
  title: string;
  href?: string | null;
  cited: boolean;
}

/**
 * A claim in the answer and the sources behind it. `start`/`end` are UTF-16 indexes into the
 * final message (`message.slice(start, end) === text`); `text` locates the claim if they drift.
 */
export interface ChatCitation {
  start: number;
  end: number;
  text: string;
  source_ids: string[];
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
  /** Searches run for the question (more than 1 when it was rewritten from history). */
  queries?: number;
  rewritten?: boolean;
  /** Results before the on-topic check, sent only when the check dropped some. */
  before_gate?: number;
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
  /** Reasoned thought stream (from <think> tags or SSE event: thinking) */
  thinking?: string;
  /** True while thinking tokens or initial deliberation are in progress */
  isThinking?: boolean;
  /** Total elapsed time spent thinking in ms */
  thinkingDurationMs?: number;
  toolCalls?: ToolCallResult[];
  sources?: ChatSource[];
  citations?: ChatCitation[];
  actionChips?: ChatActionChip[];
  status?: 'sending' | 'streaming' | 'complete' | 'error';
  timestamp: Date;
}
