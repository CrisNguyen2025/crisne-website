import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/notes?tagId=xxx — list notes, optionally filtered by tag
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tagId = searchParams.get("tagId");

    const notes = await prisma.note.findMany({
      where: tagId ? { tagId } : undefined,
      include: { tag: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(notes);
  } catch {
    return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
  }
}

// POST /api/notes — create a note
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, link, description, tagId } = body as {
      title: string;
      link?: string;
      description?: string;
      tagId?: string;
    };

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const note = await prisma.note.create({
      data: {
        title: title.trim(),
        link: link?.trim() || null,
        description: description?.trim() || null,
        tagId: tagId || null,
      },
      include: { tag: true },
    });

    return NextResponse.json(note, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
  }
}
