import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { RoadmapChatClient } from '../client';
import type { ChatMessage } from './types';
import type { PageContext } from '../types';

export interface UseRoadmapAssistantChatOptions {
  baseUrl?: string;
  threadId?: string;
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
  sendMessage: (textToSend?: string) => Promise<void>;
  stopStreaming: () => void;
  clearMessages: () => void;
}

export function useRoadmapAssistantChat(
  options: UseRoadmapAssistantChatOptions = {}
): UseRoadmapAssistantChatReturn {
  const {
    baseUrl = 'http://localhost:8000',
    threadId = 'roadmap-web-session',
    initialMessages,
    onToolExecuted,
    getContext,
    onWebMcpMessage,
  } = options;

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
          'Xin chào! Tôi là **Roadmap AI Assistant** ⚡\nTrợ lý thông minh hỗ trợ quản trị lộ trình học tập và tra cứu kiến thức chuyên sâu.\n\n💡 **Bạn có thể yêu cầu tôi:**\n• **Thao tác nhanh**: `tạo ABC topic`, `tạo 2 layer mock 1 và 2 trong be topic`\n• **Tra cứu tri thức**: `Website có bài nào về Docker hay Database không?`\n• **Lập kế hoạch**: `/plan lộ trình Next.js Fullstack`\n\n_Hỗ trợ tương tác tự nhiên cả Tiếng Việt & English._',
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

  // Clean up in-flight abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const stopStreaming = useCallback(() => {
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
                      { name, args: {}, result: 'Đang thực thi...' },
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
                  const updated = currentCalls.map((tc) =>
                    tc.name === name ? { ...tc, result } : tc
                  );
                  return { ...msg, toolCalls: updated };
                })
              );
              onToolExecutedRef.current?.(name, result);
            },

            onToken: (delta) => {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === botMsgId
                    ? { ...msg, content: msg.content + delta }
                    : msg
                )
              );
            },

            onDone: (finalResp) => {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === botMsgId
                    ? {
                        ...msg,
                        content: finalResp.message || msg.content,
                        toolCalls: finalResp.tool_calls || msg.toolCalls,
                      }
                    : msg
                )
              );
              setIsLoading(false);
              setIsStreaming(false);
              setActiveTool(null);
            },

            onError: (err) => {
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
          threadId,
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
    [input, isLoading, threadId, client, baseUrl]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
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
    sendMessage,
    stopStreaming,
    clearMessages,
  };
}
