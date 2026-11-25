import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { type LessonProvenanceResponse, toProvenanceDto } from "@/lib/provenance/dto";
import { extractProvenanceKeys } from "@/lib/provenance/markers";
import { type RelatedLessonDto, isMissingTableError } from "@/lib/provenance/relations";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/roadmaps/items/[id]/provenance — Owner only (ADR-0017).
 *
 * Matches markers at read time: a marker found in the content resolves by key whichever Lesson created it,
 * and Provenance of this Lesson whose marker was edited away comes back as `orphans` instead of being deleted.
 */
export async function GET(req: NextRequest, context: RouteContext) {
  // Checked here, not trusted to the middleware: it lets any request with a machine-key header through
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const lesson = await prisma.roadmapItem.findUnique({
      where: { id },
      select: { id: true, content: true },
    });
    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    const keys = extractProvenanceKeys(lesson.content);
    const [inContent, orphanRows] = await Promise.all([
      keys.length ? prisma.knowledgeProvenance.findMany({ where: { claimRefKey: { in: keys } } }) : [],
      prisma.knowledgeProvenance.findMany({
        where: { lessonId: lesson.id, ...(keys.length ? { claimRefKey: { notIn: keys } } : {}) },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    let relations: RelatedLessonDto[] = [];
    try {
      const relRows = await prisma.knowledgeRelation.findMany({
        where: { OR: [{ fromLessonId: lesson.id }, { toLessonId: lesson.id }] },
        include: {
          fromLesson: {
            select: {
              id: true,
              slug: true,
              title: true,
              section: true,
              roadmap: { select: { slug: true, title: true } },
            },
          },
          toLesson: {
            select: {
              id: true,
              slug: true,
              title: true,
              section: true,
              roadmap: { select: { slug: true, title: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });
      relations = relRows.map((row) => {
        const other = row.fromLessonId === lesson.id ? row.toLesson : row.fromLesson;
        return {
          lessonId: other.id,
          lessonSlug: other.slug,
          title: other.title,
          roadmapSlug: other.roadmap.slug,
          roadmapTitle: other.roadmap.title,
          section: other.section,
          relationType: row.relationType,
        };
      });
    } catch (relError) {
      if (!isMissingTableError(relError, "KnowledgeRelation")) throw relError;
    }

    const byKey = new Map(inContent.map((row) => [row.claimRefKey, row]));
    const body: LessonProvenanceResponse = {
      provenances: keys.flatMap((key) => {
        const row = byKey.get(key);
        return row ? [toProvenanceDto(row)] : [];
      }),
      orphans: orphanRows.map(toProvenanceDto),
      ...(relations.length > 0 ? { relations } : {}),
    };

    return NextResponse.json(body, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("[API GET /api/v1/roadmaps/items/[id]/provenance] Error:", error);
    return NextResponse.json({ error: "Failed to load provenance" }, { status: 500 });
  }
}
