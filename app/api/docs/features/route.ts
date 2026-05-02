import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureDocsSchema } from "@/app/api/docs/_shared/ensure-docs-schema";

export async function GET() {
  try {
    await ensureDocsSchema();
    const features = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT id, name FROM Feature ORDER BY createdAt ASC
    `;
    return NextResponse.json(features);
  } catch {
    return NextResponse.json({ error: "Failed to fetch features" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDocsSchema();
    const body = await req.json();
    const { name } = body as { name: string };
    if (!name?.trim()) return NextResponse.json({ error: "Feature name is required" }, { status: 400 });

    const id = randomUUID();
    const now = new Date().toISOString();
    await prisma.$executeRaw`
      INSERT INTO Feature (id, name, createdAt, updatedAt)
      VALUES (${id}, ${name.trim()}, ${now}, ${now})
    `;
    return NextResponse.json({ id, name: name.trim() }, { status: 201 });
  } catch (err: unknown) {
    const unique = err instanceof Error && err.message.includes("UNIQUE");
    return NextResponse.json({ error: unique ? "Feature already exists" : "Failed to create feature" }, { status: unique ? 409 : 500 });
  }
}
