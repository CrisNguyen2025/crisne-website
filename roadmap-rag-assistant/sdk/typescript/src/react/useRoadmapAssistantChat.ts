import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createSmoothStream, type SmoothStream } from './utils/smoothStream';
import { RoadmapChatClient } from '../client';
import type { ChatMessage } from './types';
import type { AssistantStepEvent, PageContext } from '../types';

/**
 * Merge a step event into the step already shown under that id.
 * Times use the client clock for the start and the server's `duration_ms` for the length,
 * so the timeline matches what the server measured.
 */
function mergeStep(prev: AssistantStepEvent | undefined, next: AssistantStepEvent): AssistantStepEvent {
  const now = Date.now();
  const merged: AssistantStepEvent = { ...prev, ...next };
  if (next.status === 'running') {
    merged.startedAt = prev?.startedAt ?? now;
    merged.endedAt = undefined;
  } else {
    merged.startedAt = prev?.startedAt;
    merged.endedAt =
      prev?.endedAt ??
      (merged.startedAt !== undefined && next.duration_ms !== undefined
        ? merged.startedAt + next.duration_ms
        : now);
  }
  return merged;
}

function upsertSteps(current: AssistantStepEvent[], incoming: AssistantStepEvent[]): AssistantStepEvent[] {
  const steps = [...current];
  for (const step of incoming) {
    const idx = steps.findIndex((s) => s.id === step.id);
    if (idx >= 0) steps[idx] = mergeStep(steps[idx], step);
    else steps.push(mergeStep(undefined, step));
  }
  return steps;
}

function generateConversationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface UseRoadmapAssistantChatOptions {
  baseUrl?: string;
  threadId?: string;
  conversationId?: string;
  initialMessages?: ChatMessage[];
  onToolExecuted?: (toolName: string, result: string) => void;
  /** Returns the page the user is viewing; read at send time. */
  getContext?: () => PageContext | undefined;
  /** Handles "/webmcp <request>" messages; returns the text to show. */
  onWebMcpMessage?: (request: string) => Promise<string>;
}

export interface UseRoadmapAssistantChatReturn {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  isLoading: boolean;
  isStreaming: boolean;
  activeTool: string | null;
  error: string | null;
  conversationId: string;
  sendMessage: (textToSend?: string) => Promise<void>;
  stopStreaming: () => void;
  clearMessages: () => void;
}

