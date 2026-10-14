import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  getWorkflowOwner,
  notFoundResponse,
  requireWriteAccess,
  unauthorizedResponse,
} from "@/lib/workflow/auth";
import { listVersions, publishVersion } from "@/lib/workflow/repository";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;

  const ownerId = await getWorkflowOwner(req);
  if (!ownerId) return unauthorizedResponse();

  const versions = await listVersions(ownerId, id);
  if (!versions) {
    return notFoundResponse("Workflow not found.");
  }

  return NextResponse.json({
    versions: versions.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      graphHash: v.graphHash,
      createdAt: v.createdAt,
    })),
  });
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  const { id } = await props.params;

  const ownerId = await getWorkflowOwner(req);
  if (!ownerId) return unauthorizedResponse();

  const result = await publishVersion(ownerId, id);
  if (!result.ok) {
    if (result.notFound) {
      return notFoundResponse(result.message);
    }
    if (result.validationErrors) {
      return NextResponse.json({ errors: result.validationErrors }, { status: 422 });
    }
    return badRequestResponse(result.message || "Failed to publish version.");
  }

  return NextResponse.json(
    {
      version: {
        id: result.version.id,
        versionNumber: result.version.versionNumber,
        graphHash: result.version.graphHash,
        createdAt: result.version.createdAt,
      },
    },
    { status: 201 }
  );
}
