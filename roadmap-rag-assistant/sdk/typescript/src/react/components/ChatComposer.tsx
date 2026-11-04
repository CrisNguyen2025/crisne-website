import React from "react";
import { ArrowUpIcon, StopIcon } from "../icons";

/** Longest question the reader can type; the proxy and the service refuse more. */
export const MAX_INPUT_LENGTH = 2000;
/** Show the counter once the question is close to the limit. */
const COUNTER_THRESHOLD = 1800;
/** The box grows with its text up to this height (about six lines), then scrolls. */
const MAX_TEXTAREA_HEIGHT = 132;

export interface ChatComposerProps {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  showStop: boolean;
  stopStreaming: () => void;
  handleSend: (textToSend?: string) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
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
    <div className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-[#E6E4DF] bg-[#FFFFFF] shrink-0">
      <div className="flex items-end gap-2 rounded-2xl border border-[#E6E4DF] bg-[#F4F3F0]/80 py-1.5 pl-4 pr-1.5 transition-all focus-within:bg-[#FFFFFF] focus-within:border-[#C2410C]/60">
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          maxLength={MAX_INPUT_LENGTH}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isLoading
              ? "Abot đang trả lời…"
              : "Hỏi Abot…"
          }
          className="min-w-0 flex-1 resize-none self-center overflow-y-auto bg-transparent py-1 text-[16px] md:text-sm font-normal tracking-[-0.01em] leading-normal text-[#1F1E1C] outline-none [scrollbar-width:thin] placeholder:text-[#6B6862]/70 placeholder:font-normal placeholder:text-sm disabled:opacity-50"
        />
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
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#FBEDE5] text-[#B42318] border border-[#B42318]/20 transition-all hover:opacity-90 active:scale-95"
          >
            <StopIcon className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!input.trim()}
            aria-label="Gửi tin nhắn"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#C2410C] text-white shadow-xs transition-all hover:bg-[#9A3412] hover:scale-105 active:scale-95 disabled:bg-[#E6E4DF] disabled:text-[#6B6862] disabled:opacity-40 disabled:hover:scale-100"
          >
            <ArrowUpIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
