import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/tags — list all tags
export async function GET() {
  try {
    const tags = await prisma.tag.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { notes: true } } },
    });
    return NextResponse.json(tags);
  } catch {
    return NextResponse.json({ error: "Failed to fetch tags" }, { status: 500 });
  }
}

// POST /api/tags — create a tag
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, color } = body as { name: string; color?: string };

    if (!name?.trim()) {
      return NextResponse.json({ error: "Tag name is required" }, { status: 400 });
    }

    const tag = await prisma.tag.create({
      data: { name: name.trim(), color: color ?? "#6b9ac4" },
    });

    return NextResponse.json(tag, { status: 201 });
  } catch (err: unknown) {
    const isUniqueConstraint =
      err instanceof Error && err.message.includes("Unique constraint");
    if (isUniqueConstraint) {
      return NextResponse.json({ error: "Tag already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create tag" }, { status: 500 });
  }
}
