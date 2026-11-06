import React from "react";
import { ArrowUpIcon, PlusIcon, StopIcon } from "../icons";

/** Longest question the reader can type; the proxy and the service refuse more. */
export const MAX_INPUT_LENGTH = 2000;
/** Show the counter once the question is close to the limit. */
const COUNTER_THRESHOLD = 1800;
/** The box grows with its text up to this height (six 24px lines plus 12px padding), then scrolls. */
const MAX_TEXTAREA_HEIGHT = 156;

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
  // Multi-line, so a pasted list of lessons keeps its lines (Enter sends, Shift+Enter adds a line).
  // Height follows the text: reset, then fit to scrollHeight, capped at MAX_TEXTAREA_HEIGHT.
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
      className={`relative shrink-0 bg-[#FFFFFF] px-3 pt-0 before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-3 before:bg-gradient-to-t before:from-[#FFFFFF] before:to-transparent ${
        isKeyboardOpen ? "pb-2" : "pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      }`}
    >
      {/* One pill like Claude: [+] text [send]. The text grows upward; the buttons stay on the
          last line. Tapping anywhere on the pill focuses the text. */}
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex cursor-text items-end gap-1 rounded-[26px] border border-[#E6E4DF] bg-[#FFFFFF] p-1.5 shadow-[0_2px_10px_rgb(0_0_0_/_0.05)] transition-[border-color,box-shadow] duration-150 focus-within:border-[#D6D3CC] focus-within:shadow-[0_2px_14px_rgb(0_0_0_/_0.08)]"
      >
        {/* Context window (attach lessons, files…) comes later: the slot is reserved now */}
        <button
          type="button"
          disabled
          title="Thêm ngữ cảnh (sắp có)"
          aria-label="Thêm ngữ cảnh (sắp có)"
          onMouseDown={(e) => e.preventDefault()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F4F3F0] text-[#4D4B46] disabled:cursor-default disabled:opacity-60"
        >
          <PlusIcon className="h-5 w-5" />
        </button>
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
          // Placeholder keeps the text's size, so the first keystroke doesn't shift the line
          className="block min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-1.5 py-1.5 text-base leading-6 md:text-sm md:leading-6 text-[#1F1E1C] outline-none [scrollbar-width:thin] placeholder:text-[#8C8983] disabled:opacity-50"
        />
        <div className="flex shrink-0 items-center gap-1.5">
        {input.length >= COUNTER_THRESHOLD && (
          <span
            className={`shrink-0 select-none text-[11px] tabular-nums ${
              input.length >= MAX_INPUT_LENGTH ? "text-[#B42318]" : "text-[#6B6862]"
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
