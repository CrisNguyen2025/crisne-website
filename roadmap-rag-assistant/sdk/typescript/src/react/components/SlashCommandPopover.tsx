import React from "react";
import type { RoadmapSummaryItem } from "../../types";
import { ArrowLeftIcon, BookOpenIcon, ChevronRightIcon } from "../icons";
import {
  STATUS_FILTER_OPTIONS,
  type SlashCommandSpec,
  type SlashSubPickerKind,
  type StatusFilterOption,
} from "../slashCommands";

export interface SlashCommandPopoverProps {
  mode: "commands" | SlashSubPickerKind;
  commands: SlashCommandSpec[];
  topics: RoadmapSummaryItem[];
  topicsLoading: boolean;
  topicsError: string | null;
  topicQuery: string;
  currentTopicSlug?: string;
  activeIndex: number;
  onHoverIndex: (idx: number) => void;
  onSelectCommand: (cmd: SlashCommandSpec) => void;
  onSelectQuizTopic: (topic: RoadmapSummaryItem) => void;
  onSelectStatusFilter: (option: StatusFilterOption) => void;
  onBackToCommands: () => void;
  onRetryTopics?: () => void;
}

export function SlashCommandPopover({
  mode,
  commands,
  topics,
  topicsLoading,
  topicsError,
  topicQuery,
  currentTopicSlug,
  activeIndex,
  onHoverIndex,
  onSelectCommand,
  onSelectQuizTopic,
  onSelectStatusFilter,
  onBackToCommands,
  onRetryTopics,
}: SlashCommandPopoverProps) {
  const sortedTopics = React.useMemo(() => {
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

  if (mode === "quiz-topic") {
    return (
      <div
        role="listbox"
        aria-label="Chọn Topic để kiểm tra quiz"
        data-testid="slash-quiz-topic-popover"
        onMouseDown={(e) => e.preventDefault()}
        className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-2xl border border-[#E6E4DF] bg-[#FFFFFF] shadow-[0_12px_32px_-6px_rgba(31,30,28,0.16),0_2px_8px_-1px_rgba(31,30,28,0.06)] animate-in fade-in slide-in-from-bottom-1 duration-150 motion-reduce:animate-none"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[#E6E4DF] px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onBackToCommands}
              aria-label="Quay lại danh sách Actions"
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[#5E5B55] hover:bg-[#F4F3F0] hover:text-[#1F1E1C]"
            >
              <ArrowLeftIcon className="h-3.5 w-3.5" />
            </button>
            <span className="truncate text-xs font-semibold text-[#1F1E1C]">
              Chọn Topic để làm quiz
            </span>
          </div>
          <span className="shrink-0 font-mono text-[11px] text-[#5E5B55]">
            /quiz
          </span>
        </div>

        <div className="max-h-56 overflow-y-auto p-1.5 [scrollbar-width:thin]">
          {topicsLoading ? (
            <div className="px-3 py-4 text-center text-xs text-[#5E5B55]">
              Đang tải danh sách Topic…
            </div>
          ) : topicsError ? (
            <div className="flex items-center justify-between gap-2 px-3 py-3 text-xs text-[#B42318]">
              <span>{topicsError}</span>
              {onRetryTopics && (
                <button
                  type="button"
                  onClick={onRetryTopics}
                  className="shrink-0 cursor-pointer rounded-md border border-[#E6E4DF] px-2 py-1 text-[#1F1E1C] hover:bg-[#F4F3F0]"
                >
                  Thử lại
                </button>
              )}
            </div>
          ) : sortedTopics.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-[#5E5B55]">
              Không tìm thấy Topic phù hợp.
            </div>
          ) : (
            sortedTopics.map((topic, idx) => {
              const isCurrent = Boolean(
                currentTopicSlug && topic.slug === currentTopicSlug
              );
              const isActive = idx === activeIndex;
              return (
                <button
                  key={topic.slug}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => onHoverIndex(idx)}
                  onClick={() => onSelectQuizTopic(topic)}
                  className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left transition-colors ${
                    isActive ? "bg-[#F4F3F0]" : "hover:bg-[#F4F3F0]"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <BookOpenIcon className="h-4 w-4 shrink-0 text-[#C2410C]" />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-[#1F1E1C]">
                          {topic.title}
                        </span>
                        {isCurrent && (
                          <span className="shrink-0 rounded-full bg-[#FBEAE3] px-1.5 py-0.5 text-[10px] font-medium text-[#9A3412]">
                            Đang xem
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[11px] text-[#5E5B55]">
                        {typeof topic._count?.items === "number"
                          ? `${topic._count.items} bài học`
                          : topic.description || topic.slug}
                      </span>
                    </span>
                  </span>
                  <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-[#5E5B55]" />
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  if (mode === "status-filter") {
    return (
      <div
        role="listbox"
        aria-label="Chọn Lesson Status để thống kê"
        data-testid="slash-status-filter-popover"
        onMouseDown={(e) => e.preventDefault()}
        className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-2xl border border-[#E6E4DF] bg-[#FFFFFF] shadow-[0_12px_32px_-6px_rgba(31,30,28,0.16),0_2px_8px_-1px_rgba(31,30,28,0.06)] animate-in fade-in slide-in-from-bottom-1 duration-150 motion-reduce:animate-none"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[#E6E4DF] px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onBackToCommands}
              aria-label="Quay lại danh sách Actions"
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[#5E5B55] hover:bg-[#F4F3F0] hover:text-[#1F1E1C]"
            >
              <ArrowLeftIcon className="h-3.5 w-3.5" />
            </button>
            <span className="truncate text-xs font-semibold text-[#1F1E1C]">
              Lọc theo Lesson Status
            </span>
          </div>
          <span className="shrink-0 font-mono text-[11px] text-[#5E5B55]">
            /status
          </span>
        </div>
        <div className="p-1.5">
          {STATUS_FILTER_OPTIONS.map((opt, idx) => {
            const isActive = idx === activeIndex;
            return (
              <button
                key={opt.prompt}
                type="button"
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => onHoverIndex(idx)}
                onClick={() => onSelectStatusFilter(opt)}
                className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left transition-colors ${
                  isActive ? "bg-[#F4F3F0]" : "hover:bg-[#F4F3F0]"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[#1F1E1C]">
                    {opt.label}
                  </span>
                  <span className="block truncate text-[11px] text-[#5E5B55]">
                    {opt.description}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-[#5E5B55]">
                  {opt.prompt}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="Actions (Slash commands)"
      data-testid="slash-command-popover"
      onMouseDown={(e) => e.preventDefault()}
      className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-2xl border border-[#E6E4DF] bg-[#FFFFFF] shadow-[0_12px_32px_-6px_rgba(31,30,28,0.16),0_2px_8px_-1px_rgba(31,30,28,0.06)] animate-in fade-in slide-in-from-bottom-1 duration-150 motion-reduce:animate-none"
    >
      <div className="flex items-center justify-between border-b border-[#E6E4DF] px-3 py-1.5 text-[11px] font-medium text-[#5E5B55]">
        <span>Actions (Slash)</span>
        <span>↑↓ chọn · Enter dùng</span>
      </div>
      <div className="max-h-60 overflow-y-auto p-1.5 [scrollbar-width:thin]">
        {commands.length === 0 ? (
          <div className="px-3 py-3 text-center text-xs text-[#5E5B55]">
            Không có lệnh phù hợp.
          </div>
        ) : (
          commands.map((cmd, idx) => {
            const isActive = idx === activeIndex;
            return (
              <button
                key={cmd.name}
                type="button"
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => onHoverIndex(idx)}
                onClick={() => onSelectCommand(cmd)}
                className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${
                  isActive ? "bg-[#F4F3F0]" : "hover:bg-[#F4F3F0]"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-semibold text-[#C2410C]">
                      {cmd.name}
                    </span>
                    {cmd.argsHint && (
                      <span className="font-mono text-[11px] text-[#5E5B55]">
                        {cmd.argsHint}
                      </span>
                    )}
                    <span className="truncate text-xs font-medium text-[#1F1E1C]">
                      · {cmd.label}
                    </span>
                  </span>
                  <span className="block truncate text-[11px] text-[#5E5B55]">
                    {cmd.description}
                  </span>
                </span>
                {cmd.subPicker && (
                  <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-[#5E5B55]" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
