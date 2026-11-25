import type { KnowledgeProvenance } from "@prisma/client";
import type { RelatedLessonDto } from "./relations";

export const PROVENANCE_AUTHOR_TYPES = ["human", "ai_generated", "ai_assisted"] as const;
export type ProvenanceAuthorType = (typeof PROVENANCE_AUTHOR_TYPES)[number];

/**
 * What the Owner sees for one Provenance. Ids of the News Item, News Source and Lesson stay on the
 * server: the chip only needs where the sentence came from.
 */
export interface ProvenanceDto {
  claimRefKey: string;
  sourceName: string;
  sourceUrl: string;
  sourceTitle: string;
  excerpt: string;
  authorType: string;
  relationType: string;
  collectedAt: string;
  extractedAt: string | null;
}

/** Response of GET /api/v1/roadmaps/items/[id]/provenance */
export interface LessonProvenanceResponse {
  /** Provenance whose marker is in the Lesson content, in order of appearance */
  provenances: ProvenanceDto[];
  /** Provenance created for this Lesson whose marker is gone (shown as the Lesson's sources) */
  orphans: ProvenanceDto[];
  relations?: RelatedLessonDto[];
}

export function toProvenanceDto(row: KnowledgeProvenance): ProvenanceDto {
  return {
    claimRefKey: row.claimRefKey,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    sourceTitle: row.sourceTitle,
    excerpt: row.excerpt,
    authorType: row.authorType,
    relationType: row.relationType,
    collectedAt: row.collectedAt.toISOString(),
    extractedAt: row.extractedAt ? row.extractedAt.toISOString() : null,
  };
}
