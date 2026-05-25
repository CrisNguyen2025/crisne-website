import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import type { PostWithTags, TagWithPostCount } from "@/lib/notion-types";

async function getNextBackupIndex(docsDir: string): Promise<number> {
  let files: string[] = [];
  try {
    files = await fs.readdir(docsDir);
  } catch {
    return 1;
  }
  const indices = files
    .map((f) => f.match(/^backup(\d+)\.md$/))
    .filter(Boolean)
    .map((m) => parseInt(m![1], 10));
  return indices.length === 0 ? 1 : Math.max(...indices) + 1;
}

export async function POST(request: Request) {
  try {
    const { posts, tags } = await request.json();

    if (!Array.isArray(posts)) {
      return NextResponse.json({ error: "Invalid data format" }, { status: 400 });
    }

    const docsDir = path.join(process.cwd(), "docs");
    try {
      await fs.access(docsDir);
    } catch {
      await fs.mkdir(docsDir, { recursive: true });
    }

    const index = await getNextBackupIndex(docsDir);
    const mdFileName = `backup${index}.md`;
    const jsonFileName = `backup${index}.json`;

    // ----------------------------------------------------------------------
    // Build Markdown with clear relations
    // ----------------------------------------------------------------------
    let mdContent = `# Notes Backup #${index}\n\nGenerated on: ${new Date().toISOString()}\n\n`;

    // Tags section with detailed info
    if (Array.isArray(tags) && tags.length > 0) {
      mdContent += `---\n\n## 🏷️ All Tags (${tags.length})\n\n`;
      mdContent += `| ID | Name | Color | Posts Count |\n|-----|------|-------|-------------|\n`;
      for (const tag of tags as TagWithPostCount[]) {
        mdContent += `| \`${tag.id}\` | ${tag.name} | ${tag.color} | ${tag.postCount} |\n`;
      }
      mdContent += `\n`;
    }

    // Posts section with relations
    mdContent += `---\n\n## 📝 All Posts (${posts.length})\n\n`;
    
    // Group posts by tag for better organization
    if (Array.isArray(tags) && tags.length > 0) {
      for (const tag of tags as TagWithPostCount[]) {
        const tagPosts = (posts as PostWithTags[]).filter(p => 
          p.tags && p.tags.some(t => t.id === tag.id)
        );
        
        if (tagPosts.length > 0) {
          mdContent += `\n### 🏷️ ${tag.name} (${tagPosts.length} posts)\n\n`;
          
          for (const post of tagPosts) {
            mdContent += `#### ${post.title}\n`;
            mdContent += `- **ID:** \`${post.id}\`\n`;
            mdContent += `- **Date:** ${new Date(post.createdAt).toLocaleDateString()}\n`;
            if (post.slug) {
              mdContent += `- **Slug:** \`${post.slug}\`\n`;
            }
            if (post.tags && post.tags.length > 1) {
              mdContent += `- **Other Tags:** ${post.tags.filter(t => t.id !== tag.id).map(t => t.name).join(", ")}\n`;
            }
            mdContent += `\n${post.content || "No content."}\n\n---\n\n`;
          }
        }
      }
      
      // Untagged posts
      const untaggedPosts = (posts as PostWithTags[]).filter(p => 
        !p.tags || p.tags.length === 0
      );
      
      if (untaggedPosts.length > 0) {
        mdContent += `\n### 📌 Untagged Posts (${untaggedPosts.length})\n\n`;
        for (const post of untaggedPosts) {
          mdContent += `#### ${post.title}\n`;
          mdContent += `- **ID:** \`${post.id}\`\n`;
          mdContent += `- **Date:** ${new Date(post.createdAt).toLocaleDateString()}\n`;
          if (post.slug) {
            mdContent += `- **Slug:** \`${post.slug}\`\n`;
          }
          mdContent += `\n${post.content || "No content."}\n\n---\n\n`;
        }
      }
    } else {
      // No tags, just list all posts
      for (const post of posts as PostWithTags[]) {
        mdContent += `\n#### ${post.title}\n`;
        mdContent += `- **ID:** \`${post.id}\`\n`;
        mdContent += `- **Date:** ${new Date(post.createdAt).toLocaleDateString()}\n`;
        if (post.slug) {
          mdContent += `- **Slug:** \`${post.slug}\`\n`;
        }
        if (post.tags && post.tags.length > 0) {
          mdContent += `- **Tags:** ${post.tags.map(t => t.name).join(", ")}\n`;
        }
        mdContent += `\n${post.content || "No content."}\n\n---\n\n`;
      }
    }

    // Add relations map for AI
    mdContent += `\n---\n\n## 🔗 Relations Map (for AI import/export)\n\n`;
    mdContent += `\`\`\`json\n`;
    const relationsMap: Record<string, string[]> = {};
    for (const post of posts as PostWithTags[]) {
      if (post.tags && post.tags.length > 0) {
        relationsMap[post.id] = post.tags.map(t => t.id);
      }
    }
    mdContent += JSON.stringify(relationsMap, null, 2);
    mdContent += `\n\`\`\`\n`;

    // ----------------------------------------------------------------------
    // Build JSON (full data dump for restore)
    // ----------------------------------------------------------------------
    const jsonContent = {
      version: 2, // Bumped version for new format
      index,
      generatedAt: new Date().toISOString(),
      tagsCount: Array.isArray(tags) ? tags.length : 0,
      postsCount: posts.length,
      tags: Array.isArray(tags) ? tags : [],
      posts,
      // Add explicit relations for easy import
      relations: (posts as PostWithTags[]).map(post => ({
        postId: post.id,
        postTitle: post.title,
        tagIds: post.tags ? post.tags.map(t => t.id) : [],
        tagNames: post.tags ? post.tags.map(t => t.name) : [],
      })),
    };

    // Write both files
    const mdPath = path.join(docsDir, mdFileName);
    const jsonPath = path.join(docsDir, jsonFileName);
    await Promise.all([
      fs.writeFile(mdPath, mdContent, "utf-8"),
      fs.writeFile(jsonPath, JSON.stringify(jsonContent, null, 2), "utf-8"),
    ]);

    return NextResponse.json({
      success: true,
      index,
      mdPath: `docs/${mdFileName}`,
      jsonPath: `docs/${jsonFileName}`,
      path: `docs/${mdFileName}`, // backwards compat
    });
  } catch (error) {
    console.error("Backup error:", error);
    return NextResponse.json({ error: "Failed to create backup" }, { status: 500 });
  }
}
