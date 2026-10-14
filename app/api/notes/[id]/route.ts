import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWriteAccess } from "@/lib/auth/write-access";

// PATCH /api/notes/:id — update a note
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const { id } = await params;
    const body = await req.json();
    const { title, link, description, tagId } = body as {
      title?: string;
      link?: string;
      description?: string;
      tagId?: string | null;
    };

    const note = await prisma.note.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(link !== undefined && { link: link?.trim() || null }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(tagId !== undefined && { tagId: tagId || null }),
      },
      include: { tag: true },
    });

    return NextResponse.json(note);
  } catch {
    return NextResponse.json({ error: "Failed to update note" }, { status: 500 });
  }
}

// DELETE /api/notes/:id
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireWriteAccess(_req);
  if (denied) return denied;

  try {
    const { id } = await params;
    await prisma.note.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}
