import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWriteAccess } from "@/lib/auth/write-access";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Only feedback still in process can be deleted; APPROVED items back published roadmap content
const DELETABLE_STATUSES = ["PENDING", "DRAFTED"];

export async function DELETE(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const { id } = await context.params;

    const { count } = await prisma.knowledgeTriage.deleteMany({
      where: { id, status: { in: DELETABLE_STATUSES } },
    });

    if (count === 0) {
      return NextResponse.json(
        { error: "Triage item not found or no longer in process" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete triage item" },
      { status: 500 }
    );
  }
}
