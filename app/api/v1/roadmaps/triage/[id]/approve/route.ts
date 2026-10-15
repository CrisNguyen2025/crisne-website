import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { markdownToPlainText, markdownToSafeHtml } from "@/lib/roadmap/markdown";

const DESCRIPTION_MAX_LENGTH = 200;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const { id } = await context.params;

    const triage = await prisma.knowledgeTriage.findUnique({
      where: { id },
    });

    if (!triage) {
      return NextResponse.json({ error: "Triage item not found" }, { status: 404 });
    }

    if (!triage.draftTitle) {
      return NextResponse.json(
        { error: "Item has no draft title to approve. Please generate draft first." },
        { status: 400 }
      );
    }

    // 1. Resolve target layer (or fallback to first layer of the roadmap)
    let layerId: string | null | undefined = triage.layerId;
    if (!layerId) {
      const roadmap = await prisma.roadmap.findFirst({
        where: { slug: triage.roadmapSlug || undefined },
        include: { layers: { orderBy: { order: "asc" } } },
      });
      layerId = roadmap?.layers[0]?.id;
    }

    if (!layerId) {
      const fallbackLayer = await prisma.roadmapLayer.findFirst();
      layerId = fallbackLayer?.id;
    }

    if (!layerId) {
      return NextResponse.json(
        { error: "No available roadmap layer found to attach the lesson." },
        { status: 400 }
      );
    }

    const level = triage.level || "core";

    // 2. Find or create group under this layer
    let group = await prisma.roadmapGroup.findFirst({
      where: { layerId, level },
      include: { _count: { select: { items: true } } },
    });

    if (!group) {
      group = await prisma.roadmapGroup.create({
        data: {
          layerId,
          level,
          title:
            level === "core"
              ? "🟢 Core"
              : level === "intermediate"
              ? "🟡 Intermediate"
              : "🔴 Advanced",
          order: 99,
        },
        include: { _count: { select: { items: true } } },
      });
    }

    const targetGroup = group;
    const { draftTitle, draftContent } = triage;

    // 3–4. Claim the item and create the lesson in one transaction: a second approve (double
    // click, retry) finds no DRAFTED row and creates nothing; a failed create rolls the claim back
    const approved = await prisma.$transaction(async (tx) => {
      const claimed = await tx.knowledgeTriage.updateMany({
        where: { id, status: "DRAFTED" },
        data: { status: "APPROVED" },
      });
      if (claimed.count === 0) return null;

      const createdItem = await tx.roadmapItem.create({
        data: {
          groupId: targetGroup.id,
          title: draftTitle,
          // From the draft, never the visitor's comment: this text is public
          description: markdownToPlainText(draftContent ?? "", DESCRIPTION_MAX_LENGTH),
          // Stored as sanitized HTML (the editor's format): the page renders it as HTML
          content: draftContent ? markdownToSafeHtml(draftContent) : null,
          order: targetGroup._count.items + 1,
        },
      });
      const updatedTriage = await tx.knowledgeTriage.findUnique({ where: { id } });
      return { createdItem, updatedTriage };
    });

    if (!approved) {
      return NextResponse.json(
        { error: "Item is not awaiting approval (already approved or dismissed)." },
        { status: 409 }
      );
    }
    const { createdItem, updatedTriage } = approved;

    return NextResponse.json({
      success: true,
      createdItem,
      triage: updatedTriage,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to approve triage item" },
      { status: 500 }
    );
  }
}
