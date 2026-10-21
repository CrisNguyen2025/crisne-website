// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FloatingQuickBar } from "@/components/floating-bot/FloatingQuickBar";

describe("Style 2 Phase 1 — FloatingQuickBar & Shortcut 'A'", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1024 });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders pinned at bottom-center with placeholder 'Hỏi Cris AI...'", () => {
    render(
      <FloatingQuickBar
        input=""
        onInputChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText("Hỏi Cris AI...");
    expect(input).toBeTruthy();
    const aside = screen.getByLabelText("Cris AI Quick Bar");
    expect(aside.className).toContain("fixed");
    expect(aside.className).toContain("bottom-4");
    expect(aside.className).toContain("left-1/2");
    expect(aside.className).toContain("-translate-x-1/2");
  });

  it("renders desktop shortcut badge with <kbd>A</kbd> and responsive hiding", () => {
    render(
      <FloatingQuickBar
        input=""
        onInputChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    const kbd = screen.getByText("A");
    expect(kbd.tagName.toLowerCase()).toBe("kbd");
    expect(kbd.className).toContain("hidden");
    expect(kbd.className).toContain("sm:inline-flex");
  });

  it("adjusts action arrow button opacity based on input content", () => {
    const { rerender } = render(
      <FloatingQuickBar
        input=""
        onInputChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    const sendBtn = screen.getByRole("button", { name: "Gửi câu hỏi" });
    expect(sendBtn.className).toContain("opacity-40");

    rerender(
      <FloatingQuickBar
        input="Hỏi về dự án"
        onInputChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );
    expect(sendBtn.className).toContain("opacity-100");
  });

  it("applies slide-down exit classes when isVisible is false", () => {
    const { rerender } = render(
      <FloatingQuickBar
        isVisible={true}
        input=""
        onInputChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    const aside = screen.getByLabelText("Cris AI Quick Bar");
    expect(aside.className).toContain("translate-y-0");
    expect(aside.className).toContain("opacity-100");

    rerender(
      <FloatingQuickBar
        isVisible={false}
        input=""
        onInputChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );
    expect(aside.className).toContain("translate-y-16");
    expect(aside.className).toContain("opacity-0");
    expect(aside.className).toContain("pointer-events-none");
  });

  it("triggers onSubmit when user submits form with non-empty query", () => {
    const onSubmit = vi.fn();
    render(
      <FloatingQuickBar
        input="Cris đã làm việc ở đâu?"
        onInputChange={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    const sendBtn = screen.getByRole("button", { name: "Gửi câu hỏi" });
    fireEvent.click(sendBtn);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("Cris đã làm việc ở đâu?");
  });

  it("triggers onOpenDrawer when user submits with empty input", () => {
    const onOpenDrawer = vi.fn();
    const onSubmit = vi.fn();
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

  describe("Action button active state & hover styling when chat has messages", () => {
    it("activates button with hover highlight and allows clicking to open drawer when messages exist", () => {
      const onOpenDrawer = vi.fn();
      render(
        <FloatingQuickBar
          input=""
          onInputChange={vi.fn()}
          onSubmit={vi.fn()}
          onOpenDrawer={onOpenDrawer}
          hasMessages={true}
        />
      );

      const actionBtn = screen.getByRole("button", { name: "Mở cuộc trò chuyện" });
      expect(actionBtn.title).toBe("Mở cuộc trò chuyện");
      expect(actionBtn.className).toContain("opacity-85");
      expect(actionBtn.className).toContain("cursor-pointer");
      expect(actionBtn.className).toContain("hover:opacity-100");
      expect(actionBtn.className).toContain("hover:scale-105");

      // Clicking opens the drawer
      fireEvent.click(actionBtn);
      expect(onOpenDrawer).toHaveBeenCalledTimes(1);
    });

    it("displays active send styling when input contains query and submits on click", () => {
      const onSubmit = vi.fn();
      render(
        <FloatingQuickBar
          input="Đang nhập câu hỏi mới"
          onInputChange={vi.fn()}
          onSubmit={onSubmit}
          hasMessages={true}
        />
      );

      const actionBtn = screen.getByRole("button", { name: "Gửi câu hỏi" });
      expect(actionBtn.className).toContain("opacity-100");
      expect(actionBtn.className).toContain("cursor-pointer");

      fireEvent.click(actionBtn);
      expect(onSubmit).toHaveBeenCalledWith("Đang nhập câu hỏi mới");
    });

    it("displays inactive disabled styling when conversation has no messages and input is empty", () => {
      const onOpenDrawer = vi.fn();
      render(
        <FloatingQuickBar
          input=""
          onInputChange={vi.fn()}
          onSubmit={vi.fn()}
          onOpenDrawer={onOpenDrawer}
          hasMessages={false}
        />
      );

      const actionBtn = screen.getByRole("button", { name: "Gửi câu hỏi" });
      expect(actionBtn.className).toContain("opacity-40");
      expect(actionBtn.className).toContain("cursor-not-allowed");
    });
  });

  describe("Global desktop shortcut 'A' guards", () => {
    it("focuses input when pressing 'A' on desktop", () => {
      render(
        <FloatingQuickBar
          input=""
          onInputChange={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      const input = screen.getByPlaceholderText("Hỏi Cris AI...");
      const focusSpy = vi.spyOn(input, "focus");

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
      expect(focusSpy).toHaveBeenCalledTimes(1);

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "A" }));
      expect(focusSpy).toHaveBeenCalledTimes(2);
    });

    it("ignores shortcut when user is typing in another input element", () => {
      render(
        <div>
          <input data-testid="other-input" />
          <FloatingQuickBar
            input=""
            onInputChange={vi.fn()}
            onSubmit={vi.fn()}
          />
        </div>
      );

      const otherInput = screen.getByTestId("other-input");
      const quickBarInput = screen.getByPlaceholderText("Hỏi Cris AI...");
      const focusSpy = vi.spyOn(quickBarInput, "focus");

      otherInput.focus();
      otherInput.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));

      expect(focusSpy).not.toHaveBeenCalled();
    });

    it("ignores shortcut when user is typing in a textarea", () => {
      render(
        <div>
          <textarea data-testid="other-textarea" />
          <FloatingQuickBar
            input=""
            onInputChange={vi.fn()}
            onSubmit={vi.fn()}
          />
        </div>
      );

      const otherTextarea = screen.getByTestId("other-textarea");
      const quickBarInput = screen.getByPlaceholderText("Hỏi Cris AI...");
      const focusSpy = vi.spyOn(quickBarInput, "focus");

      otherTextarea.focus();
      otherTextarea.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));

      expect(focusSpy).not.toHaveBeenCalled();
    });

    it("ignores shortcut when modifier keys (Cmd, Ctrl, Alt) are pressed", () => {
      render(
        <FloatingQuickBar
          input=""
          onInputChange={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      const input = screen.getByPlaceholderText("Hỏi Cris AI...");
      const focusSpy = vi.spyOn(input, "focus");

      // Cmd+A (Select All)
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", metaKey: true }));
      expect(focusSpy).not.toHaveBeenCalled();

      // Ctrl+A
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true }));
      expect(focusSpy).not.toHaveBeenCalled();

      // Alt+A
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", altKey: true }));
      expect(focusSpy).not.toHaveBeenCalled();
    });

    it("ignores shortcut on mobile viewports (< 768px)", () => {
      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 375 });
      render(
        <FloatingQuickBar
          input=""
          onInputChange={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      const input = screen.getByPlaceholderText("Hỏi Cris AI...");
      const focusSpy = vi.spyOn(input, "focus");

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
      expect(focusSpy).not.toHaveBeenCalled();
    });

    it("ignores shortcut when isVisible is false (Drawer is open)", () => {
      render(
        <FloatingQuickBar
          isVisible={false}
          input=""
          onInputChange={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      const input = screen.getByPlaceholderText("Hỏi Cris AI...");
      const focusSpy = vi.spyOn(input, "focus");

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
      expect(focusSpy).not.toHaveBeenCalled();
    });
  });
});
