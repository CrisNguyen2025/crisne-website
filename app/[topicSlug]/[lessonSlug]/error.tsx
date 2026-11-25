'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function LessonError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Lesson route error:', error);
  }, [error]);

  return (
    <div className="roadmap-theme flex h-dvh w-full flex-col items-center justify-center bg-background p-6 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertCircle className="size-7" />
      </div>
      <h2 className="mb-1 text-lg font-semibold text-foreground">
        Không thể tải nội dung bài học
      </h2>
      <p className="mb-6 max-w-sm text-sm text-muted-foreground">
        Đã xảy ra lỗi trong quá trình tải bài học. Vui lòng thử lại hoặc quay về trang chủ.
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
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Home className="size-3.5" />
          <span>Trang chủ</span>
        </Link>
      </div>
    </div>
  );
}
