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
  dbSlug?: string | null;
  isPublic: boolean;
  ingestStatus?: string;
  reviewStatus?: string;
  publicAt?: Date;
}) =>
  prisma.newsItem.create({
    data: {
      sourceUrl: `https://nextjs.org/blog/${data.slug}`,
      canonicalUrl: `https://nextjs.org/blog/${data.slug}`,
      slug: data.dbSlug === undefined ? `bai-${data.slug}` : data.dbSlug,
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
      ["author", "canonicalUrl", "domain", "id", "publicAt", "publishedAt", "slug", "takeaways", "title", "tldr"].sort()
    );
    expect(detail?.slug).toBe("bai-shape");
    expect(JSON.stringify(detail)).not.toContain("Ghi chú riêng");
    expect(JSON.stringify(detail)).not.toContain("private-tag");
    expect(detail?.takeaways).toEqual(["**Cache Components** mặc định"]);
  });

  it("looks up public posts by slug first and falls back to id", async () => {
    const withSlug = await createItem({ slug: "cache-components", dbSlug: "cache-components-explained", isPublic: true });
    const legacyWithoutSlug = await createItem({ slug: "legacy-post", dbSlug: null, isPublic: true });

    const bySlug = await getPublicNewsItem("cache-components-explained");
    expect(bySlug?.id).toBe(withSlug.id);
    expect(bySlug?.slug).toBe("cache-components-explained");

    const byId = await getPublicNewsItem(withSlug.id);
    expect(byId?.id).toBe(withSlug.id);
    expect(byId?.slug).toBe("cache-components-explained");

    const legacy = await getPublicNewsItem(legacyWithoutSlug.id);
    expect(legacy?.id).toBe(legacyWithoutSlug.id);
    expect(legacy?.slug).toBe(legacyWithoutSlug.id);
  });

  it("returns null for a post that is private or no longer exists", async () => {
    const privateItem = await createItem({ slug: "hidden", isPublic: false });
    expect(await getPublicNewsItem(privateItem.id)).toBeNull();
    expect(await getPublicNewsItem("bai-hidden")).toBeNull();
    expect(await getPublicNewsItem("missing-id")).toBeNull();
  });
});
