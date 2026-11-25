import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { createLesson } from "@/lib/roadmap/create-lesson";
import { duplicateResponse } from "@/lib/roadmap/duplicates";
import { notifyRoadmapChanged } from "@/lib/roadmap/rag-reindex";
import { buildStatementsHtml, createClaimRefKey } from "@/lib/provenance/markers";
import { canonicalLessonPair, isMissingTableError } from "@/lib/provenance/relations";
import { type IntegrateResponse, IntegrateRequestSchema } from "@/lib/provenance/schemas";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

type TxOutcome =
  | { kind: "ok"; lesson: IntegrateResponse["lesson"] }
  | { kind: "roadmap_not_found" }
  | { kind: "lesson_not_found" }
  | { kind: "duplicate"; existing: { id: string; title: string; roadmapSlug: string } }
  | { kind: "already_integrated" };

/**
 * POST /api/news/[id]/integrate — Owner only. Puts the statements the Owner picked from a News Item into a
 * new or existing Lesson, each sentence followed by a Provenance marker (ADR-0017). The Lesson and every
 * Provenance row are written in one transaction.
 */
export async function POST(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = IntegrateRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  try {
    const { id } = await context.params;
    const newsItem = await prisma.newsItem.findUnique({
      where: { id },
      include: { source: { select: { name: true } } },
    });
    if (!newsItem) {
      return NextResponse.json({ error: "News item not found" }, { status: 404 });
    }
    if (newsItem.ingestStatus !== "ready" || newsItem.reviewStatus === "dismissed") {
      return NextResponse.json(
        { error: "News item must be ready and not dismissed", code: "NOT_INTEGRABLE" },
        { status: 409 }
      );
    }

    const marked = body.statements.map((s) => ({ ...s, claimRefKey: createClaimRefKey() }));
    const statementsHtml = buildStatementsHtml(marked);

    const outcome = await prisma.$transaction(async (tx): Promise<TxOutcome> => {
      let lesson: IntegrateResponse["lesson"];

      if (body.mode === "create_lesson") {
        const created = await createLesson(tx, {
          roadmapSlug: body.roadmapSlug,
          section: body.section,
          title: body.title,
          description: body.description,
          content: statementsHtml,
          status: body.status,
        });
        if (created.kind !== "created") return created;
        lesson = { id: created.item.id, slug: created.item.slug, roadmapSlug: created.roadmapSlug };
      } else {
        const existing = await tx.roadmapItem.findUnique({
          where: { id: body.lessonId },
          select: { id: true, slug: true, content: true, roadmap: { select: { slug: true } } },
        });
        if (!existing) return { kind: "lesson_not_found" };
        const alreadyIntegrated = await tx.knowledgeProvenance.findFirst({
          where: { newsItemId: newsItem.id, lessonId: existing.id },
          select: { id: true },
        });
        if (alreadyIntegrated) return { kind: "already_integrated" };

        // Appended after the existing content; the Lesson Status stays as it is
        await tx.roadmapItem.update({
          where: { id: existing.id },
          data: { content: `${existing.content ?? ""}${statementsHtml}` },
        });
        lesson = { id: existing.id, slug: existing.slug, roadmapSlug: existing.roadmap.slug };
      }

      await tx.knowledgeProvenance.createMany({
        data: marked.map((s) => ({
          lessonId: lesson.id,
          claimRefKey: s.claimRefKey,
          newsItemId: newsItem.id,
          sourceId: newsItem.sourceId,
          sourceName: newsItem.source?.name || newsItem.domain,
          sourceUrl: newsItem.canonicalUrl,
          sourceTitle: newsItem.title,
          excerpt: s.excerpt,
          authorType: s.authorType,
          collectedAt: newsItem.createdAt,
          extractedAt: newsItem.extractedAt,
        })),
      });

      return { kind: "ok", lesson };
    });

    switch (outcome.kind) {
      case "roadmap_not_found":
        return NextResponse.json({ error: "Roadmap not found" }, { status: 404 });
      case "lesson_not_found":
        return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
      case "duplicate":
        return duplicateResponse("item", outcome.existing);
      case "already_integrated":
        return NextResponse.json(
          { error: "This news item is already in that lesson", code: "ALREADY_INTEGRATED" },
          { status: 409 }
        );
      case "ok": {
        if (body.relatedLessonIds?.length) {
          const uniqueTargets = Array.from(
            new Set(body.relatedLessonIds.filter((tid) => tid !== outcome.lesson.id))
          );
          if (uniqueTargets.length > 0) {
            try {
              const existingTargets = await prisma.roadmapItem.findMany({
                where: { id: { in: uniqueTargets } },
                select: { id: true },
              });
              if (existingTargets.length > 0) {
                const pairs = existingTargets.map((target) =>
                  canonicalLessonPair(outcome.lesson.id, target.id)
                );
                const existingRelations = await prisma.knowledgeRelation.findMany({
                  where: {
                    relationType: "relates",
                    OR: pairs.map(([fromLessonId, toLessonId]) => ({
                      fromLessonId,
                      toLessonId,
                    })),
                  },
                  select: { fromLessonId: true, toLessonId: true },
                });
                const existingKeys = new Set(
                  existingRelations.map((rel) => `${rel.fromLessonId}\0${rel.toLessonId}`)
                );
                const missingPairs = pairs.filter(
                  ([fromLessonId, toLessonId]) =>
                    !existingKeys.has(`${fromLessonId}\0${toLessonId}`)
                );
                if (missingPairs.length > 0) {
                  await prisma.knowledgeRelation.createMany({
                    data: missingPairs.map(([fromLessonId, toLessonId]) => ({
                      fromLessonId,
                      toLessonId,
                      relationType: "relates",
                    })),
                  });
                }
              }
            } catch (relError) {
              if (!isMissingTableError(relError, "KnowledgeRelation")) {
                console.error("[API POST /api/news/[id]/integrate] Relation save warning:", relError);
              }
            }
          }
        }
        notifyRoadmapChanged();
        const response: IntegrateResponse = { lesson: outcome.lesson, provenanceCount: marked.length };
        return NextResponse.json(response, { status: 201 });
      }
    }
  } catch (error) {
    console.error("[API POST /api/news/[id]/integrate] Error:", error);
    return NextResponse.json({ error: "Failed to add news item to lesson" }, { status: 500 });
  }
}
