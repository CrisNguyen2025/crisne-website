import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureDocsSchema } from "@/app/api/docs/_shared/ensure-docs-schema";

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

function toSafeInt(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return -1;
}

function normalizeJsonExample(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return trimmed;
  }
}

export async function GET() {
  try {
    await ensureDocsSchema();
    const apis = await prisma.$queryRaw<ApiRow[]>`
      SELECT id, method, path, module, summary, requestExample, responseExample, featureId, sortOrder, reviewed
      FROM ApiEndpoint
      ORDER BY COALESCE(featureId, ''), sortOrder ASC, path ASC
    `;
    return NextResponse.json(apis.map((api) => ({ ...api, reviewed: Boolean(api.reviewed) })));
  } catch {
    return NextResponse.json({ error: "Failed to fetch APIs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDocsSchema();
    const body = await req.json();
    const { method, path, summary, requestExample, responseExample, featureId } = body as {
      method: string;
      path: string;
      summary?: string;
      requestExample?: string;
      responseExample?: string;
      featureId?: string | null;
    };

    if (!method?.trim() || !path?.trim()) {
      return NextResponse.json({ error: "method and path are required" }, { status: 400 });
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const normalizedMethod = method.trim().toUpperCase();

    const rows = featureId
      ? await prisma.$queryRaw<Array<{ maxOrder: number | null }>>`
          SELECT MAX(sortOrder) as maxOrder FROM ApiEndpoint WHERE featureId = ${featureId}
        `
      : await prisma.$queryRaw<Array<{ maxOrder: number | null }>>`
          SELECT MAX(sortOrder) as maxOrder FROM ApiEndpoint WHERE featureId IS NULL
        `;
    const nextOrder = toSafeInt(rows[0]?.maxOrder) + 1;

    await prisma.$executeRaw`
      INSERT INTO ApiEndpoint (id, method, path, module, summary, requestExample, responseExample, featureId, sortOrder, reviewed, createdAt, updatedAt)
      VALUES (${id}, ${normalizedMethod}, ${path.trim()}, '', ${summary?.trim() || ""}, ${normalizeJsonExample(requestExample)}, ${normalizeJsonExample(responseExample)}, ${featureId || null}, ${nextOrder}, 0, ${now}, ${now})
    `;

    return NextResponse.json(
      { id, method: normalizedMethod, path: path.trim(), module: "", summary: summary?.trim() || "", requestExample: normalizeJsonExample(requestExample), responseExample: normalizeJsonExample(responseExample), featureId: featureId || null, sortOrder: nextOrder, reviewed: false },
      { status: 201 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    const unique = message.includes("UNIQUE");
    return NextResponse.json(
      { error: unique ? "API method + path already exists" : `Failed to create API${message ? `: ${message}` : ""}` },
      { status: unique ? 409 : 500 },
    );
  }
}
