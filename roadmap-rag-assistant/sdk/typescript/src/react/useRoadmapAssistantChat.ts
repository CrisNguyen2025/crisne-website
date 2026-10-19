import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createSmoothStream, type SmoothStream } from './utils/smoothStream';
import { friendlyError } from './errors';
import {
  clearConversation,
  conversationKey,
  loadConversation,
  saveConversation,
} from './storage';
import { buildWelcomeMessage, WELCOME_MESSAGE_ID } from './welcome';
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
  /** Whether the reader may change roadmap data; decides which examples the greeting shows. */
  canWrite?: boolean;
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
  retry: (errorMessageId: string) => void;
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
    canWrite = false,
  } = options;

  // Read once per mount: the saved conversation (if any) is shown and continued
  const storageKey = conversationKey(baseUrl);
  const [restored] = useState(() => (initialMessages?.length ? null : loadConversation(storageKey)));

  const [conversationId, setConversationId] = useState<string>(
    () => initialConversationId || threadId || restored?.conversationId || generateConversationId()
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
    // A restored greeting alone is rebuilt so it always matches the current greeting format
    const onlyGreeting =
      restored?.messages.length === 1 && restored.messages[0].id === WELCOME_MESSAGE_ID;
    if (restored && !onlyGreeting) return restored.messages;
    return [buildWelcomeMessage(getContext?.(), canWrite)];
  });
  // Access is often confirmed after mount: rebuild the greeting only while nothing was sent yet
  const canWriteRef = useRef(canWrite);
  useEffect(() => {
    if (canWriteRef.current === canWrite) return;
    canWriteRef.current = canWrite;
    setMessages((prev) =>
      prev.length === 1 && prev[0].id === WELCOME_MESSAGE_ID
        ? [buildWelcomeMessage(getContextRef.current?.(), canWrite)]
        : prev
    );
  }, [canWrite]);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Save after each finished turn (not per token), and only the settled messages
  useEffect(() => {
    if (isLoading) return;
    const timer = setTimeout(() => {
      const settled = messages.filter((m) => m.status !== 'streaming' && m.status !== 'sending');
      saveConversation(storageKey, { conversationId, messages: settled });
    }, 300);
    return () => clearTimeout(timer);
  }, [messages, conversationId, isLoading, storageKey]);


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
    setMessages((prev) =>
      prev.map((msg) =>
        msg.status === 'streaming'
          ? { ...msg, isThinking: false, status: 'complete', stopped: true }
          : msg
      )
    );
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
        thinking: '',
        isThinking: true,
        thinkingDurationMs: undefined,
        toolCalls: [],
        status: 'streaming',
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
            prev.map((msg) =>
              msg.id === botMsgId
                ? { ...msg, content: reply, isThinking: false, status: 'complete' }
                : msg
            )
          );
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : 'Lỗi không xác định';
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === botMsgId
                ? {
                    ...msg,
                    content: `⚠️ **Lỗi WebMCP**: ${errMsg}`,
                    isThinking: false,
                    status: 'error',
                  }
                : msg
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
          prev.map((msg) => {
            if (msg.id !== botMsgId) return msg;
            const now = Date.now();
            const firstTokenAt = msg.firstTokenAt ?? now;
            const thinkingDurationMs =
              msg.thinkingDurationMs ??
              (msg.thinking || msg.isThinking
                ? Math.max(0, firstTokenAt - (msg.timestamp ? msg.timestamp.getTime() : now))
                : undefined);
            return {
              ...msg,
              content: msg.content + chunk,
              firstTokenAt,
              isThinking: false,
              thinkingDurationMs: thinkingDurationMs ?? msg.thinkingDurationMs,
              status: 'streaming',
            };
          })
        );
      });
      smoothRef.current = smooth;

      try {
        abortControllerRef.current = client.streamChat(
          content,
          {
            onThinking: (delta) => {
              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id !== botMsgId) return msg;
                  return {
                    ...msg,
                    thinking: (msg.thinking || '') + delta,
                    isThinking: true,
                    status: 'streaming',
                  };
                })
              );
            },

            onToolStart: (name, args) => {
              setActiveTool(name);
              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id !== botMsgId) return msg;
                  const currentCalls = msg.toolCalls || [];
                  return {
                    ...msg,
                    toolCalls: [
                      ...currentCalls,
                      {
                        name,
                        args: args || {},
                        result: 'Đang thực thi...',
                        status: 'running',
                        startedAt: Date.now(),
                      },
                    ],
                  };
                })
              );
            },

            onToolEnd: (name, result, isFailed) => {
              setActiveTool(null);
              const status: 'failed' | 'success' = isFailed ? 'failed' : 'success';

              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id !== botMsgId) return msg;
                  const currentCalls = msg.toolCalls || [];
                  // Close the oldest still-running call with this name.
                  const idx = currentCalls.findIndex(
                    (tc) => tc.name === name && (tc.endedAt === undefined || tc.status === 'running')
                  );
                  const updated = currentCalls.map((tc, i) =>
                    i === idx
                      ? {
                          ...tc,
                          result,
                          status,
                          error: isFailed ? result : undefined,
                          endedAt: Date.now(),
                        }
                      : tc
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
                prev.map((msg) => {
                  if (msg.id !== botMsgId) return msg;
                  const now = Date.now();
                  const firstTokenAt = msg.firstTokenAt ?? now;
                  const finalThinking = finalResp.thinking || msg.thinking;
                  const durationMs =
                    msg.thinkingDurationMs ??
                    (finalThinking
                      ? Math.max(0, firstTokenAt - (msg.timestamp ? msg.timestamp.getTime() : now))
                      : undefined);

                  return {
                    ...msg,
                    content: finalResp.message || msg.content,
                    thinking: finalThinking,
                    isThinking: false,
                    thinkingDurationMs: durationMs,
                    status: 'complete',
                    // Keep streamed calls: they carry the step timings.
                    toolCalls: msg.toolCalls?.length
                      ? msg.toolCalls
                      : (finalResp.tool_calls as any),
                    // `done` has the final state of every step: fills in any event missed mid-stream
                    steps: finalResp.steps?.length
                      ? upsertSteps(msg.steps ?? [], finalResp.steps)
                      : msg.steps,
                  };
                })
              );
              setIsLoading(false);
              setIsStreaming(false);
              setActiveTool(null);
            }),

            onError: (err) => {
              smooth.flush();
              const { text } = friendlyError(err);
              setError(text);
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === botMsgId
                    ? {
                        ...msg,
                        // Keep what already streamed; the note goes after it
                        content: msg.content ? `${msg.content}\n\n⚠️ ${text}` : `⚠️ ${text}`,
                        isThinking: false,
                        status: 'error',
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
        const { text } = friendlyError(err);
        setError(text);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === botMsgId
              ? { ...msg, content: `⚠️ ${text}`, isThinking: false, status: 'error' }
              : msg
          )
        );
        setIsLoading(false);
        setIsStreaming(false);
      }
    },
    [input, isLoading, conversationId, client, baseUrl]
  );

  /**
   * Send again the question that produced an error reply. The failed pair (question + error)
   * is removed first, so the conversation shows one attempt, not a trail of failures.
   */
  const retry = useCallback(
    (errorMessageId: string) => {
      const index = messages.findIndex((m) => m.id === errorMessageId);
      const question = index > 0 ? messages[index - 1] : undefined;
      if (!question || question.role !== 'user') return;
      setMessages((prev) => prev.filter((m) => m.id !== errorMessageId && m.id !== question.id));
      void sendMessage(question.content);
    },
    [messages, sendMessage]
  );

  const clearMessages = useCallback(() => {
    // Stop anything still streaming so its tokens can't land in the new conversation
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
    setIsStreaming(false);
    setActiveTool(null);
    setError(null);
    setMessages([buildWelcomeMessage(getContextRef.current?.(), canWriteRef.current)]);
    setConversationId(generateConversationId());
    clearConversation(storageKey);
  }, [storageKey]);

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
    retry,
  };
}
