import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureDocsSchema } from "@/app/api/docs/_shared/ensure-docs-schema";

type RoleApiAccessRow = {
  id: string;
  roleId: string;
  apiId: string;
  access: "allowed" | "conditional" | "denied";
  note: string | null;
};

export async function GET() {
  try {
    await ensureDocsSchema();
    const rows = await prisma.$queryRaw<RoleApiAccessRow[]>`
      SELECT id, roleId, apiId, access, note
      FROM RoleApiAccess
    `;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: "Failed to fetch access" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureDocsSchema();
    const body = await req.json();
    const { roleId, apiId, access } = body as {
      roleId: string;
      apiId: string;
      access: "allowed" | "conditional" | "denied";
    };

    if (!roleId || !apiId || !access) {
      return NextResponse.json({ error: "roleId, apiId, access are required" }, { status: 400 });
    }

    const now = new Date().toISOString();
    await prisma.$executeRaw`
      INSERT INTO RoleApiAccess (id, roleId, apiId, access, note, createdAt, updatedAt)
      VALUES (${randomUUID()}, ${roleId}, ${apiId}, ${access}, null, ${now}, ${now})
      ON CONFLICT(roleId, apiId) DO UPDATE SET access = ${access}, updatedAt = ${now}
    `;

    const rows = await prisma.$queryRaw<RoleApiAccessRow[]>`
      SELECT id, roleId, apiId, access, note
      FROM RoleApiAccess
      WHERE roleId = ${roleId} AND apiId = ${apiId}
    `;

    return NextResponse.json(rows[0]);
  } catch {
    return NextResponse.json({ error: "Failed to update access" }, { status: 500 });
  }
}
