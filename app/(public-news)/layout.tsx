import type { Metadata } from "next";
import Link from "next/link";
import { PUBLIC_NEWS_PATH } from "@/lib/auth/public-paths";

export const metadata: Metadata = {
  title: "Tin tuyển chọn",
  description: "Bài viết kỹ thuật được Cris Nguyen chọn lọc, kèm tóm tắt tự động.",
  // Summaries are AI-generated from other sites' articles: shareable by link, not indexed
  robots: { index: false, follow: false },
};

export default function PublicNewsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="roadmap-theme min-h-dvh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <Link href={PUBLIC_NEWS_PATH} className="font-display text-lg font-semibold">
            Tin tuyển chọn
          </Link>
          <span className="text-xs text-muted-foreground">Cris Nguyen</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-6 sm:px-6">{children}</main>
    </div>
  );
}
