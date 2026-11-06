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

describe("ChatComposer - Smooth Transition & 1-Row / 2-Row UX", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders in compact 1-row mode when unfocused, no keyboard, and empty (perfectly centered Y=24px)", () => {
    render(<ComposerTestHarness initialInput="" isKeyboardOpen={false} />);

    const card = screen.getByTestId("composer-card");
    const spacer = screen.getByTestId("composer-spacer");
    const toolbar = screen.getByTestId("composer-toolbar");
    const textarea = screen.getByPlaceholderText("Hỏi Abot…");

    // Mode is compact
    expect(card.getAttribute("data-mode")).toBe("compact");
    expect(card.className).toContain("min-h-[48px]");
    expect(card.className).toContain("justify-center");

    // Textarea is exactly 46px (11px + 24px line + 11px) centering text line at Y=24.0px
    expect((textarea as HTMLTextAreaElement).style.height).toBe("46px");
    expect(textarea.className).toContain("py-[11px]");
    expect(textarea.className).toContain("pl-12 pr-12");

    // Spacer is collapsed
    expect(spacer.className).toContain("h-0");

    // Toolbar occupies full height (48px) with items-center centering buttons at Y=24.0px
    expect(toolbar.className).toContain("h-full");

    // Both action buttons exist in the same DOM tree without re-mounting
    expect(screen.getByRole("button", { name: "Nhập bằng giọng nói (sắp có)" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Gửi tin nhắn" })).toBeDefined();
  });

  it("smoothly expands to 2-row mode upon focusing the input", () => {
    render(<ComposerTestHarness initialInput="" isKeyboardOpen={false} />);

    const card = screen.getByTestId("composer-card");
    const spacer = screen.getByTestId("composer-spacer");
    const textarea = screen.getByPlaceholderText("Hỏi Abot…");

    // Focus into textarea
    fireEvent.focus(textarea);

    // Mode morphs to expanded
    expect(card.getAttribute("data-mode")).toBe("expanded");
    expect(card.className).toContain("min-h-[86px]");
    // Textarea starts at 38px (10px + 24px line + 4px)
    expect((textarea as HTMLTextAreaElement).style.height).toBe("38px");

    // Spacer smoothly opens to 44px (h-11) pushing toolbar down
    expect(spacer.className).toContain("h-11");

    // Textarea expands to full width padding
    expect(textarea.className).toContain("px-3.5 pt-2.5 pb-1");
  });

  it("remains in 2-row mode when input contains text even if blurred", () => {
    render(<ComposerTestHarness initialInput="Lộ trình React" isKeyboardOpen={false} />);

    const card = screen.getByTestId("composer-card");
    const textarea = screen.getByDisplayValue("Lộ trình React");

    // Mode stays expanded so user can read/edit multi-line and send
    expect(card.getAttribute("data-mode")).toBe("expanded");

    // Blur should not collapse if input is non-empty
    fireEvent.blur(textarea);
    expect(card.getAttribute("data-mode")).toBe("expanded");
  });

  it("expands to 2-row mode when isKeyboardOpen is true even before focus", () => {
    render(<ComposerTestHarness initialInput="" isKeyboardOpen={true} />);

    const card = screen.getByTestId("composer-card");
    expect(card.getAttribute("data-mode")).toBe("expanded");

    // Container switches to tight pb-2 without safe-area inset
    const container = card.parentElement;
    expect(container?.className).toContain("pb-2");
  });

  it("smoothly collapses back to 1-row mode when text is cleared and blurred", () => {
    render(<ComposerTestHarness initialInput="Hello" isKeyboardOpen={false} />);

    const card = screen.getByTestId("composer-card");
    const textarea = screen.getByDisplayValue("Hello");

    // Initially expanded
    expect(card.getAttribute("data-mode")).toBe("expanded");

    // Clear input and blur
    fireEvent.change(textarea, { target: { value: "" } });
    fireEvent.blur(textarea);

    // Morphs back to compact
    expect(card.getAttribute("data-mode")).toBe("compact");
    expect(card.className).toContain("min-h-[48px]");
    expect((textarea as HTMLTextAreaElement).style.height).toBe("46px");
  });

  it("collapses back to 1-row mode on mobile when user presses Back button to dismiss keyboard", () => {
    // Mock mobile viewport matchMedia: max-width: 767px matches true
    const origMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width: 767px"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    try {
      // User focuses input on phone: keyboard opens
      const { rerender } = render(<ComposerTestHarness initialInput="" isKeyboardOpen={true} />);
      const card = screen.getByTestId("composer-card");
      expect(card.getAttribute("data-mode")).toBe("expanded");

      // User presses Android Back button: keyboard closes while text is empty
      rerender(<ComposerTestHarness initialInput="" isKeyboardOpen={false} />);

      // On mobile without text, closing keyboard returns directly to 1-row compact mode
      expect(card.getAttribute("data-mode")).toBe("compact");
      expect(card.className).toContain("min-h-[48px]");
    } finally {
      window.matchMedia = origMatchMedia;
    }
  });

  it("handles stop streaming button and send trigger correctly", () => {
    const handleStop = vi.fn();
    const handleSend = vi.fn();

    const { rerender } = render(
      <ComposerTestHarness
        initialInput="Test question"
        showStop={false}
        onSend={handleSend}
        onStop={handleStop}
      />
    );

    const sendBtn = screen.getByRole("button", { name: "Gửi tin nhắn" }) as HTMLButtonElement;
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

  it("shows counter smoothly near character limit threshold", () => {
    render(<ComposerTestHarness initialInput={"a".repeat(1805)} isKeyboardOpen={false} />);

    // Text count counter visible
    expect(screen.getByText("1.805/2.000")).toBeDefined();
  });
});
