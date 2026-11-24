"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Link2, Loader2, Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NEWS_PATH } from "@/lib/news/paths";
import { ingestNewsUrl } from "@/logic/news/newsService";

const REDIRECT_DELAY_MS = 2500;

type ShareState =
  | { status: "loading" }
  | { status: "success"; isDuplicate: boolean }
  | { status: "error"; message: string };

interface ShareTargetClientProps {
  url: string;
}

const VIDEO_HOSTS: Record<string, string> = {
  "tiktok.com": "Video TikTok",
  "youtube.com": "Video YouTube",
  "youtu.be": "Video YouTube",
  "facebook.com": "Video Facebook",
  "fb.watch": "Video Facebook",
  "instagram.com": "Bài Instagram",
};

function describeSource(url: string): { label: string; host: string; isVideo: boolean } {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return { label: "Liên kết", host, isVideo: false };
  }
  const key = Object.keys(VIDEO_HOSTS).find((h) => host === h || host.endsWith(`.${h}`));
  return key
    ? { label: VIDEO_HOSTS[key], host, isVideo: true }
    : { label: "Bài viết", host, isVideo: false };
}

export function ShareTargetClient({ url }: ShareTargetClientProps) {
  const router = useRouter();
  const [state, setState] = useState<ShareState>({ status: "loading" });
  const hasFired = useRef(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const source = describeSource(url);

  const submit = useCallback(() => {
    setState({ status: "loading" });
    ingestNewsUrl({ url, origin: "share" })
      .then((result) => {
        setState({ status: "success", isDuplicate: result.status === "duplicate" });
        redirectTimer.current = setTimeout(() => router.replace(NEWS_PATH), REDIRECT_DELAY_MS);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Không thêm được vào hàng đợi.";
        setState({ status: "error", message });
      });
  }, [url, router]);

  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;
    submit();
  }, [submit]);

  useEffect(
    () => () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    },
    []
  );

  const SourceIcon = source.isVideo ? Play : Link2;

  return (
    <div className="flex min-h-dvh flex-col justify-end">
      <section
        aria-live="polite"
        className="rounded-t-3xl border-t border-border bg-card px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] motion-safe:animate-in motion-safe:slide-in-from-bottom-8 motion-safe:fade-in duration-300"
      >
        <div aria-hidden className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />

        <div className="flex items-center gap-3">
          {state.status === "loading" && (
            <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </span>
          )}
          {state.status === "success" && (
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground motion-safe:animate-in motion-safe:zoom-in-50 duration-300">
              <Check className="size-4" strokeWidth={3} />
            </span>
          )}
          {state.status === "error" && (
            <span className="flex size-8 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="size-4" />
            </span>
          )}

          <div className="min-w-0">
            <h1 className="font-display text-xl leading-tight">
              {state.status === "loading" && "Đang lưu…"}
              {state.status === "success" && "Đã lưu"}
              {state.status === "error" && "Chưa lưu được"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {state.status === "loading" && "Đang thêm vào hàng đợi…"}
              {state.status === "success" &&
                (state.isDuplicate ? "Bài này đã có trong hàng đợi." : "Đã thêm vào hàng đợi xử lý.")}
              {state.status === "error" && state.message}
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-xl border border-border bg-background p-3">
          <span className="flex h-12 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <SourceIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">{source.label}</p>
            <p className="truncate text-xs text-muted-foreground">{url}</p>
          </div>
        </div>

        <div aria-hidden className="mt-5 h-0.5 overflow-hidden rounded-full bg-muted">
          {state.status === "success" && (
            <div className="h-full origin-left bg-primary motion-safe:animate-[share-redirect_2500ms_linear_forwards]" />
          )}
        </div>

        <div className="mt-4 flex gap-2">
          {state.status === "error" && (
            <button
              type="button"
              onClick={submit}
              className="h-11 flex-1 cursor-pointer rounded-xl border border-border text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-accent active:scale-[0.98]"
            >
              Thử lại
            </button>
          )}
          <Link
            href={NEWS_PATH}
            aria-disabled={state.status === "loading"}
            className="flex h-11 flex-1 items-center justify-center rounded-xl bg-primary text-sm font-medium text-primary-foreground transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98] aria-disabled:pointer-events-none aria-disabled:opacity-40"
          >
            {state.status === "success" ? "Mở ngay" : "Về News"}
          </Link>
        </div>
      </section>
    </div>
  );
}
