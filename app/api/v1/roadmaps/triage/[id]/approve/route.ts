import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWriteAccess } from "@/lib/auth/write-access";

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

    // 3. Create the real RoadmapItem in database
    const createdItem = await prisma.roadmapItem.create({
      data: {
        groupId: group.id,
        title: triage.draftTitle,
        description: triage.comment || triage.reason || "",
        content: triage.draftContent || null,
        order: group._count.items + 1,
      },
    });

    // 4. Mark triage as APPROVED
    const updatedTriage = await prisma.knowledgeTriage.update({
      where: { id },
      data: {
        status: "APPROVED",
      },
    });

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
