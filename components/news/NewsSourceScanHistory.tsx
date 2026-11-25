"use client";

import React from "react";
import { Loader2, X } from "lucide-react";
import type { NewsSourceScanDto, NewsSourceScanTrigger } from "@/lib/news/schemas";
import { dayjs } from "@/lib/roadmap/date-utils";
import { cn } from "@/lib/utils";

const TRIGGER_LABELS: Record<NewsSourceScanTrigger, string> = {
  cron: "Tự động",
  manual: "Quét ngay",
  manual_all: "Quét tất cả",
};

function formatScanResult(scan: NewsSourceScanDto): string {
  if (scan.error) return scan.error;
  if (scan.notModified) return "Feed không đổi";
  const parts = [`+${scan.queued} mới`, `${scan.duplicates} trùng`];
  if (scan.skippedErrors > 0) parts.push(`${scan.skippedErrors} bỏ qua`);
  return parts.join(" · ");
}

interface NewsSourceScanHistoryProps {
  /** null while loading */
  scans: NewsSourceScanDto[] | null;
  error: string | null;
  onClose: () => void;
}

function ScanHistoryBody({
  scans,
  error,
}: {
  scans: NewsSourceScanDto[] | null;
  error: string | null;
}) {
  if (error) {
    return <p className="[overflow-wrap:anywhere] text-destructive">{error}</p>;
  }
  if (scans === null) {
    return (
      <p className="flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        <span>Đang tải…</span>
      </p>
    );
  }
  if (scans.length === 0) {
    return <p className="text-muted-foreground">Chưa có lần quét nào được ghi lại.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {scans.map((scan) => (
        <li key={scan.id} className="flex min-w-0 items-baseline gap-2 leading-relaxed">
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {dayjs(scan.createdAt).format("HH:mm DD/MM")}
          </span>
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[0.6875rem] text-foreground/80">
            {TRIGGER_LABELS[scan.trigger]}
          </span>
          <span
            className={cn(
              "min-w-0 [overflow-wrap:anywhere]",
              scan.error ? "text-destructive" : "text-foreground/90"
            )}
          >
            {formatScanResult(scan)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Latest scans of one source, shown under its card. */
export function NewsSourceScanHistory({ scans, error, onClose }: NewsSourceScanHistoryProps) {
  return (
    <section
      aria-label="Lịch sử quét"
      className="mt-3 space-y-2 border-t border-border/60 pt-3 text-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <h5 className="font-medium text-foreground">Lịch sử quét</h5>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng lịch sử quét"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      <ScanHistoryBody error={error} scans={scans} />
    </section>
  );
}
