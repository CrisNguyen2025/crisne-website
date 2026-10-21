// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAssistantViewport } from "@/hooks/use-assistant-viewport";
import { FloatingQuickBar } from "@/components/floating-bot/FloatingQuickBar";
import { FloatingChatDrawer } from "@/components/floating-bot/FloatingChatDrawer";
import { FloatingChatPopup } from "@/components/floating-bot/FloatingChatPopup";
import type { UseFloatingChatReturn } from "@/hooks/use-floating-chat";

// Mock scrollIntoView for jsdom
window.HTMLElement.prototype.scrollIntoView = vi.fn();

class MockVisualViewport extends EventTarget {
  height: number;
  width: number;
  offsetTop: number;
  offsetLeft: number;
  pageTop: number;
  pageLeft: number;
  scale: number;

  constructor(height = 800, width = 375, offsetTop = 0) {
    super();
    this.height = height;
    this.width = width;
    this.offsetTop = offsetTop;
    this.offsetLeft = 0;
    this.pageTop = 0;
    this.pageLeft = 0;
    this.scale = 1;
  }

  resize(newHeight: number, newOffsetTop = 0) {
    this.height = newHeight;
    this.offsetTop = newOffsetTop;
    this.dispatchEvent(new Event("resize"));
  }
}

function createDummyChat(): UseFloatingChatReturn {
  return {
    messages: [],
    input: "",
    setInput: vi.fn(),
    isLoading: false,
    isStreaming: false,
    conversationId: "test-conv",
    sendMessage: vi.fn().mockResolvedValue(undefined),
    sendFeedback: vi.fn().mockResolvedValue(undefined),
    resetChat: vi.fn(),
    stopResponse: vi.fn(),
    retry: vi.fn().mockResolvedValue(undefined),
  };
}

describe("Mobile Viewport Ergonomics & Auto-Zoom Prevention", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("useAssistantViewport hook", () => {
    it("returns zero offset on desktop viewports (width >= 768px)", () => {
      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1024 });
      Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: 800 });

      const mockVv = new MockVisualViewport(500, 1024);
      Object.defineProperty(window, "visualViewport", { writable: true, configurable: true, value: mockVv });

      const { result } = renderHook(() => useAssistantViewport(true));

      expect(result.current.keyboardOffset).toBe(0);
      expect(result.current.isKeyboardOpen).toBe(false);
      expect(result.current.composerStyle).toEqual({});
      expect(result.current.quickBarStyle).toEqual({});
    });

    it("calculates keyboard offset dynamically on mobile when virtual keyboard appears", () => {
      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 375 });
      Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: 800 });

      const mockVv = new MockVisualViewport(800, 375, 0);
      Object.defineProperty(window, "visualViewport", { writable: true, configurable: true, value: mockVv });

      const { result } = renderHook(() => useAssistantViewport(true));

      expect(result.current.keyboardOffset).toBe(0);
      expect(result.current.isKeyboardOpen).toBe(false);

      // Keyboard opens: visualViewport height shrinks from 800 to 520
      act(() => {
        mockVv.resize(520, 0);
      });

      expect(result.current.keyboardOffset).toBe(280);
      expect(result.current.isKeyboardOpen).toBe(true);
      expect(result.current.composerStyle).toEqual({ paddingBottom: "280px" });
      expect(result.current.quickBarStyle).toEqual({ transform: "translate(-50%, -280px)" });

      // Keyboard closes: visualViewport height restores to 800
      act(() => {
        mockVv.resize(800, 0);
      });

      expect(result.current.keyboardOffset).toBe(0);
      expect(result.current.isKeyboardOpen).toBe(false);
      expect(result.current.composerStyle).toEqual({});
      expect(result.current.quickBarStyle).toEqual({});
    });

    it("removes event listeners on unmount", () => {
      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 375 });
      const mockVv = new MockVisualViewport(800, 375);
      const removeSpy = vi.spyOn(mockVv, "removeEventListener");
      Object.defineProperty(window, "visualViewport", { writable: true, configurable: true, value: mockVv });

      const { unmount } = renderHook(() => useAssistantViewport(true));
      unmount();

      expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith("scroll", expect.any(Function));
    });
  });

  describe(">= 16px Font Size (iOS Safari Auto-Zoom Prevention)", () => {
    it("QuickBar input specifies text-[16px] for mobile viewports", () => {
      render(
        <FloatingQuickBar
          input=""
          onInputChange={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      const input = screen.getByPlaceholderText("Hỏi Cris AI...");
      expect(input.className).toContain("text-[16px]");
      expect(input.className).toContain("md:text-sm");
    });

    it("Drawer composer textarea specifies text-[16px] for mobile viewports", () => {
      const chat = createDummyChat();
      render(<FloatingChatDrawer isOpen={true} onClose={vi.fn()} chat={chat} />);

      const textarea = screen.getByPlaceholderText(/Hỏi Cris AI.../i);
      expect(textarea.className).toContain("text-[16px]");
      expect(textarea.className).toContain("md:text-sm");
    });

    it("Style 1 Popup composer input specifies text-[16px] for mobile viewports", () => {
      const chat = createDummyChat();
      render(<FloatingChatPopup isOpen={true} onClose={vi.fn()} chat={chat} />);

      const input = screen.getByPlaceholderText("Nhập câu hỏi của bạn...");
      expect(input.className).toContain("text-[16px]");
      expect(input.className).toContain("md:text-sm");
    });
  });
});
