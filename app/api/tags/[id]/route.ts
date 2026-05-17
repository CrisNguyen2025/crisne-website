import { NextRequest, NextResponse } from "next/server";
import { getTagById, updateTag, deleteTag, getPosts, getTags } from "@/lib/notion";
import type { PostWithTags } from "@/lib/notion-types";

type Params = { params: Promise<{ id: string }> };

// GET /api/tags/:id/posts — get all posts for a tag (handled below via query param)
// PATCH /api/tags/:id
// Body: { name?, color? }
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, color } = body as { name?: string; color?: string };

    const tag = await updateTag(id, {
      ...(name !== undefined && { name: name.trim() }),
      ...(color !== undefined && { color }),
    });

    return NextResponse.json(tag);
  } catch (err) {
    console.error("[PATCH /api/tags/:id]", err);
    return NextResponse.json({ error: "Failed to update tag" }, { status: 500 });
  }
}

// DELETE /api/tags/:id — archives the Notion page
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await deleteTag(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/tags/:id]", err);
    return NextResponse.json({ error: "Failed to delete tag" }, { status: 500 });
  }
}

// GET /api/tags/:id — single tag with its posts
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const [tag, posts, allTags] = await Promise.all([
      getTagById(id),
      getPosts({ tagId: id }),
      getTags(),
    ]);

    if (!tag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    const tagMap = Object.fromEntries(allTags.map((t) => [t.id, t]));

    const postsWithTags: PostWithTags[] = posts.map(({ tagIds, ...post }) => ({
      ...post,
      tags: tagIds.flatMap((tid) => (tagMap[tid] ? [tagMap[tid]] : [])),
    }));

    return NextResponse.json({
      ...tag,
      postCount: tag.postIds.length,
      posts: postsWithTags,
    });
  } catch (err) {
    console.error("[GET /api/tags/:id]", err);
    return NextResponse.json({ error: "Failed to fetch tag" }, { status: 500 });
  }
}
