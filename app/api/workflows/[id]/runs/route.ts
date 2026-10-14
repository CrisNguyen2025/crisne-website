import { NextRequest, NextResponse, after } from "next/server";
import {
  badRequestResponse,
  getWorkflowOwner,
  notFoundResponse,
  requireWriteAccess,
  unauthorizedResponse,
} from "@/lib/workflow/auth";
import { listRuns, runWorkflow } from "@/lib/workflow/run-service";
import { flushLangfuse } from "@/lib/ai/langfuse";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const ownerId = await getWorkflowOwner(req);
  if (!ownerId) return unauthorizedResponse();

  const { id } = await params;
  if (!id) return badRequestResponse("Missing workflow id.");

  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 20;

  const runs = await listRuns(ownerId, id, isNaN(limit) ? 20 : limit);
  return NextResponse.json({ runs });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
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

  const { input, dryRun, versionId } = body as {
    input?: { query?: unknown };
    dryRun?: unknown;
    versionId?: unknown;
  };

  if (!input || typeof input !== "object" || typeof input.query !== "string" || !input.query.trim()) {
    return badRequestResponse("Property 'input.query' is required and must be a non-empty string.");
  }

  const result = await runWorkflow({
    ownerId,
    workflowId: id,
    input: { query: input.query.trim() },
    dryRun: Boolean(dryRun),
    versionId: typeof versionId === "string" ? versionId : undefined,
    trigger: "API",
  });

  after(async () => {
    try {
      await flushLangfuse();
    } catch (err) {
      console.error("Failed to flush Langfuse trace:", err);
    }
  });

  if (!result.ok) {
    if (result.notFound) {
      return notFoundResponse(result.message ?? "Workflow not found.");
    }
    return NextResponse.json({ errors: result.validationErrors }, { status: 422 });
  }

  return NextResponse.json({ run: result.run });
}
