"use client";

import React, { useId, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Rss,
  Trash2,
  X,
} from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import {
  ROADMAP_GHOST_BTN_CLASS,
  ROADMAP_INPUT_CLASS,
  ROADMAP_MODAL_TITLE_CLASS,
  ROADMAP_PRIMARY_BTN_CLASS,
  ROADMAP_SECONDARY_BTN_CLASS,
  RoadmapFieldLabel,
  RoadmapFormError,
} from "@/components/roadmap/RoadmapFormPrimitives";
import type {
  CronSyncSummary,
  NewsSourceDto,
  UpdateNewsSourceRequest,
} from "@/lib/news/schemas";
import { NEWS_CRON_SCHEDULE } from "@/lib/news/cron-schedule";
import { dayjs, formatFriendlyTime } from "@/lib/roadmap/date-utils";
import { cn } from "@/lib/utils";
import * as newsService from "@/logic/news/newsService";

function getFeedHost(feedUrl: string): string {
  try {
    return new URL(feedUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function formatFeedUrl(feedUrl: string): string {
  return feedUrl.replace(/^https?:\/\/(www\.)?/, "");
}

function formatPullTime(lastFetchedAt: string | null): string {
  if (!lastFetchedAt) return "Chưa pull lần nào";
  return `Pull lúc ${dayjs(lastFetchedAt).format("HH:mm DD/MM")} · ${formatFriendlyTime(lastFetchedAt)}`;
}

function parseTagsInput(raw: string): string[] {
  return raw
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 5);
}

interface NewsSourceEditFormProps {
  source: NewsSourceDto;
  isSaving: boolean;
  onSave: (patch: UpdateNewsSourceRequest) => void;
  onCancel: () => void;
}

/** Inline editor for one configured source; sends only the fields that changed. */
function NewsSourceEditForm({ source, isSaving, onSave, onCancel }: NewsSourceEditFormProps) {
  const feedHost = getFeedHost(source.feedUrl);
  const [name, setName] = useState(source.name);
  const [feedUrl, setFeedUrl] = useState(source.feedUrl);
  const [domain, setDomain] = useState(source.domain === feedHost ? "" : source.domain);
  const [tags, setTags] = useState(source.defaultTags.join(", "));
  const nameId = useId();
  const domainId = useId();
  const feedId = useId();
  const tagsId = useId();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const patch: UpdateNewsSourceRequest = {};
    const trimmedName = name.trim();
    const trimmedFeedUrl = feedUrl.trim();
    if (trimmedName && trimmedName !== source.name) patch.name = trimmedName;
    if (trimmedFeedUrl && trimmedFeedUrl !== source.feedUrl) patch.feedUrl = trimmedFeedUrl;

    // An empty domain falls back to the feed host, like the create form
    const nextDomain = domain.trim() || getFeedHost(trimmedFeedUrl || source.feedUrl);
    if (nextDomain && nextDomain !== source.domain) patch.domain = nextDomain;

    const nextTags = parseTagsInput(tags);
    if (nextTags.join(",") !== source.defaultTags.join(",")) patch.defaultTags = nextTags;

    if (Object.keys(patch).length === 0) {
      onCancel();
      return;
    }
    onSave(patch);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3"
      aria-label={`Chỉnh sửa nguồn ${source.name}`}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <RoadmapFieldLabel htmlFor={nameId} required>
            Tên nguồn
          </RoadmapFieldLabel>
          <input
            id={nameId}
            type="text"
            required
            disabled={isSaving}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={cn(ROADMAP_INPUT_CLASS, "text-base sm:text-sm")}
          />
        </div>
        <div className="space-y-1.5">
          <RoadmapFieldLabel htmlFor={domainId}>
            Domain bài viết (tuỳ chọn)
          </RoadmapFieldLabel>
          <input
            id={domainId}
            type="text"
            disabled={isSaving}
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="Tự tách từ Feed URL"
            className={cn(ROADMAP_INPUT_CLASS, "text-base sm:text-sm")}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <RoadmapFieldLabel htmlFor={feedId} required>
          RSS / Atom Feed URL
        </RoadmapFieldLabel>
        <input
          id={feedId}
          type="url"
          required
          disabled={isSaving}
          value={feedUrl}
          onChange={(e) => setFeedUrl(e.target.value)}
          className={cn(ROADMAP_INPUT_CLASS, "font-mono text-base sm:text-[0.8125rem]")}
        />
      </div>

      <div className="space-y-1.5">
        <RoadmapFieldLabel htmlFor={tagsId}>
          Tags mặc định (phân tách dấu phẩy)
        </RoadmapFieldLabel>
        <input
          id={tagsId}
          type="text"
          disabled={isSaving}
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="nextjs, frontend"
          className={cn(ROADMAP_INPUT_CLASS, "text-base sm:text-sm")}
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          disabled={isSaving}
          onClick={onCancel}
          className={cn(ROADMAP_GHOST_BTN_CLASS, "h-8 px-2.5 text-xs")}
        >
          Huỷ
        </button>
        <button
          type="submit"
          disabled={isSaving || !name.trim() || !feedUrl.trim()}
          className={cn(ROADMAP_PRIMARY_BTN_CLASS, "h-8 px-3 text-xs")}
        >
          {isSaving && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          <span>Lưu</span>
        </button>
      </div>
    </form>
  );
}

interface SourcesManagerSheetProps {
  open: boolean;
  initialSources: NewsSourceDto[];
  onClose: () => void;
  onChanged: () => void;
}

export function SourcesManagerSheet({
  open,
  initialSources,
  onClose,
  onChanged,
}: SourcesManagerSheetProps) {
  const { toast } = useToast();
  const nameId = useId();
  const domainId = useId();
  const feedUrlId = useId();
  const tagsId = useId();
  const createErrorId = useId();

  const [sources, setSources] = useState<NewsSourceDto[]>(initialSources);
  const [prevInitialSources, setPrevInitialSources] = useState<NewsSourceDto[]>(initialSources);
  if (initialSources !== prevInitialSources) {
    setPrevInitialSources(initialSources);
    setSources(initialSources);
  }
  const [nameInput, setNameInput] = useState("");
  const [feedUrlInput, setFeedUrlInput] = useState("");
  const [domainInput, setDomainInput] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncingSourceId, setSyncingSourceId] = useState<string | null>(null);
  const [busySourceId, setBusySourceId] = useState<string | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastSyncSummary, setLastSyncSummary] = useState<CronSyncSummary | null>(null);

  const reloadSources = async () => {
    const res = await newsService.fetchNewsSources();
    setSources(res.sources);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = nameInput.trim();
    const trimmedFeed = feedUrlInput.trim();
    if (!trimmedName || !trimmedFeed) {
      setFormError("Vui lòng nhập đầy đủ tên nguồn và RSS / Atom Feed URL.");
      return;
    }

    const defaultTags = parseTagsInput(tagsInput);

    setIsCreating(true);
    setFormError(null);
    try {
      const { source } = await newsService.createNewsSource({
        name: trimmedName,
        feedUrl: trimmedFeed,
        domain: domainInput.trim() || undefined,
        enabled: true,
        defaultTags,
      });
      setNameInput("");
      setFeedUrlInput("");
      setDomainInput("");
      setTagsInput("");
      await reloadSources();
      onChanged();
      toast(
        source.feedUrl !== trimmedFeed
          ? `Đã tự tìm thấy RSS: ${source.feedUrl}`
          : "Đã thêm nguồn RSS mới",
        "success"
      );
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Không thể thêm nguồn RSS."
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleEnabled = async (source: NewsSourceDto) => {
    setBusySourceId(source.id);
    try {
      await newsService.updateNewsSource(source.id, { enabled: !source.enabled });
      await reloadSources();
      onChanged();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Không thể cập nhật trạng thái nguồn.",
        "error"
      );
    } finally {
      setBusySourceId(null);
    }
  };

  const handleUpdate = async (source: NewsSourceDto, patch: UpdateNewsSourceRequest) => {
    setBusySourceId(source.id);
    try {
      const { source: updated } = await newsService.updateNewsSource(source.id, patch);
      await reloadSources();
      onChanged();
      setEditingSourceId(null);
      toast(
        patch.feedUrl && updated.feedUrl !== patch.feedUrl
          ? `Đã cập nhật và tự tìm thấy RSS: ${updated.feedUrl}`
          : `Đã cập nhật nguồn "${patch.name ?? source.name}"`,
        "success"
      );
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Không thể cập nhật nguồn RSS.",
        "error"
      );
    } finally {
      setBusySourceId(null);
    }
  };

  const handleDelete = async (source: NewsSourceDto) => {
    setBusySourceId(source.id);
    try {
      await newsService.deleteNewsSource(source.id);
      await reloadSources();
      onChanged();
      toast(`Đã xoá nguồn "${source.name}"`, "success");
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Không thể xoá nguồn RSS.",
        "error"
      );
    } finally {
      setBusySourceId(null);
    }
  };

  const handleSync = async (sourceId?: string) => {
    if (isSyncingAll || syncingSourceId) return;
    if (sourceId) {
      setSyncingSourceId(sourceId);
    } else {
      setIsSyncingAll(true);
    }
    setLastSyncSummary(null);
    try {
      const summary = await newsService.triggerNewsCronSync(
        sourceId ? { sourceId } : {}
      );
      setLastSyncSummary(summary);
      await reloadSources();
      onChanged();
      toast(
        `Đã quét ${summary.sourcesProcessed} nguồn: +${summary.totalQueued} bài vào Chờ xử lý`,
        "success"
      );
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Không thể quét nguồn RSS.",
        "error"
      );
    } finally {
      setSyncingSourceId(null);
      setIsSyncingAll(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="right"
      label="Quản lý nguồn RSS & Cron"
      className="roadmap-theme max-w-xl"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2.5 border-b border-border bg-card px-4 py-3.5 sm:gap-3 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Rss className="size-4 shrink-0 text-[var(--editorial-accent)]" aria-hidden="true" />
          <h2 className={cn(ROADMAP_MODAL_TITLE_CLASS, "truncate")}>
            Nguồn RSS &amp; Cron{" "}
            <span className="tabular-nums text-muted-foreground">({sources.length})</span>
          </h2>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            disabled={isSyncingAll || Boolean(syncingSourceId) || sources.length === 0}
            onClick={() => void handleSync()}
            className={cn(
              ROADMAP_PRIMARY_BTN_CLASS,
              "h-8 shrink-0 whitespace-nowrap px-2.5 text-xs sm:px-3"
            )}
          >
            {isSyncingAll ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden="true" />
            )}
            <span>Quét tất cả ngay</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            title="Đóng (Esc)"
            aria-label="Đóng quản lý nguồn"
            className="-mr-1 shrink-0 rounded-lg p-1.5 text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-95 cursor-pointer"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-5">
        {/* Add Source Form */}
        <form
          onSubmit={handleCreate}
          className="space-y-3.5 rounded-xl border border-border bg-muted/30 p-4"
        >
          <h3 className="text-[0.8125rem] font-semibold text-foreground">
            Thêm nguồn RSS / Atom mới
          </h3>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <RoadmapFieldLabel htmlFor={nameId} required>
                Tên nguồn
              </RoadmapFieldLabel>
              <input
                id={nameId}
                type="text"
                required
                disabled={isCreating}
                aria-invalid={Boolean(formError) || undefined}
                aria-describedby={formError ? createErrorId : undefined}
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder="Vercel Blog"
                className={cn(ROADMAP_INPUT_CLASS, "text-base sm:text-sm")}
              />
            </div>

            <div className="space-y-1.5">
              <RoadmapFieldLabel htmlFor={domainId}>
                Domain bài viết (tuỳ chọn)
              </RoadmapFieldLabel>
              <input
                id={domainId}
                type="text"
                disabled={isCreating}
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="Tự tách từ Feed URL"
                className={cn(ROADMAP_INPUT_CLASS, "text-base sm:text-sm")}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <RoadmapFieldLabel htmlFor={feedUrlId} required>
              RSS / Atom Feed URL
            </RoadmapFieldLabel>
            <input
              id={feedUrlId}
              type="url"
              required
              disabled={isCreating}
              aria-invalid={Boolean(formError) || undefined}
              aria-describedby={formError ? createErrorId : undefined}
              value={feedUrlInput}
              onChange={(e) => {
                setFeedUrlInput(e.target.value);
                if (formError) setFormError(null);
              }}
              placeholder="https://vercel.com/atom hoặc https://goonnguyen.substack.com/"
              className={cn(ROADMAP_INPUT_CLASS, "font-mono text-base sm:text-[0.8125rem]")}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Dán link XML hoặc URL trang chủ blog — hệ thống tự dò RSS/Atom feed.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-1.5">
              <RoadmapFieldLabel htmlFor={tagsId}>
                Tags mặc định (phân tách dấu phẩy)
              </RoadmapFieldLabel>
              <input
                id={tagsId}
                type="text"
                disabled={isCreating}
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="nextjs, frontend"
                className={cn(ROADMAP_INPUT_CLASS, "text-base sm:text-sm")}
              />
            </div>

            <button
              type="submit"
              disabled={isCreating}
              className={cn(ROADMAP_PRIMARY_BTN_CLASS, "shrink-0 whitespace-nowrap")}
            >
              {isCreating ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="size-3.5" aria-hidden="true" />
              )}
              <span>Thêm nguồn</span>
            </button>
          </div>

          <RoadmapFormError
            id={createErrorId}
            message={formError ?? ""}
            className="[overflow-wrap:anywhere]"
          />
        </form>

        {/* Sync Summary Banner */}
        {lastSyncSummary && (() => {
          const totalSkipped = lastSyncSummary.results.reduce(
            (sum, r) => sum + r.skippedErrors,
            0
          );
          const failedSources = lastSyncSummary.results.filter((r) => Boolean(r.error));
          const notModifiedCount = lastSyncSummary.results.filter((r) => r.notModified).length;
          const hasOnlyFailures = failedSources.length > 0 && lastSyncSummary.totalQueued === 0;

          return (
            <div
              role="status"
              className={cn(
                "flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs leading-relaxed motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 duration-200",
                hasOnlyFailures
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-[var(--status-known-border)] bg-[var(--status-known-bg)] text-[var(--status-known)]"
              )}
            >
              {hasOnlyFailures ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="[overflow-wrap:anywhere] font-medium">
                  Đã quét {lastSyncSummary.sourcesProcessed} nguồn: +{lastSyncSummary.totalQueued} bài
                  mới vào Chờ xử lý · {lastSyncSummary.totalDuplicates} bài đã tồn tại
                  {notModifiedCount > 0 ? ` · ${notModifiedCount} nguồn chưa đổi` : ""}
                  {totalSkipped > 0 ? ` · ${totalSkipped} link bị bỏ qua` : ""}
                </p>
                {failedSources.map((src) => (
                  <p
                    key={src.sourceId}
                    className="flex items-start gap-1.5 [overflow-wrap:anywhere] text-destructive"
                  >
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {src.sourceName}: {src.error}
                    </span>
                  </p>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Configured Sources List */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="text-[0.8125rem] font-semibold text-foreground">
              Danh sách nguồn đã cấu hình
            </h3>
            <p className="inline-flex min-w-0 items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
              <Clock className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="[overflow-wrap:anywhere]">
                Tự động: {NEWS_CRON_SCHEDULE.label}
              </span>
            </p>
          </div>

          {sources.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm leading-relaxed text-muted-foreground">
              Chưa có nguồn RSS nào. Thêm một feed ở trên để cron tự lấy bài định kỳ vào Chờ xử lý.
            </div>
          ) : (
            sources.map((source) => {
              const isBusy =
                busySourceId === source.id || syncingSourceId === source.id || isSyncingAll;
              const feedHost = getFeedHost(source.feedUrl);
              if (editingSourceId === source.id) {
                return (
                  <div
                    key={source.id}
                    className="rounded-xl border border-[var(--ring)]/40 bg-card px-4 py-3.5 shadow-xs"
                  >
                    <NewsSourceEditForm
                      source={source}
                      isSaving={busySourceId === source.id}
                      onSave={(patch) => void handleUpdate(source, patch)}
                      onCancel={() => setEditingSourceId(null)}
                    />
                  </div>
                );
              }
              return (
                <div
                  key={source.id}
                  className="rounded-xl border border-border bg-card px-4 py-3.5 transition-colors duration-150 hover:border-foreground/20"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span
                        role="img"
                        aria-label={source.enabled ? "Đang bật" : "Đã tắt"}
                        title={source.enabled ? "Đang bật" : "Đã tắt"}
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          source.enabled
                            ? "bg-[var(--status-known)]"
                            : "bg-muted-foreground/40"
                        )}
                      />
                      <h4
                        className={cn(
                          "truncate text-sm font-semibold",
                          source.enabled ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {source.name}
                      </h4>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleSync(source.id)}
                        aria-label={`Quét nguồn ${source.name}`}
                        title="Quét nguồn này ngay"
                        className={cn(ROADMAP_SECONDARY_BTN_CLASS, "h-7 px-2.5 text-xs")}
                      >
                        <RefreshCw
                          className={cn(
                            "size-3",
                            syncingSourceId === source.id && "animate-spin"
                          )}
                          aria-hidden="true"
                        />
                        <span>Quét</span>
                      </button>

                      {busySourceId === source.id ? (
                        <span className="flex size-7 items-center justify-center text-muted-foreground">
                          <Loader2 className="size-3.5 animate-spin" aria-label="Đang xử lý" />
                        </span>
                      ) : (
                        <ActionMenu
                          label={`Tuỳ chọn nguồn ${source.name}`}
                          items={[
                            {
                              label: source.enabled ? "Tắt nguồn" : "Bật nguồn",
                              icon: source.enabled ? PowerOff : Power,
                              onSelect: () => void handleToggleEnabled(source),
                            },
                            {
                              label: "Chỉnh sửa",
                              icon: Pencil,
                              onSelect: () => setEditingSourceId(source.id),
                            },
                            {
                              label: "Xoá nguồn",
                              icon: Trash2,
                              danger: true,
                              onSelect: () => void handleDelete(source),
                              confirm: {
                                title: `Xoá "${source.name}"?`,
                                description: "Bài đã lấy từ nguồn này vẫn được giữ lại.",
                                confirmLabel: "Xoá",
                              },
                            },
                          ]}
                        />
                      )}
                    </div>
                  </div>

                  <div
                    className="mt-1.5 flex min-w-0 items-center gap-1.5 font-mono text-xs text-muted-foreground"
                    title={source.feedUrl}
                  >
                    <span className="min-w-0 truncate">{formatFeedUrl(source.feedUrl)}</span>
                    {source.domain !== feedHost && (
                      <span
                        title={source.domain}
                        className="min-w-0 max-w-[12rem] shrink-0 truncate rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground/80"
                      >
                        → {source.domain}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-relaxed text-muted-foreground">
                    {source.defaultTags.map((tag) => (
                      <span
                        key={tag}
                        className="[overflow-wrap:anywhere] rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground/80"
                      >
                        #{tag}
                      </span>
                    ))}
                    <span className="[overflow-wrap:anywhere]">
                      {formatPullTime(source.lastFetchedAt)}
                    </span>
                  </div>

                  {source.lastError && (
                    <p className="mt-2.5 [overflow-wrap:anywhere] rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive">
                      {source.lastError}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </Sheet>
  );
}
