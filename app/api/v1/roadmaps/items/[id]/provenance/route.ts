import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { type LessonProvenanceResponse, toProvenanceDto } from "@/lib/provenance/dto";
import { extractProvenanceKeys } from "@/lib/provenance/markers";

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

    const byKey = new Map(inContent.map((row) => [row.claimRefKey, row]));
    const body: LessonProvenanceResponse = {
      provenances: keys.flatMap((key) => {
        const row = byKey.get(key);
        return row ? [toProvenanceDto(row)] : [];
      }),
      orphans: orphanRows.map(toProvenanceDto),
    };

    return NextResponse.json(body, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("[API GET /api/v1/roadmaps/items/[id]/provenance] Error:", error);
    return NextResponse.json({ error: "Failed to load provenance" }, { status: 500 });
  }
}
