"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ingestNewsUrl } from "@/logic/news/newsService";

type ShareState =
  | { status: "loading" }
  | { status: "success"; message: string }
  | { status: "error"; message: string; code?: string };

interface ShareTargetClientProps {
  url: string;
}

export function ShareTargetClient({ url }: ShareTargetClientProps) {
  const router = useRouter();
  const [state, setState] = useState<ShareState>({ status: "loading" });
  const hasFired = useRef(false);

  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;

    ingestNewsUrl({ url, origin: "share" })
      .then((result) => {
        const msg =
          result.status === "duplicate"
            ? "Bài này đã có trong hàng đợi."
            : "Đã thêm vào hàng đợi xử lý.";
        setState({ status: "success", message: msg });
        // Redirect to /news after 2.5s
        setTimeout(() => router.replace("/news"), 2500);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Không thêm được vào hàng đợi.";
        setState({ status: "error", message });
      });
  }, [url, router]);

  const handleRetry = () => {
    setState({ status: "loading" });
    ingestNewsUrl({ url, origin: "share" })
      .then((result) => {
        const msg =
          result.status === "duplicate"
            ? "Bài này đã có trong hàng đợi."
            : "Đã thêm vào hàng đợi xử lý.";
        setState({ status: "success", message: msg });
        setTimeout(() => router.replace("/news"), 2500);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Không thêm được vào hàng đợi.";
        setState({ status: "error", message });
      });
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        {state.status === "loading" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Đang thêm vào hàng đợi…</p>
          </div>
        )}

        {state.status === "success" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
            <p className="font-medium">{state.message}</p>
            <p className="text-sm text-muted-foreground">
              Đang chuyển về News…
            </p>
            <Link
              href="/news"
              className="text-xs text-primary underline underline-offset-2"
            >
              Mở ngay
            </Link>
          </div>
        )}

        {state.status === "error" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <XCircle className="h-8 w-8 text-destructive" />
            <p className="font-medium text-destructive">{state.message}</p>
            <p className="truncate text-xs text-muted-foreground">{url}</p>
            <div className="flex gap-2">
              <button
                onClick={handleRetry}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
              >
                Thử lại
              </button>
              <Link
                href="/news"
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium"
              >
                Về News
              </Link>
            </div>
          </div>
        )}

        {/* URL preview — always shown below the status */}
        <div className="mt-2 rounded-md bg-muted px-3 py-2">
          <p className="truncate text-xs text-muted-foreground">{url}</p>
        </div>
      </div>
    </div>
  );
}
