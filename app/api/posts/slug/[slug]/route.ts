import { NextRequest, NextResponse } from "next/server";
import { getPostBySlug, getTags } from "@/lib/notion";
import type { PostWithTags } from "@/lib/notion-types";

type Params = { params: Promise<{ slug: string }> };

// GET /api/posts/slug/:slug — fetch post by slug with tags populated
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { slug } = await params;
    const [post, allTags] = await Promise.all([getPostBySlug(slug), getTags()]);

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const tagMap = Object.fromEntries(allTags.map((t) => [t.id, t]));
    const result: PostWithTags = {
      ...post,
      tags: post.tagIds.flatMap((tid) => (tagMap[tid] ? [tagMap[tid]] : [])),
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("[GET /api/posts/slug/:slug]", err);
    return NextResponse.json({ error: "Failed to fetch post" }, { status: 500 });
  }
}
