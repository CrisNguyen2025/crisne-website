import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, summary, focusTasks } = body as {
      name?: string;
      summary?: string;
      focusTasks?: string | null;
    };
    const now = new Date().toISOString();

    await prisma.$executeRaw`
      UPDATE Role
      SET
        name = COALESCE(${name?.trim() || null}, name),
        summary = COALESCE(${summary?.trim() || null}, summary),
        focusTasks = ${focusTasks === undefined ? null : focusTasks?.trim() || null},
        updatedAt = ${now}
      WHERE id = ${id}
    `;

    const rows = await prisma.$queryRaw<Array<{ id: string; name: string; summary: string; focusTasks: string | null }>>`
      SELECT id, name, summary, focusTasks FROM Role WHERE id = ${id}
    `;
    return NextResponse.json(rows[0] ?? null);
  } catch {
    return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.$executeRaw`DELETE FROM Role WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete role" }, { status: 500 });
  }
}
