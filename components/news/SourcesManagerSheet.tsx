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
  History,
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
  RoadmapFieldLabel,
  RoadmapFormError,
} from "@/components/roadmap/RoadmapFormPrimitives";
import {
  FeedLinkField,
  FetchScheduleFields,
  type FetchSchedule,
  formatFeedUrl,
  formatFetchHour,
  formatFetchInterval,
  useFeedLink,
} from "@/components/news/NewsSourceFields";
import { NewsSourceScanHistory } from "@/components/news/NewsSourceScanHistory";
import {
  FetchIntervalDaysSchema,
  NEWS_SOURCE_DEFAULT_FETCH_HOUR,
} from "@/lib/news/schemas";
import type {
  CronSyncSummary,
  NewsSourceDto,
  NewsSourceScanDto,
  UpdateNewsSourceRequest,
} from "@/lib/news/schemas";
import { NEWS_CRON_SCHEDULE } from "@/lib/news/cron-schedule";
import { dayjs, formatFriendlyTime } from "@/lib/roadmap/date-utils";
import { cn } from "@/lib/utils";
import * as newsService from "@/logic/news/newsService";

const DEFAULT_FETCH_SCHEDULE: FetchSchedule = {
  fetchIntervalDays: 1,
  fetchHour: NEWS_SOURCE_DEFAULT_FETCH_HOUR,
};

