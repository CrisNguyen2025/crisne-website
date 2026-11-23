// Must stay the first import: gives this file its own SQLite DB before @/lib/prisma loads
import "../setup/isolated-test-db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getPublicNewsItem, listPublicNewsItems } from "@/lib/news/public-queries";

async function cleanNewsTables() {
  await prisma.ingestJob.deleteMany();
  await prisma.newsItem.deleteMany();
  await prisma.newsSource.deleteMany();
}

const createItem = (data: {
  slug: string;
  isPublic: boolean;
  ingestStatus?: string;
  reviewStatus?: string;
  publicAt?: Date;
}) =>
  prisma.newsItem.create({
    data: {
      sourceUrl: `https://nextjs.org/blog/${data.slug}`,
      canonicalUrl: `https://nextjs.org/blog/${data.slug}`,
      domain: "nextjs.org",
      platform: "article",
      origin: "cron",
      title: `Bài ${data.slug}`,
      tldr: "Tóm tắt",
      takeaways: JSON.stringify(["**Cache Components** mặc định"]),
      tags: JSON.stringify(["nextjs", "private-tag"]),
      personalNote: "Ghi chú riêng của Owner",
      ingestStatus: data.ingestStatus ?? "ready",
      reviewStatus: data.reviewStatus ?? "published",
      isPublic: data.isPublic,
      publicAt: data.isPublic ? (data.publicAt ?? new Date()) : null,
    },
  });

describe("public News queries", () => {
  beforeEach(cleanNewsTables);

  afterAll(async () => {
    await cleanNewsTables();
    await prisma.$disconnect();
  });

  it("lists only public, ready, non-dismissed posts, newest publicAt first", async () => {
    const older = await createItem({ slug: "older", isPublic: true, publicAt: new Date("2026-11-20T00:00:00Z") });
    const newer = await createItem({ slug: "newer", isPublic: true, publicAt: new Date("2026-11-22T00:00:00Z") });
    await createItem({ slug: "private", isPublic: false });
    await createItem({ slug: "queued", isPublic: true, ingestStatus: "queued" });
    await createItem({ slug: "dismissed", isPublic: true, reviewStatus: "dismissed" });

    const items = await listPublicNewsItems();
    expect(items.map((item) => item.id)).toEqual([newer.id, older.id]);
  });

  it("returns only allowlisted fields, never Owner-only data", async () => {
    const item = await createItem({ slug: "shape", isPublic: true });

    const detail = await getPublicNewsItem(item.id);
    expect(detail).not.toBeNull();
    expect(Object.keys(detail ?? {}).sort()).toEqual(
      ["author", "canonicalUrl", "domain", "id", "publicAt", "publishedAt", "takeaways", "title", "tldr"].sort()
    );
    expect(JSON.stringify(detail)).not.toContain("Ghi chú riêng");
    expect(JSON.stringify(detail)).not.toContain("private-tag");
    expect(detail?.takeaways).toEqual(["**Cache Components** mặc định"]);
  });

  it("returns null for a post that is private or no longer exists", async () => {
    const privateItem = await createItem({ slug: "hidden", isPublic: false });
    expect(await getPublicNewsItem(privateItem.id)).toBeNull();
    expect(await getPublicNewsItem("missing-id")).toBeNull();
  });
});
