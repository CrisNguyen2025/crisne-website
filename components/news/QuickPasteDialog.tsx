"use client";

import React, { useId, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import {
  ROADMAP_GHOST_BTN_CLASS,
  ROADMAP_MODAL_TITLE_CLASS,
  ROADMAP_PRIMARY_BTN_CLASS,
  ROADMAP_TEXTAREA_CLASS,
  RoadmapFieldLabel,
} from "@/components/roadmap/RoadmapFormPrimitives";
import { useToast } from "@/components/ui/toast";
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

function parseUrlLines(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    )
  );
}

export function QuickPasteDialog({ open, onClose, onIngested }: QuickPasteDialogProps) {
  const { toast } = useToast();
  const formId = useId();
  const textareaId = useId();
  const [urlsText, setUrlsText] = useState("");
  const [forceDeep, setForceDeep] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<PasteResultRow[]>([]);

  const parsedUrls = useMemo(() => parseUrlLines(urlsText), [urlsText]);

  const handleClose = () => {
    if (isSubmitting) return;
    setResults([]);
    onClose();
  };

  const submitUrls = async () => {
    if (parsedUrls.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setResults([]);

    const batchResults: PasteResultRow[] = [];
    let anyAccepted = false;

    for (const url of parsedUrls) {
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

    if (anyAccepted) {
      onIngested();
    }
    const allSucceeded = batchResults.length > 0 && batchResults.every((r) => r.kind !== "error");
    if (allSucceeded) {
      setUrlsText("");
      setForceDeep(false);
      setResults([]);
      setIsSubmitting(false);
      toast(
        batchResults.length === 1
          ? batchResults[0].message
          : `Đã thêm ${batchResults.length} link vào kho tin`,
        "success"
      );
      onClose();
      return;
    }

    setResults(batchResults);
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
      titleClassName={ROADMAP_MODAL_TITLE_CLASS}
      description="Dán một hoặc nhiều URL, mỗi dòng một link."
      className="roadmap-theme sm:max-w-lg"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            <kbd className="font-mono">⌘/Ctrl</kbd>+<kbd className="font-mono">Enter</kbd>
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className={ROADMAP_GHOST_BTN_CLASS}
            >
              Đóng
            </button>
            <button
              type="submit"
              form={formId}
              disabled={isSubmitting || parsedUrls.length === 0}
              className={ROADMAP_PRIMARY_BTN_CLASS}
            >
              {isSubmitting && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              <span>{isSubmitting ? "Đang đưa vào hàng đợi…" : "Đưa vào hàng đợi"}</span>
            </button>
          </div>
        </div>
      }
    >
      <form id={formId} noValidate onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <RoadmapFieldLabel
            htmlFor={textareaId}
            trailing={
              <span className="text-xs tabular-nums text-muted-foreground">
                {parsedUrls.length > 0
                  ? `${parsedUrls.length} link`
                  : "YouTube, TikTok, GitHub, Substack…"}
              </span>
            }
          >
            Danh sách URL
          </RoadmapFieldLabel>
          <textarea
            id={textareaId}
            rows={4}
            required
            disabled={isSubmitting}
            value={urlsText}
            onChange={(e) => setUrlsText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void submitUrls();
              }
            }}
            placeholder={"https://www.youtube.com/watch?v=...\nhttps://vt.tiktok.com/..."}
            className={`${ROADMAP_TEXTAREA_CLASS} min-h-[6.5rem] resize-none font-mono text-base sm:text-[0.8125rem]`}
          />
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 transition-colors duration-150 hover:bg-muted/50 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={forceDeep}
            disabled={isSubmitting}
            onChange={(e) => setForceDeep(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded border-input accent-[var(--editorial-accent)] cursor-pointer"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[0.8125rem] font-medium text-foreground">
              Phân tích sâu
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
              Bỏ qua mô tả ngắn, dùng Whisper / Vision nếu cần.
            </span>
          </span>
        </label>

        {results.length > 0 && (
          <ul className="divide-y divide-border/70 rounded-xl border border-border bg-background text-xs motion-safe:animate-in motion-safe:fade-in duration-150">
            {results.map((row) => (
              <li key={row.url} className="flex items-start gap-2.5 px-3.5 py-2.5">
                {row.kind === "error" && (
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden="true" />
                )}
                {row.kind === "duplicate" && (
                  <Clock className="mt-0.5 size-3.5 shrink-0 text-[var(--status-learning)]" aria-hidden="true" />
                )}
                {row.kind !== "error" && row.kind !== "duplicate" && (
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--status-known)]" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{row.url}</p>
                  <p
                    className={
                      row.kind === "error"
                        ? "mt-0.5 [overflow-wrap:anywhere] font-medium text-destructive"
                        : "mt-0.5 [overflow-wrap:anywhere] font-medium text-foreground"
                    }
                  >
                    {row.message}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </form>
    </Dialog>
  );
}
