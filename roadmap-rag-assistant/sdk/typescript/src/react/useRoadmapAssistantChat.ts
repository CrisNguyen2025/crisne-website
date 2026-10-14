import { useState, useCallback, useRef, useEffect } from 'react';
import { createSmoothStream, type SmoothStream } from './utils/smoothStream';
import { RoadmapChatClient } from '../client';
import type { ChatMessage } from './types';
import type { PageContext } from '../types';

export interface UseRoadmapAssistantChatOptions {
  baseUrl?: string;
  threadId?: string;
  onToolExecuted?: (toolName: string, result: string) => void;
  /** Returns the page the user is viewing; read at send time. */
  getContext?: () => PageContext | undefined;
  /** Handles "/webmcp <request>" messages; returns the text to show. */
  onWebMcpMessage?: (request: string) => Promise<string>;
}

export function useRoadmapAssistantChat(
  options: UseRoadmapAssistantChatOptions = {}
) {
  const {
    baseUrl = 'http://localhost:8000',
    threadId = 'roadmap-web-session',
    onToolExecuted,
    getContext,
    onWebMcpMessage,
  } = options;

  const onWebMcpRef = useRef(onWebMcpMessage);
  onWebMcpRef.current = onWebMcpMessage;

  // Keep the latest getter without re-creating sendMessage on every render.
  const getContextRef = useRef(getContext);
  getContextRef.current = getContext;

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      role: 'assistant',
      content:
        'Xin chào! Tôi là **Roadmap AI Assistant** ⚡\nTrợ lý thông minh hỗ trợ quản trị lộ trình học tập và tra cứu kiến thức chuyên sâu.\n\n💡 **Bạn có thể yêu cầu tôi:**\n• **Thao tác nhanh**: `tạo ABC topic`, `tạo 2 layer mock 1 và 2 trong be topic`\n• **Tra cứu tri thức**: `Website có bài nào về Docker hay Database không?`\n• **Lập kế hoạch**: `/plan lộ trình Next.js Fullstack`\n\n_Hỗ trợ tương tác tự nhiên cả Tiếng Việt & English._',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<RoadmapChatClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = new RoadmapChatClient({ baseUrl });
  }

  const abortControllerRef = useRef<AbortController | null>(null);
  const smoothRef = useRef<SmoothStream | null>(null);

  // Stop revealing text into a widget that is gone
  useEffect(() => () => smoothRef.current?.cancel(), []);

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

      // Tokens arrive in bursts; reveal them word by word at a steady pace.
      const smooth = createSmoothStream((chunk) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === botMsgId ? { ...msg, content: msg.content + chunk } : msg
          )
        );
      });
      smoothRef.current = smooth;

      try {
        const client = clientRef.current!;

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
              onToolExecuted?.(name, result);
            },

            onToken: (delta) => smooth.push(delta),

            onDone: (finalResp) => smooth.finish(() => {
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
    [input, isLoading, threadId, onToolExecuted, baseUrl]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
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
