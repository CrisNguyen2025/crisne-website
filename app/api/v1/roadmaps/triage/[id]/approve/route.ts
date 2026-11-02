import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { duplicateResponse, findDuplicate } from "@/lib/roadmap/duplicates";
import { markdownToPlainText, markdownToSafeHtml } from "@/lib/roadmap/markdown";
import { sectionSpelling } from "@/lib/roadmap/sections";
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
    // The Owner may pick the section when approving; otherwise the draft's section is used
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

    // 1. The topic the draft was made for; the section comes from the draft, or from the Owner's choice here
    const roadmap = await prisma.roadmap.findFirst({
      where: { slug: triage.roadmapSlug || undefined },
      include: { items: { select: { id: true, title: true, section: true, order: true } } },
    });
    if (!roadmap) {
      return NextResponse.json({ error: "No available roadmap found to attach the lesson." }, { status: 400 });
    }

    // A lesson with this title is already in the topic: keep the draft for editing, don't add a copy
    const duplicate = findDuplicate(roadmap.items, triage.draftTitle);
    if (duplicate) return duplicateResponse("item", { id: duplicate.id, title: duplicate.title, roadmapSlug: roadmap.slug });

    // 2. The section is reused by its existing spelling, or created with the name given
    const sectionName = sectionSpelling(
      roadmap.items.map((i) => i.section),
      typeof body.section === "string" ? body.section : triage.section,
    );
    const order = roadmap.items.reduce((max, i) => Math.max(max, i.order), 0) + 1;
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
          roadmapId: roadmap.id,
          section: sectionName,
          title: draftTitle,
          // From the draft, never the visitor's comment: this text is public
          description: markdownToPlainText(draftContent ?? "", DESCRIPTION_MAX_LENGTH),
          // Stored as sanitized HTML (the editor's format): the page renders it as HTML
          content: draftContent ? markdownToSafeHtml(draftContent) : null,
          order,
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to approve triage item" },
      { status: 500 }
    );
  }
}
