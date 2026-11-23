"use client";

import React, { useState } from "react";
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
import type {
  CronSyncSummary,
  NewsSourceDto,
  UpdateNewsSourceRequest,
} from "@/lib/news/schemas";
import { NEWS_CRON_SCHEDULE } from "@/lib/news/cron-schedule";
import { dayjs, formatFriendlyTime } from "@/lib/roadmap/date-utils";
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

const EDIT_INPUT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-150 focus:outline-none focus:ring-2 focus:ring-ring";
const EDIT_LABEL_CLASS = "mb-1 block text-[11px] font-medium text-muted-foreground";

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
  const fieldId = `rss-edit-${source.id}`;

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
    <form onSubmit={handleSubmit} className="space-y-2.5" aria-label={`Chỉnh sửa nguồn ${source.name}`}>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${fieldId}-name`} className={EDIT_LABEL_CLASS}>
            Tên nguồn
          </label>
          <input
            id={`${fieldId}-name`}
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={EDIT_INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-domain`} className={EDIT_LABEL_CLASS}>
            Domain bài viết (tuỳ chọn)
          </label>
          <input
            id={`${fieldId}-domain`}
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="Tự tách từ Feed URL"
            className={EDIT_INPUT_CLASS}
          />
        </div>
      </div>
      <div>
        <label htmlFor={`${fieldId}-feed`} className={EDIT_LABEL_CLASS}>
          RSS / Atom Feed URL
        </label>
        <input
          id={`${fieldId}-feed`}
          type="url"
          required
          value={feedUrl}
          onChange={(e) => setFeedUrl(e.target.value)}
          className={`${EDIT_INPUT_CLASS} font-mono`}
        />
      </div>
      <div>
        <label htmlFor={`${fieldId}-tags`} className={EDIT_LABEL_CLASS}>
          Tags mặc định (phân tách dấu phẩy)
        </label>
        <input
          id={`${fieldId}-tags`}
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="nextjs, frontend"
          className={EDIT_INPUT_CLASS}
        />
      </div>
      <div className="flex justify-end gap-1.5 pt-0.5">
        <button
          type="button"
          disabled={isSaving}
          onClick={onCancel}
          className="inline-flex h-7 items-center rounded-md px-2.5 text-[11px] font-medium text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-accent hover:text-foreground active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
        >
          Huỷ
        </button>
        <button
          type="submit"
          disabled={isSaving || !name.trim() || !feedUrl.trim()}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[11px] font-medium text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
        >
          {isSaving && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
          Lưu
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
    if (!trimmedName || !trimmedFeed) return;

    const defaultTags = tagsInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 5);

    setIsCreating(true);
    setFormError(null);
    try {
      await newsService.createNewsSource({
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
      toast("Đã thêm nguồn RSS mới", "success");
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
      await newsService.updateNewsSource(source.id, patch);
      await reloadSources();
      onChanged();
      setEditingSourceId(null);
      toast(`Đã cập nhật nguồn "${patch.name ?? source.name}"`, "success");
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
      className="max-w-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Rss className="size-4 text-[var(--editorial-accent)]" />
          <h2 className="text-sm font-semibold text-foreground">
            Nguồn RSS & Cron ({sources.length})
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isSyncingAll || sources.length === 0}
            onClick={() => void handleSync()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
          >
            {isSyncingAll ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            <span>Quét tất cả ngay</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng quản lý nguồn"
            className="-mr-1 rounded-lg p-1.5 text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-95 cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 space-y-6">
        {/* Add Source Form */}
        <form
          onSubmit={handleCreate}
          className="space-y-3 rounded-xl border border-border bg-muted/30 p-4"
        >
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Thêm nguồn RSS / Atom mới
          </h3>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="rss-source-name"
                className="mb-1 block text-[11px] font-medium text-muted-foreground"
              >
                Tên nguồn
              </label>
              <input
                id="rss-source-name"
                type="text"
                required
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Vercel Blog"
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-150 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label
                htmlFor="rss-source-domain"
                className="mb-1 block text-[11px] font-medium text-muted-foreground"
              >
                Domain bài viết (tuỳ chọn)
              </label>
              <input
                id="rss-source-domain"
                type="text"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="Tự tách từ Feed URL"
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-150 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="rss-source-feed-url"
              className="mb-1 block text-[11px] font-medium text-muted-foreground"
            >
              RSS / Atom Feed URL
            </label>
            <input
              id="rss-source-feed-url"
              type="url"
              required
              value={feedUrlInput}
              onChange={(e) => setFeedUrlInput(e.target.value)}
              placeholder="https://vercel.com/atom"
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-150 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label
                htmlFor="rss-source-tags"
                className="mb-1 block text-[11px] font-medium text-muted-foreground"
              >
                Tags mặc định (phân tách dấu phẩy)
              </label>
              <input
                id="rss-source-tags"
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="nextjs, frontend"
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-150 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <button
              type="submit"
              disabled={isCreating}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
            >
              {isCreating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              <span>Thêm nguồn</span>
            </button>
          </div>

          {formError && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span>{formError}</span>
            </p>
          )}
        </form>

        {/* Sync Summary Banner */}
        {lastSyncSummary && (() => {
          const totalSkipped = lastSyncSummary.results.reduce(
            (sum, r) => sum + r.skippedErrors,
            0
          );
          const failedSources = lastSyncSummary.results.filter((r) => Boolean(r.error));
          const notModifiedCount = lastSyncSummary.results.filter((r) => r.notModified).length;

          return (
            <div
              role="status"
              className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 text-xs text-emerald-800 dark:text-emerald-300 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 duration-200"
            >
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">
                  Đã quét {lastSyncSummary.sourcesProcessed} nguồn: +{lastSyncSummary.totalQueued} bài
                  mới vào Chờ xử lý · {lastSyncSummary.totalDuplicates} bài đã tồn tại
                  {notModifiedCount > 0 ? ` · ${notModifiedCount} nguồn chưa đổi` : ""}
                  {totalSkipped > 0 ? ` · ${totalSkipped} link bị bỏ qua` : ""}
                </p>
                {failedSources.map((src) => (
                  <p key={src.sourceId} className="text-destructive">
                    {src.sourceName}: {src.error}
                  </p>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Configured Sources List */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Danh sách nguồn đã cấu hình
            </h3>
            <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="size-3" aria-hidden="true" />
              Tự động: {NEWS_CRON_SCHEDULE.label}
            </p>
          </div>

          {sources.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-xs text-muted-foreground">
              Chưa có nguồn RSS nào. Thêm một feed ở trên để cron tự lấy bài định kỳ vào Chờ xử lý.
            </div>
          ) : (
            sources.map((source) => {
              const isBusy =
                busySourceId === source.id || syncingSourceId === source.id;
              if (editingSourceId === source.id) {
                return (
                  <div
                    key={source.id}
                    className="rounded-xl border border-ring/50 bg-card px-4 py-3"
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
                  className="rounded-xl border border-border bg-card px-4 py-3 transition-colors duration-150 hover:border-foreground/20"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        role="img"
                        aria-label={source.enabled ? "Đang bật" : "Đã tắt"}
                        title={source.enabled ? "Đang bật" : "Đã tắt"}
                        className={`size-2 shrink-0 rounded-full ${
                          source.enabled ? "bg-emerald-500" : "bg-muted-foreground/40"
                        }`}
                      />
                      <h4
                        className={`truncate text-sm font-semibold ${
                          source.enabled ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {source.name}
                      </h4>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleSync(source.id)}
                        aria-label={`Quét nguồn ${source.name}`}
                        title="Quét nguồn này ngay"
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium text-foreground transition-[background-color,transform] duration-150 hover:bg-accent active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
                      >
                        <RefreshCw
                          className={`size-3 ${
                            syncingSourceId === source.id ? "animate-spin" : ""
                          }`}
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

                  <p
                    className="mt-1 truncate font-mono text-[11px] text-muted-foreground"
                    title={source.feedUrl}
                  >
                    {formatFeedUrl(source.feedUrl)}
                    {source.domain !== getFeedHost(source.feedUrl) && ` → ${source.domain}`}
                  </p>

                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {[
                      ...source.defaultTags.map((tag) => `#${tag}`),
                      formatPullTime(source.lastFetchedAt),
                    ].join(" · ")}
                  </p>

                  {source.lastError && (
                    <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[11px] text-destructive">
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
