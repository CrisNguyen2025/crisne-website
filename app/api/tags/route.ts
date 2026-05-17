import { NextRequest, NextResponse } from "next/server";
import { getTags, createTag } from "@/lib/notion";
import type { TagWithPostCount } from "@/lib/notion-types";

export const dynamic = "force-dynamic";

// GET /api/tags — list all tags with post count
export async function GET() {
  try {
    const tags = await getTags();

    const result: TagWithPostCount[] = tags.map((tag) => ({
      ...tag,
      postCount: tag.postIds.length,
    }));

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[GET /api/tags]", err);
    return NextResponse.json(
      { error: "Failed to fetch tags", detail: message },
      { status: 500 }
    );
  }
}

// POST /api/tags
// Body: { name, color? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, color } = body as { name: string; color?: string };

    if (!name?.trim()) {
      return NextResponse.json({ error: "Tag name is required" }, { status: 400 });
    }

    const tag = await createTag(name.trim(), color);
    return NextResponse.json(tag, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/tags]", err);
    return NextResponse.json(
      { error: "Failed to create tag", detail: message },
      { status: 500 }
    );
  }
}
