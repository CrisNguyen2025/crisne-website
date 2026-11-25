import { z } from "zod";

export const RELATION_TYPES = ["relates"] as const;
export type KnowledgeRelationType = (typeof RELATION_TYPES)[number];

export interface RelatedLessonDto {
  lessonId: string;
  lessonSlug: string;
  title: string;
  roadmapSlug: string;
  roadmapTitle: string;
  section: string | null;
  relationType: string;
}

export interface LessonRelationsResponse {
  relations: RelatedLessonDto[];
}

export interface LessonExternalSourceDto {
  sourceName: string;
  sourceUrl: string;
  sourceTitle: string;
  relationType: string;
  collectedAt: string;
}

export interface BatchLessonProvenanceResponse {
  byLessonId: Record<string, LessonExternalSourceDto[]>;
}

export interface MatchLessonCandidateDto {
  lessonId: string;
  lessonSlug: string;
  title: string;
  topicSlug: string;
  topicTitle: string;
  section: string | null;
  score: number;
  duplicateWarning: boolean;
  versionUpdateHint: boolean;
}

export interface MatchLessonsResponseDto {
  suggestedTopicSlug: string | null;
  suggestedTopicTitle: string | null;
  suggestedSection: string | null;
  matches: MatchLessonCandidateDto[];
}

export const CreateLessonRelationSchema = z.object({
  targetLessonId: z.string().trim().min(1),
});

export const BatchLessonProvenanceRequestSchema = z.object({
  lessonIds: z.array(z.string().trim().min(1)).min(1).max(10),
});

export function canonicalLessonPair(lessonIdA: string, lessonIdB: string): [string, string] {
  const a = lessonIdA.trim();
  const b = lessonIdB.trim();
  if (!a || !b || a === b) {
    throw new Error("Cannot relate a Lesson to itself.");
  }
  return a < b ? [a, b] : [b, a];
}

export function isMissingTableError(error: unknown, tableName: string): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes(`no such table: ${tableName}`) ||
    error.message.includes(`The table \`main.${tableName}\` does not exist`)
  );
}
