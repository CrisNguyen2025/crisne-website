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
import { ChatMarkdown } from "../ChatMarkdown";
import { SourceChip, roadmapSourceLabel } from "./SourceChip";
import { LayerChoicePicker } from "../LayerChoicePicker";
import { CollapsibleStepsSummary, StepItem } from "../ToolStepRow";
import {
  formatTime,
  formatToolDisplayName,
  toStepItems,
} from "../utils/formatters";
import { WELCOME_MESSAGE_ID } from "../welcome";
import { PulsatingDots } from "./PulsatingDots";
import type { ChatMessage } from "../types";

export interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  runningCode: string | null;
  expandedTools: Record<string, boolean>;
  feedback: Record<string, 1 | 0>;
  copiedId: string | null;
  sendMessage: (textToSend?: string) => void;
  retry: (errorMessageId: string) => void;
  copyMessage: (id: string, text: string) => void;
  handleFeedback: (msgId: string, val: 1 | 0) => void;
  handleRunCode: (code: string) => void;
  toggleToolExpand: (id: string) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  bottomSentinelRef: React.RefObject<HTMLDivElement | null>;
  scrollToBottom: () => void;
}

/**
 * Scroll-to-bottom button. It owns its visibility, so the sentinel observer re-renders only
 * this button, not the whole message list (a list re-render on arrival is what made the scroll
 * stutter at the end). While a reply is still generating, the arrow becomes pulsing dots.
 */
