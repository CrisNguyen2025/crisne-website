import React from "react";
import type {
  ConnectorId,
  GmailConnectorStatus,
  RoadmapSummaryItem,
} from "../../types";
import {
  ArrowUpIcon,
  BookOpenIcon,
  CloseIcon,
  FileTextIcon,
  MailIcon,
  PlusIcon,
  StopIcon,
} from "../icons";
import type { PageContextRef } from "../utils/pageContextRef";
import {
  filterSlashCommands,
  getVisibleSlashCommands,
  parseSlashInput,
  STATUS_FILTER_OPTIONS,
  type SlashCommandSpec,
  type SlashSubPickerKind,
  type StatusFilterOption,
} from "../slashCommands";
import { AddContextMenu } from "./AddContextMenu";
import { SlashCommandPopover } from "./SlashCommandPopover";

/** Longest question the reader can type; the proxy and the service refuse more. */
export const MAX_INPUT_LENGTH = 2000;
/** Show the counter once the question is close to the limit. */
const COUNTER_THRESHOLD = 1800;
/** The box grows with its text up to this height (six 24px lines plus 14px padding), then scrolls. */
const MAX_TEXTAREA_HEIGHT = 160;

/** Shimmer sweep matching ToolStepRow's live label; keyframe lives in host globals.css. */
const ANSWERING_SHIMMER_CLASS =
  "relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.8s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/80 before:to-transparent motion-reduce:before:hidden";
const ANSWERING_DOT_DELAYS = ["0ms", "180ms", "360ms"] as const;

export interface ChatComposerProps {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  showStop: boolean;
  stopStreaming: () => void;
  handleSend: (
    textToSend?: string,
    options?: {
      titles?: string[];
      target?: { topic?: string; section?: string };
      connectors?: ConnectorId[];
    }
  ) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /** The phone keyboard is up: the bottom safe-area inset is not needed */
  isKeyboardOpen?: boolean;
  /** Active Topic / Lesson page reference shown in composer-toolbar. */
  contextRef?: PageContextRef | null;
  /** Current Topic slug on active page so `/quiz` Topic picker sorts it first. */
  currentTopicSlug?: string;
  /** Whether the reader has Owner permissions (`canWrite`). */
  canWrite?: boolean;
  /** Whether WebMCP browser tool runner is available. */
  hasWebMcp?: boolean;
  /** Gmail connector status (Owner-only). */
  gmailStatus?: GmailConnectorStatus | null;
  /** Whether Gmail context chip is attached for upcoming turns. */
  isGmailAttached?: boolean;
  onToggleGmailAttached?: () => void;
  onOpenGmailConfig?: () => void;
  onOpenAddMenu?: () => void;
  /** Lazy Topic loader for `/quiz` Topic picker. */
  loadTopics?: () => Promise<RoadmapSummaryItem[]>;
}

