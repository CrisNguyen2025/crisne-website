"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Newspaper, Plus } from "lucide-react";
import type {
  PublicationTopicSummary,
  RecentLessonSummary,
} from "@/lib/roadmap/queries";
import { formatFriendlyTime } from "@/lib/roadmap/date-utils";
import type { CreateRoadmapDto } from "@/lib/roadmap/types";
import { useCanWrite } from "@/hooks/use-can-write";
import { FEED_INGESTION_PATH } from "@/lib/news/paths";
import { lessonPath, topicPath } from "@/lib/roadmap/paths";
import * as roadmapService from "@/logic/roadmap/roadmapService";
import { AbotMascot } from "@/roadmap-rag-assistant/sdk/typescript/src/react/components/AbotMascot";
import { CreateTopicModal } from "./CreateTopicModal";

interface PublicationHomeProps {
  topics: PublicationTopicSummary[];
  recentLessons: RecentLessonSummary[];
  totalLessons?: number;
}

export function PublicationHome({
  topics,
  recentLessons,
  totalLessons = 0,
}: PublicationHomeProps) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const [isCreateTopicOpen, setIsCreateTopicOpen] = useState(false);

  useEffect(() => {
    const handleUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ skipRefresh?: boolean } | undefined>).detail;
      if (detail?.skipRefresh) return;
      router.refresh();
    };
    window.addEventListener("roadmap:updated", handleUpdate);
    return () => window.removeEventListener("roadmap:updated", handleUpdate);
  }, [router]);

  const handleCreateTopic = async (payload: CreateRoadmapDto) => {
    const { roadmap: created } = await roadmapService.createRoadmap(payload);
    window.dispatchEvent(new CustomEvent("roadmap:updated"));
    if (created?.slug) {
      router.push(topicPath(created.slug));
    }
  };

  return (
    <div className="roadmap-theme min-h-dvh bg-background text-foreground flex flex-col">
      <main
        id="main-content"
        className="mx-auto w-full max-w-5xl flex-1 px-4 pt-10 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-8 sm:pt-14 lg:pb-20"
      >
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-8">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <AbotMascot
              size={72}
              enablePoke
              className="size-16 sm:size-[4.5rem]"
            />
            <div className="min-w-0">
              <h1 className="font-display text-[2.25rem] font-normal leading-[1.12] tracking-[-0.02em] text-foreground sm:text-[2.75rem]">
                Crisne
              </h1>
              <p className="mt-2 text-sm tabular-nums text-muted-foreground">
                {topics.length} topics · {totalLessons} bài học
              </p>
            </div>
          </div>

          {canWrite && (
            <div className="flex items-center gap-2">
              <Link
                href={FEED_INGESTION_PATH}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-[background-color,border-color,transform] duration-150 ease-out hover:border-foreground/25 hover:bg-accent active:scale-[0.98]"
              >
                <Newspaper className="size-3.5 text-muted-foreground" />
                <span>Feed Ingestion</span>
              </Link>
              <button
                type="button"
                onClick={() => setIsCreateTopicOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-primary/90 active:scale-[0.98] cursor-pointer"
              >
                <Plus className="size-3.5" />
                <span>Tạo topic</span>
              </button>
            </div>
          )}
        </header>

        <section className="mt-10" aria-labelledby="topics-heading">
          <h2
            id="topics-heading"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Topics
          </h2>

          {topics.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                Chưa có Topic nào.
              </p>
            </div>
          ) : (
            <div className="mt-4 grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {topics.map((topic) => (
                <Link
                  key={topic.slug}
                  href={topicPath(topic.slug)}
                  prefetch={true}
                  className="group flex flex-col justify-between rounded-xl border border-border bg-card p-5 transition-[border-color,background-color,box-shadow,transform] duration-150 ease-out hover:border-[var(--editorial-accent)] hover:shadow-xs active:scale-[0.99]"
                >
                  <div>
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="line-clamp-2 text-[0.9375rem] font-semibold tracking-tight text-foreground transition-colors group-hover:text-[var(--editorial-accent)]">
                        {topic.title}
                      </h3>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {topic.lessonCount} bài
                      </span>
                    </div>
                    {topic.description && (
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {topic.description}
                      </p>
                    )}
                  </div>
                  <p className="mt-4 text-[0.6875rem] tabular-nums text-muted-foreground/80">
                    {topic.sectionNames.length} mục
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>

        {recentLessons.length > 0 && (
          <section
            className="mt-12 max-w-3xl"
            aria-labelledby="recent-lessons-heading"
          >
            <h2
              id="recent-lessons-heading"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Mới cập nhật
            </h2>

            <div className="mt-3 divide-y divide-border border-t border-border">
              {recentLessons.map((lesson) => (
                <Link
                  key={lesson.id}
                  href={lessonPath(lesson.topicSlug, lesson.slug)}
                  prefetch={true}
                  className="group -mx-2 flex flex-col gap-0.5 rounded-lg px-2 py-3 text-sm transition-colors duration-150 hover:bg-[var(--editorial-sidebar-hover)] active:bg-[var(--editorial-sidebar-active)] sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0 sm:truncate">
                    <span className="font-medium text-foreground transition-colors group-hover:text-[var(--editorial-accent)]">
                      {lesson.title}
                    </span>
                    <span className="hidden text-xs text-muted-foreground sm:ml-2 sm:inline">
                      {lesson.topicTitle}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground sm:shrink-0">
                    <span className="sm:hidden">{lesson.topicTitle} ·</span>
                    <span>{formatFriendlyTime(lesson.updatedAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      <CreateTopicModal
        isOpen={isCreateTopicOpen}
        onClose={() => setIsCreateTopicOpen(false)}
        onSubmit={handleCreateTopic}
      />
    </div>
  );
}