function ScrollBottomButton({
  scrollRef,
  bottomSentinelRef,
  isLoading,
  scrollToBottom,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  bottomSentinelRef: React.RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  scrollToBottom: () => void;
}) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const root = scrollRef.current;
    const sentinel = bottomSentinelRef.current;
    if (!root || !sentinel || typeof IntersectionObserver === "undefined") return;
    // The sentinel sits above the list's bottom padding (py-5, 20px), so a -20px bottom margin
    // makes "visible" mean "scrolled to the very end": the button hides on arrival.
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { root, rootMargin: "0px 0px -20px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [scrollRef, bottomSentinelRef]);

  return (
    <button
      type="button"
      onClick={scrollToBottom}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      aria-label={
        isLoading ? "Đang trả lời — cuộn xuống để xem" : "Cuộn xuống cuối"
      }
      className={`absolute bottom-3 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border border-[#E6E4DF] bg-[#FFFFFF] text-[#1F1E1C] shadow-[0_2px_8px_rgb(0_0_0_/_0.08)] transition-[opacity,transform,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[#F4F3F0] active:scale-95 ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
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

export function MessageList({
  messages,
  isLoading,
  isStreaming,
  runningCode,
  expandedTools,
  feedback,
  copiedId,
  sendMessage,
  retry,
  copyMessage,
  handleFeedback,
  handleRunCode,
  toggleToolExpand,
  scrollRef,
  bottomSentinelRef,
  scrollToBottom,
}: MessageListProps) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className="flex-1 space-y-6 overflow-y-auto px-4 py-5 overscroll-contain touch-pan-y [scrollbar-color:#E6E4DF_transparent] [scrollbar-width:thin]"
      >
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const timeStr = formatTime(msg.timestamp);
          const isLast = msg.id === messages[messages.length - 1]?.id;
          const isLive = !isUser && isStreaming && isLast;
          const toolCalls = msg.toolCalls ?? [];
          const toolRunning = toolCalls.some(
            (tc) => tc.endedAt === undefined && isLive
          );
          // Waiting for the model after tools finished (or before any tool started).
          const showThinking = isLive && !msg.content && !toolRunning;
          const thinkingSince =
            toolCalls[toolCalls.length - 1]?.endedAt ??
            new Date(msg.timestamp).getTime();

          if (isUser) {
            return (
              <div key={msg.id} className="group flex flex-col items-end gap-1">
                <div className="relative max-w-[88%] md:max-w-[85%] whitespace-pre-wrap break-words rounded-xl bg-[#F4F3F0] px-3.5 py-2.5 text-sm leading-relaxed text-[#1F1E1C]">
                  {msg.content}
                </div>
                <div className="flex items-center gap-1.5 pr-1 text-xs text-[#6B6862]">
                  {timeStr && (
                    <span className="select-none text-[11px]">{timeStr}</span>
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

          // Between steps (e.g. the model extracting entities) nothing is running yet:
          // keep the header live instead of showing "Thought for" before the answer starts.
          if (
            msg.steps?.length &&
            isLive &&
            !msg.content &&
            !stepItems.some((s) => s.running)
          ) {
            const lastEnd = msg.steps[msg.steps.length - 1].endedAt;
            stepItems.push({
              id: `${msg.id}-thinking`,
              label: "Đang suy nghĩ…",
              startedAt: lastEnd ?? thinkingSince,
              running: true,
            });
          }

          if (!msg.steps?.length && toolCalls.length === 0) {
            if (showThinking) {
              stepItems.push({
                id: `${msg.id}-thinking`,
                label: "Đang suy nghĩ…",
                startedAt: thinkingSince,
                running: true,
              });
            } else if (msg.firstTokenAt && thinkingSince) {
              // Only streamed answers: a static greeting has no thinking to show
              stepItems.push({
                id: `${msg.id}-thinking`,
                label: "Đã suy nghĩ",
                startedAt: thinkingSince,
                endedAt: msg.firstTokenAt,
                running: false,
              });
            }
          }

          return (
            <div key={msg.id} className="group flex flex-col gap-2">
              {/* Step summary (Thinking & Tools), placed at top of response like Claude */}
              {stepItems.length > 0 && (
                <div className="-mx-1">
                  <CollapsibleStepsSummary
                    steps={stepItems}
                    expandedTools={expandedTools}
                    onToggleTool={toggleToolExpand}
                    isLive={isLive}
                  />
                </div>
              )}

              {/* Main answer content rendered directly on canvas */}
              {msg.content && (
                <div className="text-sm leading-relaxed text-[#1F1E1C]">
                  {/* Last block's bottom margin is dropped so the action bar sits close, like the user's */}
                  <ChatMarkdown
                    content={msg.content}
                    streaming={isLive}
                    onRun={handleRunCode}
                    runningCode={isLoading ? runningCode : null}
                    className="[&>:last-child]:!mb-0"
                  />
                </div>
              )}

              {/* Sources the answer used, shown whether or not the model linked them inline */}
              {!!msg.sources?.length && !isLive && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs text-[#6B6A66]">Nguồn</span>
                  {msg.sources.map(
                    (s) =>
                      s.href && (
                        <SourceChip
                          key={s.id}
                          title={s.title}
                          href={s.href}
                          source={roadmapSourceLabel(s.href) ?? "Roadmap"}
                        />
                      )
                  )}
                </div>
              )}

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
                <p className="py-0.5 text-sm italic text-[#6B6862]">
                  Mình chưa có câu trả lời cho câu này. Bạn nói rõ hơn giúp mình
                  nhé.
                </p>
              )}

              {/* Shown after the user pressed stop, so a partial reply doesn't look finished */}
              {msg.stopped && (
                <p className="text-xs italic text-[#6B6862]">Đã dừng</p>
              )}

              {/* Confirmation for destructive actions (dry-run preview) */}
              {awaitingConfirm && (
                <div className="flex flex-col gap-2 pt-1">
                  <p className="text-xs text-[#6B6862]">
                    Đang chờ bạn xác nhận
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => sendMessage("ok")}
                      disabled={isLoading}
                      className="flex items-center gap-1.5 rounded-lg bg-[#C2410C] px-3.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
                    >
                      <CheckCircleIcon className="h-3.5 w-3.5" />
                      <span>Xác nhận thực hiện</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => sendMessage("hủy")}
                      disabled={isLoading}
                      className="flex items-center gap-1.5 rounded-lg border border-[#E6E4DF] bg-[#F4F3F0] px-3.5 py-1.5 text-xs font-medium text-[#1F1E1C] transition-colors hover:bg-[#ECEAE5] disabled:opacity-50 cursor-pointer"
                    >
                      <CloseIcon className="h-3.5 w-3.5" />
                      <span>Hủy bỏ</span>
                    </button>
                  </div>
                </div>
              )}

              {awaitingLayerChoice && (
                <LayerChoicePicker onSend={sendMessage} disabled={isLoading} />
              )}

              {/* Actions bar (Time and action buttons grouped on the right) */}
              {msg.content && (
                <div
                  className={`-mt-1 flex items-center justify-end gap-1 text-xs text-[#6B6862] transition-opacity duration-200 ${isLive ? "invisible opacity-0" : "opacity-100"}`}
                >
                  {timeStr && (
                    <span className="select-none text-[11px] pr-1">
                      {timeStr}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => copyMessage(msg.id, msg.content)}
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
                  {/* The greeting is static text, not an answer to rate */}
                  {msg.id !== WELCOME_MESSAGE_ID && (
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
                            : "text-[#6B6862] hover:text-[#1F1E1C]"
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
                            : "text-[#6B6862] hover:text-[#1F1E1C]"
                        }`}
                      >
                        <ThumbsDownIcon
                          className={`h-3.5 w-3.5 transition-[fill] duration-200 ease-out ${feedback[msg.id] === 0 ? "fill-current" : "fill-transparent"}`}
                        />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div
          ref={bottomSentinelRef}
          aria-hidden="true"
          className="!mt-0 h-px"
        />
      </div>

      <ScrollBottomButton
        scrollRef={scrollRef}
        bottomSentinelRef={bottomSentinelRef}
        isLoading={isLoading}
        scrollToBottom={scrollToBottom}
      />
    </div>
  );
}
