import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  getWorkflowOwner,
  notFoundResponse,
  requireWriteAccess,
  unauthorizedResponse,
} from "@/lib/workflow/auth";
import { createWorkflow, listWorkflows } from "@/lib/workflow/repository";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ownerId = await getWorkflowOwner(req);
  if (!ownerId) return unauthorizedResponse();

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId || !projectId.trim()) {
    return badRequestResponse("Query parameter 'projectId' is required.");
  }

  const workflows = await listWorkflows(ownerId, projectId.trim());
  return NextResponse.json({
    workflows: workflows.map((w) => ({
      id: w.id,
      name: w.name,
      updatedAt: w.updatedAt,
      draftGraphHash: w.draftGraphHash,
    })),
  });
}

export async function POST(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  const ownerId = await getWorkflowOwner(req);
  if (!ownerId) return unauthorizedResponse();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequestResponse("Invalid JSON payload.");
  }

  if (!body || typeof body !== "object") {
    return badRequestResponse("Request body must be an object.");
  }

  const { projectId, name } = body as { projectId?: unknown; name?: unknown };
  if (typeof projectId !== "string" || !projectId.trim()) {
    return badRequestResponse("Property 'projectId' is required.");
  }
  if (typeof name !== "string" || !name.trim()) {
    return badRequestResponse("Property 'name' is required.");
  }

  try {
    const workflow = await createWorkflow(ownerId, projectId.trim(), name.trim());
    return NextResponse.json({ workflow }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("not found")) {
      return notFoundResponse(message);
    }
    return badRequestResponse(message);
  }
}
