import { NextRequest, NextResponse } from "next/server";
import { getPostById, getTags, updatePost, deletePost } from "@/lib/notion";
import { replaceBase64WithUrls, estimateContentSize } from "@/lib/image-upload";
import type { PostWithTags } from "@/lib/notion-types";

type Params = { params: Promise<{ id: string }> };

// GET /api/posts/:id — single post with tags populated
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const [post, allTags] = await Promise.all([getPostById(id), getTags()]);

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const tagMap = Object.fromEntries(allTags.map((t) => [t.id, t]));
    const result: PostWithTags = {
      ...post,
      tags: post.tagIds.flatMap((tid) => (tagMap[tid] ? [tagMap[tid]] : [])),
    };

    // Remove raw tagIds from response
    const { tagIds: _tagIds, ...rest } = result as PostWithTags & { tagIds?: string[] };
    void _tagIds;

    return NextResponse.json(rest);
  } catch (err) {
    console.error("[GET /api/posts/:id]", err);
    return NextResponse.json({ error: "Failed to fetch post" }, { status: 500 });
  }
}

// PATCH /api/posts/:id
// Body: { title?, slug?, content?, published?, tagIds? }
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { title, slug, content, published, tagIds } = body as {
      title?: string;
      slug?: string;
      content?: string;
      published?: boolean;
      tagIds?: string[];
    };

    // Process content if provided (fallback for legacy base64)
    let processedContent = content;
    
    if (content !== undefined) {
      const trimmedContent = content.trim();
      
      if (trimmedContent) {
        const sizeInfo = estimateContentSize(trimmedContent);
        
        // Only convert if there are base64 images (legacy content)
        if (sizeInfo.imageCount > 0) {
          console.log('Found base64 images in content (legacy), converting...', {
            total: `${(sizeInfo.totalSize / 1024).toFixed(2)}KB`,
            base64: `${(sizeInfo.base64Size / 1024).toFixed(2)}KB`,
            images: sizeInfo.imageCount,
          });
          
          processedContent = await replaceBase64WithUrls(trimmedContent);
          
          const newSize = processedContent.length;
          console.log(`Content size after conversion: ${(newSize / 1024).toFixed(2)}KB`);
        } else {
          processedContent = trimmedContent;
        }
      } else {
        processedContent = trimmedContent;
      }
    }

    const post = await updatePost(id, {
      ...(title !== undefined && { title: title.trim() }),
      ...(slug !== undefined && { slug: slug.trim() }),
      ...(processedContent !== undefined && { content: processedContent }),
      ...(published !== undefined && { published }),
      ...(tagIds !== undefined && { tagIds }),
    });

    return NextResponse.json(post);
  } catch (err) {
    console.error("[PATCH /api/posts/:id]", err);
    return NextResponse.json({ error: "Failed to update post" }, { status: 500 });
  }
}

// DELETE /api/posts/:id — archives the Notion page
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await deletePost(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/posts/:id]", err);
    return NextResponse.json({ error: "Failed to delete post" }, { status: 500 });
  }
}
