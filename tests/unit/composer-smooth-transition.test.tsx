// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { ChatComposer } from "@/roadmap-rag-assistant/sdk/typescript/src/react/components/ChatComposer";
import type { PageContextRef } from "@/roadmap-rag-assistant/sdk/typescript/src/react/utils/pageContextRef";

function ComposerTestHarness(props: {
  initialInput?: string;
  isKeyboardOpen?: boolean;
  isLoading?: boolean;
  showStop?: boolean;
  contextRef?: PageContextRef | null;
  onSend?: (text?: string) => void;
  onStop?: () => void;
}) {
  const [input, setInput] = React.useState(props.initialInput ?? "");
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);

  return (
    <ChatComposer
      inputRef={inputRef}
      input={input}
      setInput={setInput}
      isLoading={props.isLoading ?? false}
      showStop={props.showStop ?? false}
      stopStreaming={props.onStop ?? vi.fn()}
      handleSend={props.onSend ?? vi.fn()}
      handleKeyDown={vi.fn()}
      isKeyboardOpen={props.isKeyboardOpen ?? false}
      contextRef={props.contextRef}
    />
  );
}

describe("ChatComposer - 2-Column Row Layout & Auto-Grow UX", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders 2-column layout with textarea and composer-toolbar as siblings, with no voice button", () => {
    render(<ComposerTestHarness initialInput="" isKeyboardOpen={false} />);

    const card = screen.getByTestId("composer-card");
    const toolbar = screen.getByTestId("composer-toolbar");
    const textarea = screen.getByPlaceholderText("Hỏi Abot…");

    // Card contains textarea (left) and toolbar (right) as direct siblings
    expect(card.children[0]).toBe(textarea);
    expect(card.children[1]).toBe(toolbar);

    // Send button lives inside toolbar
    expect(toolbar.contains(screen.getByRole("button", { name: "Gửi tin nhắn" }))).toBe(true);

    // Voice button and spacer are removed; no data-mode on card
    expect(screen.queryByRole("button", { name: /giọng nói/i })).toBeNull();
    expect(screen.queryByTestId("composer-spacer")).toBeNull();
    expect(card.getAttribute("data-mode")).toBeNull();
  });

  it("textarea maintains constant className across focus, blur, single-line, and multi-line input", () => {
    render(<ComposerTestHarness initialInput="" isKeyboardOpen={false} />);

    const textarea = screen.getByPlaceholderText("Hỏi Abot…");
    const initialClassName = textarea.className;

    // Focus / blur
    fireEvent.focus(textarea);
    expect(textarea.className).toBe(initialClassName);
    fireEvent.blur(textarea);
    expect(textarea.className).toBe(initialClassName);

    // Single line text
    fireEvent.change(textarea, { target: { value: "Single line text" } });
    expect(textarea.className).toBe(initialClassName);

    // Multi-line text with newlines
    fireEvent.change(textarea, { target: { value: "Line 1\nLine 2\nLine 3" } });
    expect(textarea.className).toBe(initialClassName);
  });

  it("auto-grows height based on scrollHeight and caps at MAX_TEXTAREA_HEIGHT (160px)", () => {
    const originalScrollHeight = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "scrollHeight"
    );

    try {
      let mockHeight = 70;
      Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
        configurable: true,
        get: () => mockHeight,
      });

      render(<ComposerTestHarness initialInput="Hello" isKeyboardOpen={false} />);
      const textarea = screen.getByDisplayValue("Hello") as HTMLTextAreaElement;
      expect(textarea.style.height).toBe("70px");

      // When scrollHeight exceeds 160px, capped at 160px
      mockHeight = 220;
      fireEvent.change(textarea, { target: { value: "Hello\nLine 2\nLine 3" } });
      expect(textarea.style.height).toBe("160px");
    } finally {
      if (originalScrollHeight) {
        Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", originalScrollHeight);
      } else {
        delete (HTMLTextAreaElement.prototype as unknown as { scrollHeight?: unknown }).scrollHeight;
      }
    }
  });

  it("switches container padding to pb-2 when isKeyboardOpen is true, and restores normal padding when false", () => {
    const { rerender } = render(<ComposerTestHarness initialInput="" isKeyboardOpen={true} />);

    const card = screen.getByTestId("composer-card");
    expect(card.parentElement?.className).toContain("pb-2");

    rerender(<ComposerTestHarness initialInput="" isKeyboardOpen={false} />);
    expect(card.parentElement?.className).not.toContain("pb-2");
    expect(card.parentElement?.className).toContain("pb-[max(0.75rem,env(safe-area-inset-bottom))]");
  });

  it("blurs textarea on mobile when keyboard closes while input is empty", () => {
    const { rerender } = render(<ComposerTestHarness initialInput="" isKeyboardOpen={true} />);

    const textarea = screen.getByPlaceholderText("Hỏi Abot…") as HTMLTextAreaElement;
    const blurSpy = vi.spyOn(textarea, "blur");

    rerender(<ComposerTestHarness initialInput="" isKeyboardOpen={false} />);
    expect(blurSpy).toHaveBeenCalled();
  });

  it("handles stop streaming button and send trigger correctly", () => {
    const handleStop = vi.fn();
    const handleSend = vi.fn();

    const { rerender } = render(
      <ComposerTestHarness
        initialInput=""
        showStop={false}
        onSend={handleSend}
        onStop={handleStop}
      />
    );

    const sendBtn = screen.getByRole("button", { name: "Gửi tin nhắn" }) as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("Hỏi Abot…"), { target: { value: "Test question" } });
    expect(sendBtn.disabled).toBe(false);
    fireEvent.click(sendBtn);
    expect(handleSend).toHaveBeenCalledTimes(1);

    // Switch to streaming state (real handleSend clears input upon sending)
    fireEvent.change(screen.getByPlaceholderText("Hỏi Abot…"), { target: { value: "" } });
    rerender(
      <ComposerTestHarness
        initialInput=""
        showStop={true}
        isLoading={true}
        onSend={handleSend}
        onStop={handleStop}
      />
    );

    expect(screen.getByPlaceholderText("Abot đang trả lời…")).toBeDefined();
    const indicator = screen.getByTestId("composer-answering-indicator");
    expect(indicator.textContent).toContain("Abot đang trả lời");
    expect(indicator.querySelectorAll(".animate-dot-wave")).toHaveLength(3);

    // Typing a follow-up draft hides the answering overlay immediately
    fireEvent.change(screen.getByPlaceholderText("Abot đang trả lời…"), {
      target: { value: "Hỏi tiếp" },
    });
    expect(screen.queryByTestId("composer-answering-indicator")).toBeNull();

    const stopBtn = screen.getByRole("button", { name: "Dừng phản hồi" });
    fireEvent.click(stopBtn);
    expect(handleStop).toHaveBeenCalledTimes(1);
  });

  it("shows character counter near threshold (1.805/2.000) and turns red at limit", () => {
    render(<ComposerTestHarness initialInput={"a".repeat(1805)} isKeyboardOpen={false} />);

    const counter = screen.getByText("1.805/2.000");
    expect(counter).toBeDefined();
    expect(counter.className).toContain("text-[#5E5B55]");

    const textarea = screen.getByDisplayValue("a".repeat(1805));
    fireEvent.change(textarea, { target: { value: "a".repeat(2000) } });
    const maxCounter = screen.getByText("2.000/2.000");
    expect(maxCounter.className).toContain("text-[#B42318]");
  });

  it("renders Tablet+ current-page Context Reference chip inside composer-toolbar alongside Send button", () => {
    const lessonRef: PageContextRef = {
      kind: "lesson",
      path: "/frontend/ban-phat-hanh-bao-mat-nextjs-thang-112026-va-loi-v1645-va-v15529",
      label: "Bản phát hành bảo mật Next.js tháng 11/2026 và lỗi v16.4.5 & v15.5.29",
      topicLabel: "Frontend",
      section: "Next.js",
      tooltip:
        "Bản phát hành bảo mật Next.js tháng 11/2026 và lỗi v16.4.5 & v15.5.29 (/frontend/ban-phat-hanh-bao-mat-nextjs-thang-112026-va-loi-v1645-va-v15529)",
    };

    const { rerender } = render(<ComposerTestHarness contextRef={lessonRef} />);

    const card = screen.getByTestId("composer-card");
    const toolbar = screen.getByTestId("composer-toolbar");
    const chip = screen.getByTestId("composer-context-ref");
    const sendBtn = screen.getByRole("button", { name: "Gửi tin nhắn" });
    const textarea = screen.getByPlaceholderText("Hỏi Abot…");

    // Card is always unified 2-row (`flex-col`): textarea above, toolbar (with `+` and Send) below
    expect(card.className).toContain("flex-col");
    expect(toolbar.contains(screen.getByRole("button", { name: "Thêm ngữ cảnh" }))).toBe(true);
    expect(toolbar.contains(chip)).toBe(true);
    expect(toolbar.contains(sendBtn)).toBe(true);
    expect(chip.getAttribute("data-context-kind")).toBe("lesson");
    expect(chip.getAttribute("data-context-path")).toBe(lessonRef.path);
    expect(chip.textContent).toBe(lessonRef.label);
    expect(chip.textContent).not.toContain("Trang hiện tại");

    // Hovering the 2-level current file chip reveals its full path popover
    expect(screen.queryByTestId("composer-context-popover")).toBeNull();
    fireEvent.mouseEnter(chip);
    const popover = screen.getByTestId("composer-context-popover");
    expect(popover.textContent).toContain("Frontend · Next.js");
    expect(popover.textContent).toContain(lessonRef.path);
    fireEvent.mouseLeave(chip);
    expect(screen.queryByTestId("composer-context-popover")).toBeNull();

    // Textarea className remains static across typing even with contextRef enabled
    const clsBefore = textarea.className;
    fireEvent.change(textarea, { target: { value: "Tóm tắt bài này\nÝ thứ hai" } });
    expect(textarea.className).toBe(clsBefore);

    // Topic reference variant (1 level: no 2-level path popover on hover)
    rerender(
      <ComposerTestHarness
        contextRef={{
          kind: "topic",
          path: "/frontend",
          label: "Frontend",
          tooltip: "Frontend (/frontend)",
        }}
      />
    );
    const topicChip = screen.getByTestId("composer-context-ref");
    expect(topicChip.getAttribute("data-context-kind")).toBe("topic");
    expect(topicChip.textContent).toContain("Frontend");
    fireEvent.mouseEnter(topicChip);
    expect(screen.queryByTestId("composer-context-popover")).toBeNull();
  });
});
