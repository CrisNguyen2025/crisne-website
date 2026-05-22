import { NextRequest, NextResponse } from "next/server";
import { getPosts, getTags, createPost } from "@/lib/notion";
import { replaceBase64WithUrls, estimateContentSize } from "@/lib/image-upload";
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

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    });
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

    // Check content size and convert base64 images to URLs (fallback for old content)
    let processedContent = content?.trim();
    
    if (processedContent) {
      const sizeInfo = estimateContentSize(processedContent);
      
      // Only process if there are base64 images (shouldn't happen with new paste plugin)
      if (sizeInfo.imageCount > 0) {
        console.log('Found base64 images in content (legacy), converting...', {
          total: `${(sizeInfo.totalSize / 1024).toFixed(2)}KB`,
          base64: `${(sizeInfo.base64Size / 1024).toFixed(2)}KB`,
          images: sizeInfo.imageCount,
        });
        
        processedContent = await replaceBase64WithUrls(processedContent);
        
        const newSize = processedContent.length;
        console.log(`Content size after conversion: ${(newSize / 1024).toFixed(2)}KB (saved ${((sizeInfo.totalSize - newSize) / 1024).toFixed(2)}KB)`);
      }
      
      // Warn if still too large
      if (processedContent.length > 200000) {
        console.warn(`Content is still large (${(processedContent.length / 1024).toFixed(2)}KB). May exceed Notion limits.`);
      }
    }

    const post = await createPost({
      title: title.trim(),
      slug: slug?.trim(),
      content: processedContent,
      published: published ?? false,
      tagIds: tagIds ?? [],
    });

    return NextResponse.json(post, { status: 201 });
  } catch (err) {
    console.error("[POST /api/posts]", err);
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
  }
}
