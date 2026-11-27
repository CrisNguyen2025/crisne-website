import React, { useCallback, useEffect, useState } from "react";
import type { ThreadSummary } from "../../types";
import { CheckIcon, CloseIcon, HistoryIcon, SearchIcon, TrashIcon } from "../icons";
import { formatTime } from "../utils/formatters";
import { AbotDialog, useAbotDialogClose } from "./AbotDialog";

const DELETE_CONFIRM_TIMEOUT_MS = 4000;

export interface ThreadHistorySheetProps {
  threads: ThreadSummary[];
  query: string;
  onQueryChange: (next: string) => void;
  isLoading: boolean;
  isSearching: boolean;
  error: string | null;
  deletingId: string | null;
  currentThreadId: string;
  zIndex?: number;
  onRetry: () => void;
  onSelectThread: (threadId: string) => Promise<boolean>;
  onDeleteThread: (threadId: string) => Promise<boolean>;
  onClose: () => void;
}

function ThreadSkeletonRows() {
  return (
    <div className="space-y-2" aria-label="Đang tải lịch sử chat" aria-busy="true">
      {[0, 1, 2].map((idx) => (
        <div
          key={idx}
          className="animate-pulse rounded-xl border border-[#E6E4DF]/70 bg-[#FAF9F7] px-3 py-2.5"
        >
          <div className="h-3.5 w-3/4 rounded bg-[#E6E4DF]/80" />
          <div className="mt-2 h-2.5 w-1/3 rounded bg-[#E6E4DF]/60" />
        </div>
      ))}
    </div>
  );
}

function HighlightedSnippet({ snippet, query }: { snippet: string; query: string }) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return <span>{snippet}</span>;

  const lowerSnippet = snippet.toLowerCase();
  const lowerQuery = trimmedQuery.toLowerCase();
  const idx = lowerSnippet.indexOf(lowerQuery);
  if (idx < 0) return <span>{snippet}</span>;

  return (
    <span>
      {snippet.slice(0, idx)}
      <mark className="rounded bg-[#F4F3F0] px-0.5 font-medium text-[#1F1E1C]">
        {snippet.slice(idx, idx + trimmedQuery.length)}
      </mark>
      {snippet.slice(idx + trimmedQuery.length)}
    </span>
  );
}

interface ThreadHistoryRowProps {
  thread: ThreadSummary;
  query: string;
  isCurrent: boolean;
  isDeleting: boolean;
  isConfirmingDelete: boolean;
  disableActions: boolean;
  onSelect: (threadId: string) => void;
  onRequestDelete: (threadId: string) => void;
  onConfirmDelete: (threadId: string) => void;
  onCancelDelete: () => void;
}

