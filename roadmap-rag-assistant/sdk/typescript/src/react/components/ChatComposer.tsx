import React from "react";
import { ArrowUpIcon, StopIcon } from "../icons";

/** Longest question the reader can type; the proxy and the service refuse more. */
export const MAX_INPUT_LENGTH = 2000;
/** Show the counter once the question is close to the limit. */
const COUNTER_THRESHOLD = 1800;
/** The box grows with its text up to this height (six 24px lines plus 14px padding), then scrolls. */
const MAX_TEXTAREA_HEIGHT = 160;

export interface ChatComposerProps {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  showStop: boolean;
  stopStreaming: () => void;
  handleSend: (textToSend?: string) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /** The phone keyboard is up: the bottom safe-area inset is not needed */
  isKeyboardOpen?: boolean;
}

/**
 * 2-column flex composer:
 * - Text column (left, flex-1 min-w-0): textarea auto-grows from 1 line to MAX_TEXTAREA_HEIGHT (160px), then scrolls.
 *   Padding and width remain static regardless of line count or focus state to eliminate layout jitter.
 * - Action column (right, shrink-0): counter (when near limit) + send/stop button,
 *   anchored at the bottom (items-end) alongside the last text line.
 */
export function ChatComposer({
  inputRef,
  input,
  setInput,
  isLoading,
  showStop,
  stopStreaming,
  handleSend,
  handleKeyDown,
  isKeyboardOpen = false,
}: ChatComposerProps) {
  // When mobile keyboard dismisses (e.g. Back button pressed), blur textarea to drop active cursor
  const prevKeyboardOpenRef = React.useRef(isKeyboardOpen);
  React.useEffect(() => {
    if (prevKeyboardOpenRef.current && !isKeyboardOpen && input.trim().length === 0) {
      inputRef.current?.blur();
    }
    prevKeyboardOpenRef.current = isKeyboardOpen;
  }, [isKeyboardOpen, input, inputRef]);

  // Auto-grow textarea height following text content up to MAX_TEXTAREA_HEIGHT
  React.useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [input, inputRef]);

  return (
    // Like Claude: no divider, the card floats over the list's end. With the keyboard up the
    // home-indicator inset sits under the keyboard, so it is dropped there.
    <div
      className={`relative shrink-0 bg-[#FFFFFF] px-3 pt-0 transition-[padding-bottom] duration-200 ease-out motion-reduce:transition-none before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-3 before:bg-gradient-to-t before:from-[#FFFFFF] before:to-transparent ${
        isKeyboardOpen ? "pb-2" : "pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      }`}
    >
      {/* Outer composer card: 2-column flex row anchored to bottom */}
      <div
        onClick={() => inputRef.current?.focus()}
        data-testid="composer-card"
        className="group relative flex min-h-[48px] cursor-text items-end gap-1 rounded-[24px] border border-[#E6E4DF] bg-[#FFFFFF] p-1.5 shadow-[0_1px_3px_rgb(0_0_0_/_0.04),0_6px_20px_rgb(0_0_0_/_0.06)] transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none focus-within:border-[#D6D3CC] focus-within:shadow-[0_2px_6px_rgb(0_0_0_/_0.06),0_8px_24px_rgb(0_0_0_/_0.10)]"
      >
        {/* Left column: Text Input Area */}
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          // A chat message is not a form: no autofill, password-manager or card strip above the keyboard
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="sentences"
          spellCheck={false}
          data-lpignore="true"
          data-1p-ignore="true"
          enterKeyHint="send"
          maxLength={MAX_INPUT_LENGTH}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isLoading
              ? "Abot đang trả lời…"
              : "Hỏi Abot…"
          }
          className="flex-1 min-w-0 resize-none overflow-y-auto bg-transparent py-1.5 pl-2.5 pr-1 text-base leading-6 text-[#1F1E1C] outline-none [scrollbar-width:thin] placeholder:text-[#75716A] disabled:opacity-50 md:text-sm md:leading-6"
        />

        {/* Right column: Action toolbar (counter + send/stop button) */}
        <div
          data-testid="composer-toolbar"
          className="flex shrink-0 items-center gap-1.5"
        >
          {input.length >= COUNTER_THRESHOLD && (
            <span
              className={`shrink-0 select-none text-xs tabular-nums ${
                input.length >= MAX_INPUT_LENGTH ? "text-[#B42318]" : "text-[#5E5B55]"
              }`}
            >
              {input.length.toLocaleString("vi-VN")}/{MAX_INPUT_LENGTH.toLocaleString("vi-VN")}
            </span>
          )}
          {showStop ? (
            <button
              type="button"
              onClick={stopStreaming}
              title="Dừng phản hồi"
              aria-label="Dừng phản hồi"
              // Keeps focus in the text so the phone keyboard stays up
              onMouseDown={(e) => e.preventDefault()}
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#1F1E1C] text-white transition-[opacity,transform] hover:opacity-85 active:scale-95"
            >
              <StopIcon className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSend()}
              onMouseDown={(e) => e.preventDefault()}
              disabled={!input.trim()}
              aria-label="Gửi tin nhắn"
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#C2410C] text-white transition-[background-color,opacity,transform] hover:bg-[#9A3412] active:scale-95 disabled:cursor-default disabled:opacity-40"
            >
              <ArrowUpIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
