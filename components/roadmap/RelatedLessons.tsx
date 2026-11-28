"use client";

import Link from "next/link";
import type { RelatedLessonDto } from "@/lib/provenance/relations";
import { lessonPath } from "@/lib/roadmap/paths";
import { Skeleton } from "@/components/ui/skeleton";

interface RelatedLessonsProps {
  relations: RelatedLessonDto[];
  isLoading?: boolean;
}

export function RelatedLessons({
  relations,
  isLoading = false,
}: RelatedLessonsProps) {
  if (isLoading && relations.length === 0) {
    return (
      <section
        aria-labelledby="related-lessons-heading"
        aria-busy="true"
        className="mt-10 border-t border-border pt-5"
      >
        <h2
          id="related-lessons-heading"
          className="text-sm font-semibold text-foreground"
        >
          Bài học liên quan
        </h2>
        <ul className="mt-3 space-y-2.5" aria-hidden="true">
          <li className="flex items-center gap-2">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-4 w-28" />
          </li>
          <li className="flex items-center gap-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-4 w-24" />
          </li>
        </ul>
      </section>
    );
  }

  if (relations.length === 0) return null;

  return (
    <section
      aria-labelledby="related-lessons-heading"
      className="mt-10 border-t border-border pt-5 motion-safe:animate-in motion-safe:fade-in animation-duration-150"
    >
      <h2
        id="related-lessons-heading"
        className="text-sm font-semibold text-foreground"
      >
        Bài học liên quan
      </h2>
      <ul className="mt-3 space-y-1.5">
        {relations.map((rel) => (
          <li key={rel.lessonId} className="flex flex-wrap items-baseline gap-x-2 py-1 text-sm">
            <Link
              href={lessonPath(rel.roadmapSlug, rel.lessonSlug)}
              prefetch={true}
              className="font-medium text-foreground transition-colors hover:text-[var(--editorial-accent)]"
            >
              {rel.title}
            </Link>
            <span className="text-xs text-muted-foreground">
              {rel.roadmapTitle}
              {rel.section ? ` · ${rel.section}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
