// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FloatingChatDrawer } from "@/components/floating-bot/FloatingChatDrawer";
import type { UseFloatingChatReturn } from "@/hooks/use-floating-chat";

// Mock scrollIntoView for jsdom
window.HTMLElement.prototype.scrollIntoView = vi.fn();

function createMockChat(overrides: Partial<UseFloatingChatReturn> = {}): UseFloatingChatReturn {
  return {
    messages: [],
    input: "",
    setInput: vi.fn(),
    isLoading: false,
    isStreaming: false,
    conversationId: "test-conv-123",
    sendMessage: vi.fn().mockResolvedValue(undefined),
    sendFeedback: vi.fn().mockResolvedValue(undefined),
    resetChat: vi.fn(),
    stopResponse: vi.fn(),
    retry: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("Style 2 Phase 2 — FloatingChatDrawer", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders full-height drawer when isOpen is true", () => {
    const chat = createMockChat();
    render(<FloatingChatDrawer isOpen={true} onClose={vi.fn()} chat={chat} />);

    const drawer = screen.getByLabelText("Cris AI Assistant Drawer");
    expect(drawer).toBeTruthy();
    expect(drawer.className).toContain("fixed");
    expect(drawer.className).toContain("inset-y-0");
    expect(drawer.className).toContain("right-0");
    expect(drawer.className).toContain("h-[100dvh]");
  });

  it("does not render drawer when isOpen is false", () => {
    const chat = createMockChat();
    render(<FloatingChatDrawer isOpen={false} onClose={vi.fn()} chat={chat} />);

    expect(screen.queryByLabelText("Cris AI Assistant Drawer")).toBeNull();
  });

  describe("Dismiss Ergonomics (Backdrop, X button, Escape)", () => {
    it("calls onClose when backdrop is clicked", () => {
      const onClose = vi.fn();
      const chat = createMockChat();
      const { container } = render(
        <FloatingChatDrawer isOpen={true} onClose={onClose} chat={chat} />
      );

      const backdrop = container.querySelector(".bg-black\\/40");
      expect(backdrop).toBeTruthy();
      fireEvent.click(backdrop!);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when Close 'X' button is clicked", () => {
      const onClose = vi.fn();
      const chat = createMockChat();
      render(<FloatingChatDrawer isOpen={true} onClose={onClose} chat={chat} />);

      const closeBtn = screen.getByRole("button", { name: "Đóng bảng trò chuyện" });
      fireEvent.click(closeBtn);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when Escape key is pressed", () => {
      const onClose = vi.fn();
      const chat = createMockChat();
      render(<FloatingChatDrawer isOpen={true} onClose={onClose} chat={chat} />);

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("Empty State & Quick Prompts", () => {
    it("shows friendly greeting and Quick Prompts when messages is empty", () => {
      const chat = createMockChat();
      render(<FloatingChatDrawer isOpen={true} onClose={vi.fn()} chat={chat} />);

      expect(screen.getByText("Xin chào! 👋")).toBeTruthy();
      expect(screen.getByText(/Gợi ý câu hỏi/i)).toBeTruthy();
      expect(screen.getByText("Cris có kinh nghiệm gì về Next.js & React?")).toBeTruthy();
    });

    it("invokes chat.sendMessage when a Quick Prompt is clicked", () => {
      const chat = createMockChat();
      render(<FloatingChatDrawer isOpen={true} onClose={vi.fn()} chat={chat} />);

      const promptBtn = screen.getByText("Cris có kinh nghiệm gì về Next.js & React?");
      fireEvent.click(promptBtn);

      expect(chat.sendMessage).toHaveBeenCalledWith("Cris có kinh nghiệm gì về Next.js & React?");
    });
  });

  describe("Seamless Handoff & Query Rendering", () => {
    it("renders user message and assistant reply handed off from Quick Bar", () => {
      const chat = createMockChat({
        messages: [
          {
            id: "user-1",
            role: "user",
            content: "Dự án Kamala sử dụng stack gì?",
            createdAt: new Date(),
          },
          {
            id: "bot-1",
            role: "assistant",
            content: "Kamala kết hợp Next.js App Router, Tailwind CSS, và Stripe.",
            createdAt: new Date(),
          },
        ],
      });

      render(<FloatingChatDrawer isOpen={true} onClose={vi.fn()} chat={chat} />);

      expect(screen.getByText("Dự án Kamala sử dụng stack gì?")).toBeTruthy();
      expect(screen.getByText(/Kamala kết hợp Next.js App Router/)).toBeTruthy();
    });
  });

  describe("Utility Toolbar (Retry, Share, Clear)", () => {
    it("calls chat.retry when Retry button is clicked", () => {
      const chat = createMockChat({
        messages: [
          { id: "user-1", role: "user", content: "Lỗi mạng", createdAt: new Date() },
          { id: "bot-1", role: "assistant", content: "Lỗi kết nối", createdAt: new Date() },
        ],
      });

      render(<FloatingChatDrawer isOpen={true} onClose={vi.fn()} chat={chat} />);

      const retryBtn = screen.getByRole("button", { name: "Thử lại câu trả lời" });
      expect(retryBtn.hasAttribute("disabled")).toBe(false);

      fireEvent.click(retryBtn);
      expect(chat.retry).toHaveBeenCalledTimes(1);
    });

    it("copies current URL to clipboard when Share button is clicked", async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const chat = createMockChat();
      render(<FloatingChatDrawer isOpen={true} onClose={vi.fn()} chat={chat} />);

      const shareBtn = screen.getByRole("button", { name: "Chia sẻ liên kết" });
      fireEvent.click(shareBtn);

      expect(writeTextMock).toHaveBeenCalledWith(window.location.href);
      await waitFor(() => {
        expect(screen.getByTitle("Đã copy link!")).toBeTruthy();
      });
    });

    it("calls chat.resetChat when Clear button is clicked", () => {
      const chat = createMockChat({
        messages: [
          { id: "user-1", role: "user", content: "Hello", createdAt: new Date() },
        ],
      });

      render(<FloatingChatDrawer isOpen={true} onClose={vi.fn()} chat={chat} />);

      const clearBtn = screen.getByRole("button", { name: "Xóa lịch sử trò chuyện" });
      fireEvent.click(clearBtn);

      expect(chat.resetChat).toHaveBeenCalledTimes(1);
    });
  });

  describe("Composer & Streaming Behavior", () => {
    it("transforms Send button into Stop button during streaming and stops response", () => {
      const chat = createMockChat({
        isLoading: true,
        isStreaming: true,
      });

      render(<FloatingChatDrawer isOpen={true} onClose={vi.fn()} chat={chat} />);

      const stopBtn = screen.getByRole("button", { name: "Dừng phản hồi" });
      expect(stopBtn).toBeTruthy();

      fireEvent.click(stopBtn);
      expect(chat.stopResponse).toHaveBeenCalledTimes(1);
    });

    it("sends message on Enter key without Shift", () => {
      const chat = createMockChat({
        input: "Câu hỏi mới",
      });

      render(<FloatingChatDrawer isOpen={true} onClose={vi.fn()} chat={chat} />);

      const textarea = screen.getByPlaceholderText(/Hỏi Cris AI.../i);
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

      expect(chat.sendMessage).toHaveBeenCalledTimes(1);
    });

    it("does not send message on Shift+Enter (allows newline)", () => {
      const chat = createMockChat({
        input: "Dòng 1",
      });

      render(<FloatingChatDrawer isOpen={true} onClose={vi.fn()} chat={chat} />);

      const textarea = screen.getByPlaceholderText(/Hỏi Cris AI.../i);
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

      expect(chat.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe("Action Chips in Drawer", () => {
    it("renders chips and dispatches project:open-modal and roadmap:select-layer", () => {
      const projectEventSpy = vi.fn();
      const roadmapEventSpy = vi.fn();
      window.addEventListener("project:open-modal", projectEventSpy);
      window.addEventListener("roadmap:select-layer", roadmapEventSpy);

      const onClose = vi.fn();
      const chat = createMockChat({
        messages: [
          {
            id: "bot-1",
            role: "assistant",
            content: "Xem dự án [[action:project|smartbit-saas-platform|Smartbit SaaS]] và lộ trình [[action:roadmap|layer-03|Layer 03]]",
            createdAt: new Date(),
          },
        ],
      });

      render(<FloatingChatDrawer isOpen={true} onClose={onClose} chat={chat} />);

      const projectChip = screen.getByText("Smartbit SaaS");
      expect(projectChip).toBeTruthy();
      fireEvent.click(projectChip);

      expect(projectEventSpy).toHaveBeenCalledTimes(1);
      expect(projectEventSpy.mock.calls[0][0].detail.projectId).toBe("smartbit-saas-platform");

      const roadmapChip = screen.getByText("Layer 03");
      expect(roadmapChip).toBeTruthy();
      fireEvent.click(roadmapChip);

      expect(roadmapEventSpy).toHaveBeenCalledTimes(1);
      expect(roadmapEventSpy.mock.calls[0][0].detail.layerId).toBe("layer-03");

      window.removeEventListener("project:open-modal", projectEventSpy);
      window.removeEventListener("roadmap:select-layer", roadmapEventSpy);
    });
  });
});
