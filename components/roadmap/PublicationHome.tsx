"use client";

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, BookOpen, Newspaper, Plus, Search } from "lucide-react";
import type {
  PublicationTopicSummary,
  RecentLessonSummary,
} from "@/lib/roadmap/queries";
import { formatFriendlyTime } from "@/lib/roadmap/date-utils";
import type { CreateRoadmapDto } from "@/lib/roadmap/types";
import { useCanWrite } from "@/hooks/use-can-write";
import { NEWS_PATH } from "@/lib/news/paths";
import { lessonPath, topicPath } from "@/lib/roadmap/paths";
import { openGlobalSearch } from "@/lib/search/search-controller";
import { Button } from "@/components/ui/button";
import { DesignMenu } from "@/components/design-menu";
import { cn } from "@/lib/utils";
import {
  clearDeletedTopicSlug,
  getDeletedLessonIdsSnapshot,
  getDeletedTopicSlugsSnapshot,
  getEmptyPendingSet,
  markRoadmapRefreshPending,
  reconcileDeletedLessonIds,
  reconcileDeletedTopicSlugs,
  recordPendingDeletion,
  subscribePendingWrites,
} from "@/lib/roadmap/pending-write";
import * as roadmapService from "@/logic/roadmap/roadmapService";
import { AbotMascot } from "@/roadmap-rag-assistant/sdk/typescript/src/react/components/AbotMascot";
import { CreateTopicModal } from "./CreateTopicModal";
import { usePendingRoadmapRefresh } from "./usePendingRoadmapRefresh";
import type { RoadmapUpdatedEventDetail } from "./useTopicOwnerStatuses";

interface NewsMetricsSummary {
  inbox: number;
  saved: number;
  total: number;
}

interface PublicationHomeProps {
  topics: PublicationTopicSummary[];
  recentLessons: RecentLessonSummary[];
  totalLessons?: number;
  newsMetrics?: NewsMetricsSummary;
}

