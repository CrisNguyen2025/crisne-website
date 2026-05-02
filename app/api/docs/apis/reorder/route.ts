import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { ids } = body as { ids: string[] };
    if (!Array.isArray(ids)) return NextResponse.json({ error: "ids are required" }, { status: 400 });

    const now = new Date().toISOString();
    for (const [index, id] of ids.entries()) {
      await prisma.$executeRaw`UPDATE ApiEndpoint SET sortOrder = ${index}, updatedAt = ${now} WHERE id = ${id}`;
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to reorder APIs" }, { status: 500 });
  }
}
