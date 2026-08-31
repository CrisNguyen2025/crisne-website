"use client";

import { useState, useCallback, useRef } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

export function useFloatingChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stopResponse = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);

  const resetChat = useCallback(() => {
    stopResponse();
    setMessages([]);
    setInput("");
  }, [stopResponse]);

  const sendMessage = useCallback(
    async (contentToSend?: string) => {
      const text = (contentToSend ?? input).trim();
      if (!text || isLoading) return;

      const userMsgId = `user-${Date.now()}`;
      const botMsgId = `bot-${Date.now() + 1}`;

      const newMessages: ChatMessage[] = [
        ...messages,
        { id: userMsgId, role: "user", content: text, createdAt: new Date() },
      ];

      setMessages([
        ...newMessages,
        { id: botMsgId, role: "assistant", content: "", createdAt: new Date() },
      ]);
      setInput("");
      setIsLoading(true);

      abortControllerRef.current = new AbortController();

      try {
        const historyPayload = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            history: historyPayload,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!res.ok || !res.body) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Không thể kết nối với máy chủ AI");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

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
                    "Xin lỗi, đã xảy ra lỗi kết nối. Vui lòng thử lại sau ít giây hoặc kết nối qua Zalo/GitHub nhé!",
                }
              : msg
          )
        );
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [input, isLoading, messages]
  );

  return {
    messages,
    input,
    setInput,
    isLoading,
    sendMessage,
    resetChat,
    stopResponse,
  };
}