function ThreadHistoryRow({
  thread,
  query,
  isCurrent,
  isDeleting,
  isConfirmingDelete,
  disableActions,
  onSelect,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: ThreadHistoryRowProps) {
  const timeLabel = formatTime(thread.lastMessageAt);

  return (
    <li
      className={`group flex items-start gap-1.5 rounded-xl border transition-colors ${
        isCurrent
          ? "border-[#3F7D58]/35 bg-[#3F7D58]/[0.05]"
          : "border-[#E6E4DF] bg-[#FFFFFF] hover:border-[#D6D3CC] hover:bg-[#FAF9F7]"
      }`}
    >
      <button
        type="button"
        disabled={disableActions}
        onClick={() => onSelect(thread.threadId)}
        className="min-w-0 flex-1 cursor-pointer px-3 py-2.5 text-left disabled:cursor-wait disabled:opacity-70"
      >
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-[#1F1E1C]">
            {thread.title}
          </span>
          {isCurrent && (
            <span className="shrink-0 rounded-full bg-[#3F7D58]/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-[#3F7D58]">
              Đang mở
            </span>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.6875rem] text-[#5E5B55]">
          {timeLabel && <span>{timeLabel}</span>}
          {thread.activeTopicTitle && (
            <>
              <span aria-hidden="true">·</span>
              <span className="max-w-36 truncate rounded bg-[#F4F3F0] px-1.5 py-0.5 text-[0.625rem] font-medium text-[#4D4B46] sm:max-w-56">
                {thread.activeTopicTitle}
              </span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{thread.messageCount} tin</span>
        </div>

        {thread.matchedSnippet && (
          <p className="mt-1.5 line-clamp-2 border-l-2 border-[#E6E4DF] pl-2 text-[0.6875rem] leading-4 text-[#5E5B55]">
            <HighlightedSnippet snippet={thread.matchedSnippet} query={query} />
          </p>
        )}
      </button>

      <div className="flex shrink-0 items-center pr-1.5 pt-2">
        {isConfirmingDelete ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => onConfirmDelete(thread.threadId)}
              aria-label={`Xác nhận xoá ${thread.title}`}
              className="flex h-7 min-h-9 cursor-pointer items-center gap-1 rounded-lg bg-[#B42318] px-2 text-[0.6875rem] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0"
            >
              <CheckIcon className="h-3 w-3" />
              <span>{isDeleting ? "Đang xoá" : "Xoá"}</span>
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={onCancelDelete}
              aria-label="Huỷ xoá"
              className="flex h-7 w-7 min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-lg text-[#5E5B55] hover:bg-[#F4F3F0] hover:text-[#1F1E1C] md:min-h-0 md:min-w-0"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={disableActions}
            onClick={() => onRequestDelete(thread.threadId)}
            title="Xoá cuộc trò chuyện"
            aria-label={`Xoá cuộc trò chuyện ${thread.title}`}
            className="flex h-8 w-8 min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg text-[#8A8780] transition-colors hover:bg-[#FBEDE5] hover:text-[#B42318] md:h-7 md:w-7 md:min-h-0 md:min-w-0 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}

interface ThreadHistoryContentProps extends Omit<ThreadHistorySheetProps, "zIndex"> {
  confirmDeleteId: string | null;
  onConfirmDeleteIdChange: (next: string | null) => void;
}

function ThreadHistoryContent({
  threads,
  query,
  onQueryChange,
  isLoading,
  isSearching,
  error,
  deletingId,
  currentThreadId,
  confirmDeleteId,
  onConfirmDeleteIdChange,
  onRetry,
  onSelectThread,
  onDeleteThread,
  onClose,
}: ThreadHistoryContentProps) {
  const requestClose = useAbotDialogClose(onClose);
  const isDesktop = typeof window !== "undefined" && window.innerWidth >= 768;

  const handleSelect = (threadId: string) => {
    if (deletingId) return;
    onConfirmDeleteIdChange(null);
    requestClose();
    void onSelectThread(threadId);
  };

  const handleConfirmDelete = async (threadId: string) => {
    const ok = await onDeleteThread(threadId);
    if (ok) {
      onConfirmDeleteIdChange(null);
    }
  };

  const trimmedQuery = query.trim();

  return (
    <>
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[#E6E4DF]/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <HistoryIcon className="h-4 w-4 text-[#5E5B55]" />
          <span className="text-xs font-semibold text-[#1F1E1C] sm:text-[13px]">Lịch sử chat</span>
        </div>
        <button
          type="button"
          onClick={requestClose}
          title="Đóng"
          aria-label="Đóng lịch sử chat"
          autoFocus={!isDesktop}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[#5E5B55] hover:bg-[#F4F3F0] hover:text-[#1F1E1C] md:h-7 md:w-7"
        >
          <CloseIcon className="h-4 w-4 md:h-3.5 md:w-3.5" />
        </button>
      </div>

      {/* Sticky Search */}
      <div className="shrink-0 border-b border-[#E6E4DF]/50 px-4 py-2.5">
        <div className="flex items-center gap-2 rounded-xl border border-[#E6E4DF] bg-[#FAF9F7] px-2.5 py-1.5 focus-within:border-[#1F1E1C]/40 focus-within:bg-[#FFFFFF]">
          <SearchIcon className="h-3.5 w-3.5 shrink-0 text-[#8A8780]" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Tìm tiêu đề, nội dung hoặc Topic…"
            aria-label="Tìm kiếm lịch sử chat"
            autoFocus={isDesktop}
            className="min-w-0 flex-1 bg-transparent text-base text-[#1F1E1C] placeholder:text-[#8A8780] focus:outline-none md:text-xs"
          />
          {isSearching && (
            <span
              role="status"
              aria-label="Đang tìm kiếm"
              className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-[#E6E4DF] border-t-[#5E5B55]"
            />
          )}
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              title="Xoá từ khoá"
              aria-label="Xoá từ khoá tìm kiếm"
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-[#8A8780] hover:bg-[#F4F3F0] hover:text-[#1F1E1C]"
            >
              <CloseIcon className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable List */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        {error && (
          <div
            role="alert"
            className="mb-2.5 flex items-center justify-between gap-2 rounded-lg border border-[#B42318]/20 bg-[#FBEDE5] px-2.5 py-1.5 text-[0.6875rem] text-[#B42318]"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={onRetry}
              className="shrink-0 cursor-pointer font-semibold underline"
            >
              Thử lại
            </button>
          </div>
        )}

        <div className="mb-2 flex items-center justify-between text-[0.6875rem] font-medium text-[#5E5B55]">
          <span>{trimmedQuery ? "Kết quả tìm kiếm" : "Gần đây"}</span>
          {threads.length > 0 && <span className="tabular-nums">{threads.length}</span>}
        </div>

        {isLoading && threads.length === 0 ? (
          <ThreadSkeletonRows />
        ) : threads.length === 0 ? (
          <p className="py-6 text-center text-xs text-[#5E5B55]">
            {trimmedQuery
              ? "Không tìm thấy cuộc trò chuyện phù hợp."
              : "Chưa có cuộc trò chuyện nào trong 30 ngày qua."}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {threads.map((thread) => (
              <ThreadHistoryRow
                key={thread.threadId}
                thread={thread}
                query={trimmedQuery}
                isCurrent={thread.threadId === currentThreadId}
                isDeleting={deletingId === thread.threadId}
                isConfirmingDelete={confirmDeleteId === thread.threadId}
                disableActions={Boolean(deletingId)}
                onSelect={handleSelect}
                onRequestDelete={(id) => onConfirmDeleteIdChange(id)}
                onConfirmDelete={(id) => void handleConfirmDelete(id)}
                onCancelDelete={() => onConfirmDeleteIdChange(null)}
              />
            ))}
          </ul>
        )}

        <p className="mt-3 text-[0.6875rem] leading-4 text-[#5E5B55]">
          Lưu tối đa 50 tin mỗi cuộc trò chuyện trong 30 ngày gần nhất.
        </p>
      </div>
    </>
  );
}

export function ThreadHistorySheet({
  zIndex,
  onClose,
  ...rest
}: ThreadHistorySheetProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = setTimeout(() => setConfirmDeleteId(null), DELETE_CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [confirmDeleteId]);

  const handleEscape = useCallback(() => {
    if (!confirmDeleteId) return false;
    setConfirmDeleteId(null);
    return true;
  }, [confirmDeleteId]);

  return (
    <AbotDialog
      label="Lịch sử chat"
      size="md"
      zIndex={zIndex}
      onClose={onClose}
      onEscape={handleEscape}
      panelClassName="min-h-[18rem] sm:min-h-[24rem]"
    >
      <ThreadHistoryContent
        {...rest}
        confirmDeleteId={confirmDeleteId}
        onConfirmDeleteIdChange={setConfirmDeleteId}
        onClose={onClose}
      />
    </AbotDialog>
  );
}
