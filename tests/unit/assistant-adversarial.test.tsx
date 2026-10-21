// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { FloatingChatBot } from "@/components/floating-bot/FloatingChatBot";
import { FloatingQuickBar } from "@/components/floating-bot/FloatingQuickBar";
import { FloatingChatDrawer } from "@/components/floating-bot/FloatingChatDrawer";
import { useFloatingChat, type UseFloatingChatReturn } from "@/hooks/use-floating-chat";
import { useQuickBarShortcut } from "@/hooks/use-quickbar-shortcut";

// Mock scrollIntoView for jsdom
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// Polyfill isContentEditable in jsdom if missing to match real browser DOM behavior
if (typeof HTMLElement !== "undefined" && !Object.getOwnPropertyDescriptor(HTMLElement.prototype, "isContentEditable")) {
  Object.defineProperty(HTMLElement.prototype, "isContentEditable", {
    get() {
      return this.getAttribute("contenteditable") === "true" || Boolean(this.closest?.('[contenteditable="true"]'));
    },
    configurable: true,
  });
}

const createStreamResponse = (chunks: string[], status = 200, traceId = "adv-trace-999") => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  const headers = new Headers();
  headers.set("X-Trace-Id", traceId);

  return new Response(stream, { status, headers });
};

function createMockChat(overrides: Partial<UseFloatingChatReturn> = {}): UseFloatingChatReturn {
  return {
    messages: [],
    input: "",
    setInput: vi.fn(),
    isLoading: false,
    isStreaming: false,
    conversationId: "test-conv-adversarial",
    sendMessage: vi.fn().mockResolvedValue(undefined),
    sendFeedback: vi.fn().mockResolvedValue(undefined),
    resetChat: vi.fn(),
    stopResponse: vi.fn(),
    retry: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("Adversarial Stress Test: Assistant UI Dual-Concept Upgrade", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1024 });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. DESKTOP SHORTCUT 'A' ADVERSARIAL STRESS TESTS
  // =========================================================================
  describe("1. Desktop Shortcut 'A' Stress Testing", () => {
    it("ignores shortcut when typing in INPUT, TEXTAREA, SELECT, and contentEditable", () => {
      function FormControlsHost() {
        const inputRef = React.useRef<HTMLInputElement | null>(null);
        useQuickBarShortcut({ inputRef, isEnabled: true });

        return (
          <div>
            <input data-testid="target-input" />
            <textarea data-testid="target-textarea" />
            <select data-testid="target-select">
              <option value="1">Option 1</option>
            </select>
            <div data-testid="target-editable" contentEditable={true}>
              <p>
                <span data-testid="target-nested-span">Editable text</span>
              </p>
            </div>
            {/* Quick Bar Input */}
            <input ref={inputRef} data-testid="quickbar-input" />
          </div>
        );
      }

      render(<FormControlsHost />);
      const quickBarInput = screen.getByTestId("quickbar-input");
      const focusSpy = vi.spyOn(quickBarInput, "focus");

      // 1.1 In standard input
      const inputEl = screen.getByTestId("target-input");
      inputEl.focus();
      inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
      inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "A", bubbles: true }));
      expect(focusSpy).not.toHaveBeenCalled();

      // 1.2 In textarea
      const textareaEl = screen.getByTestId("target-textarea");
      textareaEl.focus();
      textareaEl.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
      textareaEl.dispatchEvent(new KeyboardEvent("keydown", { key: "A", bubbles: true }));
      expect(focusSpy).not.toHaveBeenCalled();

      // 1.3 In select
      const selectEl = screen.getByTestId("target-select");
      selectEl.focus();
      selectEl.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
      selectEl.dispatchEvent(new KeyboardEvent("keydown", { key: "A", bubbles: true }));
      expect(focusSpy).not.toHaveBeenCalled();

      // 1.4 In contentEditable root
      const editableEl = screen.getByTestId("target-editable");
      editableEl.focus();
      editableEl.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
      expect(focusSpy).not.toHaveBeenCalled();

      // 1.5 In nested child inside contentEditable
      const nestedSpan = screen.getByTestId("target-nested-span");
      nestedSpan.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
      expect(focusSpy).not.toHaveBeenCalled();
    });

    it("guards modifier keys: Cmd+A, Ctrl+A, Alt+A, and modifier combos", () => {
      const inputRef = { current: document.createElement("input") };
      const focusSpy = vi.spyOn(inputRef.current, "focus");

      function Host() {
        useQuickBarShortcut({ inputRef, isEnabled: true });
        return <div />;
      }
      render(<Host />);

      // Cmd+A (Mac Select All)
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", metaKey: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "A", metaKey: true }));
      expect(focusSpy).not.toHaveBeenCalled();

      // Ctrl+A (Windows/Linux Select All)
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "A", ctrlKey: true }));
      expect(focusSpy).not.toHaveBeenCalled();

      // Alt+A
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", altKey: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "A", altKey: true }));
      expect(focusSpy).not.toHaveBeenCalled();

      // Multi-modifier: Cmd+Alt+A, Ctrl+Alt+A
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", metaKey: true, altKey: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, altKey: true }));
      expect(focusSpy).not.toHaveBeenCalled();
    });

    it("matches lowercase 'a' and uppercase 'A' (Shift+A), but ignores non-ASCII and other keys", () => {
      const inputRef = { current: document.createElement("input") };
      const focusSpy = vi.spyOn(inputRef.current, "focus");

      function Host() {
        useQuickBarShortcut({ inputRef, isEnabled: true });
        return <div />;
      }
      render(<Host />);

      // Non-A keys
      const ignoredKeys = ["b", "c", "z", "1", " ", "Enter", "Tab", "Escape", "ArrowDown"];
      ignoredKeys.forEach((key) => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key }));
      });
      expect(focusSpy).not.toHaveBeenCalled();

      // Vietnamese diacritic vowels (non-ASCII: á, à, ả, ã, ạ, ă, â, etc.)
      const diacriticKeys = ["á", "à", "ả", "ã", "ạ", "ă", "â", "ắ", "ấ", "đ", "é", "è"];
      diacriticKeys.forEach((key) => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key }));
      });
      expect(focusSpy).not.toHaveBeenCalled();

      // Valid lowercase 'a'
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
      expect(focusSpy).toHaveBeenCalledTimes(1);

      // Valid uppercase 'A' (Shift+A)
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "A", shiftKey: true }));
      expect(focusSpy).toHaveBeenCalledTimes(2);
    });

    it("survives rapid consecutive keystrokes without thrashing or recursion", () => {
      const inputRef = { current: document.createElement("input") };
      const onTrigger = vi.fn();
      const focusSpy = vi.spyOn(inputRef.current, "focus");

      function Host() {
        useQuickBarShortcut({ inputRef, onTrigger, isEnabled: true });
        return <div />;
      }
      render(<Host />);

      // Rapidly fire 20 'a' keystrokes
      for (let i = 0; i < 20; i++) {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
      }

      expect(focusSpy).toHaveBeenCalledTimes(20);
      expect(onTrigger).toHaveBeenCalledTimes(20);
    });

    it("is completely inactive when Drawer is open (does not hijack typing in Drawer)", () => {
      render(<FloatingChatBot uiStyle="style2-drawer" initialOpen={true} />);

      // Quick bar should have translate-y-16 opacity-0
      const quickBar = screen.getByLabelText("Cris AI Quick Bar");
      expect(quickBar.className).toContain("translate-y-16");
      expect(quickBar.className).toContain("opacity-0");

      const drawerTextarea = screen.getByPlaceholderText(/Hỏi Cris AI... \(Enter để gửi\)/i);
      expect(drawerTextarea).toBeTruthy();

      // Type 'a' in the drawer textarea
      drawerTextarea.focus();
      const event = new KeyboardEvent("keydown", { key: "a", bubbles: true });
      const preventDefaultSpy = vi.spyOn(event, "preventDefault");
      drawerTextarea.dispatchEvent(event);

      // Should NOT prevent default inside the drawer textarea
      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 2. QUERY HANDOFF & EDGE CASES
  // =========================================================================
  describe("2. Query Handoff & Edge Cases", () => {
    it("does not trigger chat streaming on empty input submission in Quick Bar (opens drawer instead)", () => {
      const onSubmit = vi.fn();
      const onOpenDrawer = vi.fn();

      render(
        <FloatingQuickBar
          input=""
          onInputChange={vi.fn()}
          onSubmit={onSubmit}
          onOpenDrawer={onOpenDrawer}
        />
      );

      const form = screen.getByRole("button", { name: "Gửi câu hỏi" }).closest("form")!;
      fireEvent.submit(form);

      expect(onSubmit).not.toHaveBeenCalled();
      expect(onOpenDrawer).toHaveBeenCalledTimes(1);
    });

    it("trims whitespace-only input and does not trigger chat streaming", () => {
      const onSubmit = vi.fn();
      const onOpenDrawer = vi.fn();

      render(
        <FloatingQuickBar
          input={"   \t\n   "}
          onInputChange={vi.fn()}
          onSubmit={onSubmit}
          onOpenDrawer={onOpenDrawer}
        />
      );

      const sendBtn = screen.getByRole("button", { name: "Gửi câu hỏi" });
      fireEvent.click(sendBtn);

      expect(onSubmit).not.toHaveBeenCalled();
      expect(onOpenDrawer).toHaveBeenCalledTimes(1);
    });

    it("direct call to chat.sendMessage with empty/whitespace string is a safe no-op", async () => {
      function TestHost() {
        const chat = useFloatingChat();
        return (
          <div>
            <button onClick={() => chat.sendMessage("")}>Send Empty</button>
            <button onClick={() => chat.sendMessage("    \t\n  ")}>Send Spaces</button>
            <div data-testid="msg-count">{chat.messages.length}</div>
          </div>
        );
      }

      render(<TestHost />);

      await act(async () => {
        fireEvent.click(screen.getByText("Send Empty"));
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByTestId("msg-count").textContent).toBe("0");

      await act(async () => {
        fireEvent.click(screen.getByText("Send Spaces"));
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByTestId("msg-count").textContent).toBe("0");
    });

    it("handles very long prompt (1000+ chars) gracefully via server error payload without crash", async () => {
      // Server returns HTTP 400 with specific length restriction
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: "Câu hỏi hơi dài, bạn rút gọn dưới 1000 ký tự giúp Cris nhé!" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      );

      function TestChatHost() {
        const chat = useFloatingChat();
        return (
          <div>
            <button onClick={() => chat.sendMessage("A".repeat(1200))}>Send 1200 chars</button>
            <div data-testid="last-msg">{chat.messages.at(-1)?.content}</div>
          </div>
        );
      }

      render(<TestChatHost />);

      await act(async () => {
        fireEvent.click(screen.getByText("Send 1200 chars"));
      });

      await waitFor(() => {
        expect(screen.getByTestId("last-msg").textContent).toBe(
          "Câu hỏi hơi dài, bạn rút gọn dưới 1000 ký tự giúp Cris nhé!"
        );
      });
    });

    it("Drawer composer enforces maxLength=1000 on textarea", () => {
      const chat = createMockChat();
      render(<FloatingChatDrawer isOpen={true} onClose={vi.fn()} chat={chat} />);

      const textarea = screen.getByPlaceholderText(/Hỏi Cris AI.../i);
      expect(textarea.getAttribute("maxLength")).toBe("1000");
    });

    it("FloatingQuickBar UI mitigates rapid double-clicks by immediately resetting input state", async () => {
      fetchMock.mockReturnValue(new Promise(() => {}));

      render(<FloatingChatBot uiStyle="style2-drawer" />);
      const quickBarInput = screen.getByPlaceholderText("Hỏi Cris AI...");
      fireEvent.change(quickBarInput, { target: { value: "Trùng lặp tin nhắn?" } });
      const sendBtn = screen.getByRole("button", { name: "Gửi câu hỏi" });

      // First click sends question and clears input
      fireEvent.click(sendBtn);
      // Immediate second click sees empty input and only triggers drawer open without second fetch
      fireEvent.click(sendBtn);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("exposes concurrency edge case: headless useFloatingChat lacks synchronous ref lock against same-tick invocations", async () => {
      // Simulate delayed streaming response
      let resolveStreamPromise: (res: Response) => void;
      const streamPromise = new Promise<Response>((resolve) => {
        resolveStreamPromise = resolve;
      });
      fetchMock.mockReturnValue(streamPromise);

      function TestRapidClicks() {
        const chat = useFloatingChat();
        return (
          <div>
            <button
              onClick={() => {
                // Fire two immediate calls in the exact same event tick
                void chat.sendMessage("Câu hỏi 1");
                void chat.sendMessage("Câu hỏi 2");
              }}
            >
              Rapid Double Send
            </button>
            <div data-testid="loading-state">{chat.isLoading ? "loading" : "idle"}</div>
            <div data-testid="msg-count">{chat.messages.length}</div>
          </div>
        );
      }

      render(<TestRapidClicks />);

      await act(async () => {
        fireEvent.click(screen.getByText("Rapid Double Send"));
      });

      // EMPIRICAL OBSERVATION:
      // Because isLoading is only tracked in React state (which updates on next render)
      // rather than a synchronous ref (isLoadingRef.current), both invocations pass
      // `if (!text || isLoading) return;`, resulting in 2 concurrent fetches.
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Clean up in-flight promise
      await act(async () => {
        resolveStreamPromise!(createStreamResponse(["Đáp án"]));
      });
    });
  });

  // =========================================================================
  // 3. UTILITY TOOLBAR STRESS TESTS
  // =========================================================================
  describe("3. Utility Toolbar Stress Testing (Retry, Clear, Share)", () => {
    it("Retry button is disabled when messages is empty", () => {
      const chat = createMockChat({ messages: [] });
      render(<FloatingChatDrawer isOpen={true} onClose={vi.fn()} chat={chat} />);

      const retryBtn = screen.getByRole("button", { name: "Thử lại câu trả lời" });
      expect(retryBtn.hasAttribute("disabled")).toBe(true);
    });

    it("Retry button is disabled during streaming (isLoading = true)", () => {
      const chat = createMockChat({
        isLoading: true,
        isStreaming: true,
        messages: [
          { id: "u-1", role: "user", content: "Hi", createdAt: new Date() },
          { id: "b-1", role: "assistant", content: "Hello", createdAt: new Date() },
        ],
      });
      render(<FloatingChatDrawer isOpen={true} onClose={vi.fn()} chat={chat} />);

      const retryBtn = screen.getByRole("button", { name: "Thử lại câu trả lời" });
      expect(retryBtn.hasAttribute("disabled")).toBe(true);
    });

    it("Retry successfully recovers when previous assistant turn failed with error", async () => {
      fetchMock
        .mockResolvedValueOnce(new Response("Service unavailable", { status: 503 }))
        .mockResolvedValueOnce(createStreamResponse(["Phản hồi phục hồi thành công!"]));

      function TestRetryHost() {
        const chat = useFloatingChat();
        return (
          <div>
            <button onClick={() => chat.sendMessage("Câu hỏi cần retry")}>Send</button>
            <button onClick={() => chat.retry()}>Retry</button>
            <div data-testid="msg-count">{chat.messages.length}</div>
            <div data-testid="assistant-content">{chat.messages.filter((m) => m.role === "assistant").at(-1)?.content}</div>
          </div>
        );
      }

      render(<TestRetryHost />);

      // 1. Initial send fails with 503
      await act(async () => {
        fireEvent.click(screen.getByText("Send"));
      });

      await waitFor(() => {
        expect(screen.getByTestId("assistant-content").textContent).toContain("Xin lỗi, đã xảy ra lỗi");
      });
      expect(screen.getByTestId("msg-count").textContent).toBe("2");

      // 2. Retry replaces failed turn and streams success
      await act(async () => {
        fireEvent.click(screen.getByText("Retry"));
      });

      await waitFor(() => {
        expect(screen.getByTestId("assistant-content").textContent).toBe("Phản hồi phục hồi thành công!");
      });
      expect(screen.getByTestId("msg-count").textContent).toBe("2");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("Clear history resets conversationId, clears messages, and aborts any active streaming", async () => {
      // Simulate an infinite stream that never finishes until aborted
      const abortSpy = vi.fn();
      fetchMock.mockImplementation((_url, options) => {
        options?.signal?.addEventListener("abort", abortSpy);
        return new Promise(() => {}); // never resolves
      });

      function TestClearHost() {
        const chat = useFloatingChat();
        return (
          <div>
            <button onClick={() => chat.sendMessage("Stream mãi mãi")}>Start Stream</button>
            <button onClick={() => chat.resetChat()}>Clear History</button>
            <div data-testid="conv-id">{chat.conversationId}</div>
            <div data-testid="msg-count">{chat.messages.length}</div>
            <div data-testid="is-loading">{chat.isLoading ? "loading" : "idle"}</div>
          </div>
        );
      }

      render(<TestClearHost />);

      const initialConvId = screen.getByTestId("conv-id").textContent;

      // Start in-flight request
      await act(async () => {
        fireEvent.click(screen.getByText("Start Stream"));
      });

      expect(screen.getByTestId("is-loading").textContent).toBe("loading");
      expect(screen.getByTestId("msg-count").textContent).toBe("2");

      // Now click Clear History
      await act(async () => {
        fireEvent.click(screen.getByText("Clear History"));
      });

      // Stream should have received abort signal
      expect(abortSpy).toHaveBeenCalled();
      expect(screen.getByTestId("is-loading").textContent).toBe("idle");
      expect(screen.getByTestId("msg-count").textContent).toBe("0");
      expect(screen.getByTestId("conv-id").textContent).not.toBe(initialConvId);
    });

    it("Share button copies URL, displays checkmark badge, and handles clipboard rejection gracefully", async () => {
      // Case A: Successful writeText
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const chat = createMockChat();
      const { rerender } = render(<FloatingChatDrawer isOpen={true} onClose={vi.fn()} chat={chat} />);

      const shareBtn = screen.getByRole("button", { name: "Chia sẻ liên kết" });
      fireEvent.click(shareBtn);

      expect(writeTextMock).toHaveBeenCalledWith(window.location.href);
      await waitFor(() => {
        expect(screen.getByTitle("Đã copy link!")).toBeTruthy();
      });

      // Case B: Clipboard writeText rejects (e.g. permission denied) - does not crash component
      const rejectMock = vi.fn().mockRejectedValue(new Error("Clipboard permission denied"));
      Object.assign(navigator, {
        clipboard: {
          writeText: rejectMock,
        },
      });

      rerender(<FloatingChatDrawer isOpen={true} onClose={vi.fn()} chat={chat} />);
      const shareBtnAfter = screen.getByRole("button", { name: /Chia sẻ liên kết|Đã copy link!/ });
      
      // Should not throw unhandled rejection
      expect(() => fireEvent.click(shareBtnAfter)).not.toThrow();
    });

    it("Share button does not crash if navigator.clipboard is undefined", () => {
      // Insecure context or restricted webview where clipboard is undefined
      const originalClipboard = navigator.clipboard;
      // @ts-expect-error simulating missing clipboard
      delete navigator.clipboard;

      const chat = createMockChat();
      render(<FloatingChatDrawer isOpen={true} onClose={vi.fn()} chat={chat} />);

      const shareBtn = screen.getByRole("button", { name: "Chia sẻ liên kết" });
      expect(() => fireEvent.click(shareBtn)).not.toThrow();

      // Restore clipboard
      Object.assign(navigator, { clipboard: originalClipboard });
    });
  });

  // =========================================================================
  // 4. INTEGRATION HANDOFF (QUICK BAR -> DRAWER -> STREAMING)
  // =========================================================================
  describe("4. End-to-End Style 2 Handoff & State Hoisting", () => {
    it("submitting question in Quick Bar opens Drawer, carries question over, and streams answer", async () => {
      fetchMock.mockResolvedValueOnce(
        createStreamResponse(["Cris có hơn 5 năm kinh nghiệm về Next.js và kiến trúc micro-frontend."])
      );

      render(<FloatingChatBot uiStyle="style2-drawer" />);

      // Quick bar is visible initially, drawer is closed
      expect(screen.queryByLabelText("Cris AI Assistant Drawer")).toBeNull();
      const quickBarInput = screen.getByPlaceholderText("Hỏi Cris AI...");

      // Type question and submit
      fireEvent.change(quickBarInput, { target: { value: "Kinh nghiệm của Cris?" } });
      const sendBtn = screen.getByRole("button", { name: "Gửi câu hỏi" });
      fireEvent.click(sendBtn);

      // Drawer opens immediately
      await waitFor(() => {
        expect(screen.getByLabelText("Cris AI Assistant Drawer")).toBeTruthy();
      });

      // Question is visible in drawer
      expect(screen.getByText("Kinh nghiệm của Cris?")).toBeTruthy();

      // Streaming answer appears
      await waitFor(() => {
        expect(
          screen.getByText(/Cris có hơn 5 năm kinh nghiệm về Next.js/i)
        ).toBeTruthy();
      });

      // Quick Bar is hidden
      const quickBar = screen.getByLabelText("Cris AI Quick Bar");
      expect(quickBar.className).toContain("translate-y-16");
      expect(quickBar.className).toContain("opacity-0");
    });
  });
});
