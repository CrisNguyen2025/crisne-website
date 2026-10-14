import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  badRequestResponse,
  getWorkflowOwner,
  notFoundResponse,
  requireWriteAccess,
  unauthorizedResponse,
} from "@/lib/workflow/auth";
import { ingestDocument } from "@/lib/workflow/kb/ingest";
import { MAX_DOCUMENT_FILE_SIZE, MAX_DOCUMENTS_PER_PROJECT } from "@/lib/workflow/kb/parser";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await props.params;

  const ownerId = await getWorkflowOwner(req);
  if (!ownerId) return unauthorizedResponse();

  const project = await prisma.workflowProject.findFirst({
    where: { id: projectId, ownerId },
  });
  if (!project) return notFoundResponse("Project not found.");

  const docs = await prisma.projectDocument.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { chunks: true },
      },
    },
  });

  return NextResponse.json({
    documents: docs.map((d) => ({
      id: d.id,
      filename: d.filename,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      status: d.status,
      error: d.error,
      chunksCount: d._count.chunks,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    })),
  });
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ projectId: string }> }
) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  const { projectId } = await props.params;

  const ownerId = await getWorkflowOwner(req);
  if (!ownerId) return unauthorizedResponse();

  const project = await prisma.workflowProject.findFirst({
    where: { id: projectId, ownerId },
  });
  if (!project) return notFoundResponse("Project not found.");

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return badRequestResponse("Invalid multipart form data.");
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return badRequestResponse("A file is required.");
  }

  if (file.size > MAX_DOCUMENT_FILE_SIZE) {
    return badRequestResponse("File size exceeds the 1 MB limit.");
  }

  const filename = (file as File).name || "document.txt";
  const lowerName = filename.toLowerCase();
  const isSupported =
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".markdown") ||
    lowerName.endsWith(".txt") ||
    file.type === "text/markdown" ||
    file.type === "text/plain";

  if (!isSupported) {
    return badRequestResponse(
      "Unsupported document format. Only Markdown (.md) and plain text (.txt) files are supported."
    );
  }

  const currentCount = await prisma.projectDocument.count({
    where: { projectId },
  });
  if (currentCount >= MAX_DOCUMENTS_PER_PROJECT) {
    return badRequestResponse(
      `Project reached maximum limit of ${MAX_DOCUMENTS_PER_PROJECT} documents.`
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  try {
    const result = await ingestDocument({
      projectId,
      ownerId,
      filename,
      mimeType: file.type || "text/plain",
      buffer,
    });

    return NextResponse.json(
      {
        document: {
          id: result.document.id,
          filename: result.document.filename,
          mimeType: result.document.mimeType,
          sizeBytes: result.document.sizeBytes,
          status: result.document.status,
          error: result.document.error,
          chunksCount: result.chunksCount,
          createdAt: result.document.createdAt,
        },
        skipped: result.skipped,
      },
      { status: 201 }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Failed to process document.";
    return badRequestResponse(errorMsg);
  }
}
