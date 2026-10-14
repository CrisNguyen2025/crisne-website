import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  getWorkflowOwner,
  notFoundResponse,
  unauthorizedResponse,
} from "@/lib/workflow/auth";
import { getRunDetail } from "@/lib/workflow/run-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; runId: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const ownerId = await getWorkflowOwner(req);
  if (!ownerId) return unauthorizedResponse();

  const { runId } = await params;
  if (!runId) return badRequestResponse("Missing run id.");

  const run = await getRunDetail(ownerId, runId);
  if (!run) return notFoundResponse(`Run "${runId}" not found.`);

  return NextResponse.json({ run });
}
