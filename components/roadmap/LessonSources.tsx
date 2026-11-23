"use client";

import type { ProvenanceDto } from "@/lib/provenance/dto";

const EXCERPT_PREVIEW_LENGTH = 160;

function previewExcerpt(excerpt: string): string {
  return excerpt.length > EXCERPT_PREVIEW_LENGTH ? `${excerpt.slice(0, EXCERPT_PREVIEW_LENGTH - 1).trimEnd()}…` : excerpt;
}

interface LessonSourcesProps {
  sources: ProvenanceDto[];
}

/** Sources of the Lesson whose sentence marker was edited away (ADR-0017): kept, shown for the whole Lesson. */
export function LessonSources({ sources }: LessonSourcesProps) {
  if (sources.length === 0) return null;
  return (
    <section aria-labelledby="lesson-sources-heading" className="mt-10 border-t border-border pt-5">
      <h2 id="lesson-sources-heading" className="text-sm font-semibold text-foreground">
        Nguồn tham khảo của bài
      </h2>
      <ul className="mt-3 space-y-3">
        {sources.map((source) => (
          <li key={source.claimRefKey} className="text-sm">
            <a
              href={source.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--editorial-accent)] hover:underline"
            >
              {source.sourceName}
            </a>
            <span className="text-muted-foreground"> · {source.sourceTitle}</span>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{previewExcerpt(source.excerpt)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
