import React from "react";
import {
  ArrowDownIcon,
  CheckCircleIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "../icons";
import { ChatMarkdown, markdownToPlainText } from "../ChatMarkdown";
import { LayerChoicePicker } from "../LayerChoicePicker";
import { CollapsibleStepsSummary, StepItem } from "../ToolStepRow";
import {
  formatTime,
  formatStepsDigest,
  formatToolDisplayName,
  toStepItems,
} from "../utils/formatters";
import { PulsatingDots } from "./PulsatingDots";
import { ChangeReviewCard } from "./ChangeReviewCard";
import { AbotMascot, type MascotState } from "./AbotMascot";
import { findExecutedPromptTargets } from "../utils/snippets";
import { WELCOME_MESSAGE_ID } from "../welcome";
import type { ChatMessage } from "../types";

export interface MessageListProps {
  activityState?: MascotState;
  title?: string;
  heroMascotRef?: React.RefObject<HTMLDivElement | null>;
  heroTextRef?: React.RefObject<HTMLDivElement | null>;
  heroChipsRef?: React.RefObject<HTMLDivElement | null>;
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  runningCode: string | null;
  expandedTools: Record<string, boolean>;
  feedback: Record<string, 1 | 0 | null>;
  copiedId: string | null;
  /** Owner only: each traced reply gets a button that copies its Langfuse trace id */
  canWrite?: boolean;
  /** The 👍/👎 votes; off when the host takes no feedback */
  showFeedback?: boolean;
  sendMessage: (
    textToSend?: string,
    options?: { titles?: string[]; target?: { topic?: string; section?: string } }
  ) => void;
  retry: (errorMessageId: string) => void;
  copyMessage: (id: string, text: string) => void;
  handleFeedback: (msgId: string, val: 1 | 0) => void;
  handleRunCode: (code: string) => void;
  toggleToolExpand: (id: string) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  contentRef?: React.RefObject<HTMLDivElement | null>;
  bottomSentinelRef: React.RefObject<HTMLDivElement | null>;
  autoFollowRef?: React.RefObject<boolean>;
  scrollToBottom: () => void;
  /** Called before programmatic scroll away from the bottom so auto-follow disengages */
  onBeforeJump?: () => void;
}

/**
 * Scroll-to-bottom button. It owns its visibility, so the sentinel observer re-renders only
 * this button, not the whole message list (a list re-render on arrival is what made the scroll
 * stutter at the end). While a reply is still generating, the arrow becomes pulsing dots.
 */
function ScrollBottomButton({
  scrollRef,
  bottomSentinelRef,
  autoFollowRef,
  isLoading,
  scrollToBottom,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  bottomSentinelRef: React.RefObject<HTMLDivElement | null>;
  autoFollowRef?: React.RefObject<boolean>;
  isLoading: boolean;
  scrollToBottom: () => void;
}) {
  const [visible, setVisible] = React.useState(false);
  const sentinelOutRef = React.useRef(false);

  React.useEffect(() => {
    const root = scrollRef.current;
    const sentinel = bottomSentinelRef.current;
    if (!root || !sentinel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const isOut = !entry.isIntersecting;
        sentinelOutRef.current = isOut;
        if (!isOut || root.dataset.subCeiling === "true") {
          setVisible(false);
        } else if (!autoFollowRef?.current) {
          setVisible(true);
        }
      },
      { root, rootMargin: "0px 0px 24px 0px" }
    );
    observer.observe(sentinel);

    const handleScroll = () => {
      if (
        sentinelOutRef.current &&
        !autoFollowRef?.current &&
        root.dataset.subCeiling !== "true"
      ) {
        setVisible(true);
      }
    };
    const handleWheel = (e: WheelEvent) => {
      if (
        e.deltaY < 0 &&
        sentinelOutRef.current &&
        root.dataset.subCeiling !== "true"
      ) {
        setVisible(true);
      }
    };

    root.addEventListener("scroll", handleScroll, { passive: true });
    root.addEventListener("wheel", handleWheel, { passive: true });

    return () => {
      observer.disconnect();
      root.removeEventListener("scroll", handleScroll);
      root.removeEventListener("wheel", handleWheel);
    };
  }, [scrollRef, bottomSentinelRef, autoFollowRef]);

  return (
    <button
      type="button"
      onClick={() => {
        setVisible(false);
        scrollToBottom();
      }}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      aria-label={
        isLoading ? "Đang trả lời — cuộn xuống để xem" : "Cuộn xuống cuối"
      }
      className={`absolute bottom-2 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border border-[#E6E4DF] bg-[#FFFFFF] text-[#1F1E1C] shadow-[0_2px_8px_rgb(0_0_0_/_0.08)] transition-[opacity,transform,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none hover:bg-[#F4F3F0] active:scale-95 ${
        visible
          ? "translate-y-0 scale-100 opacity-100"
          : "pointer-events-none translate-y-2 scale-90 opacity-0"
      }`}
    >
      {isLoading ? (
        <PulsatingDots className="h-2.5 w-5 text-[#C2410C]" />
      ) : (
        <ArrowDownIcon className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

/**
 * Confirm / cancel buttons of a Preview. A Preview may carry editable names (`editableTitles`) and target
 * (`editableTarget`) as inputs so the Owner can correct them manually before confirming.
 */
function ConfirmActions({
  editableTitles,
  editableTarget,
  disabled,
  sendMessage,
}: {
  editableTitles?: string[];
  editableTarget?: { topic?: string; section?: string };
  disabled: boolean;
  sendMessage: MessageListProps["sendMessage"];
}) {
  const [draft, setDraft] = React.useState<string[]>(editableTitles ?? []);
  const [topicDraft, setTopicDraft] = React.useState<string>(editableTarget?.topic ?? "");
  const [sectionDraft, setSectionDraft] = React.useState<string>(editableTarget?.section ?? "");
  const editable = draft.length > 0;
  const showTopicInput = editableTarget?.topic !== undefined;
  const showSectionInput = editableTarget?.section !== undefined;
  const showFieldLabels = showTopicInput || showSectionInput;
  const hasBlank =
    draft.some((title) => !title.trim()) || (showTopicInput && !topicDraft.trim());
  const confirm = () => {
    if (disabled || hasBlank) return;
    const titlesChanged = editable && draft.some((title, i) => title.trim() !== editableTitles?.[i]);
    const topicChanged = showTopicInput && topicDraft.trim() !== editableTarget?.topic;
    const sectionChanged = showSectionInput && sectionDraft.trim() !== (editableTarget?.section ?? "");
    const payload: { titles?: string[]; target?: { topic?: string; section?: string } } = {};
    if (titlesChanged) {
      payload.titles = draft.map((title) => title.trim());
    }
    if (topicChanged || sectionChanged) {
      payload.target = {
        ...(topicChanged ? { topic: topicDraft.trim() } : {}),
        ...(sectionChanged ? { section: sectionDraft.trim() } : {}),
      };
    }
    sendMessage("ok", Object.keys(payload).length > 0 ? payload : undefined);
  };

  return (
    <>
      {editable && (
        <div className="flex flex-col gap-1.5">
          {showFieldLabels && (
            <span className="text-[11px] font-medium text-[#5E5B55]">
              {draft.length > 1 ? "Tên các mục/bài" : "Tên"}
            </span>
          )}
          {draft.map((title, i) => (
            <input
              key={i}
              type="text"
              value={title}
              maxLength={200}
              disabled={disabled}
              aria-label={draft.length > 1 ? `Tên ${i + 1}` : "Tên"}
              onChange={(e) => setDraft((prev) => prev.map((t, j) => (j === i ? e.target.value : t)))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirm();
                }
              }}
              className="w-full rounded-lg border border-[#E6E4DF] bg-white px-3 py-1.5 text-sm text-[#1F1E1C] outline-none focus:border-[#C2410C] disabled:opacity-50"
            />
          ))}
        </div>
      )}
      {showFieldLabels && (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {showTopicInput && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[#5E5B55]">Topic đích</span>
              <input
                type="text"
                value={topicDraft}
                maxLength={200}
                disabled={disabled}
                aria-label="Topic đích"
                placeholder="Topic đích"
                onChange={(e) => setTopicDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    confirm();
                  }
                }}
                className="w-full rounded-lg border border-[#E6E4DF] bg-white px-3 py-1.5 text-sm text-[#1F1E1C] outline-none focus:border-[#C2410C] disabled:opacity-50"
              />
            </label>
          )}
          {showSectionInput && (
            <label className={`flex flex-col gap-1 ${showTopicInput ? "" : "sm:col-span-2"}`}>
              <span className="text-[11px] font-medium text-[#5E5B55]">Mục đích</span>
              <input
                type="text"
                value={sectionDraft}
                maxLength={200}
                disabled={disabled}
                aria-label="Mục đích"
                placeholder="Mục đích (để trống = Chung)"
                onChange={(e) => setSectionDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    confirm();
                  }
                }}
                className="w-full rounded-lg border border-[#E6E4DF] bg-white px-3 py-1.5 text-sm text-[#1F1E1C] outline-none focus:border-[#C2410C] disabled:opacity-50"
              />
            </label>
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={disabled || hasBlank}
          className="flex items-center gap-1.5 rounded-lg bg-[#C2410C] px-3.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          <CheckCircleIcon className="h-3.5 w-3.5" />
          <span>Xác nhận thực hiện</span>
        </button>
        <button
          type="button"
          onClick={() => sendMessage("hủy")}
          disabled={disabled}
          className="flex items-center gap-1.5 rounded-lg border border-[#E6E4DF] bg-[#F4F3F0] px-3.5 py-1.5 text-xs font-medium text-[#1F1E1C] transition-colors hover:bg-[#ECEAE5] disabled:opacity-50 cursor-pointer"
        >
          <CloseIcon className="h-3.5 w-3.5" />
          <span>Hủy bỏ</span>
        </button>
      </div>
    </>
  );
}

type MessageHandlers = Pick<
  MessageListProps,
  | "sendMessage"
  | "retry"
  | "copyMessage"
  | "handleFeedback"
  | "handleRunCode"
  | "toggleToolExpand"
> & {
  jumpToMessage: (messageId: string) => void;
};

interface MessageItemProps
  extends Pick<
    MessageListProps,
    "isLoading" | "isStreaming" | "runningCode" | "expandedTools" | "feedback" | "copiedId" | "canWrite" | "showFeedback"
  > {
  msg: ChatMessage;
  isLast: boolean;
  isHighlighted?: boolean;
  executedPrompts?: Record<string, string>;
  handlers: MessageHandlers;
}

function areStringRecordsEqual(
  a?: Record<string, string>,
  b?: Record<string, string>
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function areMessageItemPropsEqual(
  prev: MessageItemProps,
  next: MessageItemProps
): boolean {
  return (
    prev.msg === next.msg &&
    prev.isLast === next.isLast &&
    prev.isLoading === next.isLoading &&
    prev.isStreaming === next.isStreaming &&
    prev.runningCode === next.runningCode &&
    prev.expandedTools === next.expandedTools &&
    prev.feedback === next.feedback &&
    prev.copiedId === next.copiedId &&
    prev.canWrite === next.canWrite &&
    prev.showFeedback === next.showFeedback &&
    prev.isHighlighted === next.isHighlighted &&
    prev.handlers === next.handlers &&
    areStringRecordsEqual(prev.executedPrompts, next.executedPrompts)
  );
}

/**
 * One message. Memoized: while a reply streams only the live message changes, so the others
 * skip re-rendering (and re-parsing their markdown) on every streamed frame.
 */
const MessageItem = React.memo(function MessageItem({
  msg,
  isLast,
  isLoading,
  isStreaming,
  runningCode,
  expandedTools,
  feedback,
  copiedId,
  canWrite,
  showFeedback,
  isHighlighted = false,
  executedPrompts,
  handlers,
}: MessageItemProps) {
  const {
    sendMessage,
    retry,
    copyMessage,
    handleFeedback,
    handleRunCode,
    toggleToolExpand,
    jumpToMessage,
  } = handlers;

  const isUser = msg.role === "user";
  const timeStr = formatTime(msg.timestamp);
  const isLive = !isUser && isStreaming && isLast;
  const toolCalls = msg.toolCalls ?? [];

  if (isUser) {
    return (
      <div
        key={msg.id}
        data-message-id={msg.id}
        className="group flex flex-col items-end gap-1"
      >
        <div
          className={`relative max-w-[88%] md:max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3.5 py-2.5 text-base md:text-sm leading-relaxed text-[#1F1E1C] transition-[background-color,box-shadow] duration-300 ${
            isHighlighted
              ? "bg-[#E6F1EA] ring-2 ring-[#3F7D58]/45"
              : "bg-[#F4F3F0]"
          }`}
        >
          {msg.content}
        </div>
        <div className="flex items-center gap-1.5 pr-1 text-xs text-[#5E5B55]">
          {timeStr && (
            <span className="select-none text-xs">{timeStr}</span>
          )}
          <button
            type="button"
            onClick={() => copyMessage(msg.id, msg.content)}
            title="Sao chép câu hỏi"
            aria-label="Sao chép câu hỏi"
            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer"
          >
            {copiedId === msg.id ? (
              <CheckIcon className="h-3.5 w-3.5 text-[#3F7D58]" />
            ) : (
              <CopyIcon className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    );
  }

  const awaitingConfirm =
    !isStreaming &&
    isLast &&
    (msg.content.includes("Xác nhận thực hiện") ||
      msg.content.includes("DRY-RUN PREVIEW"));

  const awaitingLayerChoice =
    !isStreaming &&
    isLast &&
    msg.content.includes("Chọn layer cho bài học");

  // Step events from the server when it sends them; tool calls for older servers.
  const stepItems: StepItem[] = msg.steps?.length
    ? toStepItems(msg.id, msg.steps, isLive)
    : toolCalls.map((tc, idx) => ({
        id: `${msg.id}-${idx}`,
        label: formatToolDisplayName(tc.name),
        startedAt: tc.startedAt,
        endedAt: tc.endedAt,
        running: isLive && tc.endedAt === undefined,
        detail: tc.result,
      }));

  const stepsDigest = msg.steps?.length
    ? formatStepsDigest(msg.steps)
    : [...new Set(toolCalls.map((tc) => formatToolDisplayName(tc.name)))].join(", ") || undefined;

  // Waiting for the model, or a streamed answer; a static greeting has no thinking to show.
  // Gaps between steps are not rows: the header shows "Đang suy nghĩ…" on its own.
  const showSteps = stepItems.length > 0 || (isLive && !msg.content) || !!msg.firstTokenAt;

  return (
    <div key={msg.id} className="group flex flex-col gap-2">
      {/* Step summary (Thinking & Tools), placed at top of response like Claude */}
      {showSteps && (
        <div className="-mx-1">
          <CollapsibleStepsSummary
            steps={stepItems}
            expandedTools={expandedTools}
            onToggleTool={toggleToolExpand}
            isLive={isLive}
            startedAt={new Date(msg.timestamp).getTime()}
            firstTokenAt={msg.firstTokenAt}
            digest={stepsDigest}
          />
        </div>
      )}

      {/* Main answer content rendered directly on canvas */}
      {msg.content && (
        <div className="text-base md:text-sm leading-relaxed text-[#1F1E1C]">
          {/* Last block's bottom margin is dropped so the action bar sits close, like the user's */}
          <ChatMarkdown
            content={msg.content}
            streaming={isLive}
            onRun={handleRunCode}
            runningCode={isLoading ? runningCode : null}
            isBusy={isLoading}
            executedPrompts={executedPrompts}
            onJumpToMessage={jumpToMessage}
            citations={isLive ? undefined : msg.citations}
            sources={isLive ? undefined : msg.sources}
            className="[&>:last-child]:!mb-0"
          />
        </div>
      )}

      {/* Data the reply's actions wrote: summary, expands to the rows created and deleted */}
      {!!msg.changes?.length && <ChangeReviewCard changes={msg.changes} />}

      {/* Suggested follow-ups as chips; the full prompt is sent on tap */}
      {!!msg.suggestions?.length && !isLive && (
        <div className="flex flex-wrap gap-2 pt-0.5">
          {msg.suggestions.map((s) => (
            <button
              key={s.prompt}
              type="button"
              onClick={() => sendMessage(s.prompt)}
              disabled={isLoading}
              title={s.prompt}
              className="rounded-full border border-[#E6E4DF] bg-white px-3 py-1.5 text-xs font-medium text-[#1F1E1C] transition-colors hover:border-[#D6D3CC] hover:bg-[#F4F3F0] disabled:opacity-50 cursor-pointer"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* A failed reply can be sent again: the question is re-asked as it was */}
      {msg.status === "error" && !isLive && (
        <div className="pt-0.5">
          <button
            type="button"
            onClick={() => retry(msg.id)}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-lg border border-[#E6E4DF] bg-[#F4F3F0] px-3 py-1.5 text-xs font-medium text-[#1F1E1C] transition-colors hover:bg-[#ECEAE5] disabled:opacity-50 cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Finished with no text (empty reply or stopped before the first token) */}
      {!msg.content && !isLive && (
        <p className="py-0.5 text-sm italic text-[#5E5B55]">
          Mình chưa có câu trả lời cho câu này. Bạn nói rõ hơn giúp mình
          nhé.
        </p>
      )}

      {/* Shown after the user pressed stop, so a partial reply doesn't look finished */}
      {msg.stopped && (
        <p className="text-xs italic text-[#5E5B55]">Đã dừng</p>
      )}

      {/* Confirmation for destructive actions (dry-run preview) */}
      {awaitingConfirm && (
        <div className="flex flex-col gap-2 pt-1">
          <p className="text-xs text-[#5E5B55]">
            Đang chờ bạn xác nhận
          </p>
          <ConfirmActions
            editableTitles={canWrite ? msg.editableTitles : undefined}
            editableTarget={canWrite ? msg.editableTarget : undefined}
            disabled={isLoading}
            sendMessage={sendMessage}
          />
        </div>
      )}

      {awaitingLayerChoice && (
        <LayerChoicePicker onSend={sendMessage} disabled={isLoading} />
      )}

      {/* Actions bar (Time and action buttons grouped on the right) */}
      {msg.content && (
        <div
          className={`-mt-1 flex items-center justify-end gap-1 text-xs text-[#5E5B55] transition-opacity duration-200 ${isLive ? "invisible opacity-0" : "opacity-100"}`}
        >
          {timeStr && (
            <span className="select-none text-xs pr-1">
              {timeStr}
            </span>
          )}
          <button
            type="button"
            onClick={() => copyMessage(msg.id, markdownToPlainText(msg.content))}
            title="Sao chép"
            aria-label="Sao chép câu trả lời"
            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer"
          >
            {copiedId === msg.id ? (
              <CheckIcon className="h-3.5 w-3.5 text-[#3F7D58]" />
            ) : (
              <CopyIcon className="h-3.5 w-3.5" />
            )}
          </button>
          {/* Only a traced reply can be rated: the vote is a score on its trace. Leaves out the
              greeting, stopped or failed replies, and every reply when tracing is off */}
          {msg.traceId && (
            <>
              {/* The trace holds the query, page context, routing steps and reply: paste the id in Langfuse */}
              {canWrite && (
                <button
                  type="button"
                  onClick={() => copyMessage(`${msg.id}:trace`, msg.traceId ?? "")}
                  title={`Sao chép trace ID: ${msg.traceId}`}
                  aria-label="Sao chép trace ID của câu trả lời"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-semibold leading-none transition-colors hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer"
                >
                  {copiedId === `${msg.id}:trace` ? (
                    <CheckIcon className="h-3.5 w-3.5 text-[#3F7D58]" />
                  ) : (
                    "ID"
                  )}
                </button>
              )}
              {showFeedback && (
              <>
              <button
                type="button"
                onClick={() => handleFeedback(msg.id, 1)}
                title="Hữu ích"
                aria-label="Câu trả lời hữu ích"
                aria-pressed={feedback[msg.id] === 1}
                className={`flex h-7 w-7 items-center justify-center rounded-md transition-[color,background-color] duration-200 ease-out hover:bg-[#F4F3F0] cursor-pointer ${
                  feedback[msg.id] === 1
                    ? "text-[#3F7D58] bg-[#E6F1EA]"
                    : "text-[#5E5B55] hover:text-[#1F1E1C]"
                }`}
              >
                <ThumbsUpIcon
                  className={`h-3.5 w-3.5 transition-[fill] duration-200 ease-out ${feedback[msg.id] === 1 ? "fill-current" : "fill-transparent"}`}
                />
              </button>
              <button
                type="button"
                onClick={() => handleFeedback(msg.id, 0)}
                title="Chưa tốt"
                aria-label="Câu trả lời chưa tốt"
                aria-pressed={feedback[msg.id] === 0}
                className={`flex h-7 w-7 items-center justify-center rounded-md transition-[color,background-color] duration-200 ease-out hover:bg-[#F4F3F0] cursor-pointer ${
                  feedback[msg.id] === 0
                    ? "text-[#B42318] bg-[#FBEDE5]"
                    : "text-[#5E5B55] hover:text-[#1F1E1C]"
                }`}
              >
                <ThumbsDownIcon
                  className={`h-3.5 w-3.5 transition-[fill] duration-200 ease-out ${feedback[msg.id] === 0 ? "fill-current" : "fill-transparent"}`}
                />
              </button>
              </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}, areMessageItemPropsEqual);

export function MessageList({
  activityState = "idle",
  title = "Abot",
  heroMascotRef,
  heroTextRef,
  heroChipsRef,
  messages,
  isLoading,
  isStreaming,
  runningCode,
  expandedTools,
  feedback,
  copiedId,
  canWrite = false,
  showFeedback = true,
  sendMessage,
  retry,
  copyMessage,
  handleFeedback,
  handleRunCode,
  toggleToolExpand,
  scrollRef,
  contentRef,
  bottomSentinelRef,
  autoFollowRef,
  scrollToBottom,
  onBeforeJump,
}: MessageListProps) {
  const showWelcomeStage =
    messages.length === 1 && messages[0]?.id === WELCOME_MESSAGE_ID;
  const visibleMessages = React.useMemo(
    () =>
      showWelcomeStage
        ? []
        : messages.filter((m) => m.id !== WELCOME_MESSAGE_ID),
    [messages, showWelcomeStage]
  );

  const executedTargetsByMsg = React.useMemo(
    () => findExecutedPromptTargets(visibleMessages),
    [visibleMessages]
  );

  const [highlightedId, setHighlightedId] = React.useState<string | null>(null);
  const highlightTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  React.useEffect(() => {
    return () => {
      if (highlightTimerRef.current !== null) {
        clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  // The host recreates these on every render (`retry` changes with each streamed frame), which
  // would defeat MessageItem's memo. Stable wrappers call the latest ones instead.
  const latestHandlers = React.useRef<
    Omit<MessageHandlers, "jumpToMessage"> & { onBeforeJump?: () => void }
  >({
    sendMessage,
    retry,
    copyMessage,
    handleFeedback,
    handleRunCode,
    toggleToolExpand,
    onBeforeJump,
  });
  React.useLayoutEffect(() => {
    latestHandlers.current = {
      sendMessage,
      retry,
      copyMessage,
      handleFeedback,
      handleRunCode,
      toggleToolExpand,
      onBeforeJump,
    };
  });

  const jumpToMessage = React.useCallback(
    (messageId: string) => {
      latestHandlers.current.onBeforeJump?.();
      const container = scrollRef.current;
      if (container) {
        const target = Array.from(
          container.querySelectorAll<HTMLElement>("[data-message-id]")
        ).find((el) => el.dataset.messageId === messageId);
        if (target) {
          const containerRect = container.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          const top = Math.max(
            0,
            container.scrollTop + (targetRect.top - containerRect.top) - 16
          );
          const prefersReducedMotion =
            typeof window !== "undefined" &&
            window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
          if (typeof container.scrollTo === "function") {
            container.scrollTo({
              top,
              behavior: prefersReducedMotion ? "auto" : "smooth",
            });
          } else {
            container.scrollTop = top;
          }
        }
      }
      setHighlightedId(messageId);
      if (highlightTimerRef.current !== null) {
        clearTimeout(highlightTimerRef.current);
      }
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedId(null);
        highlightTimerRef.current = null;
      }, 1600);
    },
    [scrollRef]
  );

  const handlers = React.useMemo<MessageHandlers>(
    () => ({
      sendMessage: (text, options) => latestHandlers.current.sendMessage(text, options),
      retry: (id) => latestHandlers.current.retry(id),
      copyMessage: (id, text) => latestHandlers.current.copyMessage(id, text),
      handleFeedback: (id, val) => latestHandlers.current.handleFeedback(id, val),
      handleRunCode: (code) => latestHandlers.current.handleRunCode(code),
      toggleToolExpand: (id) => latestHandlers.current.toggleToolExpand(id),
      jumpToMessage,
    }),
    [jumpToMessage]
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        data-abot-scroll-root=""
        className={
          showWelcomeStage
            ? "flex flex-1 flex-col overflow-hidden px-4"
            : "flex-1 overflow-x-hidden overflow-y-auto px-4 overscroll-contain touch-pan-y [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:#E6E4DF_transparent] data-[sub-ceiling=true]:[scrollbar-color:transparent_transparent]"
        }
      >
        {showWelcomeStage ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center pb-4 text-center">
            <div
              ref={heroMascotRef}
              className="mb-3.5 flex items-center justify-center"
            >
              <AbotMascot
                size={116}
                state={activityState}
                showShadow
                enablePoke
              />
            </div>
            <div ref={heroTextRef} className="max-w-[300px]">
              <h3 className="text-[22px] font-semibold tracking-tight text-[#1F1E1C]">
                Xin chào, mình là {title}
              </h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-[#5E5B55]">
                Trợ lý quản trị lộ trình học tập và tra cứu kiến thức cá nhân.
              </p>
            </div>
            {!!messages[0]?.suggestions?.length && (
              <div
                ref={heroChipsRef}
                className="mt-5 flex flex-wrap justify-center gap-2"
              >
                {messages[0].suggestions.map((s) => (
                  <button
                    key={s.prompt}
                    type="button"
                    onClick={() => handlers.sendMessage(s.prompt)}
                    disabled={isLoading}
                    title={s.prompt}
                    className="rounded-full border border-[#E6E4DF] bg-white px-3.5 py-1.5 text-xs font-medium text-[#1F1E1C] transition-colors hover:border-[#D6D3CC] hover:bg-[#F4F3F0] disabled:opacity-50 cursor-pointer"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div ref={contentRef} className="space-y-6 pt-5 pb-2">
            {visibleMessages.map((msg, idx) => (
              <MessageItem
                key={msg.id}
                msg={msg}
                isLast={idx === visibleMessages.length - 1}
                isLoading={isLoading}
                isStreaming={isStreaming}
                runningCode={runningCode}
                expandedTools={expandedTools}
                feedback={feedback}
                copiedId={copiedId}
                canWrite={canWrite}
                showFeedback={showFeedback}
                isHighlighted={highlightedId === msg.id}
                executedPrompts={executedTargetsByMsg.get(msg.id)}
                handlers={handlers}
              />
            ))}
          </div>
        )}
        <div
          ref={bottomSentinelRef}
          aria-hidden="true"
          className="!mt-0 h-px"
        />
      </div>

      {!showWelcomeStage && (
        <ScrollBottomButton
          scrollRef={scrollRef}
          bottomSentinelRef={bottomSentinelRef}
          autoFollowRef={autoFollowRef}
          isLoading={isLoading}
          scrollToBottom={scrollToBottom}
        />
      )}
    </div>
  );
}