/**
 * Unified 2-row composer (ADR-0021):
 * - Full-width auto-growing textarea on row 1 (`card.children[0]`).
 * - Bottom toolbar on row 2 (`card.children[1]`): `+` Add Context button + active context chips (left),
 *   counter & Send/Stop button (right).
 * - Textarea className stays constant across focus/blur and line counts to prevent layout jitter.
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
  contextRef = null,
  currentTopicSlug,
  canWrite = false,
  hasWebMcp = false,
  gmailStatus = null,
  isGmailAttached = false,
  onToggleGmailAttached,
  onOpenGmailConfig,
  onOpenAddMenu,
  loadTopics,
}: ChatComposerProps) {
  const showAnsweringOverlay = isLoading && input.length === 0;
  const isTwoLevelContext = contextRef?.kind === "lesson";
  const [isContextHovered, setIsContextHovered] = React.useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = React.useState(false);
  const [manualSlashMode, setManualSlashMode] = React.useState<
    "none" | "commands" | SlashSubPickerKind
  >("none");
  const [dismissedInput, setDismissedInput] = React.useState<string | null>(
    null
  );
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [topics, setTopics] = React.useState<RoadmapSummaryItem[]>([]);
  const [topicsLoaded, setTopicsLoaded] = React.useState(false);
  const [topicsLoading, setTopicsLoading] = React.useState(false);
  const [topicsError, setTopicsError] = React.useState<string | null>(null);

  const wrapperRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setIsContextHovered(false);
  }, [contextRef?.path]);

  // Reset Escape dismissal whenever user modifies text
  React.useEffect(() => {
    if (dismissedInput !== null && input !== dismissedInput) {
      setDismissedInput(null);
    }
  }, [input, dismissedInput]);

  // When mobile keyboard dismisses (e.g. Back button pressed), blur textarea to drop active cursor
  const prevKeyboardOpenRef = React.useRef(isKeyboardOpen);
  React.useEffect(() => {
    if (
      prevKeyboardOpenRef.current &&
      !isKeyboardOpen &&
      input.trim().length === 0
    ) {
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

  const parsedSlash = React.useMemo(() => parseSlashInput(input), [input]);
  const slashMode: "none" | "commands" | SlashSubPickerKind =
    dismissedInput === input
      ? "none"
      : manualSlashMode !== "none"
        ? manualSlashMode
        : parsedSlash.mode;

  const visibleCommands = React.useMemo(
    () => getVisibleSlashCommands({ canWrite, hasWebMcp }),
    [canWrite, hasWebMcp]
  );
  const filteredCommands = React.useMemo(
    () =>
      parsedSlash.mode === "commands"
        ? filterSlashCommands(visibleCommands, parsedSlash.query)
        : visibleCommands,
    [visibleCommands, parsedSlash]
  );
  const topicQuery = parsedSlash.mode === "quiz-topic" ? parsedSlash.query : "";

  const fetchTopicsForQuiz = React.useCallback(async () => {
    if (!loadTopics) return;
    setTopicsLoading(true);
    setTopicsError(null);
    try {
      const list = await loadTopics();
      setTopics(list);
      setTopicsLoaded(true);
    } catch {
      setTopicsError("Chưa tải được danh sách Topic.");
    } finally {
      setTopicsLoading(false);
    }
  }, [loadTopics]);

  React.useEffect(() => {
    if (slashMode === "quiz-topic" && !topicsLoaded && !topicsLoading && loadTopics) {
      void fetchTopicsForQuiz();
    }
  }, [slashMode, topicsLoaded, topicsLoading, loadTopics, fetchTopicsForQuiz]);

  const sortedTopicsForNav = React.useMemo(() => {
    const q = topicQuery.trim().toLowerCase();
    const filtered = q
      ? topics.filter(
          (t) =>
            t.title.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q)
        )
      : topics;
    return [...filtered].sort((a, b) => {
      const aCur = currentTopicSlug && a.slug === currentTopicSlug ? 0 : 1;
      const bCur = currentTopicSlug && b.slug === currentTopicSlug ? 0 : 1;
      return aCur - bCur;
    });
  }, [topics, topicQuery, currentTopicSlug]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [slashMode, topicQuery, filteredCommands.length]);

  const closeAllOverlays = React.useCallback(() => {
    setIsAddMenuOpen(false);
    setManualSlashMode("none");
    if (parsedSlash.mode !== "none") {
      setDismissedInput(input);
    }
  }, [parsedSlash.mode, input]);

  // Close overlays on outside click or Escape (capture-phase Escape avoids closing widget drawer)
  React.useEffect(() => {
    const isAnyOverlayOpen = isAddMenuOpen || slashMode !== "none";
    if (!isAnyOverlayOpen) return;

    const handleDocPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (wrapperRef.current && target && !wrapperRef.current.contains(target)) {
        closeAllOverlays();
      }
    };
    const handleDocKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeAllOverlays();
      }
    };
    document.addEventListener("mousedown", handleDocPointerDown);
    document.addEventListener("touchstart", handleDocPointerDown, { passive: true });
    document.addEventListener("keydown", handleDocKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handleDocPointerDown);
      document.removeEventListener("touchstart", handleDocPointerDown);
      document.removeEventListener("keydown", handleDocKeyDown, true);
    };
  }, [isAddMenuOpen, slashMode, closeAllOverlays]);

  const focusInputAtEnd = React.useCallback(() => {
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange?.(len, len);
    });
  }, [inputRef]);

  const handleSelectActionsFromMenu = () => {
    setIsAddMenuOpen(false);
    setDismissedInput(null);
    if (!input.trim()) {
      setInput("/");
      setManualSlashMode("none");
    } else {
      setManualSlashMode("commands");
    }
    focusInputAtEnd();
  };

  const handleToggleGmailFromMenu = () => {
    setIsAddMenuOpen(false);
    onToggleGmailAttached?.();
    focusInputAtEnd();
  };

  const handleOpenGmailFromMenu = () => {
    setIsAddMenuOpen(false);
    onOpenGmailConfig?.();
  };

  const handleSelectCommand = (cmd: SlashCommandSpec) => {
    setIsAddMenuOpen(false);
    setDismissedInput(null);
    if (cmd.subPicker === "quiz-topic") {
      setInput("/quiz ");
      setManualSlashMode("quiz-topic");
      focusInputAtEnd();
      return;
    }
    if (cmd.subPicker === "status-filter") {
      setInput("/status ");
      setManualSlashMode("status-filter");
      focusInputAtEnd();
      return;
    }
    setManualSlashMode("none");
    if (cmd.immediate) {
      handleSend(cmd.name);
      return;
    }
    if (cmd.name === "/gmail" && canWrite && gmailStatus?.connected && !isGmailAttached) {
      onToggleGmailAttached?.();
    }
    setInput(cmd.insertText ?? `${cmd.name} `);
    focusInputAtEnd();
  };

  const handleSelectQuizTopic = (topic: RoadmapSummaryItem) => {
    setManualSlashMode("none");
    setDismissedInput(null);
    handleSend(`/quiz ${topic.title}`);
  };

  const handleSelectStatusFilter = (option: StatusFilterOption) => {
    setManualSlashMode("none");
    setDismissedInput(null);
    handleSend(option.prompt);
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) {
      handleKeyDown(e);
      return;
    }
    if (slashMode !== "none") {
      const optionCount =
        slashMode === "commands"
          ? filteredCommands.length
          : slashMode === "quiz-topic"
            ? sortedTopicsForNav.length
            : STATUS_FILTER_OPTIONS.length;

      if (e.key === "ArrowDown" && optionCount > 0) {
        e.preventDefault();
        setActiveIndex((idx) => (idx + 1) % optionCount);
        return;
      }
      if (e.key === "ArrowUp" && optionCount > 0) {
        e.preventDefault();
        setActiveIndex((idx) => (idx - 1 + optionCount) % optionCount);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        if (slashMode === "commands" && filteredCommands[activeIndex]) {
          e.preventDefault();
          handleSelectCommand(filteredCommands[activeIndex]);
          return;
        }
        if (slashMode === "quiz-topic" && sortedTopicsForNav[activeIndex]) {
          e.preventDefault();
          handleSelectQuizTopic(sortedTopicsForNav[activeIndex]);
          return;
        }
        if (slashMode === "status-filter" && STATUS_FILTER_OPTIONS[activeIndex]) {
          e.preventDefault();
          handleSelectStatusFilter(STATUS_FILTER_OPTIONS[activeIndex]);
          return;
        }
      }
    }
    handleKeyDown(e);
  };

  return (
    <div
      ref={wrapperRef}
      className={`relative shrink-0 bg-[#FFFFFF] px-3 pt-0 transition-[padding-bottom] duration-200 ease-out motion-reduce:transition-none before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-3 before:bg-gradient-to-t before:from-[#FFFFFF] before:to-transparent ${
        isKeyboardOpen ? "pb-2" : "pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      }`}
    >
      <div className="relative h-0">
        {isAddMenuOpen && (
          <AddContextMenu
            canWrite={canWrite}
            gmailStatus={gmailStatus}
            isGmailAttached={isGmailAttached}
            onSelectActions={handleSelectActionsFromMenu}
            onToggleGmail={handleToggleGmailFromMenu}
            onOpenGmailConfig={handleOpenGmailFromMenu}
          />
        )}

        {slashMode !== "none" && !isAddMenuOpen && (
          <SlashCommandPopover
            mode={slashMode}
            commands={filteredCommands}
            topics={topics}
            topicsLoading={topicsLoading}
            topicsError={topicsError}
            topicQuery={topicQuery}
            currentTopicSlug={currentTopicSlug}
            activeIndex={activeIndex}
            onHoverIndex={setActiveIndex}
            onSelectCommand={handleSelectCommand}
            onSelectQuizTopic={handleSelectQuizTopic}
            onSelectStatusFilter={handleSelectStatusFilter}
            onBackToCommands={() => {
              setInput("/");
              setManualSlashMode("commands");
              focusInputAtEnd();
            }}
            onRetryTopics={() => void fetchTopicsForQuiz()}
          />
        )}
      </div>

      {/* Unified 2-row composer card on both mobile & desktop */}
        <div
          onClick={() => inputRef.current?.focus()}
          data-testid="composer-card"
          className={`group relative flex min-h-[48px] cursor-text flex-col items-stretch gap-1 rounded-[20px] border bg-[#FFFFFF] p-2 shadow-[0_1px_3px_rgb(0_0_0_/_0.04),0_6px_20px_rgb(0_0_0_/_0.06)] transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none focus-within:border-[#D6D3CC] focus-within:shadow-[0_2px_6px_rgb(0_0_0_/_0.06),0_8px_24px_rgb(0_0_0_/_0.10)] ${
            isLoading ? "border-[#D6D3CC]" : "border-[#E6E4DF]"
          }`}
        >
          {/* Text Input Area (card.children[0]) */}
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            maxLength={MAX_INPUT_LENGTH}
            aria-label={isLoading ? "Nhập câu hỏi tiếp theo cho Abot" : "Hỏi Abot"}
            onChange={(e) => {
              setManualSlashMode("none");
              setInput(e.target.value);
            }}
            onKeyDown={handleTextareaKeyDown}
            placeholder={isLoading ? "Abot đang trả lời…" : "Hỏi Abot…"}
            className={`w-full flex-none min-w-0 resize-none overflow-y-auto bg-transparent py-1.5 pl-2 pr-1 text-base leading-6 text-[#1F1E1C] outline-none [scrollbar-width:thin] disabled:opacity-50 md:text-sm md:leading-6 ${
              showAnsweringOverlay ? "placeholder:text-transparent" : "placeholder:text-[#75716A]"
            }`}
          />

          {/* Bottom Toolbar (card.children[1]): + Add Context & active chips (left), counter & Send/Stop (right) */}
          <div
            data-testid="composer-toolbar"
            className="flex w-full shrink-0 items-center justify-between gap-2 pl-0.5"
          >
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <button
                type="button"
                data-testid="composer-add-context-btn"
                aria-label="Thêm ngữ cảnh"
                aria-expanded={isAddMenuOpen}
                aria-haspopup="menu"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAddMenuOpen((open) => {
                    const next = !open;
                    if (next) onOpenAddMenu?.();
                    return next;
                  });
                }}
                className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${
                  isAddMenuOpen
                    ? "bg-[#ECEAE5] text-[#1F1E1C]"
                    : "text-[#5E5B55] hover:bg-[#F4F3F0] hover:text-[#1F1E1C]"
                }`}
              >
                <PlusIcon className="h-4 w-4" />
              </button>

              {canWrite && isGmailAttached && (
                <span
                  data-testid="composer-gmail-chip"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex h-7 max-w-[8.5rem] shrink-0 items-center gap-1 rounded-full border border-[#D7E6DC] bg-[#F1F8F4] pl-2 pr-1 text-xs font-medium text-[#2F6846]"
                >
                  <button
                    type="button"
                    onClick={() => onOpenGmailConfig?.()}
                    title={
                      gmailStatus?.accountEmail
                        ? `Gmail: ${gmailStatus.accountEmail}`
                        : "Cấu hình Gmail"
                    }
                    className="flex min-w-0 cursor-pointer items-center gap-1 text-left"
                  >
                    <MailIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate">Gmail</span>
                  </button>
                  <button
                    type="button"
                    aria-label="Bỏ ngữ cảnh Gmail"
                    onClick={() => onToggleGmailAttached?.()}
                    className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-[#D7E6DC]"
                  >
                    <CloseIcon className="h-3 w-3" />
                  </button>
                </span>
              )}

              {contextRef && (
                <div
                  data-testid="composer-context-ref"
                  data-context-kind={contextRef.kind}
                  data-context-path={contextRef.path}
                  aria-label={contextRef.tooltip}
                  title={!isTwoLevelContext ? contextRef.tooltip : undefined}
                  onMouseEnter={() => isTwoLevelContext && setIsContextHovered(true)}
                  onMouseLeave={() => setIsContextHovered(false)}
                  onClick={(e) => e.stopPropagation()}
                  className="relative inline-flex min-w-0 max-w-[9.5rem] cursor-default items-center gap-1.5 rounded-full border border-[#E6E4DF] bg-[#F4F3F0] px-2.5 py-1 text-xs text-[#4D4B46] transition-colors hover:border-[#D6D3CC] hover:bg-[#ECEAE5] sm:max-w-[13.5rem]"
                >
                  {isTwoLevelContext ? (
                    <FileTextIcon className="h-3.5 w-3.5 shrink-0 text-[#C2410C]" />
                  ) : (
                    <BookOpenIcon className="h-3.5 w-3.5 shrink-0 text-[#C2410C]" />
                  )}
                  <span className="min-w-0 truncate font-medium text-[#1F1E1C]">
                    {contextRef.label}
                  </span>

                  {isTwoLevelContext && isContextHovered && (
                    <div
                      role="tooltip"
                      data-testid="composer-context-popover"
                      className="absolute bottom-full left-0 z-30 w-max max-w-[min(21rem,calc(100vw-3rem))] pb-1.5 animate-in fade-in slide-in-from-bottom-1 duration-150 motion-reduce:animate-none"
                    >
                      <div className="rounded-xl border border-[#E6E4DF] bg-[#FFFFFF] px-2.5 py-2 text-left shadow-[0_8px_24px_-4px_rgba(31,30,28,0.12),0_2px_6px_-1px_rgba(31,30,28,0.06)]">
                        {(contextRef.topicLabel || contextRef.section) && (
                          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-[#5E5B55]">
                            <BookOpenIcon className="h-3 w-3 shrink-0 text-[#C2410C]" />
                            <span className="truncate">
                              {[contextRef.topicLabel, contextRef.section]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </div>
                        )}
                        <div className="break-all font-mono text-[11px] leading-relaxed text-[#1F1E1C]">
                          {contextRef.path}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {input.length >= COUNTER_THRESHOLD && (
                <span
                  className={`shrink-0 select-none text-xs tabular-nums ${
                    input.length >= MAX_INPUT_LENGTH ? "text-[#B42318]" : "text-[#5E5B55]"
                  }`}
                >
                  {input.length.toLocaleString("vi-VN")}/
                  {MAX_INPUT_LENGTH.toLocaleString("vi-VN")}
                </span>
              )}
              {showStop ? (
                <button
                  type="button"
                  onClick={stopStreaming}
                  title="Dừng phản hồi"
                  aria-label="Dừng phản hồi"
                  onMouseDown={(e) => e.preventDefault()}
                  className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#1F1E1C] text-white ring-2 ring-[#1F1E1C]/15 transition-[opacity,transform,box-shadow] hover:opacity-85 active:scale-95"
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

          {/* Animated answering indicator overlaid on the textarea's first line while input is empty */}
          {showAnsweringOverlay && (
            <div
              data-testid="composer-answering-indicator"
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-3.5 right-4 flex items-center gap-2 select-none text-base leading-6 text-[#5E5B55] animate-in fade-in duration-150 motion-reduce:animate-none md:text-sm md:leading-6"
            >
              <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[#C2410C]/45 animate-ping motion-reduce:hidden" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#C2410C]" />
              </span>
              <span className="inline-flex min-w-0 items-baseline gap-1">
                <span className={`truncate font-medium ${ANSWERING_SHIMMER_CLASS}`}>
                  Abot đang trả lời
                </span>
                <span className="inline-flex items-center gap-[3px] pt-1">
                  {ANSWERING_DOT_DELAYS.map((delay) => (
                    <span
                      key={delay}
                      className="h-[3px] w-[3px] rounded-full bg-[#5E5B55] animate-dot-wave motion-reduce:animate-none"
                      style={{ animationDelay: delay }}
                    />
                  ))}
                </span>
              </span>
            </div>
          )}
      </div>
    </div>
  );
}
