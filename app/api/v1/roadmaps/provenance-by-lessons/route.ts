import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { prisma } from "@/lib/prisma";
import { extractProvenanceKeys } from "@/lib/provenance/markers";
import {
  type BatchLessonProvenanceResponse,
  type LessonExternalSourceDto,
  BatchLessonProvenanceRequestSchema,
} from "@/lib/provenance/relations";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  const rawParam = req.nextUrl.searchParams.get("lessonIds") ?? "";
  const rawList = rawParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const parsed = BatchLessonProvenanceRequestSchema.safeParse({ lessonIds: rawList });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const lessonIds = Array.from(new Set(parsed.data.lessonIds));
    const lessons = await prisma.roadmapItem.findMany({
      where: { id: { in: lessonIds } },
      select: { id: true, content: true },
    });

    const keysByLesson = new Map<string, string[]>();
    const allKeys = new Set<string>();
    for (const lesson of lessons) {
      const keys = extractProvenanceKeys(lesson.content);
      keysByLesson.set(lesson.id, keys);
      for (const k of keys) allKeys.add(k);
    }

    const rows = await prisma.knowledgeProvenance.findMany({
      where: {
        OR: [
          { lessonId: { in: lessonIds } },
          ...(allKeys.size > 0 ? [{ claimRefKey: { in: Array.from(allKeys) } }] : []),
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    const rowByKey = new Map(rows.map((r) => [r.claimRefKey, r]));
    const byLessonId: Record<string, LessonExternalSourceDto[]> = {};

    for (const lesson of lessons) {
      const seen = new Set<string>();
      const sources: LessonExternalSourceDto[] = [];
      const pushRow = (row: (typeof rows)[number]) => {
        const dedupeKey = `${row.sourceUrl}::${row.sourceTitle}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        sources.push({
          sourceName: row.sourceName,
          sourceUrl: row.sourceUrl,
          sourceTitle: row.sourceTitle,
          relationType: row.relationType,
          collectedAt: row.collectedAt.toISOString(),
        });
      };

      for (const key of keysByLesson.get(lesson.id) ?? []) {
        const matched = rowByKey.get(key);
        if (matched) pushRow(matched);
      }
      for (const row of rows) {
        if (row.lessonId === lesson.id) pushRow(row);
      }

      if (sources.length > 0) {
        byLessonId[lesson.id] = sources;
      }
    }

    const body: BatchLessonProvenanceResponse = { byLessonId };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("[API GET /api/v1/roadmaps/provenance-by-lessons] Error:", error);
    return NextResponse.json({ error: "Failed to load lesson provenance" }, { status: 500 });
  }
}
