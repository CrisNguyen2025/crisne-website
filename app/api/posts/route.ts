import { NextRequest, NextResponse } from "next/server";
import { getPosts, getTags, createPost } from "@/lib/notion";
import type { PostWithTags } from "@/lib/notion-types";

export const dynamic = "force-dynamic";

// GET /api/posts
// Query params:
//   ?tagId=<notionPageId>   — filter by tag
//   ?published=true         — only published posts
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tagId = searchParams.get("tagId") ?? undefined;
    const publishedOnly = searchParams.get("published") === "true";

    const [posts, allTags] = await Promise.all([
      getPosts({ tagId, publishedOnly }),
      getTags(),
    ]);

    const tagMap = Object.fromEntries(allTags.map((t) => [t.id, t]));

    const result: PostWithTags[] = posts.map(({ tagIds, ...post }) => ({
      ...post,
      tags: tagIds.flatMap((id) => (tagMap[id] ? [tagMap[id]] : [])),
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error("[GET /api/posts]", err);
    return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
  }
}

// POST /api/posts
// Body: { title, slug?, content?, published?, tagIds? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, slug, content, published, tagIds } = body as {
      title: string;
      slug?: string;
      content?: string;
      published?: boolean;
      tagIds?: string[];
    };

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const post = await createPost({
      title: title.trim(),
      slug: slug?.trim(),
      content: content?.trim(),
      published: published ?? false,
      tagIds: tagIds ?? [],
    });

    return NextResponse.json(post, { status: 201 });
  } catch (err) {
    console.error("[POST /api/posts]", err);
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
  }
}
