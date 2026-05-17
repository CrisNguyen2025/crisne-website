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
    .map(f => f.match(/^backup(\d+)\.md$/))
    .filter(Boolean)
    .map(m => parseInt(m![1], 10));
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
    const fileName = `backup${index}.md`;

    let mdContent = `# Notes Backup #${index}\n\nGenerated on: ${new Date().toISOString()}\n\n`;

    if (Array.isArray(tags) && tags.length > 0) {
      mdContent += `---\n\n## 🏷️ All Tags (${tags.length})\n\n`;
      mdContent += `| Name | Color | Posts |\n|------|-------|-------|\n`;
      for (const tag of tags as TagWithPostCount[]) {
        mdContent += `| ${tag.name} | ${tag.color} | ${tag.postCount} |\n`;
      }
      mdContent += `\n`;
    }

    mdContent += `---\n\n## 📝 All Posts (${posts.length})\n\n---\n\n`;

    for (const post of posts as PostWithTags[]) {
      mdContent += `## ${post.title}\n`;
      mdContent += `**Date:** ${new Date(post.createdAt).toLocaleDateString()}\n`;
      if (post.slug) {
        mdContent += `**Slug:** ${post.slug}\n`;
      }
      if (post.tags && post.tags.length > 0) {
        mdContent += `**Tags:** ${post.tags.map(t => t.name).join(", ")}\n`;
      }
      mdContent += `\n${post.content || "No content."}\n\n---\n\n`;
    }

    const filePath = path.join(docsDir, fileName);
    await fs.writeFile(filePath, mdContent, "utf-8");

    return NextResponse.json({ success: true, path: `docs/${fileName}`, index });
  } catch (error) {
    console.error("Backup error:", error);
    return NextResponse.json({ error: "Failed to create backup" }, { status: 500 });
  }
}
