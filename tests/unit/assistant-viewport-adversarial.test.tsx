// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
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

  scroll() {
    this.dispatchEvent(new Event("scroll"));
  }
}

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

describe("Adversarial Stress Suite: Mobile Viewport, Keyboard & Dismiss Ergonomics", () => {
  const originalVisualViewport = window.visualViewport;
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Object.defineProperty(window, "visualViewport", {
      writable: true,
      configurable: true,
      value: originalVisualViewport,
    });
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
    Object.defineProperty(window, "innerHeight", {
      writable: true,
      configurable: true,
      value: originalInnerHeight,
    });
    window.matchMedia = originalMatchMedia;
  });

  // =========================================================================
  // 1. useAssistantViewport: SSR, Legacy, Rapid Events, Extreme Geometries
  // =========================================================================
  describe("1. useAssistantViewport Robustness & Edge Cases", () => {
    it("falls back to 0 and null cleanly when window.visualViewport is undefined (legacy browsers)", () => {
      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 375 });
      Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: 800 });
      Object.defineProperty(window, "visualViewport", { writable: true, configurable: true, value: undefined });

      const { result, unmount } = renderHook(() => useAssistantViewport(true));

      expect(result.current.keyboardOffset).toBe(0);
      expect(result.current.viewportHeight).toBeNull();
      expect(result.current.isKeyboardOpen).toBe(false);
      expect(result.current.composerStyle).toEqual({});
      expect(result.current.quickBarStyle).toEqual({});

      // Should not throw on window resize
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });
      expect(result.current.keyboardOffset).toBe(0);

      // Should unmount cleanly without errors
      expect(() => unmount()).not.toThrow();
    });

    it("handles matchMedia missing and falls back to window.innerWidth", () => {
      // Delete or set matchMedia to undefined
      Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: undefined });
      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 375 });
      Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: 800 });

      const mockVv = new MockVisualViewport(500, 375, 0);
      Object.defineProperty(window, "visualViewport", { writable: true, configurable: true, value: mockVv });

      const { result } = renderHook(() => useAssistantViewport(true));
      expect(result.current.keyboardOffset).toBe(300);
      expect(result.current.isKeyboardOpen).toBe(true);
    });

    it("handles rapid burst of 100 resize and scroll events without throwing or memory leaks", () => {
      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 375 });
      Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: 800 });

      const mockVv = new MockVisualViewport(800, 375, 0);
      Object.defineProperty(window, "visualViewport", { writable: true, configurable: true, value: mockVv });

      const { result, unmount } = renderHook(() => useAssistantViewport(true));
      expect(result.current.keyboardOffset).toBe(0);

      // Stress: rapid oscillation between heights 400, 600, 750, 800
      act(() => {
        for (let i = 0; i < 50; i++) {
          const h = 400 + (i % 5) * 80;
          mockVv.resize(h, 0);
        }
        for (let j = 0; j < 50; j++) {
          mockVv.scroll();
        }
      });

      // Settle on known height 500
      act(() => {
        mockVv.resize(500, 0);
      });

      expect(result.current.keyboardOffset).toBe(300);
      expect(result.current.isKeyboardOpen).toBe(true);
      expect(result.current.composerStyle).toEqual({ paddingBottom: "300px" });
      expect(result.current.quickBarStyle).toEqual({ transform: "translate(-50%, -300px)" });

      unmount();
    });

    it("handles extreme keyboard heights: keyboard taller than screen (Math.max guard)", () => {
      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 375 });
      Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: 800 });

      // Pathological: visualViewport height is larger than window.innerHeight (e.g. zoom out)
      const mockVv = new MockVisualViewport(1200, 375, 0);
      Object.defineProperty(window, "visualViewport", { writable: true, configurable: true, value: mockVv });

      const { result } = renderHook(() => useAssistantViewport(true));

      // 800 - 1200 = -400 -> Math.max(0, -400) = 0
      expect(result.current.keyboardOffset).toBe(0);
      expect(result.current.isKeyboardOpen).toBe(false);
      expect(result.current.composerStyle).toEqual({});
      expect(result.current.quickBarStyle).toEqual({});
    });

    it("handles extreme keyboard heights: keyboard covering 95% of screen (height = 40px)", () => {
      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 375 });
      Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: 800 });

      const mockVv = new MockVisualViewport(40, 375, 0);
      Object.defineProperty(window, "visualViewport", { writable: true, configurable: true, value: mockVv });

      const { result } = renderHook(() => useAssistantViewport(true));

      expect(result.current.keyboardOffset).toBe(760);
      expect(result.current.isKeyboardOpen).toBe(true);
      expect(result.current.composerStyle).toEqual({ paddingBottom: "760px" });
      expect(result.current.quickBarStyle).toEqual({ transform: "translate(-50%, -760px)" });
    });

    it("handles negative offsetTop and zero window.innerHeight safely", () => {
      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 375 });
      Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: 800 });

      // Negative offsetTop (e.g. overscroll / bounce effect)
      const mockVv = new MockVisualViewport(600, 375, -50);
      Object.defineProperty(window, "visualViewport", { writable: true, configurable: true, value: mockVv });

      const { result } = renderHook(() => useAssistantViewport(true));

      // 800 - (600 + (-50)) = 250
      expect(result.current.keyboardOffset).toBe(250);
      expect(result.current.isKeyboardOpen).toBe(true);

      // Pathological: window.innerHeight is 0
      act(() => {
        Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: 0 });
        mockVv.resize(600, 0);
      });
      // 0 - 600 = -600 -> Math.max(0, -600) = 0
      expect(result.current.keyboardOffset).toBe(0);
      expect(result.current.isKeyboardOpen).toBe(false);
    });

    it("unmount removes all event listeners from both visualViewport and window", () => {
      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 375 });
      const mockVv = new MockVisualViewport(800, 375, 0);
      Object.defineProperty(window, "visualViewport", { writable: true, configurable: true, value: mockVv });

      const vvRemoveSpy = vi.spyOn(mockVv, "removeEventListener");
      const winRemoveSpy = vi.spyOn(window, "removeEventListener");

      const { unmount } = renderHook(() => useAssistantViewport(true));
      unmount();

      expect(vvRemoveSpy).toHaveBeenCalledWith("resize", expect.any(Function));
      expect(vvRemoveSpy).toHaveBeenCalledWith("scroll", expect.any(Function));
      expect(winRemoveSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    });

    it("returns 0 and null immediately when enabled is false", () => {
      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 375 });
      Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: 800 });

      const mockVv = new MockVisualViewport(400, 375, 0);
      Object.defineProperty(window, "visualViewport", { writable: true, configurable: true, value: mockVv });

      const { result } = renderHook(() => useAssistantViewport(false));

      expect(result.current.keyboardOffset).toBe(0);
      expect(result.current.viewportHeight).toBeNull();
      expect(result.current.isKeyboardOpen).toBe(false);
      expect(result.current.composerStyle).toEqual({});
      expect(result.current.quickBarStyle).toEqual({});
    });
  });

  // =========================================================================
  // 2. Mobile Input Ergonomics & iOS Safari Auto-Zoom Prevention
  // =========================================================================
  describe("2. Mobile Input Ergonomics & Auto-Zoom Prevention", () => {
    it("FloatingQuickBar input has >= 16px font size on mobile (text-[16px])", () => {
      render(
        <FloatingQuickBar
          isVisible={true}
          input=""
          onInputChange={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      const input = screen.getByPlaceholderText("Hỏi Cris AI...");
      expect(input).toBeTruthy();
      expect(input.tagName).toBe("INPUT");
      expect(input.className).toMatch(/text-\[16px\]/);
      expect(input.className).toMatch(/md:text-sm/);
    });

    it("FloatingChatDrawer textarea has >= 16px font size on mobile (text-[16px])", () => {
      const chat = createMockChat();
      render(<FloatingChatDrawer isOpen={true} onClose={vi.fn()} chat={chat} />);

      const textarea = screen.getByPlaceholderText(/Hỏi Cris AI... \(Enter để gửi\)/i);
      expect(textarea).toBeTruthy();
      expect(textarea.tagName).toBe("TEXTAREA");
      expect(textarea.className).toMatch(/text-\[16px\]/);
      expect(textarea.className).toMatch(/md:text-sm/);
    });

    it("FloatingChatPopup input has >= 16px font size on mobile (text-[16px])", () => {
      const chat = createMockChat();
      render(<FloatingChatPopup isOpen={true} onClose={vi.fn()} chat={chat} />);

      const input = screen.getByPlaceholderText("Nhập câu hỏi của bạn...");
      expect(input).toBeTruthy();
      expect(input.tagName).toBe("INPUT");
      expect(input.className).toMatch(/text-\[16px\]/);
      expect(input.className).toMatch(/md:text-sm/);
    });

    it("confirms NO input or textarea element across all 3 components lacks text-[16px]", () => {
      const chat = createMockChat();
      const { container } = render(
        <>
          <FloatingQuickBar input="" onInputChange={vi.fn()} onSubmit={vi.fn()} />
          <FloatingChatDrawer isOpen={true} onClose={vi.fn()} chat={chat} />
          <FloatingChatPopup isOpen={true} onClose={vi.fn()} chat={chat} />
        </>
      );

      const formControls = container.querySelectorAll("input, textarea");
      expect(formControls.length).toBeGreaterThanOrEqual(3);

      formControls.forEach((control) => {
        expect(control.className).toContain("text-[16px]");
      });
    });
  });

  // =========================================================================
  // 3. Escape & Dismiss Stress
  // =========================================================================
  describe("3. Escape & Dismiss Stress", () => {
    it("Escape key while focused inside textarea bubbles and closes the drawer", () => {
      const onClose = vi.fn();
      const chat = createMockChat({ input: "Drafting a question..." });

      render(<FloatingChatDrawer isOpen={true} onClose={onClose} chat={chat} />);

      const textarea = screen.getByPlaceholderText(/Hỏi Cris AI.../i);
      textarea.focus();
      expect(document.activeElement).toBe(textarea);

      // Press Escape key while focused on textarea
      fireEvent.keyDown(textarea, { key: "Escape", code: "Escape" });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("clicking backdrop while streaming closes drawer cleanly without errors", () => {
      const onClose = vi.fn();
      const chat = createMockChat({
        isLoading: true,
        isStreaming: true,
        messages: [
          {
            id: "user-1",
            role: "user",
            content: "Kinh nghiệm của Cris?",
            createdAt: new Date(),
          },
          {
            id: "bot-1",
            role: "assistant",
            content: "Cris có hơn 5 năm kinh nghiệm...",
            createdAt: new Date(),
          },
        ],
      });

      const { container } = render(
        <FloatingChatDrawer isOpen={true} onClose={onClose} chat={chat} />
      );

      // Backdrop element is rendered with bg-black/40
      const backdrop = container.querySelector(".bg-black\\/40");
      expect(backdrop).toBeTruthy();

      // Click backdrop while streaming
      expect(() => {
        fireEvent.click(backdrop!);
      }).not.toThrow();

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("pressing Escape while streaming closes drawer cleanly", () => {
      const onClose = vi.fn();
      const chat = createMockChat({
        isLoading: true,
        isStreaming: true,
      });

      render(<FloatingChatDrawer isOpen={true} onClose={onClose} chat={chat} />);

      expect(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      }).not.toThrow();

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("rapid burst of backdrop clicks does not throw or corrupt state", () => {
      const onClose = vi.fn();
      const chat = createMockChat();

      const { container } = render(
        <FloatingChatDrawer isOpen={true} onClose={onClose} chat={chat} />
      );

      const backdrop = container.querySelector(".bg-black\\/40");
      expect(backdrop).toBeTruthy();

      // 10 rapid clicks
      for (let i = 0; i < 10; i++) {
        fireEvent.click(backdrop!);
      }

      expect(onClose).toHaveBeenCalledTimes(10);
    });

    it("close 'X' button while streaming closes drawer cleanly", () => {
      const onClose = vi.fn();
      const chat = createMockChat({
        isLoading: true,
        isStreaming: true,
      });

      render(<FloatingChatDrawer isOpen={true} onClose={onClose} chat={chat} />);

      const closeBtn = screen.getByRole("button", { name: "Đóng bảng trò chuyện" });
      expect(() => {
        fireEvent.click(closeBtn);
      }).not.toThrow();

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not listen for Escape when drawer is closed (isOpen: false)", () => {
      const onClose = vi.fn();
      const chat = createMockChat();

      render(<FloatingChatDrawer isOpen={false} onClose={onClose} chat={chat} />);

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
