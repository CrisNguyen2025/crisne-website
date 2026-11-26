/**
 * RoadmapChatClient — TypeScript SDK for the Roadmap RAG Assistant with SSE streaming.
 */

import type {
  ActionPreviewMeta,
  AssistantStepEvent,
  ChangeReview,
  ChatResponse,
  ConversationContext,
  CreatedLessonItem,
  CreateLessonInput,
  CreateOwnerMemoryInput,
  EditablePreviewTarget,
  HealthResponse,
  LatestThreadResponse,
  LogMemoryActivityInput,
  OwnerMemoryItem,
  OwnerMemorySettings,
  OwnerMemoryStatus,
  PageContext,
  PlanResponse,
  RoadmapOutlineResponse,
  RoadmapSummaryItem,
  ThreadDetailResponse,
  ThreadSummary,
  ToolCallResult,
  UpdateOwnerMemoryInput,
  WebMcpToolSpec,
} from './types';

export interface RoadmapChatClientOptions {
  baseUrl?: string;
  /** Base path for Owner Memory CRUD API (defaults to `/api/v1/memories`). */
  memoriesBaseUrl?: string;
  /** Base path for Roadmap CRUD API (defaults to `/api/v1/roadmaps`). */
  roadmapsBaseUrl?: string;
  /** Total time allowed for one request, in ms. */
  timeout?: number;
  /** Longest silence allowed between stream chunks, in ms. */
  idleTimeout?: number;
}

/** The stream stopped sending data for too long; the request was cancelled. */
export class StreamTimeoutError extends Error {
  readonly kind = 'timeout' as const;

  constructor(message = 'Stream idle timeout') {
    super(message);
    this.name = 'StreamTimeoutError';
  }
}

export type { AssistantStepEvent, AssistantStepItem, AssistantStepKind, EditablePreviewTarget } from './types';

export interface StreamCallbacks {
  onToken?: (delta: string) => void;
  onThinking?: (delta: string) => void;
  onToolStart?: (name: string, args: Record<string, unknown>) => void;
  /** `isError` comes from the server's `is_error` when present, else a guess from the text */
  onToolEnd?: (name: string, result: string, isError: boolean) => void;
  onStep?: (step: AssistantStepEvent) => void;
  onChangeReview?: (change: ChangeReview) => void;
  /** A change waiting for the Owner's confirmation; `editableTitles` / `editableTarget` may be corrected first */
  onActionPreview?: (preview: ActionPreviewMeta) => void;
  /** Langfuse trace of the turn, sent before the reply (also repeated on `done` as `traceId`) */
  onTrace?: (traceId: string) => void;
  onDone?: (response: ChatResponse) => void;
  onError?: (error: Error) => void;
}

export class RoadmapChatClient {
  private readonly baseUrl: string;
  private readonly memoriesBaseUrl: string;
  private readonly roadmapsBaseUrl: string;
  private readonly timeout: number;
  private readonly idleTimeout: number;

  constructor(options: RoadmapChatClientOptions = {}) {
    this.baseUrl = (options.baseUrl || 'http://localhost:8000').replace(
      /\/$/,
      ''
    );
    this.memoriesBaseUrl = (options.memoriesBaseUrl || '/api/v1/memories').replace(
      /\/$/,
      ''
    );
    this.roadmapsBaseUrl = (options.roadmapsBaseUrl || '/api/v1/roadmaps').replace(
      /\/$/,
      ''
    );
    this.timeout = options.timeout || 120000;
    this.idleTimeout = options.idleTimeout || 30000;
  }

  /**
   * Real-time Server-Sent Events (SSE) streaming chat.
   *
   * @param message - User prompt
   * @param callbacks - Event callbacks for real-time tokens and tool events
   * @param threadId - Conversation thread ID
   * @param context - Optional page context (current roadmap, layer, item)
   * @returns AbortController to allow canceling the stream
   */
  streamChat(
    message: string,
    callbacks: StreamCallbacks,
    threadId: string = 'default',
    context?: PageContext,
    titles?: string[],
    target?: EditablePreviewTarget
  ): AbortController {
    const controller = new AbortController();

    // Two guards: a silence limit between chunks (a stalled stream) and a cap on the whole request.
    // Either one aborts the fetch, and the error reaches onError as a StreamTimeoutError.
    let timedOut = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const cancelForTimeout = () => {
      timedOut = true;
      controller.abort();
    };
    const armIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(cancelForTimeout, this.idleTimeout);
    };
    const totalTimer = setTimeout(cancelForTimeout, this.timeout);