export function useRoadmapAssistantChat(
  options: UseRoadmapAssistantChatOptions = {}
): UseRoadmapAssistantChatReturn {
  const {
    baseUrl = 'http://localhost:8000',
    threadId,
    conversationId: initialConversationId,
    initialMessages,
    onToolExecuted,
    getContext,
    onWebMcpMessage,
  } = options;

  const [conversationId, setConversationId] = useState<string>(
    () => initialConversationId || threadId || generateConversationId()
  );

  useEffect(() => {
    if (initialConversationId) {
      setConversationId(initialConversationId);
    } else if (threadId) {
      setConversationId(threadId);
    }
  }, [initialConversationId, threadId]);


  // React 19 compliance: Synchronize callbacks and getters in useEffect
  const onWebMcpRef = useRef(onWebMcpMessage);
  useEffect(() => {
    onWebMcpRef.current = onWebMcpMessage;
  }, [onWebMcpMessage]);

  const getContextRef = useRef(getContext);
  useEffect(() => {
    getContextRef.current = getContext;
  }, [getContext]);

  const onToolExecutedRef = useRef(onToolExecuted);
  useEffect(() => {
    onToolExecutedRef.current = onToolExecuted;
  }, [onToolExecuted]);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (initialMessages && initialMessages.length > 0) {
      return initialMessages;
    }
    return [
      {
        id: 'welcome-msg',
        role: 'assistant',
        content:
          'Xin chào! Tôi là **Roadmap AI Assistant** ⚡\nTrợ lý thông minh hỗ trợ quản trị lộ trình học tập và tra cứu kiến thức chuyên sâu.\n\n**Thao tác nhanh**\n```text\ntạo 2 layer mock 1 và 2 trong be topic\n```\n**Tra cứu tri thức**\n```text\nWebsite có bài nào về Docker hay Database không?\n```\n**Lập kế hoạch**\n```text\n/plan lộ trình Next.js Fullstack\n```\n_Hỗ trợ tương tác tự nhiên cả Tiếng Việt & English._',
        timestamp: new Date(),
      },
    ];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pure useMemo instantiates client reactively without render-phase ref mutations/reads
  const client = useMemo(() => new RoadmapChatClient({ baseUrl }), [baseUrl]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const smoothRef = useRef<SmoothStream | null>(null);

  // Clean up in-flight abort controller on unmount
  useEffect(() => {
    return () => {
      smoothRef.current?.cancel();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const stopStreaming = useCallback(() => {
    smoothRef.current?.flush();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setIsLoading(false);
    setActiveTool(null);
  }, []);

  const sendMessage = useCallback(
    async (textToSend?: string) => {
      const content = (textToSend ?? input).trim();
      if (!content) return;

      // Abort any in-flight stream before starting new message
      smoothRef.current?.flush();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        timestamp: new Date(),
      };

      const botMsgId = `bot-${Date.now()}`;
      const initialBotMsg: ChatMessage = {
        id: botMsgId,
        role: 'assistant',
        content: '',
        toolCalls: [],
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg, initialBotMsg]);
      setInput('');
      setError(null);
      setActiveTool(null);

      // "/webmcp <request>" runs one WebMCP tool in the browser instead of the server chat
      if (/^\/webmcp\b/i.test(content) && onWebMcpRef.current) {
        const request = content.replace(/^\/webmcp\b\s*/i, '');
        setIsLoading(true);
        try {
          const reply = await onWebMcpRef.current(request);
          setMessages((prev) =>
            prev.map((msg) => (msg.id === botMsgId ? { ...msg, content: reply } : msg))
          );
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : 'Lỗi không xác định';
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === botMsgId ? { ...msg, content: `⚠️ **Lỗi WebMCP**: ${errMsg}` } : msg
            )
          );
        } finally {
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setIsStreaming(true);

      // Tokens arrive in bursts; reveal them at a steady pace.
      const smooth = createSmoothStream((chunk) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === botMsgId
              ? {
                  ...msg,
                  content: msg.content + chunk,
                  firstTokenAt: msg.firstTokenAt ?? Date.now(),
                }
              : msg
          )
        );
      });
      smoothRef.current = smooth;

      try {
        abortControllerRef.current = client.streamChat(
          content,
          {
            onToolStart: (name) => {
              setActiveTool(name);
              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id !== botMsgId) return msg;
                  const currentCalls = msg.toolCalls || [];
                  return {
                    ...msg,
                    toolCalls: [
                      ...currentCalls,
                      { name, args: {}, result: 'Đang thực thi...', startedAt: Date.now() },
                    ],
                  };
                })
              );
            },

            onToolEnd: (name, result) => {
              setActiveTool(null);
              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id !== botMsgId) return msg;
                  const currentCalls = msg.toolCalls || [];
                  // Close the oldest still-running call with this name.
                  const idx = currentCalls.findIndex(
                    (tc) => tc.name === name && tc.endedAt === undefined
                  );
                  const updated = currentCalls.map((tc, i) =>
                    i === idx ? { ...tc, result, endedAt: Date.now() } : tc
                  );
                  return { ...msg, toolCalls: updated };
                })
              );
              onToolExecutedRef.current?.(name, result);
            },

            onStep: (stepEvt) => {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === botMsgId
                    ? { ...msg, steps: upsertSteps(msg.steps ?? [], [stepEvt]) }
                    : msg
                )
              );
            },

            onToken: (delta) => smooth.push(delta),

            onDone: (finalResp) => smooth.finish(() => {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === botMsgId
                    ? {
                        ...msg,
                        content: finalResp.message || msg.content,
                        // Keep streamed calls: they carry the step timings.
                        toolCalls: msg.toolCalls?.length
                          ? msg.toolCalls
                          : finalResp.tool_calls,
                        // `done` has the final state of every step: fills in any event missed mid-stream
                        steps: finalResp.steps?.length
                          ? upsertSteps(msg.steps ?? [], finalResp.steps)
                          : msg.steps,
                      }
                    : msg
                )
              );
              setIsLoading(false);
              setIsStreaming(false);
              setActiveTool(null);
            }),

            onError: (err) => {
              smooth.flush();
              const errMsg = err.message || 'Lỗi kết nối tới Assistant service';
              setError(errMsg);
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === botMsgId
                    ? {
                        ...msg,
                        content:
                          msg.content ||
                          `⚠️ **Lỗi kết nối**: ${errMsg}\n\n_Hãy đảm bảo server FastAPI đang chạy tại ${baseUrl}._`,
                      }
                    : msg
                )
              );
              setIsLoading(false);
              setIsStreaming(false);
              setActiveTool(null);
            },
          },
          conversationId,
          getContextRef.current?.()
        );
      } catch (err: unknown) {
        const errMsg =
          err instanceof Error
            ? err.message
            : 'Không thể kết nối tới server Assistant (:8000).';
        setError(errMsg);
        setIsLoading(false);
        setIsStreaming(false);
      }
    },
    [input, isLoading, conversationId, client, baseUrl]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    setConversationId(generateConversationId());
  }, []);

  return {
    messages,
    setMessages,
    input,
    setInput,
    isLoading,
    isStreaming,
    activeTool,
    error,
    conversationId,
    sendMessage,
    stopStreaming,
    clearMessages,
  };
}