export function PublicationHome({
  topics,
  recentLessons,
  totalLessons = 0,
  newsMetrics,
}: PublicationHomeProps) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const [isCreateTopicOpen, setIsCreateTopicOpen] = useState(false);

  usePendingRoadmapRefresh("/");
  const deletedLessonIds = useSyncExternalStore(
    subscribePendingWrites,
    getDeletedLessonIdsSnapshot,
    getEmptyPendingSet
  );
  const deletedTopicSlugs = useSyncExternalStore(
    subscribePendingWrites,
    getDeletedTopicSlugsSnapshot,
    getEmptyPendingSet
  );

  useEffect(() => {
    reconcileDeletedTopicSlugs(topics.map((t) => t.slug));
  }, [topics]);

  const prevRecentRef = useRef(recentLessons);
  useEffect(() => {
    if (prevRecentRef.current === recentLessons) return;
    prevRecentRef.current = recentLessons;
    reconcileDeletedLessonIds(recentLessons.map((l) => l.id));
  }, [recentLessons]);

  const visibleTopics = useMemo(
    () =>
      deletedTopicSlugs.size === 0
        ? topics
        : topics.filter((t) => !deletedTopicSlugs.has(t.slug)),
    [topics, deletedTopicSlugs]
  );

  const visibleRecentLessons = useMemo(
    () =>
      deletedTopicSlugs.size === 0 && deletedLessonIds.size === 0
        ? recentLessons
        : recentLessons.filter(
            (l) =>
              !deletedTopicSlugs.has(l.topicSlug) &&
              !deletedLessonIds.has(l.id)
          ),
    [recentLessons, deletedTopicSlugs, deletedLessonIds]
  );

  const removedLessonCount = useMemo(() => {
    if (deletedTopicSlugs.size === 0 && deletedLessonIds.size === 0) return 0;
    const removedByTopic = topics.reduce(
      (sum, t) => (deletedTopicSlugs.has(t.slug) ? sum + t.lessonCount : sum),
      0
    );
    const removedStandaloneLessons = recentLessons.reduce(
      (sum, l) =>
        !deletedTopicSlugs.has(l.topicSlug) && deletedLessonIds.has(l.id)
          ? sum + 1
          : sum,
      0
    );
    return removedByTopic + removedStandaloneLessons;
  }, [topics, recentLessons, deletedTopicSlugs, deletedLessonIds]);

  const visibleTotalLessons = Math.max(0, totalLessons - removedLessonCount);

  useEffect(() => {
    const handleUpdate = (event: Event) => {
      const detail = (
        event as CustomEvent<RoadmapUpdatedEventDetail | undefined>
      ).detail;
      recordPendingDeletion(detail);
      if (detail?.skipRefresh) return;
      router.refresh();
    };
    window.addEventListener("roadmap:updated", handleUpdate);
    return () => window.removeEventListener("roadmap:updated", handleUpdate);
  }, [router]);

  const handleCreateTopic = async (payload: CreateRoadmapDto) => {
    const { roadmap: created } = await roadmapService.createRoadmap(payload);
    if (created?.slug) {
      clearDeletedTopicSlug(created.slug);
      markRoadmapRefreshPending({ originRouteKey: "/" });
    }
    window.dispatchEvent(
      new CustomEvent("roadmap:updated", {
        detail: { skipRefresh: Boolean(created?.slug) },
      })
    );
    if (created?.slug) {
      router.push(topicPath(created.slug));
    }
  };

  return (
    <div className="roadmap-theme min-h-dvh bg-background text-foreground flex flex-col">
      <main
        id="main-content"
        className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-8 sm:pt-12 lg:pb-20"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border pb-5 sm:pb-6">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <AbotMascot
              size={56}
              enablePoke
              className="size-10 shrink-0 sm:size-14"
            />
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-semibold leading-none tracking-tight text-foreground sm:text-4xl">
                Crisne
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {canWrite && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={openGlobalSearch}
                  aria-label="Tìm kiếm nhanh (Cmd+K)"
                  className="size-9 cursor-pointer bg-card px-0 text-xs sm:w-auto sm:px-3"
                >
                  <Search className="size-4 text-muted-foreground sm:size-3.5" />
                  <span className="hidden sm:inline">Tìm kiếm</span>
                  <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground sm:inline">
                    ⌘K
                  </kbd>
                </Button>
                <Button
                  type="button"
                  size="lg"
                  onClick={() => setIsCreateTopicOpen(true)}
                  aria-label="Tạo topic"
                  className="size-9 cursor-pointer px-0 text-xs sm:w-auto sm:px-3"
                >
                  <Plus className="size-4 sm:size-3.5" />
                  <span className="hidden sm:inline">Tạo topic</span>
                </Button>
              </>
            )}
            <DesignMenu triggerClassName="size-9" />
          </div>
        </header>

        <section
          aria-label="Tổng quan"
          className={cn(
            "mt-5 grid gap-3 sm:mt-6 sm:gap-4",
            canWrite ? "grid-cols-2" : "grid-cols-1"
          )}
        >
          <a
            href="#topics-heading"
            className="group flex min-w-0 flex-col justify-between rounded-2xl border border-border bg-secondary/70 p-3.5 transition-[border-color,background-color,transform] duration-150 ease-out hover:border-foreground/20 hover:bg-secondary active:scale-[0.99] sm:p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <BookOpen
                  className="size-3.5 shrink-0 text-[var(--editorial-accent)] sm:size-4"
                  aria-hidden="true"
                />
                <span className="truncate">Topics &amp; Lesson</span>
              </span>
              <ArrowRight
                className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </div>
            <div className="mt-3">
              <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground sm:text-3xl">
                {visibleTotalLessons}
              </p>
              <p className="mt-1 truncate text-xs tabular-nums text-muted-foreground">
                {visibleTopics.length} topics · {visibleTotalLessons} bài học
              </p>
            </div>
          </a>

          {canWrite && (
            <Link
              href={NEWS_PATH}
              prefetch={true}
              className="group flex min-w-0 flex-col justify-between rounded-2xl border border-border bg-secondary/70 p-3.5 transition-[border-color,background-color,transform] duration-150 ease-out hover:border-foreground/20 hover:bg-secondary active:scale-[0.99] sm:p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Newspaper
                    className="size-3.5 shrink-0 text-[var(--editorial-accent)] sm:size-4"
                    aria-hidden="true"
                  />
                  <span className="truncate">News</span>
                </span>
                <ArrowUpRight
                  className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </div>
              <div className="mt-3">
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground sm:text-3xl">
                  {newsMetrics ? newsMetrics.inbox : "—"}
                </p>
                <p className="mt-1 truncate text-xs tabular-nums text-muted-foreground">
                  {newsMetrics
                    ? `${newsMetrics.inbox} chờ xử lý · ${newsMetrics.saved} đã lưu`
                    : "Mở hộp tin"}
                </p>
              </div>
            </Link>
          )}
        </section>

        {visibleRecentLessons.length > 0 && (
          <section className="mt-8" aria-label="Tiếp tục đọc">
            <Link
              href={lessonPath(
                visibleRecentLessons[0].topicSlug,
                visibleRecentLessons[0].slug
              )}
              prefetch={true}
              className="editorial-accent-rail-card group flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-[border-color,transform] duration-150 ease-out hover:border-foreground/25 active:scale-[0.995] sm:flex-row sm:items-center sm:p-6"
            >
              <div className="min-w-0 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  <span className="text-[var(--editorial-accent)]">
                    Tiếp tục đọc
                  </span>
                  <span aria-hidden="true"> · </span>
                  <span>{visibleRecentLessons[0].topicTitle}</span>
                  <span aria-hidden="true"> · </span>
                  <span className="tabular-nums">
                    {formatFriendlyTime(visibleRecentLessons[0].updatedAt)}
                  </span>
                </p>
                <h2 className="truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                  {visibleRecentLessons[0].title}
                </h2>
                {visibleRecentLessons[0].description && (
                  <p className="line-clamp-1 text-sm text-muted-foreground">
                    {visibleRecentLessons[0].description}
                  </p>
                )}
              </div>
              <span className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-xs font-medium text-primary-foreground transition-opacity group-hover:opacity-90">
                <span>Đọc tiếp</span>
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </span>
            </Link>
          </section>
        )}

        <section className="mt-10" aria-labelledby="topics-heading">
          <h2
            id="topics-heading"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Topics
          </h2>

          {visibleTopics.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                Chưa có Topic nào.
              </p>
            </div>
          ) : (
            <div className="mt-4 grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleTopics.map((topic) => (
                <Link
                  key={topic.slug}
                  href={topicPath(topic.slug)}
                  prefetch={true}
                  className="editorial-paper group flex flex-col justify-between rounded-2xl border border-border bg-card p-5 transition-[border-color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-foreground/25 active:scale-[0.99]"
                >
                  <div>
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="line-clamp-2 text-base font-semibold tracking-tight text-foreground transition-colors group-hover:text-[var(--editorial-accent)]">
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
                  <p className="mt-4 border-t border-border pt-3 text-xs tabular-nums text-muted-foreground">
                    {topic.sectionNames.length} mục
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>

        {visibleRecentLessons.length > 1 && (
          <section
            className="mt-10"
            aria-labelledby="recent-lessons-heading"
          >
            <h2
              id="recent-lessons-heading"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Mới cập nhật
            </h2>

            <div className="editorial-paper mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {visibleRecentLessons.slice(1).map((lesson) => (
                <Link
                  key={lesson.id}
                  href={lessonPath(lesson.topicSlug, lesson.slug)}
                  prefetch={true}
                  className="group flex flex-col gap-0.5 px-4 py-3 text-sm transition-colors duration-150 hover:bg-muted/60 active:bg-muted sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 sm:px-5"
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
