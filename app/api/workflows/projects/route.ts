import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  getWorkflowOwner,
  requireWriteAccess,
  unauthorizedResponse,
} from "@/lib/workflow/auth";
import { createProject, listProjects } from "@/lib/workflow/repository";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ownerId = await getWorkflowOwner(req);
  if (!ownerId) return unauthorizedResponse();

  const projects = await listProjects(ownerId);
  return NextResponse.json({
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
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

  const { name, description } = body as { name?: unknown; description?: unknown };
  if (typeof name !== "string" || !name.trim()) {
    return badRequestResponse("Project name is required.");
  }

  const project = await createProject(ownerId, {
    name: name.trim(),
    description: typeof description === "string" ? description.trim() : undefined,
  });

  return NextResponse.json({ project }, { status: 201 });
}
