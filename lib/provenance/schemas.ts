import { z } from "zod";
import { LESSON_STATUSES } from "@/lib/roadmap/status";
import { PROVENANCE_AUTHOR_TYPES } from "./dto";

export const MAX_STATEMENTS_PER_INTEGRATION = 10;
export const MAX_STATEMENT_LENGTH = 1000;
export const MAX_EXCERPT_LENGTH = 1000;

export const IntegrationStatementSchema = z.object({
  text: z.string().trim().min(1).max(MAX_STATEMENT_LENGTH),
  excerpt: z.string().trim().min(1).max(MAX_EXCERPT_LENGTH),
  authorType: z.enum(PROVENANCE_AUTHOR_TYPES),
});

const StatementsSchema = z.array(IntegrationStatementSchema).min(1).max(MAX_STATEMENTS_PER_INTEGRATION);
const RelatedLessonIdsSchema = z.array(z.string().trim().min(1)).max(10).optional();

/** Body of POST /api/news/[id]/integrate */
export const IntegrateRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("create_lesson"),
    roadmapSlug: z.string().trim().min(1),
    section: z.string().trim().max(120).nullable().optional(),
    title: z.string().trim().min(1).max(240),
    description: z.string().trim().max(500).nullable().optional(),
    // New Lessons from a News Item are something the Owner wants to learn (ADR-0010)
    status: z.enum(LESSON_STATUSES).optional().default("target"),
    statements: StatementsSchema,
    relatedLessonIds: RelatedLessonIdsSchema,
  }),
  z.object({
    mode: z.literal("append_to_lesson"),
    lessonId: z.string().trim().min(1),
    statements: StatementsSchema,
    relatedLessonIds: RelatedLessonIdsSchema,
  }),
]);

export type IntegrationStatement = z.infer<typeof IntegrationStatementSchema>;
export type IntegrateRequest = z.input<typeof IntegrateRequestSchema>;
export type ParsedIntegrateRequest = z.output<typeof IntegrateRequestSchema>;

/** Response of POST /api/news/[id]/integrate (201) */
export interface IntegrateResponse {
  lesson: { id: string; slug: string; roadmapSlug: string };
  provenanceCount: number;
}
