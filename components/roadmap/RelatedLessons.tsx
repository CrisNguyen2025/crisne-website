"use client";

import Link from "next/link";
import type { RelatedLessonDto } from "@/lib/provenance/relations";
import { lessonPath } from "@/lib/roadmap/paths";

interface RelatedLessonsProps {
  relations: RelatedLessonDto[];
}

export function RelatedLessons({ relations }: RelatedLessonsProps) {
  if (relations.length === 0) return null;
  return (
    <section aria-labelledby="related-lessons-heading" className="mt-10 border-t border-border pt-5">
      <h2 id="related-lessons-heading" className="text-sm font-semibold text-foreground">
        Bài học liên quan
      </h2>
      <ul className="mt-3 space-y-2">
        {relations.map((rel) => (
          <li key={rel.lessonId} className="text-sm">
            <Link
              href={lessonPath(rel.roadmapSlug, rel.lessonSlug)}
              className="font-medium text-[var(--editorial-accent)] hover:underline"
            >
              {rel.title}
            </Link>
            <span className="text-muted-foreground">
              {" "}
              · {rel.roadmapTitle}
              {rel.section ? ` › ${rel.section}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
