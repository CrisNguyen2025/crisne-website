import type { PageContext, ChatActionChip, ChatSource, ChatCitation, ChangeReview } from '../types';
import type { AssistantStepEvent, AssistantStepItem } from '../client';

export type { ChatActionChip };
export type { AssistantStepEvent, AssistantStepItem };

/**
 * Configuration and state types for the Roadmap Assistant Chatbot Widget.
 */

export type ChatbotPosition =
  | 'bottom-right'
  | 'bottom-left'
  | 'top-right'
  | 'top-left';

export interface ToolCall {
  name: string;
  args?: Record<string, unknown>;
  result: string;
  status?: 'running' | 'success' | 'failed';
  error?: string;
  /** Epoch ms when the tool started (client clock). */
  startedAt?: number;
  /** Epoch ms when the tool finished; undefined while running. */
  endedAt?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** Reasoned thought stream (from <think> tags or SSE event: thinking) */
  thinking?: string;
  /** True while thinking tokens or initial deliberation are in progress */
  isThinking?: boolean;
  // True when the user pressed stop before the reply finished
  stopped?: boolean;
  /** Total elapsed time spent thinking in ms */
  thinkingDurationMs?: number;
  toolCalls?: ToolCall[];
  steps?: AssistantStepEvent[];
  /** Documents the answer used, shown under it. */
  sources?: ChatSource[];
  /** Claims in `content` and their sources, shown as chips after each claim. */
  citations?: ChatCitation[];
  /** Data the reply's actions wrote, shown as a review card under it. */
  changes?: ChangeReview[];
  /** Langfuse trace of the reply; feedback on it is scored on this trace. */
  traceId?: string;
  actionChips?: ChatActionChip[];
  /** Follow-up prompts shown as chips under the answer; tapping one sends its prompt. */
  suggestions?: { label: string; prompt: string }[];
  status?: 'sending' | 'streaming' | 'complete' | 'error';
  /** Epoch ms of the first streamed token; ends the "thinking" step. */
  firstTokenAt?: number;
  timestamp: Date;
}

export interface ChatbotConfig {
  /**
   * Whether this reader may change roadmap data. Readers get read-only suggestions.
   * Default: false (fail closed until the host has confirmed access).
   */
  canWrite?: boolean;

  /**
   * Screen anchor corner for the floating widget.
   * Default: 'bottom-right'
   */
  position?: ChatbotPosition;

  /**
   * Horizontal offset from screen edge in pixels.
   * Default: 24
   */
  offsetX?: number;

  /**
   * Vertical offset from screen edge in pixels.
   * Default: 24
   */
  offsetY?: number;

  /**
   * CSS z-index for floating container.
   * Default: 9999
   */
  zIndex?: number;

  /**
   * Widget title in header.
   * Default: 'Roadmap Assistant'
   */
  title?: string;

  /**
   * Subtitle description in header.
   * Default: 'Natural Language CUD & Mini-RAG'
   */
  subtitle?: string;

  /**
   * FastAPI service base URL.
   * Default: 'http://localhost:8000'
   */
  baseUrl?: string;

  /**
   * Returns the page the user is viewing (roadmap, layer, item), sent with each message.
   */
  getContext?: () => PageContext | undefined;

  /** Handles "/webmcp <request>" messages by running a WebMCP tool in the browser. */
  onWebMcpMessage?: (request: string) => Promise<string>;

  /**
   * Whether the chat window starts open.
   * Default: false
   */
  initialOpen?: boolean;

  /**
   * Suggested quick prompts displayed in the empty state.
   */
  suggestedPrompts?: string[];

  /**
   * Initial messages to populate the chat history.
   */
  initialMessages?: ChatMessage[];

  /**
   * Callback fired whenever the agent invokes a tool successfully.
   */
  onToolExecuted?: (toolName: string, result: string) => void;

  /**
   * Callback fired with the last vote on an answer (1 for like, 0 for unlike, null when taken back),
   * after rapid clicks settle. A 👎 arrives once its reason sheet closes, with the reason if given.
   * Reject the promise when the vote was not saved: the widget then shows the previous vote again.
   */
  onFeedback?: (
    messageId: string,
    value: 0 | 1 | null,
    detail?: FeedbackDetail
  ) => void | Promise<void>;

  /**
   * Optional custom CSS class name for the wrapper container.
   */
  className?: string;

  /**
   * Optional custom conversation/thread ID.
   * If omitted, a unique UUID is automatically generated per conversation session.
   */
  conversationId?: string;
  threadId?: string;
}

export interface FeedbackDetail {
  /** Langfuse trace of the rated reply; missing when the service runs without tracing. */
  traceId?: string;
  reason?: string;
  comment?: string;
}