    (async () => {
      try {
        const resp = await fetch(`${this.baseUrl}/chat/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            thread_id: threadId,
            context,
            ...(titles?.length ? { titles } : {}),
            ...(target && Object.keys(target).length ? { target } : {}),
          }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const errorText = await resp.text().catch(() => resp.statusText);
          throw new Error(`SSE streaming failed (${resp.status}): ${errorText}`);
        }

        if (!resp.body) {
          throw new Error('Response body is null');
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let currentEvent = 'message';

        const accumulatedTools: ToolCallResult[] = [];
        const pendingToolArgs = new Map<string, Record<string, unknown>>();
        let accumulatedMessage = '';
        let accumulatedThinking = '';
        let inThinkTag = false;
        // Set by `done` or `error`. A body that ends without either was cut off (e.g. the proxy's
        // time limit), and the caller must still hear about it or it waits forever.
        let isTerminated = false;

        const processTokenChunk = (chunk: string) => {
          if (!chunk) return;
          let remaining = chunk;

          while (remaining.length > 0) {
            if (!inThinkTag) {
              const thinkMatch = remaining.match(/<(?:think|thought)>/i);
              if (thinkMatch && thinkMatch.index !== undefined) {
                const before = remaining.slice(0, thinkMatch.index);
                if (before) {
                  accumulatedMessage += before;
                  callbacks.onToken?.(before);
                }
                inThinkTag = true;
                remaining = remaining.slice(thinkMatch.index + thinkMatch[0].length);
              } else {
                accumulatedMessage += remaining;
                callbacks.onToken?.(remaining);
                remaining = '';
              }
            } else {
              const closeMatch = remaining.match(/<\/(?:think|thought)>/i);
              if (closeMatch && closeMatch.index !== undefined) {
                const thinkContent = remaining.slice(0, closeMatch.index);
                if (thinkContent) {
                  accumulatedThinking += thinkContent;
                  callbacks.onThinking?.(thinkContent);
                }
                inThinkTag = false;
                remaining = remaining.slice(closeMatch.index + closeMatch[0].length);
              } else {
                accumulatedThinking += remaining;
                callbacks.onThinking?.(remaining);
                remaining = '';
              }
            }
          }
        };

        armIdle();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          armIdle();

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
              currentEvent = 'message';
              continue;
            }

            if (trimmed.startsWith('event:')) {
              currentEvent = trimmed.slice(6).trim();
            } else if (trimmed.startsWith('data:')) {
              const dataRaw = trimmed.slice(5).trim();
              try {
                const data = JSON.parse(dataRaw);

                if (currentEvent === 'thinking' || currentEvent === 'reasoning') {
                  const delta = typeof data === 'object' && data !== null
                    ? (data.delta ?? data.content ?? '')
                    : (typeof data === 'string' ? data : '');
                  if (delta) {
                    accumulatedThinking += delta;
                    callbacks.onThinking?.(delta);
                  }
                } else if (currentEvent === 'token') {
                  const rawDelta = typeof data === 'object' && data !== null
                    ? (data.delta ?? data.content ?? '')
                    : (typeof data === 'string' ? data : '');
                  processTokenChunk(rawDelta);
                } else if (currentEvent === 'tool_start') {
                  const args = (data.args && typeof data.args === 'object') ? data.args : {};
                  pendingToolArgs.set(data.name, args);
                  callbacks.onToolStart?.(data.name, args);
                } else if (currentEvent === 'tool_end') {
                  const resolvedArgs = (data.args && Object.keys(data.args).length > 0)
                    ? data.args
                    : (pendingToolArgs.get(data.name) || {});
                  pendingToolArgs.delete(data.name);

                  // The server's is_error is authoritative; guessing from the text is only a
                  // fallback for events that don't carry it (older servers, unknown outcomes).
                  const isFailed =
                    typeof data.is_error === 'boolean'
                      ? data.is_error
                      : Boolean(
                          data.status === 'failed' ||
                          data.error ||
                          (typeof data.result === 'string' &&
                            (data.result.toLowerCase().startsWith('error') ||
                             data.result.toLowerCase().includes('failed') ||
                             data.result.toLowerCase().includes('thất bại') ||
                             data.result.toLowerCase().startsWith('exception')))
                        );

                  const toolItem: ToolCallResult = {
                    name: data.name,
                    args: resolvedArgs,
                    result: data.result || '',
                    status: isFailed ? 'failed' : 'success',
                    error: data.error || (isFailed ? data.result : undefined),
                  };
                  accumulatedTools.push(toolItem);
                  callbacks.onToolEnd?.(data.name, data.result || '', isFailed);
                } else if (currentEvent === 'step') {
                  callbacks.onStep?.(data as AssistantStepEvent);
                } else if (currentEvent === 'change_review') {
                  callbacks.onChangeReview?.(data as ChangeReview);
                } else if (currentEvent === 'action_preview') {
                  const rawTarget = data.editable_target;
                  const parsedTarget: EditablePreviewTarget =
                    rawTarget && typeof rawTarget === 'object' && !Array.isArray(rawTarget)
                      ? {
                          ...(typeof rawTarget.topic === 'string' ? { topic: rawTarget.topic } : {}),
                          ...(typeof rawTarget.section === 'string' ? { section: rawTarget.section } : {}),
                        }
                      : {};
                  const editableTitles = Array.isArray(data.editable_titles)
                    ? data.editable_titles.filter((t: unknown): t is string => typeof t === 'string')
                    : undefined;
                  callbacks.onActionPreview?.({
                    actionId: typeof data.action_id === 'string' ? data.action_id : undefined,
                    kind: typeof data.kind === 'string' ? data.kind : undefined,
                    confirmable: typeof data.confirmable === 'boolean' ? data.confirmable : true,
                    ...(editableTitles?.length ? { editableTitles } : {}),
                    ...(Object.keys(parsedTarget).length > 0 ? { editableTarget: parsedTarget } : {}),
                  });
                } else if (currentEvent === 'trace') {
                  if (typeof data.trace_id === 'string') callbacks.onTrace?.(data.trace_id);
                } else if (currentEvent === 'done') {
                  const finalResp: ChatResponse = {
                    message: data.message || accumulatedMessage,
                    thinking: data.thinking || (accumulatedThinking ? accumulatedThinking : undefined),
                    tool_calls: data.tool_calls || accumulatedTools,
                    steps: Array.isArray(data.steps) ? data.steps : undefined,
                    sources: Array.isArray(data.metadata?.sources) ? data.metadata.sources : undefined,
                    citations: Array.isArray(data.metadata?.citations) ? data.metadata.citations : undefined,
                    changes: Array.isArray(data.changes) ? data.changes : undefined,
                    traceId: typeof data.trace_id === 'string' ? data.trace_id : undefined,
                  };
                  isTerminated = true;
                  callbacks.onDone?.(finalResp);
                } else if (currentEvent === 'error') {
                  isTerminated = true;
                  callbacks.onError?.(new Error(data.error || 'Stream error'));
                }
              } catch (e) {
                console.error('[RoadmapChatClient] Failed to parse SSE data:', e, dataRaw);
              }
            }
          }
        }

        if (!isTerminated) {
          throw new Error('Stream closed before the reply finished');
        }
      } catch (err: unknown) {
        if (timedOut) {
          callbacks.onError?.(new StreamTimeoutError());
          return;
        }
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        callbacks.onError?.(
          err instanceof Error ? err : new Error(String(err))
        );
      } finally {
        clearTimeout(idleTimer);
        clearTimeout(totalTimer);
      }
    })();

    return controller;
  }

  /**
   * Synchronous chat request (waits until response completes).
   */
  async chat(
    message: string,
    threadId: string = 'default',
    context?: PageContext
  ): Promise<ChatResponse> {
    return new Promise((resolve, reject) => {
      this.streamChat(
        message,
        {
          onDone: (resp) => resolve(resp),
          onError: (err) => reject(err),
        },
        threadId,
        context
      );
    });
  }

  /**
   * Ask the service to choose one WebMCP tool for a message. Nothing is executed server-side.
   */
  async plan(
    message: string,
    tools: WebMcpToolSpec[],
    context?: PageContext
  ): Promise<PlanResponse> {
    const resp = await fetch(`${this.baseUrl}/chat/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, tools, context }),
    });
    if (!resp.ok) {
      throw new Error(`Plan request failed (${resp.status})`);
    }
    return (await resp.json()) as PlanResponse;
  }

  /**
   * What the conversation's next answer carries, against Abot's budget. Cheap: no LLM call.
   */
  async getConversationContext(threadId: string): Promise<ConversationContext> {
    const resp = await fetch(`${this.baseUrl}/chat/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_id: threadId }),
    });
    if (!resp.ok) {
      throw new Error(`Context request failed (${resp.status})`);
    }
    return (await resp.json()) as ConversationContext;
  }

  /**
   * Restore the Owner's latest open Thread from Turso (ADR-0012 / ADR-0015).
   * Returns null for Visitors or when the host does not expose `/thread`.
   */
  async getLatestThread(): Promise<LatestThreadResponse | null> {
    try {
      const resp = await fetch(`${this.baseUrl}/thread`, { cache: 'no-store' });
      if (!resp.ok) return null;
      const data = (await resp.json()) as LatestThreadResponse;
      if (!data || typeof data.threadId !== 'string' || !Array.isArray(data.messages)) return null;
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Mark the Owner's Thread closed when starting a fresh conversation so a new tab will not re-open it.
   */
  async resetThread(threadId: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/thread`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId }),
      });
    } catch {
      // Fail-open: starting a new conversation locally still works
    }
  }

  /** List recent Owner Threads (with optional keyword search). */
  async listThreads(query?: string, signal?: AbortSignal): Promise<ThreadSummary[]> {
    const params = new URLSearchParams();
    const trimmed = query?.trim();
    if (trimmed) {
      params.set('q', trimmed);
    }
    const suffix = params.toString();
    const resp = await fetch(`${this.baseUrl}/threads${suffix ? `?${suffix}` : ''}`, {
      cache: 'no-store',
      signal,
    });
    if (!resp.ok) {
      throw new Error(`Không tải được lịch sử chat (${resp.status})`);
    }
    const data = (await resp.json()) as { threads?: ThreadSummary[] };
    return Array.isArray(data.threads) ? data.threads : [];
  }

  /** Switch to a previous Owner Thread and make it the active open Thread. */
  async switchThread(threadId: string): Promise<ThreadDetailResponse> {
    const resp = await fetch(`${this.baseUrl}/threads/${encodeURIComponent(threadId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'activate' }),
      cache: 'no-store',
    });
    if (!resp.ok) {
      throw new Error(`Không mở được cuộc trò chuyện (${resp.status})`);
    }
    return (await resp.json()) as ThreadDetailResponse;
  }

  /** Permanently delete an Owner Thread from history. */
  async deleteThread(threadId: string): Promise<void> {
    const resp = await fetch(`${this.baseUrl}/threads/${encodeURIComponent(threadId)}`, {
      method: 'DELETE',
    });
    if (!resp.ok) {
      throw new Error(`Không xoá được cuộc trò chuyện (${resp.status})`);
    }
  }

  /** List Owner Memory items by status (`active`, `pending`, `archived`, or `all`). */
  async listMemories(
    status: OwnerMemoryStatus | 'all' = 'active',
    options?: { origin?: 'all' | 'explicit' | 'auto'; q?: string }
  ): Promise<OwnerMemoryItem[]> {
    const params = new URLSearchParams({ status });
    if (options?.origin && options.origin !== 'all') {
      params.set('origin', options.origin);
    }
    if (options?.q?.trim()) {
      params.set('q', options.q.trim());
    }
    const resp = await fetch(`${this.memoriesBaseUrl}?${params.toString()}`, {
      cache: 'no-store',
    });
    if (!resp.ok) {
      throw new Error(`Không tải được bộ nhớ (${resp.status})`);
    }
    const data = (await resp.json()) as { memories?: OwnerMemoryItem[] };
    return Array.isArray(data.memories) ? data.memories : [];
  }

  /** Create an explicit active Owner Memory entry. */
  async createMemory(input: CreateOwnerMemoryInput): Promise<OwnerMemoryItem> {
    const resp = await fetch(this.memoriesBaseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Không lưu được mục bộ nhớ (${resp.status})`);
    }
    const data = (await resp.json()) as { memory: OwnerMemoryItem };
    return data.memory;
  }

  /** Update an Owner Memory entry (content, kind, scope, or status such as approving pending -> active). */
  async updateMemory(id: string, input: UpdateOwnerMemoryInput): Promise<OwnerMemoryItem> {
    const resp = await fetch(`${this.memoriesBaseUrl}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Không cập nhật được mục bộ nhớ (${resp.status})`);
    }
    const data = (await resp.json()) as { memory: OwnerMemoryItem };
    return data.memory;
  }

  /** Permanently delete an Owner Memory entry. */
  async deleteMemory(id: string): Promise<void> {
    const resp = await fetch(`${this.memoriesBaseUrl}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!resp.ok) {
      throw new Error(`Không xoá được mục bộ nhớ (${resp.status})`);
    }
  }

  /** Read Owner Memory global kill-switches (`memoryEnabled`, `autoObserveEnabled`). */
  async getMemorySettings(): Promise<OwnerMemorySettings> {
    const resp = await fetch(`${this.memoriesBaseUrl}/settings`, { cache: 'no-store' });
    if (!resp.ok) {
      throw new Error(`Không tải được cài đặt bộ nhớ (${resp.status})`);
    }
    const data = (await resp.json()) as { settings?: OwnerMemorySettings };
    if (!data?.settings || typeof data.settings.memoryEnabled !== 'boolean') {
      throw new Error('Dữ liệu cài đặt bộ nhớ không hợp lệ');
    }
    return data.settings;
  }

  /** Update Owner Memory kill-switches (`memoryEnabled`, `autoObserveEnabled`). */
  async updateMemorySettings(
    input: Partial<Pick<OwnerMemorySettings, 'memoryEnabled' | 'autoObserveEnabled'>>
  ): Promise<OwnerMemorySettings> {
    const resp = await fetch(`${this.memoriesBaseUrl}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Không cập nhật được cài đặt bộ nhớ (${resp.status})`);
    }
    const data = (await resp.json()) as { settings: OwnerMemorySettings };
    return data.settings;
  }

  /** Permanently delete memories matching `status` / `origin` (Clear All). */
  async clearMemories(
    status: OwnerMemoryStatus | 'all' = 'all',
    origin?: 'all' | 'explicit' | 'auto'
  ): Promise<{ deletedCount: number }> {
    const params = new URLSearchParams({ status });
    if (origin && origin !== 'all') {
      params.set('origin', origin);
    }
    const resp = await fetch(`${this.memoriesBaseUrl}?${params.toString()}`, {
      method: 'DELETE',
    });
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Không xoá được bộ nhớ (${resp.status})`);
    }
    const data = (await resp.json()) as { deletedCount?: number };
    return { deletedCount: Number(data.deletedCount ?? 0) };
  }

  /** Best-effort log of Owner rejection/feedback/edit signals for future synthesis avoidance. */
  async logMemoryActivityEvent(input: LogMemoryActivityInput): Promise<void> {
    const resp = await fetch(`${this.memoriesBaseUrl}/activity-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!resp.ok) {
      throw new Error(`Không ghi nhận được phản hồi (${resp.status})`);
    }
  }

  /** Trigger on-demand observation synthesis and stale memory pruning via Next.js proxy. */
  async refreshObservations(force = true): Promise<{
    ok: boolean;
    createdCount: number;
    archivedCount: number;
    skipped?: string;
  }> {
    const resp = await fetch(`${this.baseUrl}/memories/observations/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force }),
    });
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Không tổng hợp lại được quan sát (${resp.status})`);
    }
    return (await resp.json()) as {
      ok: boolean;
      createdCount: number;
      archivedCount: number;
      skipped?: string;
    };
  }

  /** List Topic summaries for Owner Lesson promotion/picker flows. */
  async listRoadmaps(): Promise<RoadmapSummaryItem[]> {
    const resp = await fetch(this.roadmapsBaseUrl, { cache: 'no-store' });
    if (!resp.ok) {
      throw new Error(`Không tải được danh sách Topic (${resp.status})`);
    }
    const data = (await resp.json()) as { roadmaps?: RoadmapSummaryItem[] };
    return Array.isArray(data.roadmaps) ? data.roadmaps : [];
  }

  /** Fetch outline metadata (`sections`, items) of a Topic by slug. */
  async getRoadmap(slug: string): Promise<RoadmapOutlineResponse> {
    const resp = await fetch(
      `${this.roadmapsBaseUrl}/${encodeURIComponent(slug)}?mode=outline`,
      { cache: 'no-store' }
    );
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string; message?: string };
      throw new Error(err.error || err.message || `Không tải được cấu trúc Topic (${resp.status})`);
    }
    return (await resp.json()) as RoadmapOutlineResponse;
  }

  /** Create a Lesson inside a Topic via `/api/v1/roadmaps/items`. */
  async createLesson(input: CreateLessonInput): Promise<CreatedLessonItem> {
    const resp = await fetch(`${this.roadmapsBaseUrl}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string; message?: string };
      throw new Error(err.error || err.message || `Không tạo được Lesson (${resp.status})`);
    }
    const data = (await resp.json()) as { item: CreatedLessonItem };
    return data.item;
  }

  /**
   * Check health of the Assistant service.
   */
  async health(): Promise<HealthResponse> {
    const resp = await fetch(`${this.baseUrl}/health`);
    if (!resp.ok) {
      throw new Error(`Health check failed: ${resp.statusText}`);
    }
    return (await resp.json()) as HealthResponse;
  }
}
