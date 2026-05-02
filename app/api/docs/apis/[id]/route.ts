import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type ApiUpdateBody = {
  method?: string;
  path?: string;
  summary?: string | null;
  requestExample?: string | null;
  responseExample?: string | null;
  featureId?: string | null;
  reviewed?: boolean;
  sortOrder?: number;
};

type ApiRow = {
  id: string;
  method: string;
  path: string;
  module: string;
  summary: string;
  requestExample: string | null;
  responseExample: string | null;
  featureId: string | null;
  sortOrder: number;
  reviewed: number;
};

function normalizeJsonExample(value: string | null | undefined): string | null {
  if (value === undefined) return null;
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return trimmed;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as ApiUpdateBody;
    const now = new Date().toISOString();

    const currentRows = await prisma.$queryRaw<ApiRow[]>`
      SELECT id, method, path, module, summary, requestExample, responseExample, featureId, sortOrder, reviewed
      FROM ApiEndpoint
      WHERE id = ${id}
    `;
    const current = currentRows[0];
    if (!current) return NextResponse.json({ error: "API not found" }, { status: 404 });

    const nextMethod = body.method?.trim().toUpperCase() || current.method;
    const nextPath = body.path?.trim() || current.path;
    const nextSummary = body.summary === undefined ? current.summary : body.summary?.trim() || "";
    const nextRequestExample = body.requestExample === undefined ? current.requestExample : normalizeJsonExample(body.requestExample);
    const nextResponseExample = body.responseExample === undefined ? current.responseExample : normalizeJsonExample(body.responseExample);
    const nextFeatureId = body.featureId === undefined ? current.featureId : body.featureId || null;
    const nextReviewed = body.reviewed === undefined ? current.reviewed : body.reviewed ? 1 : 0;
    const nextSortOrder = body.sortOrder ?? current.sortOrder;

    await prisma.$executeRaw`
      UPDATE ApiEndpoint
      SET
        method = ${nextMethod},
        path = ${nextPath},
        summary = ${nextSummary},
        requestExample = ${nextRequestExample},
        responseExample = ${nextResponseExample},
        featureId = ${nextFeatureId},
        reviewed = ${nextReviewed},
        sortOrder = ${nextSortOrder},
        updatedAt = ${now}
      WHERE id = ${id}
    `;

    const rows = await prisma.$queryRaw<ApiRow[]>`
      SELECT id, method, path, module, summary, requestExample, responseExample, featureId, sortOrder, reviewed
      FROM ApiEndpoint
      WHERE id = ${id}
    `;
    const api = rows[0];
    return NextResponse.json(api ? { ...api, reviewed: Boolean(api.reviewed) } : null);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    return NextResponse.json({ error: `Failed to update API${message ? `: ${message}` : ""}` }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.$executeRaw`DELETE FROM ApiEndpoint WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete API" }, { status: 500 });
  }
}
