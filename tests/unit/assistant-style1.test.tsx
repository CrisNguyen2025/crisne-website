// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FloatingChatBot } from "@/components/floating-bot/FloatingChatBot";
import { FloatingChatPopup } from "@/components/floating-bot/FloatingChatPopup";
import { useFloatingChat } from "@/hooks/use-floating-chat";

// Mock scrollIntoView for jsdom
window.HTMLElement.prototype.scrollIntoView = vi.fn();

const createStreamResponse = (chunks: string[], status = 200, traceId = "test-trace-123") => {
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

describe("Style 1 Assistant (Capsule/Mascot + Floating Popup)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders Capsule trigger button by default with 'Ask AI' text", () => {
    render(<FloatingChatBot />);
    const trigger = screen.getByRole("button", { name: /Mở AI Assistant/i });
    expect(trigger).toBeTruthy();
    expect(screen.getByText("Ask AI")).toBeTruthy();
  });

  it("renders Mascot trigger button when triggerVariant='mascot'", () => {
    render(<FloatingChatBot triggerVariant="mascot" />);
    const trigger = screen.getByRole("button", { name: /Mở AI Assistant/i });
    expect(trigger).toBeTruthy();
    expect(screen.getByText(/Hi there! Cris có thể giúp gì cho bạn?/i)).toBeTruthy();
  });

  it("toggles popup open on trigger button click and closes on close button click", async () => {
    render(<FloatingChatBot />);
    expect(screen.queryByPlaceholderText("Nhập câu hỏi của bạn...")).toBeNull();

    const trigger = screen.getByRole("button", { name: /Mở AI Assistant/i });
    fireEvent.click(trigger);

    expect(screen.getByPlaceholderText("Nhập câu hỏi của bạn...")).toBeTruthy();
    expect(screen.getByText("Cris Assistant")).toBeTruthy();

    const closeBtn = screen.getByRole("button", { name: "Đóng chat" });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Nhập câu hỏi của bạn...")).toBeNull();
    });
  });

  it("renders open popup immediately when initialOpen is true", () => {
    render(<FloatingChatBot initialOpen={true} />);
    expect(screen.getByPlaceholderText("Nhập câu hỏi của bạn...")).toBeTruthy();
    expect(screen.getByText("Xin chào! 👋")).toBeTruthy();
  });

  it("renders Quick Prompts in empty state and allows prompt click to send message", async () => {
    fetchMock.mockResolvedValueOnce(createStreamResponse(["Cris có nhiều kinh nghiệm Next.js"]));
    render(<FloatingChatBot initialOpen={true} />);

    const quickPrompt = screen.getByText("Cris có kinh nghiệm gì về Next.js & React?");
    expect(quickPrompt).toBeTruthy();

    fireEvent.click(quickPrompt);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.message).toBe("Cris có kinh nghiệm gì về Next.js & React?");
  });

  it("dispatches project:open-modal and closes popup on project chip click", async () => {
    const projectEventSpy = vi.fn();
    window.addEventListener("project:open-modal", projectEventSpy);

    const onClose = vi.fn();
    const mockChat = {
      messages: [
        {
          id: "bot-1",
          role: "assistant" as const,
          content: "Bạn có thể xem dự án [[action:project|smartbit-saas-platform|Smartbit SaaS]]",
          createdAt: new Date(),
        },
      ],
      input: "",
      setInput: vi.fn(),
      isLoading: false,
      isStreaming: false,
      conversationId: "conv-1",
      sendMessage: vi.fn(),
      sendFeedback: vi.fn(),
      resetChat: vi.fn(),
      stopResponse: vi.fn(),
      retry: vi.fn(),
    };

    render(<FloatingChatPopup isOpen={true} onClose={onClose} chat={mockChat} />);

    const chip = screen.getByText("Smartbit SaaS");
    expect(chip).toBeTruthy();

    fireEvent.click(chip);

    expect(projectEventSpy).toHaveBeenCalledTimes(1);
    expect(projectEventSpy.mock.calls[0][0].detail.projectId).toBe("smartbit-saas-platform");
    expect(onClose).toHaveBeenCalled();

    window.removeEventListener("project:open-modal", projectEventSpy);
  });

  it("dispatches roadmap:select-layer and closes popup on roadmap chip click", async () => {
    const roadmapEventSpy = vi.fn();
    window.addEventListener("roadmap:select-layer", roadmapEventSpy);

    const onClose = vi.fn();
    const mockChat = {
      messages: [
        {
          id: "bot-2",
          role: "assistant" as const,
          content: "Tham khảo lộ trình [[action:roadmap|layer-02|Layer 02]]",
          createdAt: new Date(),
        },
      ],
      input: "",
      setInput: vi.fn(),
      isLoading: false,
      isStreaming: false,
      conversationId: "conv-2",
      sendMessage: vi.fn(),
      sendFeedback: vi.fn(),
      resetChat: vi.fn(),
      stopResponse: vi.fn(),
      retry: vi.fn(),
    };

    render(<FloatingChatPopup isOpen={true} onClose={onClose} chat={mockChat} />);

    const chip = screen.getByText("Layer 02");
    expect(chip).toBeTruthy();

    fireEvent.click(chip);

    expect(roadmapEventSpy).toHaveBeenCalledTimes(1);
    expect(roadmapEventSpy.mock.calls[0][0].detail.layerId).toBe("layer-02");
    expect(onClose).toHaveBeenCalled();

    window.removeEventListener("roadmap:select-layer", roadmapEventSpy);
  });
});

describe("useFloatingChat augmentations", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retry re-sends user question after removing target assistant message", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("Error connecting", { status: 500 }))
      .mockResolvedValueOnce(createStreamResponse(["Câu trả lời retry thành công!"]));

    function TestChatComponent() {
      const chat = useFloatingChat();
      return (
        <div>
          <button onClick={() => chat.sendMessage("Hỏi lần 1")}>Gửi</button>
          <button onClick={() => chat.retry()}>Retry</button>
          <div data-testid="msg-count">{chat.messages.length}</div>
          <div data-testid="last-content">{chat.messages.at(-1)?.content}</div>
        </div>
      );
    }

    render(<TestChatComponent />);

    await act(async () => {
      fireEvent.click(screen.getByText("Gửi"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("last-content").textContent).toContain("Xin lỗi, đã xảy ra lỗi");
    });

    // Invoke retry
    await act(async () => {
      fireEvent.click(screen.getByText("Retry"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("last-content").textContent).toBe("Câu trả lời retry thành công!");
    });

    // History should keep one user turn and one assistant turn (2 total)
    expect(screen.getByTestId("msg-count").textContent).toBe("2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resetChat resets messages, input, and generates a new conversation ID", async () => {
    fetchMock.mockResolvedValueOnce(createStreamResponse(["Xin chào"]));

    function TestResetComponent() {
      const chat = useFloatingChat();
      return (
        <div>
          <button onClick={() => chat.sendMessage("Hello")}>Gửi</button>
          <button onClick={() => chat.resetChat()}>Reset</button>
          <div data-testid="conv-id">{chat.conversationId}</div>
          <div data-testid="msg-count">{chat.messages.length}</div>
        </div>
      );
    }

    render(<TestResetComponent />);

    const initialConvId = screen.getByTestId("conv-id").textContent;

    await act(async () => {
      fireEvent.click(screen.getByText("Gửi"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("msg-count").textContent).toBe("2");
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Reset"));
    });

    expect(screen.getByTestId("msg-count").textContent).toBe("0");
    const newConvId = screen.getByTestId("conv-id").textContent;
    expect(newConvId).not.toBe(initialConvId);
  });
});
