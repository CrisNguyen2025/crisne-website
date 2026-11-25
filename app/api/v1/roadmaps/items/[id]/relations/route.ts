import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { prisma } from "@/lib/prisma";
import {
  type LessonRelationsResponse,
  type RelatedLessonDto,
  CreateLessonRelationSchema,
  canonicalLessonPair,
  isMissingTableError,
} from "@/lib/provenance/relations";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const RELATED_LESSON_SELECT = {
  id: true,
  slug: true,
  title: true,
  section: true,
  roadmap: { select: { slug: true, title: true } },
} as const;

export async function GET(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const lesson = await prisma.roadmapItem.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    let rows;
    try {
      rows = await prisma.knowledgeRelation.findMany({
        where: { OR: [{ fromLessonId: id }, { toLessonId: id }] },
        include: {
          fromLesson: { select: RELATED_LESSON_SELECT },
          toLesson: { select: RELATED_LESSON_SELECT },
        },
        orderBy: { createdAt: "asc" },
      });
    } catch (error) {
      if (isMissingTableError(error, "KnowledgeRelation")) {
        const empty: LessonRelationsResponse = { relations: [] };
        return NextResponse.json(empty, { headers: { "Cache-Control": "no-store, max-age=0" } });
      }
      throw error;
    }

    const relations: RelatedLessonDto[] = rows.map((row) => {
      const other = row.fromLessonId === id ? row.toLesson : row.fromLesson;
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

    const body: LessonRelationsResponse = { relations };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("[API GET /api/v1/roadmaps/items/[id]/relations] Error:", error);
    return NextResponse.json({ error: "Failed to load related lessons" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = CreateLessonRelationSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    if (id === parsed.data.targetLessonId) {
      return NextResponse.json({ error: "Cannot relate a lesson to itself" }, { status: 400 });
    }

    const found = await prisma.roadmapItem.findMany({
      where: { id: { in: [id, parsed.data.targetLessonId] } },
      select: { id: true },
    });
    if (found.length < 2) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    const [fromLessonId, toLessonId] = canonicalLessonPair(id, parsed.data.targetLessonId);
    await prisma.knowledgeRelation.upsert({
      where: {
        fromLessonId_toLessonId_relationType: {
          fromLessonId,
          toLessonId,
          relationType: "relates",
        },
      },
      create: { fromLessonId, toLessonId, relationType: "relates" },
      update: {},
    });

    return NextResponse.json({ created: true }, { status: 201 });
  } catch (error) {
    console.error("[API POST /api/v1/roadmaps/items/[id]/relations] Error:", error);
    return NextResponse.json({ error: "Failed to save lesson relation" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const queryTarget = req.nextUrl.searchParams.get("targetLessonId")?.trim();
    let targetLessonId = queryTarget || "";
    if (!targetLessonId) {
      const body = (await req.json().catch(() => ({}))) as { targetLessonId?: string };
      targetLessonId = body.targetLessonId?.trim() ?? "";
    }
    if (!targetLessonId || targetLessonId === id) {
      return NextResponse.json({ error: "Invalid targetLessonId" }, { status: 400 });
    }

    const [fromLessonId, toLessonId] = canonicalLessonPair(id, targetLessonId);
    const deleted = await prisma.knowledgeRelation.deleteMany({
      where: { fromLessonId, toLessonId, relationType: "relates" },
    });

    return NextResponse.json({ deleted: deleted.count > 0 });
  } catch (error) {
    console.error("[API DELETE /api/v1/roadmaps/items/[id]/relations] Error:", error);
    return NextResponse.json({ error: "Failed to delete lesson relation" }, { status: 500 });
  }
}
