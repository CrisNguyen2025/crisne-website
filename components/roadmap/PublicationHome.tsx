'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import type { PublicationTopicSummary, RecentLessonSummary } from '@/lib/roadmap/queries';
import { formatFriendlyTime } from '@/lib/roadmap/date-utils';
import type { CreateRoadmapDto } from '@/lib/roadmap/types';
import { useCanWrite } from '@/hooks/use-can-write';
import * as roadmapService from '@/logic/roadmap/roadmapService';
import { EditorialHeader } from './EditorialHeader';
import { CreateTopicModal } from './CreateTopicModal';

interface PublicationHomeProps {
  topics: PublicationTopicSummary[];
  recentLessons: RecentLessonSummary[];
  totalLessons?: number;
}

export function PublicationHome({ topics, recentLessons }: PublicationHomeProps) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const [isCreateTopicOpen, setIsCreateTopicOpen] = useState(false);

  useEffect(() => {
    const handleUpdate = () => router.refresh();
    window.addEventListener('roadmap:updated', handleUpdate);
    return () => window.removeEventListener('roadmap:updated', handleUpdate);
  }, [router]);

  const handleCreateTopic = async (payload: CreateRoadmapDto) => {
    const { roadmap: created } = await roadmapService.createRoadmap(payload);
    window.dispatchEvent(new CustomEvent('roadmap:updated'));
    if (created?.slug) {
      router.push(`/topic/${created.slug}`);
    }
  };

  return (
    <div className="roadmap-theme min-h-dvh bg-background text-foreground flex flex-col">
      <EditorialHeader />

      <main
        id="main-content"
        className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-24 sm:px-6 sm:pt-10 sm:pb-16"
      >
        <section aria-labelledby="topics-heading">
          <div className="flex items-center justify-between gap-4">
            <h1 id="topics-heading" className="text-lg font-semibold tracking-tight text-foreground">
              Topics
            </h1>
            {canWrite && (
              <button
                type="button"
                onClick={() => setIsCreateTopicOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-border/90 bg-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-[0_0.0625rem_0.125rem_oklch(0_0_0/0.03)] transition-[border-color,background-color,transform] duration-150 ease-out hover:border-foreground/30 active:scale-[0.98] cursor-pointer"
              >
                <Plus className="size-3.5" />
                <span>Tạo topic</span>
              </button>
            )}
          </div>

          {topics.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">Chưa có Topic nào.</p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {topics.map((topic) => (
                <Link
                  key={topic.slug}
                  href={`/topic/${topic.slug}`}
                  prefetch={true}
                  className="group flex flex-col justify-between rounded-xl border border-border/90 bg-card p-4 shadow-[0_0.0625rem_0.125rem_oklch(0_0_0/0.03)] transition-[border-color,background-color,transform] duration-150 ease-out hover:border-foreground/25 active:scale-[0.995]"
                >
                  <div>
                    <div className="flex items-baseline justify-between gap-3">
                      <h2 className="text-sm font-medium tracking-tight text-foreground">
                        {topic.title}
                      </h2>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground/80">
                        {topic.lessonCount}
                      </span>
                    </div>
                    {topic.description && (
                      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {topic.description}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {recentLessons.length > 0 && (
          <section className="mt-10 max-w-3xl" aria-labelledby="recent-lessons-heading">
            <h2 id="recent-lessons-heading" className="text-sm font-semibold tracking-tight text-foreground">
              Mới cập nhật
            </h2>

            <div className="mt-3 divide-y divide-border/60 border-t border-border/60">
              {recentLessons.map((lesson) => (
                <Link
                  key={lesson.id}
                  href={`/lessons/${lesson.slug}`}
                  prefetch={true}
                  className="group -mx-2 flex items-baseline justify-between gap-4 rounded-md px-2 py-2.5 text-sm transition-colors duration-150 hover:bg-muted/50"
                >
                  <div className="min-w-0 truncate">
                    <span className="font-normal text-foreground/90 transition-colors group-hover:text-foreground">
                      {lesson.title}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground/75">{lesson.topicTitle}</span>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground/75">
                    {formatFriendlyTime(lesson.updatedAt)}
                  </span>
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
