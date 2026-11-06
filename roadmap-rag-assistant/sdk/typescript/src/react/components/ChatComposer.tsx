import React from "react";
import { ArrowUpIcon, MicIcon, StopIcon } from "../icons";

/** Longest question the reader can type; the proxy and the service refuse more. */
export const MAX_INPUT_LENGTH = 2000;
/** Show the counter once the question is close to the limit. */
const COUNTER_THRESHOLD = 1800;
/** The box grows with its text up to this height (six 24px lines plus 14px padding), then scrolls. */
const MAX_TEXTAREA_HEIGHT = 160;
/** Exact textarea height in compact 1-row mode: 11px padding-top + 24px line + 11px padding-bottom = 46px */
const COMPACT_TEXTAREA_HEIGHT = 46;
/** Single line height in expanded mode: 10px padding-top + 24px line + 4px padding-bottom = 38px */
const EXPANDED_1LINE_HEIGHT = 38;

const MOBILE_QUERY = "(max-width: 767px)";

function subscribeMobile(callback: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mq = window.matchMedia(MOBILE_QUERY);
  if (mq.addEventListener) {
    mq.addEventListener("change", callback);
    return () => mq.removeEventListener("change", callback);
  }
  return () => {};
}

function getMobileSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(MOBILE_QUERY).matches;
}

function getMobileServerSnapshot(): boolean {
  return false;
}

function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribeMobile, getMobileSnapshot, getMobileServerSnapshot);
}

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
  const [focused, setFocused] = React.useState(false);
  const isMobile = useIsMobile();

  // Expanded mode (2 rows):
  // - If text is entered: always 2 rows so user can view/edit multiline.
  // - On mobile: 2-line mode is active only while the phone keyboard is open (or text entered).
  //   When user presses Android Back button to dismiss the keyboard, isKeyboardOpen becomes false
  //   and composer returns cleanly to 1-line compact mode.
  // - On desktop: 2-line mode is active when focused or text is entered.
  const isExpanded =
    input.trim().length > 0 || (isMobile ? isKeyboardOpen : (focused || isKeyboardOpen));
  const isCompact = !isExpanded;

  // When mobile keyboard dismisses (e.g. Back button pressed), blur textarea to drop active cursor
  const prevKeyboardOpenRef = React.useRef(isKeyboardOpen);
  React.useEffect(() => {
    if (prevKeyboardOpenRef.current && !isKeyboardOpen && input.trim().length === 0) {
      inputRef.current?.blur();
    }
    prevKeyboardOpenRef.current = isKeyboardOpen;
  }, [isKeyboardOpen, input, inputRef]);

  // Auto-grow textarea height following text content.
  // In compact mode: locked to 46px (11px + 24px line + 11px) centering text perfectly at Y=24px.
  // In expanded mode: resizes smoothly from 38px up to MAX_TEXTAREA_HEIGHT (160px).
  React.useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    if (isCompact) {
      el.style.height = `${COMPACT_TEXTAREA_HEIGHT}px`;
      return;
    }

    el.style.height = "auto";
    const nextHeight = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT);
    el.style.height = `${Math.max(nextHeight, EXPANDED_1LINE_HEIGHT)}px`;
  }, [input, inputRef, isCompact]);

  return (
    // Like Claude: no divider, the card floats over the list's end. With the keyboard up the
    // home-indicator inset sits under the keyboard, so it is dropped there.
    <div
      className={`relative shrink-0 bg-[#FFFFFF] px-3 pt-0 transition-[padding-bottom] duration-200 ease-out motion-reduce:transition-none before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-3 before:bg-gradient-to-t before:from-[#FFFFFF] before:to-transparent ${
        isKeyboardOpen ? "pb-2" : "pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      }`}
    >
      {/* Outer composer card: seamless fluid transition between 1-row pill (48px) and 2-row multi-line card */}
      <div
        onClick={() => inputRef.current?.focus()}
        data-testid="composer-card"
        data-mode={isCompact ? "compact" : "expanded"}
        className={`group relative flex cursor-text flex-col rounded-[24px] border border-[#E6E4DF] bg-[#FFFFFF] shadow-[0_1px_3px_rgb(0_0_0_/_0.04),0_6px_20px_rgb(0_0_0_/_0.06)] transition-[border-color,box-shadow,min-height] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none focus-within:border-[#D6D3CC] focus-within:shadow-[0_2px_6px_rgb(0_0_0_/_0.06),0_8px_24px_rgb(0_0_0_/_0.10)] ${
          isCompact ? "min-h-[48px] justify-center" : "min-h-[86px] justify-start"
        }`}
      >
        {/* Row 1 / Text Input Area */}
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
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
          className={`block w-full min-w-0 resize-none overflow-y-auto bg-transparent text-base leading-6 md:text-sm md:leading-6 text-[#1F1E1C] outline-none [scrollbar-width:thin] placeholder:text-[#75716A] disabled:opacity-50 transition-[padding] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
            isCompact
              ? "pl-12 pr-12 py-[11px]"
              : "px-3.5 pt-2.5 pb-1"
          }`}
        />

        {/* Dynamic spacer that cleanly pushes bottom toolbar down when expanded */}
        <div
          aria-hidden="true"
          data-testid="composer-spacer"
          className={`shrink-0 transition-[height] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
            isCompact ? "h-0" : "h-11"
          }`}
        />

        {/* Bottom Toolbar: perfectly aligned with center axis in compact mode,
            smoothly gliding to bottom row in expanded mode */}
        <div
          data-testid="composer-toolbar"
          className={`absolute inset-x-0 bottom-0 flex items-center justify-between pointer-events-none px-1.5 transition-[height] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
            isCompact ? "h-full" : "h-11 pb-1"
          }`}
        >
          {/* Voice input: left action slot */}
          <button
            type="button"
            disabled
            title="Nhập bằng giọng nói (sắp có)"
            aria-label="Nhập bằng giọng nói (sắp có)"
            onMouseDown={(e) => e.preventDefault()}
            className="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F4F3F0] text-[#4D4B46] transition-colors hover:bg-[#ECEAE5] disabled:cursor-default"
          >
            <MicIcon className="h-5 w-5" />
          </button>

          {/* Right action slots: counter + send/stop */}
          <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
            {input.length >= COUNTER_THRESHOLD && (
              <span
                className={`shrink-0 select-none text-xs tabular-nums transition-opacity duration-150 ${
                  input.length >= MAX_INPUT_LENGTH ? "text-[#B42318]" : "text-[#5E5B55]"
                } ${isCompact ? "opacity-0 pointer-events-none" : "opacity-100"}`}
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
    </div>
  );
}
