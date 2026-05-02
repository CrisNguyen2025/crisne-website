import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.$executeRaw`UPDATE ApiEndpoint SET featureId = NULL WHERE featureId = ${id}`;
    await prisma.$executeRaw`DELETE FROM Feature WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete feature" }, { status: 500 });
  }
}
