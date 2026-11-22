"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import type { ExtractionMethod, NewsItemDto } from "@/lib/news/schemas";
import { dayjs } from "@/lib/roadmap/date-utils";
import { NewsDecisionBar } from "./NewsDecisionBar";
import { PlatformIcon, formatNewsTitle, isPendingIngest } from "./NewsCard";

interface NewsReaderPanelProps {
  item: NewsItemDto;
  duplicateTitle?: string;
  isUpdating?: boolean;
  isReingesting?: boolean;
  onBack: () => void;
  onToggleRead: (item: NewsItemDto, nextState: "read" | "unread") => void;
  onDismiss: (item: NewsItemDto) => void;
  onReopen: (item: NewsItemDto) => void;
  onUpdateTags: (item: NewsItemDto, tags: string[]) => Promise<void>;
  onSaveNote: (item: NewsItemDto, note: string | null) => Promise<void>;
  onReingest: (item: NewsItemDto) => void;
  onOpenExternal: (item: NewsItemDto) => void;
}

const METHOD_LABELS: Record<ExtractionMethod, string> = {
  captions: "Captions",
  description: "Description",
  article: "Article",
  whisper: "Whisper",
  vision: "Vision Slides",
  metadata_only: "Metadata only",
};

const AUTO_READ_DELAY_MS = 3_000;
const SECTION_LABEL =
  "text-xs font-medium uppercase tracking-wide text-muted-foreground";

