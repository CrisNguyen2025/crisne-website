"use client";

import React, { useId, useState } from "react";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import {
  ROADMAP_INPUT_CLASS,
  ROADMAP_SECONDARY_BTN_CLASS,
  RoadmapFieldLabel,
  RoadmapFormError,
} from "@/components/roadmap/RoadmapFormPrimitives";
import {
  FetchIntervalDaysSchema,
  NEWS_SOURCE_FETCH_INTERVAL_DAYS,
} from "@/lib/news/schemas";
import type {
  NewsSourcePreviewCandidateDto,
  NewsSourcePreviewDto,
} from "@/lib/news/schemas";
import { cn } from "@/lib/utils";
import * as newsService from "@/logic/news/newsService";

const FETCH_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
// A bare domain or URL with no spaces; anything else is pasted as plain text
const PASTED_LINK_REGEX = /^(https?:\/\/)?[^\s/]+\.[^\s]+$/i;

export function formatFeedUrl(feedUrl: string): string {
  return feedUrl.replace(/^https?:\/\/(www\.)?/, "");
}

export function formatFetchInterval(days: number): string {
  if (days === 1) return "Mỗi ngày";
  if (days === 7) return "Mỗi tuần";
  return `Mỗi ${days} ngày`;
}

export function formatFetchHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** State of one "link → detected feed" field, shared by the add and edit forms. */
export function useFeedLink(
  initialValue = "",
  options: { onDetected?: (preview: NewsSourcePreviewDto) => void } = {}
) {
  const [value, setValue] = useState(initialValue);
  const [preview, setPreview] = useState<NewsSourcePreviewDto | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Feeds found on pages the checked page links to, when the page itself has none
  const [suggestions, setSuggestions] = useState<NewsSourcePreviewCandidateDto[]>([]);

  const change = (next: string) => {
    setValue(next);
    setPreview(null);
    setError(null);
    setSuggestions([]);
  };

  /** Detects the feed behind `targetUrl` and swaps the field to the feed URL it found. */
  const detect = async (
    targetUrl: string = value
  ): Promise<NewsSourcePreviewDto | null> => {
    const trimmed = targetUrl.trim();
    if (!trimmed) {
      setError("Vui lòng dán link trang hoặc feed.");
      return null;
    }
    setIsPreviewing(true);
    setError(null);
    setSuggestions([]);
    try {
      const result = await newsService.previewNewsSource(trimmed);
      setPreview(result);
      setValue(result.resolvedFeedUrl);
      options.onDetected?.(result);
      return result;
    } catch (err) {
      setPreview(null);
      setError(
        err instanceof Error ? err.message : "Không thể kiểm tra nguồn RSS."
      );
      if (err instanceof newsService.NewsSourcePreviewError) setSuggestions(err.suggestions);
      return null;
    } finally {
      setIsPreviewing(false);
    }
  };

  const reset = () => {
    setValue("");
    setPreview(null);
    setError(null);
    setSuggestions([]);
  };

  return { value, preview, isPreviewing, error, suggestions, change, detect, reset };
}

export type FeedLink = ReturnType<typeof useFeedLink>;

interface FeedLinkFieldProps {
  link: FeedLink;
  disabled?: boolean;
}

