"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  // Langfuse trace of the assistant answer, used to attach feedback
  traceId?: string;
  feedback?: 0 | 1;
}

export interface UseFloatingChatReturn {
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  isStreaming: boolean;
  conversationId: string;
  sendMessage: (contentToSend?: string, historyOverride?: ChatMessage[]) => Promise<void>;
  sendFeedback: (message: ChatMessage, value: 0 | 1) => Promise<void>;
  resetChat: () => void;
  stopResponse: () => void;
  retry: (targetMessageId?: string) => Promise<void>;
}

export function useFloatingChat(): UseFloatingChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [conversationId, setConversationId] = useState<string>(() => crypto.randomUUID());
  // Groups all turns of one conversation into a Langfuse session; renewed on reset
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    sessionIdRef.current = conversationId;
  }, [conversationId]);

  const stopResponse = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setIsStreaming(false);
  }, []);

  const resetChat = useCallback(() => {
    stopResponse();
    setMessages([]);
    setInput("");
    setIsLoading(false);
    setIsStreaming(false);
    const newSessionId = crypto.randomUUID();
    sessionIdRef.current = newSessionId;
    setConversationId(newSessionId);
  }, [stopResponse]);

  const sendFeedback = useCallback(async (message: ChatMessage, value: 0 | 1) => {
    const { id, traceId } = message;
    if (!traceId) return;

    setMessages((prev) =>
      prev.map((msg) => (msg.id === id ? { ...msg, feedback: value } : msg))
    );

    try {
      await fetch("/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traceId, value }),
      });
    } catch (err) {
      // Feedback is best-effort; keep the optimistic UI state
      console.error("Feedback error:", err);
    }
  }, []);

  const sendMessage = useCallback(
    async (contentToSend?: string, historyOverride?: ChatMessage[]) => {
      const text = (contentToSend ?? input).trim();
      if (!text || isLoading) return;

      const baseHistory = historyOverride ?? messages;

      const userMsgId = `user-${Date.now()}`;
      const botMsgId = `bot-${Date.now() + 1}`;

      const newMessages: ChatMessage[] = [
        ...baseHistory,
        { id: userMsgId, role: "user", content: text, createdAt: new Date() },
      ];

      setMessages([
        ...newMessages,
        { id: botMsgId, role: "assistant", content: "", createdAt: new Date() },
      ]);
      setInput("");
      setIsLoading(true);
      setIsStreaming(false);

      abortControllerRef.current = new AbortController();
      // Friendly message from the API (e.g. rate limit, message too long), shown instead of the generic error
      let serverErrorMessage: string | undefined;

      try {
        const historyPayload = baseHistory.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            history: historyPayload,
            sessionId: sessionIdRef.current ?? conversationId,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!res.ok || !res.body) {
          const errData = await res.json().catch(() => ({}));
          serverErrorMessage = errData.error;
          throw new Error(errData.error || "Không thể kết nối với máy chủ AI");
        }

        const traceId = res.headers.get("X-Trace-Id") ?? undefined;
        if (traceId) {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === botMsgId ? { ...msg, traceId } : msg))
          );
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let receivedFirstChunk = false;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          if (!receivedFirstChunk) {
            receivedFirstChunk = true;
            setIsStreaming(true);
          }

          const chunk = decoder.decode(value, { stream: true });
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === botMsgId ? { ...msg, content: msg.content + chunk } : msg
            )
          );
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        console.error("Chat error:", err);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === botMsgId
              ? {
                  ...msg,
                  content:
                    msg.content ||
                    serverErrorMessage ||
                    "Xin lỗi, đã xảy ra lỗi kết nối. Vui lòng thử lại sau ít giây hoặc kết nối qua Zalo/GitHub nhé!",
                }
              : msg
          )
        );
      } finally {
        setIsLoading(false);
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [conversationId, input, isLoading, messages]
  );

  const retry = useCallback(
    async (targetMessageId?: string) => {
      if (isLoading) return;
      const targetId =
        targetMessageId ??
        messages.filter((m) => m.role === "assistant").at(-1)?.id;
      if (!targetId) return;

      const index = messages.findIndex((m) => m.id === targetId);
      const question = index > 0 ? messages[index - 1] : undefined;
      if (!question || question.role !== "user") return;

      const remaining = messages.filter(
        (m) => m.id !== targetId && m.id !== question.id
      );
      setMessages(remaining);
      await sendMessage(question.content, remaining);
    },
    [isLoading, messages, sendMessage]
  );

  return {
    messages,
    input,
    setInput,
    isLoading,
    isStreaming,
    conversationId,
    sendMessage,
    sendFeedback,
    resetChat,
    stopResponse,
    retry,
  };
}
