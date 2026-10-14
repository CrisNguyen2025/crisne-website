import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getWorkflowOwner,
  notFoundResponse,
  requireWriteAccess,
  unauthorizedResponse,
} from "@/lib/workflow/auth";
import { deleteFromStorage } from "@/lib/workflow/kb/storage";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; documentId: string }> }
) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  const { projectId, documentId } = await props.params;

  const ownerId = await getWorkflowOwner(req);
  if (!ownerId) return unauthorizedResponse();

  const doc = await prisma.projectDocument.findFirst({
    where: {
      id: documentId,
      projectId,
      ownerId,
    },
  });

  if (!doc) {
    return notFoundResponse("Document not found.");
  }

  // Delete stored file
  if (doc.storageKey) {
    await deleteFromStorage(doc.storageKey).catch(() => {});
  }

  // Delete from DB (associated chunks cascade delete automatically)
  await prisma.projectDocument.delete({
    where: { id: doc.id },
  });

  return NextResponse.json({ ok: true, deletedId: doc.id });
}