/** Inline reader for the selected item; remount it per item (`key={item.id}`) to reset drafts. */
export function NewsReaderPanel({
  item,
  duplicateTitle,
  isUpdating = false,
  isReingesting = false,
  onBack,
  onToggleRead,
  onDismiss,
  onReopen,
  onUpdateTags,
  onSaveNote,
  onReingest,
  onOpenExternal,
}: NewsReaderPanelProps) {
  const [tagInput, setTagInput] = useState("");
  const [noteDraft, setNoteDraft] = useState(item.personalNote ?? "");

  const isNoteDirty = noteDraft.trim() !== (item.personalNote ?? "").trim();

  // Feed polling hands us a new `item` object every few seconds; keep the latest values in refs
  // so the auto-read timer below restarts only when the item or its read status really changes.
  const latestItemRef = useRef(item);
  const onToggleReadRef = useRef(onToggleRead);
  useEffect(() => {
    latestItemRef.current = item;
    onToggleReadRef.current = onToggleRead;
  });

  const { id: itemId, reviewStatus, readState } = item;

  // Auto-mark unread items as read after viewing the panel for 3 seconds
  useEffect(() => {
    if (reviewStatus === "dismissed" || readState !== "unread") return;
    const timer = window.setTimeout(() => {
      onToggleReadRef.current(latestItemRef.current, "read");
    }, AUTO_READ_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [itemId, reviewStatus, readState]);

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = tagInput.trim().toLowerCase().slice(0, 32);
    if (!cleaned) return;
    if (item.tags.includes(cleaned) || item.tags.length >= 8) {
      setTagInput("");
      return;
    }
    await onUpdateTags(item, [...item.tags, cleaned]);
    setTagInput("");
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    await onUpdateTags(
      item,
      item.tags.filter((tag) => tag !== tagToRemove)
    );
  };

  const handleSaveNote = async () => {
    if (!isNoteDirty || isUpdating) return;
    const trimmed = noteDraft.trim();
    await onSaveNote(item, trimmed ? trimmed : null);
  };

  const handleNoteKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSaveNote();
    }
  };

  const isWorking =
    item.ingestStatus === "queued" || item.ingestStatus === "processing";
  const publishedAt = item.publishedAt ?? item.createdAt;

  return (
    <article
      aria-label={item.title}
      className="@container flex min-h-0 min-w-0 flex-1 flex-col bg-card"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-8 sm:py-7">
          <button
            type="button"
            onClick={onBack}
            className="-ml-2 mb-3 inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground hover:bg-accent xl:hidden cursor-pointer"
          >
            <ArrowLeft className="size-4" />
            Danh sách
          </button>

          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            <PlatformIcon platform={item.platform} />
            <span className="truncate">
              {item.domain}
              {item.author ? ` · ${item.author}` : ""}
            </span>
            <time dateTime={publishedAt}>
              · {dayjs(publishedAt).format("DD/MM/YYYY HH:mm")}
            </time>
            {item.extractionMethod && (
              <span className="rounded-md bg-muted px-1.5 py-0.5">
                via {METHOD_LABELS[item.extractionMethod]}
              </span>
            )}
          </div>

          <h1
            className={`mt-2 ${
              isPendingIngest(item)
                ? "break-all font-mono text-base text-muted-foreground"
                : "font-display text-2xl font-semibold leading-tight text-foreground sm:text-[28px]"
            }`}
          >
            {formatNewsTitle(item)}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-1">
            <a
              href={item.canonicalUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onOpenExternal(item)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              <ExternalLink className="size-4" />
              Mở nguồn gốc
            </a>
            <button
              type="button"
              disabled={isUpdating}
              onClick={() =>
                onToggleRead(
                  item,
                  item.readState === "read" ? "unread" : "read"
                )
              }
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 cursor-pointer"
            >
              {item.readState === "read" ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <Circle className="size-4" />
              )}
              {item.readState === "read" ? "Đã đọc" : "Đánh dấu đã đọc"}
            </button>
            <button
              type="button"
              disabled={isReingesting || isWorking}
              onClick={() => onReingest(item)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 cursor-pointer"
            >
              <RotateCcw
                className={`size-4 ${isReingesting ? "animate-spin" : ""}`}
              />
              Phân tích sâu lại
            </button>
          </div>

          {/* Two columns from a 672px wide panel: content on the left, Tag and note on the right */}
          <div className="@2xl:grid @2xl:grid-cols-[minmax(0,1fr)_15rem] @2xl:gap-8">
            <div className="min-w-0">
              {item.possibleDuplicateOfId && (
                <div className="mt-5 flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="font-medium text-foreground">
                      Bài này có tiêu đề gần giống bài đã lưu trong 72h qua
                    </p>
                    {duplicateTitle && (
                      <p className="mt-0.5">{duplicateTitle}</p>
                    )}
                  </div>
                </div>
              )}

              {item.extractionError && (
                <div className="mt-5 rounded-lg bg-[var(--editorial-accent-soft)] px-3 py-2.5 text-sm text-destructive">
                  {item.extractionError}
                </div>
              )}

              {isWorking && (
                <div className="mt-5 flex items-center gap-2 rounded-lg bg-[var(--status-learning-bg)] px-3 py-2.5 text-sm text-[var(--status-learning)]">
                  <Loader2 className="size-4 animate-spin" />
                  {item.ingestStatus === "processing"
                    ? "Đang trích xuất và tóm tắt"
                    : "Đang chờ trong hàng đợi"}
                </div>
              )}

              {item.tldr && (
                <section className="mt-5 border-l-2 border-[var(--editorial-accent)] pl-4">
                  <h2 className={SECTION_LABEL}>TL;DR</h2>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-foreground">
                    {item.tldr}
                  </p>
                </section>
              )}

              {item.takeaways.length > 0 && (
                <section className="mt-7">
                  <h2 className={SECTION_LABEL}>Ý chính</h2>
                  <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground">
                    {item.takeaways.map((point, index) => (
                      <li key={index}>{point}</li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            <aside
              aria-label="Tag và ghi chú"
              className="mt-7 @2xl:sticky @2xl:top-0 @2xl:mt-5 @2xl:self-start @2xl:border-l @2xl:border-border @2xl:pl-6"
            >
              <section>
                <h2 className={SECTION_LABEL}>Tag</h2>
                {item.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
                      >
                        #{tag}
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => void handleRemoveTag(tag)}
                          aria-label={`Xoá tag ${tag}`}
                          className="rounded p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <form
                  onSubmit={handleAddTag}
                  className="mt-2.5 flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="Thêm tag (vd: ai, nextjs)..."
                    maxLength={32}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="submit"
                    disabled={
                      isUpdating || !tagInput.trim() || item.tags.length >= 8
                    }
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50 cursor-pointer"
                  >
                    <Plus className="size-3.5" />
                    Thêm
                  </button>
                </form>
              </section>

              <section className="mt-7 pb-4">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor={`personal-note-${item.id}`}
                    className={SECTION_LABEL}
                  >
                    Ghi chú cá nhân
                  </label>
                  {isNoteDirty && (
                    <span className="text-xs text-[var(--editorial-accent)]">
                      Chưa lưu
                    </span>
                  )}
                </div>
                <textarea
                  id={`personal-note-${item.id}`}
                  rows={4}
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onKeyDown={handleNoteKeyDown}
                  placeholder="Áp dụng cho dự án nào, cần thử gì"
                  className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {isNoteDirty && (
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => void handleSaveNote()}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
                    >
                      {isUpdating ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Save className="size-3.5" />
                      )}
                      Lưu ghi chú
                    </button>
                  </div>
                )}
              </section>
            </aside>
          </div>
        </div>
      </div>

      <NewsDecisionBar
        item={item}
        isBusy={isUpdating}
        onDismiss={onDismiss}
        onReopen={onReopen}
      />
    </article>
  );
}

const SKELETON_BAR = "rounded bg-muted motion-safe:animate-pulse";

/** Placeholder with the panel's shape, shown on wide screens while the reader is not ready yet. */
export function NewsReaderSkeleton() {
  return (
    <div
      role="status"
      aria-label="Đang tải bài"
      className="@container hidden min-h-0 min-w-0 flex-1 flex-col bg-card xl:flex"
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto max-w-5xl px-8 py-7">
          <div className={`h-3 w-56 ${SKELETON_BAR}`} />
          <div className={`mt-4 h-7 w-4/5 ${SKELETON_BAR}`} />
          <div className={`mt-2 h-7 w-3/5 ${SKELETON_BAR}`} />
          <div className="mt-4 flex gap-2">
            <div className={`h-8 w-32 ${SKELETON_BAR}`} />
            <div className={`h-8 w-28 ${SKELETON_BAR}`} />
          </div>

          <div className="@2xl:grid @2xl:grid-cols-[minmax(0,1fr)_15rem] @2xl:gap-8">
            <div className="mt-6 space-y-2.5 border-l-2 border-border pl-4">
              <div className={`h-3 w-12 ${SKELETON_BAR}`} />
              <div className={`h-3.5 w-full ${SKELETON_BAR}`} />
              <div className={`h-3.5 w-full ${SKELETON_BAR}`} />
              <div className={`h-3.5 w-2/3 ${SKELETON_BAR}`} />
              <div className="pt-5" />
              <div className={`h-3 w-16 ${SKELETON_BAR}`} />
              <div className={`h-3.5 w-11/12 ${SKELETON_BAR}`} />
              <div className={`h-3.5 w-4/5 ${SKELETON_BAR}`} />
              <div className={`h-3.5 w-5/6 ${SKELETON_BAR}`} />
            </div>
            <div className="mt-6 hidden space-y-2.5 border-l border-border pl-6 @2xl:block">
              <div className={`h-3 w-10 ${SKELETON_BAR}`} />
              <div className="flex flex-wrap gap-1.5">
                <div className={`h-5 w-14 ${SKELETON_BAR}`} />
                <div className={`h-5 w-20 ${SKELETON_BAR}`} />
                <div className={`h-5 w-12 ${SKELETON_BAR}`} />
              </div>
              <div className="pt-5" />
              <div className={`h-3 w-24 ${SKELETON_BAR}`} />
              <div className={`h-20 w-full ${SKELETON_BAR}`} />
            </div>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center border-t border-border px-8 py-3">
        <div className={`h-9 w-24 ${SKELETON_BAR}`} />
      </div>
    </div>
  );
}
