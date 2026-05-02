import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/tags/:id — rename or recolor a tag
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, color, prompt } = body as { name?: string; color?: string; prompt?: string | null };

    const tag = await prisma.tag.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(color !== undefined && { color }),
        ...(prompt !== undefined && { prompt: prompt?.trim() || null }),
      },
    });
    return NextResponse.json(tag);
  } catch (err) {
    console.error("[PATCH /api/tags/:id]", err);
    return NextResponse.json({ error: "Failed to update tag" }, { status: 500 });
  }
}

// DELETE /api/tags/:id
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.tag.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete tag" }, { status: 500 });
  }
}
