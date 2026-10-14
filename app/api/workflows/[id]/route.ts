import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  getWorkflowOwner,
  notFoundResponse,
  requireWriteAccess,
  unauthorizedResponse,
} from "@/lib/workflow/auth";
import { getWorkflow, saveDraft } from "@/lib/workflow/repository";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const ownerId = await getWorkflowOwner(req);
  if (!ownerId) return unauthorizedResponse();

  const { id } = await params;
  if (!id) return badRequestResponse("Missing workflow id.");

  const result = await getWorkflow(ownerId, id);
  if (!result) return notFoundResponse(`Workflow "${id}" not found.`);

  return NextResponse.json(result);
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  const ownerId = await getWorkflowOwner(req);
  if (!ownerId) return unauthorizedResponse();

  const { id } = await params;
  if (!id) return badRequestResponse("Missing workflow id.");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequestResponse("Invalid JSON payload.");
  }

  if (!body || typeof body !== "object") {
    return badRequestResponse("Request body must be an object.");
  }

  const { graph, ui, name } = body as { graph?: unknown; ui?: unknown; name?: unknown };

  if (!graph || typeof graph !== "object") {
    return badRequestResponse("Property 'graph' must be an object.");
  }

  if (
    !ui ||
    typeof ui !== "object" ||
    !("positions" in ui) ||
    !("viewport" in ui)
  ) {
    return badRequestResponse("Property 'ui' must be an object containing 'positions' and 'viewport'.");
  }

  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    return badRequestResponse("Property 'name' must be a non-empty string when provided.");
  }

  const result = await saveDraft(ownerId, id, {
    graph,
    ui,
    name: typeof name === "string" ? name.trim() : undefined,
  });

  if (!result) {
    return notFoundResponse(`Workflow "${id}" not found.`);
  }

  return NextResponse.json(result);
}