/** Link input that detects the RSS / Atom feed on paste or on "Kiểm tra feed", with a preview card. */
export function FeedLinkField({ link, disabled = false }: FeedLinkFieldProps) {
  const inputId = useId();
  const errorId = useId();
  const { preview } = link;

  return (
    <div className="space-y-1.5">
      <RoadmapFieldLabel htmlFor={inputId} required>
        Link trang hoặc feed
      </RoadmapFieldLabel>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={inputId}
          type="url"
          required
          disabled={disabled || link.isPreviewing}
          aria-invalid={Boolean(link.error) || undefined}
          aria-describedby={link.error ? errorId : undefined}
          value={link.value}
          onChange={(e) => link.change(e.target.value)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text").trim();
            if (!PASTED_LINK_REGEX.test(pasted)) return;
            // A pasted link replaces the field and is detected right away
            e.preventDefault();
            link.change(pasted);
            void link.detect(pasted);
          }}
          placeholder="https://nextjs.org/docs"
          className={cn(
            ROADMAP_INPUT_CLASS,
            // flex-1 only in the row layout: in the mobile column it would shrink the input below h-9
            "min-w-0 shrink-0 font-mono text-base sm:flex-1 sm:shrink sm:text-[0.8125rem]"
          )}
        />
        <button
          type="button"
          disabled={disabled || link.isPreviewing || !link.value.trim()}
          onClick={() => void link.detect()}
          className={cn(
            ROADMAP_SECONDARY_BTN_CLASS,
            "shrink-0 whitespace-nowrap"
          )}
        >
          {link.isPreviewing ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="size-3.5" aria-hidden="true" />
          )}
          <span>Kiểm tra feed</span>
        </button>
      </div>

      <RoadmapFormError
        id={errorId}
        message={link.error ?? ""}
        className="[overflow-wrap:anywhere]"
      />

      {link.suggestions.length > 0 && (
        <div className="space-y-1.5" role="group" aria-label="Feed gợi ý">
          <p className="text-[0.6875rem] font-medium text-muted-foreground">
            Feed tìm thấy trên các trang liên quan:
          </p>
          <div className="flex flex-col gap-1.5">
            {link.suggestions.map((suggestion) => (
              <button
                key={suggestion.url}
                type="button"
                disabled={disabled || link.isPreviewing}
                onClick={() => {
                  link.change(suggestion.url);
                  void link.detect(suggestion.url);
                }}
                className="flex min-w-0 items-baseline gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-left text-xs transition-colors hover:border-foreground/30 hover:bg-muted disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
              >
                <span className="shrink-0 font-medium text-foreground">
                  {suggestion.title || formatFeedUrl(suggestion.url)}
                </span>
                <span className="min-w-0 truncate font-mono text-[0.6875rem] text-muted-foreground">
                  {formatFeedUrl(suggestion.url)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {preview && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] uppercase text-foreground/80">
                {preview.format}
              </span>
              <span className="truncate">
                {preview.feedTitle || preview.siteHost}
              </span>
            </div>
            <span className="tabular-nums text-muted-foreground">
              {preview.itemCount} bài
            </span>
          </div>

          {preview.candidates.length > 1 && (
            <div className="space-y-1">
              <p className="text-[0.6875rem] font-medium text-muted-foreground">
                Chọn một trong {preview.candidates.length} feed tìm thấy:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {preview.candidates.map((cand) => {
                  const isSelected = cand.url === preview.resolvedFeedUrl;
                  return (
                    <button
                      key={cand.url}
                      type="button"
                      onClick={() => void link.detect(cand.url)}
                      className={cn(
                        "max-w-full truncate rounded-md border px-2 py-1 text-[0.6875rem] transition-colors cursor-pointer",
                        isSelected
                          ? "border-[var(--editorial-accent)] bg-[var(--editorial-accent)]/10 font-medium text-foreground"
                          : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {cand.title || formatFeedUrl(cand.url)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {preview.sampleItems.length > 0 && (
            <ul className="space-y-1 border-t border-border/60 pt-2 text-muted-foreground">
              {preview.sampleItems.slice(0, 3).map((item) => (
                <li key={item.url} className="truncate">
                  • {item.title || item.url}
                </li>
              ))}
            </ul>
          )}

          {preview.warnings.map((warning) => (
            <p
              key={warning}
              className="flex items-start gap-1.5 rounded-md border border-[var(--status-learning-border)] bg-[var(--status-learning-bg)] px-2.5 py-1.5 text-[0.6875rem] leading-relaxed text-[var(--status-learning)]"
            >
              <AlertTriangle
                className="mt-0.5 size-3.5 shrink-0"
                aria-hidden="true"
              />
              <span>{warning}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export interface FetchSchedule {
  fetchIntervalDays: 1 | 3 | 7;
  fetchHour: number;
}

interface FetchScheduleFieldsProps {
  value: FetchSchedule;
  onChange: (next: FetchSchedule) => void;
  disabled?: boolean;
}

/** Interval and hour (Vietnam time) of the automatic cron pull. */
export function FetchScheduleFields({
  value,
  onChange,
  disabled = false,
}: FetchScheduleFieldsProps) {
  const intervalId = useId();
  const hourId = useId();

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <RoadmapFieldLabel htmlFor={intervalId}>
          Tần suất quét tự động
        </RoadmapFieldLabel>
        <select
          id={intervalId}
          disabled={disabled}
          value={value.fetchIntervalDays}
          onChange={(e) => {
            const parsed = FetchIntervalDaysSchema.safeParse(
              Number(e.target.value)
            );
            if (parsed.success)
              onChange({ ...value, fetchIntervalDays: parsed.data });
          }}
          className={cn(ROADMAP_INPUT_CLASS, "text-base sm:text-sm")}
        >
          {NEWS_SOURCE_FETCH_INTERVAL_DAYS.map((days) => (
            <option key={days} value={days}>
              {formatFetchInterval(days)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <RoadmapFieldLabel htmlFor={hourId}>
          Giờ quét (giờ VN)
        </RoadmapFieldLabel>
        <select
          id={hourId}
          disabled={disabled}
          value={value.fetchHour}
          onChange={(e) =>
            onChange({ ...value, fetchHour: Number(e.target.value) })
          }
          className={cn(ROADMAP_INPUT_CLASS, "text-base sm:text-sm")}
        >
          {FETCH_HOURS.map((hour) => (
            <option key={hour} value={hour}>
              {formatFetchHour(hour)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
