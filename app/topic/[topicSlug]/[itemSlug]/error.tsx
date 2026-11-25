"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ItemError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Item route error:", error);
  }, [error]);

  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center bg-background p-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-4">
        <AlertCircle className="size-7" />
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-1">
        Không thể tải nội dung bài học
      </h2>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        Đã xảy ra lỗi trong quá trình tải dữ liệu bài học. Vui lòng thử lại hoặc quay về trang chủ.
      </p>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={() => reset()}
          className="h-auto cursor-pointer gap-2 rounded-xl px-4 py-2 text-xs"
        >
          <RefreshCw className="size-3.5" />
          <span>Thử lại</span>
        </Button>
        <Link
          href="/"
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
        >
          <Home className="size-3.5" />
          <span>Trang chủ</span>
        </Link>
      </div>
    </div>
  );
}
