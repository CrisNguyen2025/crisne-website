import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const SKELETON_BAR = "rounded bg-muted motion-safe:animate-pulse";

export default function NewsLoading() {
  return (
    <div className="flex h-dvh min-h-0 flex-col">
      <header className="shrink-0 border-b border-border bg-background">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <Link
            href="/"
            aria-label="Về Crisne"
            className="inline-flex size-9 shrink-0 touch-manipulation items-center justify-center rounded-lg text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-accent hover:text-foreground active:scale-95"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <h1 className="font-display text-2xl font-semibold leading-none text-foreground">
            News
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <div className={`hidden h-9 w-64 md:block ${SKELETON_BAR}`} />
            <div className={`size-9 md:hidden ${SKELETON_BAR}`} />
            <div className={`size-9 ${SKELETON_BAR}`} />
            <div className={`size-9 ${SKELETON_BAR}`} />
            <div className={`h-9 w-9 sm:w-28 ${SKELETON_BAR}`} />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <section
          aria-label="Đang tải danh sách tin"
          className="flex w-full min-w-0 flex-col border-r border-border xl:w-[520px] xl:shrink-0"
        >
          <div className="shrink-0 border-b border-border px-4 sm:px-5">
            <div className="flex h-10 items-center gap-4">
              <div className={`h-4 w-20 ${SKELETON_BAR}`} />
              <div className={`h-4 w-16 ${SKELETON_BAR}`} />
              <div className={`h-4 w-20 ${SKELETON_BAR}`} />
              <div className={`h-4 w-14 ${SKELETON_BAR}`} />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden px-4 sm:px-5">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="space-y-2.5 border-b border-border py-4">
                <div className={`h-3 w-40 ${SKELETON_BAR}`} />
                <div className={`h-5 w-4/5 ${SKELETON_BAR}`} />
                <div className={`h-3.5 w-full ${SKELETON_BAR}`} />
              </div>
            ))}
          </div>
        </section>

        <div
          role="status"
          aria-label="Đang tải bài"
          className="hidden min-h-0 min-w-0 flex-1 flex-col bg-card xl:flex"
        >
          <div className="min-h-0 flex-1 overflow-hidden">
            <div className="mx-auto max-w-5xl px-8 py-7">
              <div className={`h-3 w-56 ${SKELETON_BAR}`} />
              <div className={`mt-4 h-7 w-4/5 ${SKELETON_BAR}`} />
              <div className={`mt-2 h-7 w-3/5 ${SKELETON_BAR}`} />
              <div className="mt-6 space-y-2.5 border-l-2 border-border pl-4">
                <div className={`h-3 w-12 ${SKELETON_BAR}`} />
                <div className={`h-3.5 w-full ${SKELETON_BAR}`} />
                <div className={`h-3.5 w-full ${SKELETON_BAR}`} />
                <div className={`h-3.5 w-2/3 ${SKELETON_BAR}`} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
