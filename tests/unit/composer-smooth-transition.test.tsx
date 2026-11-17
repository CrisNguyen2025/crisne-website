// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { ChatComposer } from "@/roadmap-rag-assistant/sdk/typescript/src/react/components/ChatComposer";

function ComposerTestHarness(props: {
  initialInput?: string;
  isKeyboardOpen?: boolean;
  isLoading?: boolean;
  showStop?: boolean;
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

    // Switch to streaming state
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
});
