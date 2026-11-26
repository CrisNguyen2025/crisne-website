// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRoadmapAssistantChat } from "@/roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat";
import { conversationKey } from "@/roadmap-rag-assistant/sdk/typescript/src/react/storage";
import { WELCOME_MESSAGE_ID } from "@/roadmap-rag-assistant/sdk/typescript/src/react/welcome";

const BASE = "/api/roadmap-assistant";
const KEY = conversationKey(BASE);

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const answerStream = (text: string) =>
  new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(sse("token", { delta: text })));
        c.enqueue(new TextEncoder().encode(sse("done", { message: text })));
        c.close();
      },
    }),
    { status: 200 }
  );
const failure = (status: number) => new Response("boom", { status });

/** Waits until the hook has finished the in-flight turn. */
const settle = (result: { current: { isLoading: boolean } }) =>
  waitFor(() => expect(result.current.isLoading).toBe(false));

describe("useRoadmapAssistantChat", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.sessionStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("retry (P0-2)", () => {
    it("re-sends the same question after a failed reply and keeps one attempt in the history", async () => {
      fetchMock.mockResolvedValueOnce(failure(500)).mockResolvedValueOnce(answerStream("Đây là lộ trình"));
      const { result } = renderHook(() => useRoadmapAssistantChat({ baseUrl: BASE }));

      await act(() => result.current.sendMessage("Có lộ trình nào?"));
      await settle(result);
      const failed = result.current.messages.at(-1)!;
      expect(failed.status).toBe("error");
      expect(failed.content).not.toMatch(/localhost|:8000|FastAPI/);

      await act(() => {
        result.current.retry(failed.id);
        return Promise.resolve();
      });
      await settle(result);

      const sent = JSON.parse(String(fetchMock.mock.calls[1][1]!.body));
      expect(sent.message).toBe("Có lộ trình nào?");
      const texts = result.current.messages.map((m) => `${m.role}:${m.content}`);
      expect(texts.filter((t) => t === "user:Có lộ trình nào?")).toHaveLength(1);
      expect(result.current.messages.at(-1)?.content).toBe("Đây là lộ trình");
    });

    it("does nothing for a message that is not an error reply", async () => {
      const { result } = renderHook(() => useRoadmapAssistantChat({ baseUrl: BASE }));
      const before = result.current.messages.length;
      act(() => result.current.retry(WELCOME_MESSAGE_ID));
      expect(result.current.messages).toHaveLength(before);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("clearMessages / Cuộc trò chuyện mới (P1-5)", () => {
    it("stops the stream, leaves only the greeting, and gives a new conversation id", async () => {
      fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
        init?.signal?.addEventListener("abort", () => {});
        return new Response(new ReadableStream({ start() {} }), { status: 200 });
      });
      const { result } = renderHook(() => useRoadmapAssistantChat({ baseUrl: BASE }));
      const oldId = result.current.conversationId;

      act(() => {
        void result.current.sendMessage("câu đang chạy");
      });
      await waitFor(() => expect(result.current.isLoading).toBe(true));

      act(() => result.current.clearMessages());

      expect(result.current.isLoading).toBe(false);
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].id).toBe(WELCOME_MESSAGE_ID);
      expect(result.current.conversationId).not.toBe(oldId);
      expect(window.sessionStorage.getItem(KEY)).toBeNull();
    });
  });

  describe("saved conversation (P1-4)", () => {
    it("restores the saved turns and conversation id on mount", () => {
      window.sessionStorage.setItem(
        KEY,
        JSON.stringify({
          conversationId: "conv-saved",
          messages: [
            { id: "u1", role: "user", content: "hỏi cũ", timestamp: "2026-10-17T08:00:00Z" },
            { id: "a1", role: "assistant", content: "đáp cũ", timestamp: "2026-10-17T08:00:01Z", status: "complete" },
          ],
        })
      );
      const { result } = renderHook(() => useRoadmapAssistantChat({ baseUrl: BASE }));
      expect(result.current.conversationId).toBe("conv-saved");
      expect(result.current.messages.map((m) => m.content)).toEqual(["hỏi cũ", "đáp cũ"]);
    });

    it("saves the settled turn after the reply, without the streaming placeholder", async () => {
      fetchMock.mockResolvedValueOnce(answerStream("xong"));
      const { result } = renderHook(() => useRoadmapAssistantChat({ baseUrl: BASE }));
      await act(() => result.current.sendMessage("hỏi"));
      await settle(result);

      await waitFor(() => {
        const saved = JSON.parse(window.sessionStorage.getItem(KEY) ?? "{}");
        expect(saved.messages?.map((m: { content: string }) => m.content)).toContain("xong");
      });
      const saved = JSON.parse(window.sessionStorage.getItem(KEY)!);
      expect(saved.messages.some((m: { status?: string }) => m.status === "streaming")).toBe(false);
    });

    it("still works when sessionStorage throws", () => {
      vi.stubGlobal("window", {
        ...window,
        sessionStorage: {
          getItem: () => {
            throw new Error("SecurityError");
          },
          setItem: () => {
            throw new Error("QuotaExceededError");
          },
          removeItem: () => {
            throw new Error("SecurityError");
          },
        },
      });
      const { result } = renderHook(() => useRoadmapAssistantChat({ baseUrl: BASE }));
      expect(result.current.messages[0].id).toBe(WELCOME_MESSAGE_ID);
    });
  });

  describe("greeting follows access (P0-1)", () => {
    it("rebuilds the untouched greeting when canWrite becomes true, still with no write chip", () => {
      const { result, rerender } = renderHook(
        ({ canWrite }: { canWrite: boolean }) => useRoadmapAssistantChat({ baseUrl: BASE, canWrite }),
        { initialProps: { canWrite: false } }
      );
      expect(result.current.messages[0].suggestions?.[0].prompt).toBe("Có những lộ trình nào trên website?");

      rerender({ canWrite: true });
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].id).toBe(WELCOME_MESSAGE_ID);
      expect(result.current.messages[0].suggestions?.map((s) => s.prompt)).toEqual([
        "Có những lộ trình nào trên website?",
        "Bạn làm được gì?",
      ]);
    });

    it("keeps the conversation when access changes after a message was sent", async () => {
      fetchMock.mockResolvedValueOnce(answerStream("ok"));
      const { result, rerender } = renderHook(
        ({ canWrite }: { canWrite: boolean }) => useRoadmapAssistantChat({ baseUrl: BASE, canWrite }),
        { initialProps: { canWrite: false } }
      );
      await act(() => result.current.sendMessage("hỏi"));
      await settle(result);
      const before = result.current.messages.map((m) => m.id);

      rerender({ canWrite: true });
      expect(result.current.messages.map((m) => m.id)).toEqual(before);
    });
  });
  describe("trace id", () => {
    it("keeps the trace id sent before the reply when the stream ends without done", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode(sse("trace", { trace_id: "0123456789abcdef0123456789abcdef" })));
              c.enqueue(new TextEncoder().encode(sse("token", { delta: "Đang trả lời" })));
              c.close();
            },
          }),
          { status: 200 }
        )
      );
      const { result } = renderHook(() => useRoadmapAssistantChat({ baseUrl: BASE }));

      await act(() => result.current.sendMessage("hỏi thử"));
      await waitFor(() =>
        expect(result.current.messages.at(-1)?.traceId).toBe("0123456789abcdef0123456789abcdef")
      );
    });
  });

  describe("onToolExecuted isFailed flag", () => {
    it("forwards isFailed=true when tool_end reports failure and false when succeeded", async () => {
      const onToolExecuted = vi.fn();
      fetchMock.mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(c) {
              const enc = new TextEncoder();
              c.enqueue(enc.encode(sse("tool_start", { name: "delete_item" })));
              c.enqueue(enc.encode(sse("tool_end", { name: "delete_item", result: "Lỗi DB", is_error: true })));
              c.enqueue(enc.encode(sse("tool_start", { name: "mark_lesson_reviewed" })));
              c.enqueue(enc.encode(sse("tool_end", { name: "mark_lesson_reviewed", result: "Đã ôn xong", is_error: false })));
              c.enqueue(enc.encode(sse("done", { message: "Xong" })));
              c.close();
            },
          }),
          { status: 200 }
        )
      );

      const { result } = renderHook(() =>
        useRoadmapAssistantChat({ baseUrl: BASE, onToolExecuted })
      );
      await act(() => result.current.sendMessage("xoá bài"));
      await settle(result);

      expect(onToolExecuted).toHaveBeenNthCalledWith(1, "delete_item", "Lỗi DB", true);
      expect(onToolExecuted).toHaveBeenNthCalledWith(2, "mark_lesson_reviewed", "Đã ôn xong", false);
    });
  });

  describe("action_preview and thread restore", () => {
    it("parses structured action_preview metadata even without editableTitles", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(c) {
              const enc = new TextEncoder();
              c.enqueue(
                enc.encode(
                  sse("action_preview", {
                    action_id: "owner:t1",
                    kind: "status_change",
                    confirmable: true,
                  })
                )
              );
              c.enqueue(enc.encode(sse("token", { delta: "xác nhận thực hiện" })));
              c.enqueue(enc.encode(sse("done", { message: "xác nhận thực hiện" })));
              c.close();
            },
          }),
          { status: 200 }
        )
      );

      const { result } = renderHook(() => useRoadmapAssistantChat({ baseUrl: BASE, canWrite: true }));
      await act(() => result.current.sendMessage("đánh dấu đã nắm bài X"));
      await settle(result);

      expect(result.current.messages.at(-1)?.actionPreview).toEqual({
        actionId: "owner:t1",
        kind: "status_change",
        confirmable: true,
      });
    });

    it("marks Owner messages restored from /thread with isRestored=true", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            threadId: "restored-thread-1",
            messages: [
              { id: "restored-1", role: "user", content: "hỏi trước", timestamp: "2026-11-25T08:00:00.000Z" },
              { id: "restored-2", role: "assistant", content: "đáp trước", timestamp: "2026-11-25T08:00:05.000Z" },
            ],
          }),
          { status: 200 }
        )
      );

      const { result } = renderHook(() =>
        useRoadmapAssistantChat({ baseUrl: BASE, canWrite: true, restoreLatestThread: true })
      );

      await waitFor(() => expect(result.current.conversationId).toBe("restored-thread-1"));
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages.every((m) => m.isRestored === true)).toBe(true);
      expect(result.current.messages[1].traceId).toBeUndefined();
      expect(result.current.messages[1].changes).toBeUndefined();
    });

    it("switches to a selected Thread, aborts active stream, and persists to sessionStorage", async () => {
      fetchMock
        .mockImplementationOnce(async (_url: string, init?: RequestInit) => {
          init?.signal?.addEventListener("abort", () => {});
          return new Response(new ReadableStream({ start() {} }), { status: 200 });
        })
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              threadId: "history-thread-2",
              messages: [
                { id: "restored-10", role: "user", content: "câu cũ", timestamp: "2026-11-24T10:00:00.000Z" },
                { id: "restored-11", role: "assistant", content: "đáp cũ", timestamp: "2026-11-24T10:00:05.000Z" },
              ],
              state: null,
            }),
            { status: 200 }
          )
        );

      const { result } = renderHook(() => useRoadmapAssistantChat({ baseUrl: BASE, canWrite: true }));
      act(() => {
        void result.current.sendMessage("đang stream");
      });
      await waitFor(() => expect(result.current.isLoading).toBe(true));

      await act(async () => {
        await result.current.switchToThread("history-thread-2");
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.conversationId).toBe("history-thread-2");
      expect(result.current.messages.map((m) => m.content)).toEqual(["câu cũ", "đáp cũ"]);
      expect(result.current.messages.every((m) => m.isRestored === true)).toBe(true);

      const saved = JSON.parse(window.sessionStorage.getItem(KEY) ?? "{}");
      expect(saved.conversationId).toBe("history-thread-2");
    });

    it("resets to welcome only when the currently active Thread is deleted", () => {
      const { result } = renderHook(() =>
        useRoadmapAssistantChat({ baseUrl: BASE, canWrite: true, threadId: "t-active" })
      );

      act(() => result.current.handleThreadDeleted("t-other"));
      expect(result.current.conversationId).toBe("t-active");

      act(() => result.current.handleThreadDeleted("t-active"));
      expect(result.current.conversationId).not.toBe("t-active");
      expect(result.current.messages[0].id).toBe(WELCOME_MESSAGE_ID);
    });
  });
});
