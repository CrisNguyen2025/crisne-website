"use client";

import React, { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Loader2, Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import * as newsService from "@/logic/news/newsService";

interface QuickPasteDialogProps {
  open: boolean;
  onClose: () => void;
  onIngested: () => void;
}

interface PasteResultRow {
  url: string;
  kind: "queued" | "duplicate" | "error";
  message: string;
}

export function QuickPasteDialog({ open, onClose, onIngested }: QuickPasteDialogProps) {
  const [urlsText, setUrlsText] = useState("");
  const [forceDeep, setForceDeep] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<PasteResultRow[]>([]);

  const handleClose = () => {
    if (isSubmitting) return;
    setResults([]);
    onClose();
  };

  const submitUrls = async () => {
    const lines = Array.from(
      new Set(
        urlsText
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      )
    );
    if (lines.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setResults([]);

    const batchResults: PasteResultRow[] = [];
    let anyAccepted = false;

    for (const url of lines) {
      try {
        const res = await newsService.ingestNewsUrl({
          url,
          origin: "manual",
          forceDeep,
        });
        anyAccepted = true;
        if (res.status === "duplicate") {
          batchResults.push({
            url,
            kind: "duplicate",
            message: `Đã có sẵn: ${res.item.title}`,
          });
        } else {
          batchResults.push({
            url,
            kind: "queued",
            message: `Đã vào hàng đợi (${res.item.domain})`,
          });
        }
      } catch (error) {
        const errWithCode = error as Error & { code?: string };
        batchResults.push({
          url,
          kind: "error",
          message: errWithCode.code
            ? `${errWithCode.message} [${errWithCode.code}]`
            : errWithCode.message || "Không thể nạp URL",
        });
      }
    }

    setResults(batchResults);
    if (anyAccepted) {
      onIngested();
    }
    if (batchResults.every((r) => r.kind !== "error")) {
      setUrlsText("");
      setForceDeep(false);
    }
    setIsSubmitting(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitUrls();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Thêm link vào kho tin"
      description="Dán một hoặc nhiều URL (mỗi dòng 1 link) thuộc whitelist YouTube, TikTok, GitHub, ArXiv, Dev.to, Substack..."
      icon={<Plus className="size-4" />}
      className="sm:max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="quick-paste-urls"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Danh sách URL
          </label>
          <textarea
            id="quick-paste-urls"
            rows={4}
            required
            value={urlsText}
            onChange={(e) => setUrlsText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void submitUrls();
              }
            }}
            placeholder={"https://www.youtube.com/watch?v=...\nhttps://vt.tiktok.com/..."}
            className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-150 focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={forceDeep}
            onChange={(e) => setForceDeep(e.target.checked)}
            className="mt-0.5 size-3.5 rounded border-input accent-[var(--editorial-accent)]"
          />
          <span>Phân tích sâu (bỏ qua tầng description, dùng Whisper / Vision nếu cần)</span>
        </label>

        {results.length > 0 && (
          <ul className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-xs motion-safe:animate-in motion-safe:fade-in duration-150">
            {results.map((row) => (
              <li key={row.url} className="flex items-start gap-2">
                {row.kind === "error" ? (
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                ) : row.kind === "duplicate" ? (
                  <Clock className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                ) : (
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{row.url}</p>
                  <p
                    className={
                      row.kind === "error"
                        ? "font-medium text-destructive"
                        : "font-medium text-foreground"
                    }
                  >
                    {row.message}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-[background-color,transform] duration-150 hover:bg-accent active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
          >
            Đóng
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !urlsText.trim()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            <span>Đưa vào hàng đợi</span>
          </button>
        </div>
      </form>
    </Dialog>
  );
}
