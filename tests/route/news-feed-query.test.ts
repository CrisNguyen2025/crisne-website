// Must stay the first import: gives this file its own SQLite DB before @/lib/prisma loads
import "../setup/isolated-test-db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { queryNewsFeed } from "@/lib/news/queries";

const BASE_TIME = Date.parse("2026-11-01T00:00:00.000Z");

async function cleanNewsTables() {
  await prisma.ingestJob.deleteMany();
  await prisma.newsItem.deleteMany();
  await prisma.newsSource.deleteMany();
}

interface SeedRow {
  index: number;
  title?: string;
  tags?: string[];
  origin?: "cron" | "share" | "manual";
}

/** Higher index = newer item. */
async function seedItems(rows: SeedRow[]) {
  await prisma.newsItem.createMany({
    data: rows.map(({ index, title, tags, origin }) => ({
      sourceUrl: `https://github.com/seed/item-${index}`,
      canonicalUrl: `https://github.com/seed/item-${index}`,
      domain: "github.com",
      platform: "article",
      origin: origin ?? "cron",
      title: title ?? `Bản tin số ${index}`,
      tags: JSON.stringify(tags ?? ["general"]),
      reviewStatus: "published",
      readState: "unread",
      ingestStatus: "ready",
      createdAt: new Date(BASE_TIME + index * 60_000),
    })),
  });
}

describe("queryNewsFeed filtering beyond the newest 500 rows", () => {
  beforeEach(async () => {
    await cleanNewsTables();
  });

  afterAll(async () => {
    await cleanNewsTables();
    await prisma.$disconnect();
  });

  it("finds the oldest item by a rare tag and by a search query", async () => {
    await seedItems([
      { index: 0, title: "Hướng dẫn Đồng bộ Turso hiếm gặp", tags: ["turso"] },
      ...Array.from({ length: 520 }, (_, i) => ({ index: i + 1 })),
    ]);

    const byTag = await queryNewsFeed({ view: "all", tag: "turso", limit: 10 });
    expect(byTag.items.map((item) => item.title)).toEqual(["Hướng dẫn Đồng bộ Turso hiếm gặp"]);

    // Query without diacritics still matches the Vietnamese title
    const byQuery = await queryNewsFeed({ view: "all", q: "dong bo turso", limit: 10 });
    expect(byQuery.items.map((item) => item.title)).toEqual(["Hướng dẫn Đồng bộ Turso hiếm gặp"]);
  });

  it("matches a tag only as a whole element, not as a substring", async () => {
    await seedItems([
      { index: 1, tags: ["ai"] },
      { index: 2, tags: ["airflow"] },
    ]);

    const result = await queryNewsFeed({ view: "all", tag: "ai", limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].tags).toEqual(["ai"]);
  });

  it("splits items into all, inbox and done views with matching counts", async () => {
    await seedItems([
      { index: 1, title: "Bài chờ xử lý", origin: "share" },
      { index: 2, title: "Bài cron chờ duyệt" },
      { index: 3, title: "Bài để sau", origin: "manual" },
      { index: 4, title: "Bài đã bỏ qua", origin: "share" },
    ]);
    await prisma.newsItem.updateMany({
      where: { title: "Bài cron chờ duyệt" },
      data: { reviewStatus: "draft" },
    });
    await prisma.newsItem.updateMany({ where: { title: "Bài để sau" }, data: { isSaved: true } });
    await prisma.newsItem.updateMany({
      where: { title: "Bài đã bỏ qua" },
      data: { reviewStatus: "dismissed" },
    });

    const titlesOf = async (view: "all" | "inbox" | "done") =>
      (await queryNewsFeed({ view, limit: 10 })).items.map((item) => item.title);

    expect(await titlesOf("inbox")).toEqual(["Bài cron chờ duyệt", "Bài chờ xử lý"]);
    expect(await titlesOf("done")).toEqual(["Bài đã bỏ qua", "Bài để sau"]);
    expect(await titlesOf("all")).toHaveLength(4);

    const { counts } = await queryNewsFeed({ view: "inbox", limit: 10 });
    expect(counts.total).toBe(4);
    expect(counts.inbox).toBe(2);
    expect(counts.done).toBe(2);
  });

  it("puts older curated items before newer cron items when sorting curated_first", async () => {
    await seedItems([
      { index: 0, title: "Bài share cũ nhất", origin: "share" },
      { index: 1, title: "Bài manual cũ", origin: "manual" },
      ...Array.from({ length: 520 }, (_, i) => ({ index: i + 2, origin: "cron" as const })),
    ]);

    const result = await queryNewsFeed({ view: "all", sort: "curated_first", limit: 5 });
    expect(result.items.map((item) => item.title)).toEqual([
      "Bài manual cũ",
      "Bài share cũ nhất",
      "Bản tin số 521",
      "Bản tin số 520",
      "Bản tin số 519",
    ]);
  });
});
