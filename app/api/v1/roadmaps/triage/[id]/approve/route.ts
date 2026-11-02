import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { duplicateResponse, findDuplicate } from "@/lib/roadmap/duplicates";
import { markdownToPlainText, markdownToSafeHtml } from "@/lib/roadmap/markdown";
import { GroupChoiceRequired, groupChoiceResponse, resolveGroup } from "@/lib/roadmap/groups";
import { notifyRoadmapChanged } from "@/lib/roadmap/rag-reindex";

const DESCRIPTION_MAX_LENGTH = 200;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    // The Owner may pick the target group when approving; otherwise the draft's groupTitle is used
    const body = await req.json().catch(() => ({}));

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

    // A lesson with this title is already in the layer: keep the draft for editing, don't add a copy
    const layerItems = await prisma.roadmapItem.findMany({
      where: { group: { layerId } },
      select: { id: true, title: true },
    });
    const duplicate = findDuplicate(layerItems, triage.draftTitle);
    if (duplicate) return duplicateResponse("item", { ...duplicate, layerId });

    // 2. Resolve the group under this layer, created when the named title is new (ADR-0008)
    const targetGroup = await resolveGroup(prisma, layerId, {
      groupId: body.groupId,
      groupTitle: body.groupTitle ?? triage.groupTitle,
    });
    const groupSize = await prisma.roadmapItem.count({ where: { groupId: targetGroup.id } });
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
          order: groupSize + 1,
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

    notifyRoadmapChanged();
    return NextResponse.json({
      success: true,
      createdItem,
      triage: updatedTriage,
    });
  } catch (error) {
    if (error instanceof GroupChoiceRequired) return groupChoiceResponse(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to approve triage item" },
      { status: 500 }
    );
  }
}