function getFeedHost(feedUrl: string): string {
  try {
    return new URL(feedUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function formatPullTime(lastFetchedAt: string | null): string {
  if (!lastFetchedAt) return "Chưa pull lần nào";
  return `Pull lúc ${dayjs(lastFetchedAt).format("HH:mm DD/MM")} · ${formatFriendlyTime(lastFetchedAt)}`;
}

function getFetchSchedule(source: NewsSourceDto): FetchSchedule {
  const interval = FetchIntervalDaysSchema.safeParse(source.fetchIntervalDays);
  return {
    fetchIntervalDays: interval.success ? interval.data : DEFAULT_FETCH_SCHEDULE.fetchIntervalDays,
    fetchHour: source.fetchHour,
  };
}

interface NewsSourceEditFormProps {
  source: NewsSourceDto;
  isSaving: boolean;
  onSave: (patch: UpdateNewsSourceRequest) => void;
  onCancel: () => void;
}

/** Inline editor for one configured source: same fields as the add form plus the name; sends only what changed. */
function NewsSourceEditForm({ source, isSaving, onSave, onCancel }: NewsSourceEditFormProps) {
  const initialSchedule = getFetchSchedule(source);
  const [name, setName] = useState(source.name);
  const [schedule, setSchedule] = useState<FetchSchedule>(initialSchedule);
  const link = useFeedLink(source.feedUrl);
  const nameId = useId();
  const isBusy = isSaving || link.isPreviewing;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const patch: UpdateNewsSourceRequest = {};
    const trimmedName = name.trim();
    if (trimmedName && trimmedName !== source.name) patch.name = trimmedName;

    // A detected feed brings its own site host; a typed link is resolved by the server
    const nextFeedUrl = link.preview?.resolvedFeedUrl ?? link.value.trim();
    if (nextFeedUrl && nextFeedUrl !== source.feedUrl) {
      patch.feedUrl = nextFeedUrl;
      const nextDomain = link.preview?.siteHost || getFeedHost(nextFeedUrl);
      if (nextDomain && nextDomain !== source.domain) patch.domain = nextDomain;
    }

    if (schedule.fetchIntervalDays !== initialSchedule.fetchIntervalDays) {
      patch.fetchIntervalDays = schedule.fetchIntervalDays;
    }
    if (schedule.fetchHour !== initialSchedule.fetchHour) patch.fetchHour = schedule.fetchHour;

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

      <FeedLinkField link={link} disabled={isSaving} />
      <FetchScheduleFields value={schedule} onChange={setSchedule} disabled={isSaving} />

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
          disabled={isBusy || !name.trim() || !link.value.trim()}
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
  const createErrorId = useId();

  const [sources, setSources] = useState<NewsSourceDto[]>(initialSources);
  const [prevInitialSources, setPrevInitialSources] = useState<NewsSourceDto[]>(initialSources);
  if (initialSources !== prevInitialSources) {
    setPrevInitialSources(initialSources);
    setSources(initialSources);
  }
  const [createName, setCreateName] = useState("");
  // A detected feed fills the name only while the Owner has not typed one
  const createLink = useFeedLink("", {
    onDetected: (preview) =>
      setCreateName((current) => (current.trim() ? current : (preview.feedTitle ?? ""))),
  });
  const createNameId = useId();
  const [createSchedule, setCreateSchedule] = useState<FetchSchedule>(DEFAULT_FETCH_SCHEDULE);
  const [isCreating, setIsCreating] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncingSourceId, setSyncingSourceId] = useState<string | null>(null);
  const [busySourceId, setBusySourceId] = useState<string | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastSyncSummary, setLastSyncSummary] = useState<CronSyncSummary | null>(null);
  // Scan history of at most one source at a time; scans is null while loading
  const [scanHistory, setScanHistory] = useState<{
    sourceId: string;
    scans: NewsSourceScanDto[] | null;
    error: string | null;
  } | null>(null);

  const reloadSources = async () => {
    const res = await newsService.fetchNewsSources();
    setSources(res.sources);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createLink.value.trim()) return;

    setIsCreating(true);
    setFormError(null);
    try {
      // Reuse the shown preview; otherwise detect the feed now so name and domain come from it
      const preview = createLink.preview ?? (await createLink.detect());
      if (!preview) return;
      const { source } = await newsService.createNewsSource({
        name: (createName.trim() || preview.feedTitle?.trim() || preview.siteHost).slice(0, 120),
        feedUrl: preview.resolvedFeedUrl,
        domain: preview.siteHost || undefined,
        enabled: true,
        ...createSchedule,
      });
      createLink.reset();
      setCreateName("");
      setCreateSchedule(DEFAULT_FETCH_SCHEDULE);
      await reloadSources();
      onChanged();
      toast(`Đã thêm nguồn "${source.name}" (${formatFeedUrl(source.feedUrl)})`, "success");
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

  const loadScanHistory = async (sourceId: string) => {
    setScanHistory({ sourceId, scans: null, error: null });
    try {
      const { scans } = await newsService.fetchNewsSourceScans(sourceId);
      setScanHistory((current) =>
        current?.sourceId === sourceId ? { sourceId, scans, error: null } : current
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không tải được lịch sử quét.";
      setScanHistory((current) =>
        current?.sourceId === sourceId ? { sourceId, scans: [], error: message } : current
      );
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
      // An open history should show the scan that just ran
      if (scanHistory && (!sourceId || scanHistory.sourceId === sourceId)) {
        void loadScanHistory(scanHistory.sourceId);
      }
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

          <FeedLinkField link={createLink} disabled={isCreating} />
          <div className="space-y-1.5">
            <RoadmapFieldLabel htmlFor={createNameId}>Tên nguồn (tuỳ chọn)</RoadmapFieldLabel>
            <input
              id={createNameId}
              type="text"
              maxLength={120}
              disabled={isCreating}
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder={createLink.preview?.feedTitle || "Tự lấy theo tên feed"}
              className={cn(ROADMAP_INPUT_CLASS, "text-base sm:text-sm")}
            />
          </div>
          <FetchScheduleFields
            value={createSchedule}
            onChange={setCreateSchedule}
            disabled={isCreating}
          />

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isCreating || createLink.isPreviewing || !createLink.value.trim()}
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
                {lastSyncSummary.results
                  .filter((r) => (r.skippedReasons?.length ?? 0) > 0)
                  .map((src) => (
                    <p
                      key={`${src.sourceId}-skipped`}
                      className="[overflow-wrap:anywhere] text-[0.6875rem] opacity-90"
                    >
                      {src.sourceName}: bỏ qua {src.skippedErrors} link (
                      {Array.from(new Set(src.skippedReasons?.map((s) => s.code))).join(", ")})
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
                      <span
                        title={`${source.itemCount} bài đã lấy từ nguồn này`}
                        aria-label={`${source.itemCount} bài`}
                        className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[0.6875rem] font-medium tabular-nums text-foreground/80"
                      >
                        {source.itemCount}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {isBusy ? (
                        <span className="flex size-7 items-center justify-center text-muted-foreground">
                          <Loader2 className="size-3.5 animate-spin" aria-label="Đang xử lý" />
                        </span>
                      ) : (
                        <ActionMenu
                          label={`Tuỳ chọn nguồn ${source.name}`}
                          items={[
                            {
                              label: "Chỉnh sửa",
                              icon: Pencil,
                              onSelect: () => setEditingSourceId(source.id),
                            },
                            {
                              label: "Quét ngay",
                              icon: RefreshCw,
                              onSelect: () => void handleSync(source.id),
                            },
                            {
                              label:
                                scanHistory?.sourceId === source.id
                                  ? "Ẩn lịch sử quét"
                                  : "Lịch sử quét",
                              icon: History,
                              onSelect: () =>
                                scanHistory?.sourceId === source.id
                                  ? setScanHistory(null)
                                  : void loadScanHistory(source.id),
                            },
                            {
                              label: source.enabled ? "Tắt nguồn" : "Bật nguồn",
                              icon: source.enabled ? PowerOff : Power,
                              onSelect: () => void handleToggleEnabled(source),
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
                    <span>
                      {formatFetchInterval(source.fetchIntervalDays)} ·{" "}
                      {formatFetchHour(source.fetchHour)}
                    </span>
                    <span className="[overflow-wrap:anywhere]">
                      {formatPullTime(source.lastFetchedAt)}
                    </span>
                  </div>

                  {source.lastError && (
                    <p className="mt-2.5 [overflow-wrap:anywhere] rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive">
                      {source.lastError}
                    </p>
                  )}

                  {scanHistory?.sourceId === source.id && (
                    <NewsSourceScanHistory
                      scans={scanHistory.scans}
                      error={scanHistory.error}
                      onClose={() => setScanHistory(null)}
                    />
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
