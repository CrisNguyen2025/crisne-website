// Must stay the first import: gives this file its own SQLite DB before @/lib/prisma loads
import "../setup/isolated-test-db";
import dns from "node:dns";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const writeAccess = vi.hoisted(() => ({ requireWriteAccess: vi.fn() }));
vi.mock("@/lib/auth/write-access", () => writeAccess);

import { prisma } from "@/lib/prisma";
import { POST as ingestPost } from "@/app/api/ingest/route";
import { GET as newsGet } from "@/app/api/news/route";
import { POST as reingestPost } from "@/app/api/news/[id]/reingest/route";
import { POST as reingestBlockedPost } from "@/app/api/news/reingest-blocked/route";
import { POST as claimPost } from "@/app/api/news/jobs/claim/route";
import { POST as completePost } from "@/app/api/news/jobs/[id]/complete/route";

const jsonRequest = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
      : {}),
  });

const idContext = (id: string) => ({ params: Promise.resolve({ id }) });

async function cleanNewsTables() {
  await prisma.ingestJob.deleteMany();
  await prisma.newsItem.deleteMany();
  await prisma.newsSource.deleteMany();
}

describe("news ingest & job routes", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    writeAccess.requireWriteAccess.mockResolvedValue(null);
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as never);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const target = String(input);
        if (target.includes("youtu.be/testVid01")) {
          return new Response(null, {
            status: 302,
            headers: { location: "https://www.youtube.com/watch?v=testVid01" },
          });
        }
        return new Response(null, { status: 200 });
      })
    );
    await cleanNewsTables();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await cleanNewsTables();
    await prisma.$disconnect();
  });

  it("rejects unauthorized callers across ingest, news list, claim, complete, and reingest", async () => {
    writeAccess.requireWriteAccess.mockResolvedValue(new Response("Unauthorized", { status: 401 }));

    const responses = await Promise.all([
      ingestPost(jsonRequest("http://localhost/api/ingest", "POST", { url: "https://github.com/vercel/next.js" })),
      newsGet(jsonRequest("http://localhost/api/news", "GET")),
      claimPost(jsonRequest("http://localhost/api/news/jobs/claim", "POST")),
      completePost(jsonRequest("http://localhost/api/news/jobs/j1/complete", "POST", {}), idContext("j1")),
      reingestPost(jsonRequest("http://localhost/api/news/n1/reingest", "POST"), idContext("n1")),
    ]);

    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401, 401]);
    expect(await prisma.newsItem.count()).toBe(0);
  });

  it("rejects non-whitelisted domains with 403", async () => {
    const res = await ingestPost(
      jsonRequest("http://localhost/api/ingest", "POST", {
        url: "https://untrusted-news.example/article-1",
      })
    );
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe("DOMAIN_NOT_ALLOWED");
    expect(await prisma.newsItem.count()).toBe(0);
  });

  it("queues valid URLs with origin-based reviewStatus and dedupes canonical URLs", async () => {
    const manualRes = await ingestPost(
      jsonRequest("http://localhost/api/ingest", "POST", {
        url: "https://youtu.be/testVid01?si=share123",
        origin: "manual",
      })
    );
    expect(manualRes.status).toBe(202);
    const manualData = await manualRes.json();
    expect(manualData.status).toBe("queued");
    expect(manualData.item.reviewStatus).toBe("published");
    expect(manualData.item.canonicalUrl).toBe("https://youtube.com/watch?v=testVid01");

    const dupRes = await ingestPost(
      jsonRequest("http://localhost/api/ingest", "POST", {
        url: "https://www.youtube.com/watch?v=testVid01&utm_source=feed",
        origin: "share",
      })
    );
    expect(dupRes.status).toBe(200);
    const dupData = await dupRes.json();
    expect(dupData.status).toBe("duplicate");
    expect(dupData.item.id).toBe(manualData.item.id);

    const cronRes = await ingestPost(
      jsonRequest("http://localhost/api/ingest", "POST", {
        url: "https://github.com/vercel/next.js",
        origin: "cron",
      })
    );
    expect(cronRes.status).toBe(202);
    const cronData = await cronRes.json();
    expect(cronData.item.reviewStatus).toBe("draft");

    const shareRes = await ingestPost(
      jsonRequest("http://localhost/api/ingest", "POST", {
        url: "https://www.tiktok.com/@cris/video/123456789?is_from_webapp=1",
        origin: "share",
      })
    );
    expect(shareRes.status).toBe(202);
    const shareData = await shareRes.json();
    expect(shareData.item.reviewStatus).toBe("published");

    // ADR-0019: News Items are never public, so the DTO no longer exposes isPublic/publicAt
    for (const data of [manualData, shareData, cronData]) {
      expect(data.item).not.toHaveProperty("isPublic");
      expect(data.item).not.toHaveProperty("publicAt");
    }
  });

  it("claims a job atomically, validates summary with Zod, and detects 72h title similarity", async () => {
    await ingestPost(
      jsonRequest("http://localhost/api/ingest", "POST", {
        url: "https://github.com/vercel/next.js",
        origin: "manual",
      })
    );
    await ingestPost(
      jsonRequest("http://localhost/api/ingest", "POST", {
        url: "https://dev.to/vercel/nextjs-16-release",
        origin: "manual",
      })
    );

    const claim1 = await claimPost(jsonRequest("http://localhost/api/news/jobs/claim", "POST"));
    const claim1Data = await claim1.json();
    expect(claim1.status).toBe(200);
    expect(claim1Data.job).not.toBeNull();

    // Invalid summary rejected with 400 (Zod validation)
    const badComplete = await completePost(
      jsonRequest("http://localhost/api/news/jobs/x/complete", "POST", {
        outcome: "ready",
        extractionMethod: "article",
        summary: { title: "No", tldr: "short", takeaways: [], tags: [], language: "vi" },
      }),
      idContext(claim1Data.job.jobId)
    );
    expect(badComplete.status).toBe(400);

    // Valid summary accepted and serialized
    const goodComplete = await completePost(
      jsonRequest("http://localhost/api/news/jobs/x/complete", "POST", {
        outcome: "ready",
        extractionMethod: "article",
        author: "Vercel Team",
        summary: {
          title: "Next.js 16 bật Turbopack mặc định cho mọi dự án",
          tldr: "Phiên bản Next.js 16 kích hoạt Turbopack ổn định mặc định giúp giảm mạnh thời gian build.",
          takeaways: [
            "Turbopack ổn định cho cả dev và build.",
            "Cải thiện tốc độ HMR đáng kể.",
          ],
          tags: ["NextJS", "Frontend", "nextjs"],
          language: "vi",
        },
      }),
      idContext(claim1Data.job.jobId)
    );
    expect(goodComplete.status).toBe(200);
    const firstCompleted = (await goodComplete.json()).item;
    expect(firstCompleted.ingestStatus).toBe("ready");
    expect(firstCompleted.slug).toMatch(/^[a-z0-9-]+$/);
    expect(firstCompleted.tags).toEqual(["nextjs", "frontend"]);
    expect(firstCompleted.possibleDuplicateOfId).toBeNull();
    // Next.js stamps when extraction finished; the worker does not send it
    const firstRow = await prisma.newsItem.findUnique({ where: { id: firstCompleted.id } });
    expect(firstRow?.extractedAt).toBeInstanceOf(Date);

    // Claim 2nd job and complete with nearly identical title
    const claim2 = await claimPost(jsonRequest("http://localhost/api/news/jobs/claim", "POST"));
    const claim2Data = await claim2.json();
    expect(claim2Data.job).not.toBeNull();

    // Empty queue after claiming both
    const claim3 = await claimPost(jsonRequest("http://localhost/api/news/jobs/claim", "POST"));
    expect((await claim3.json()).job).toBeNull();

    const goodComplete2 = await completePost(
      jsonRequest("http://localhost/api/news/jobs/x/complete", "POST", {
        outcome: "ready",
        extractionMethod: "article",
        summary: {
          title: "Next.js 16 bat Turbopack mac dinh cho moi du an web",
          tldr: "Bài viết tổng hợp các thay đổi của Next.js 16 với Turbopack mặc định.",
          takeaways: ["Turbopack chạy nhanh hơn webpack."],
          tags: ["nextjs"],
          language: "vi",
        },
      }),
      idContext(claim2Data.job.jobId)
    );
    expect(goodComplete2.status).toBe(200);
    const secondCompleted = (await goodComplete2.json()).item;
    expect(secondCompleted.possibleDuplicateOfId).toBe(firstCompleted.id);

    // GET /api/news returns items and accurate counts
    const listRes = await newsGet(jsonRequest("http://localhost/api/news", "GET"));
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.counts.total).toBe(2);
    expect(listData.counts.ready).toBe(2);
    expect(listData.items).toHaveLength(2);
  });

  it("handles partial outcomes, retries failed jobs up to maxAttempts, and supports reingest", async () => {
    const ingestRes = await ingestPost(
      jsonRequest("http://localhost/api/ingest", "POST", {
        url: "https://www.tiktok.com/@user/video/777",
        origin: "share",
      })
    );
    const createdItem = (await ingestRes.json()).item;

    // Simulate 3 failed attempts -> 1st & 2nd re-queue, 3rd marks failed
    for (let attempt = 1; attempt <= 3; attempt++) {
      const claimRes = await claimPost(jsonRequest("http://localhost/api/news/jobs/claim", "POST"));
      const job = (await claimRes.json()).job;
      expect(job).not.toBeNull();
      expect(job.attempts).toBe(attempt);

      const failRes = await completePost(
        jsonRequest("http://localhost/api/news/jobs/x/complete", "POST", {
          outcome: "failed",
          error: `Attempt ${attempt} failed`,
          retryable: true,
        }),
        idContext(job.jobId)
      );
      const updated = (await failRes.json()).item;
      if (attempt < 3) {
        expect(updated.ingestStatus).toBe("queued");
        // Make nextRunAt immediate so the next test loop iteration can claim right away
        await prisma.ingestJob.update({
          where: { id: job.jobId },
          data: { nextRunAt: new Date(Date.now() - 1000) },
        });
      } else {
        expect(updated.ingestStatus).toBe("failed");
      }
    }

    // Reingest creates a fresh pending job with forceDeep: true
    const reingestRes = await reingestPost(
      jsonRequest(`http://localhost/api/news/${createdItem.id}/reingest`, "POST", {
        forceDeep: true,
      }),
      idContext(createdItem.id)
    );
    expect(reingestRes.status).toBe(202);
    const reingestData = await reingestRes.json();
    expect(reingestData.item.ingestStatus).toBe("queued");

    const claimAfterReingest = await claimPost(
      jsonRequest("http://localhost/api/news/jobs/claim", "POST")
    );
    const newJob = (await claimAfterReingest.json()).job;
    expect(newJob.jobId).toBe(reingestData.jobId);
    expect(newJob.forceDeep).toBe(true);

    // Complete as partial
    const partialRes = await completePost(
      jsonRequest("http://localhost/api/news/jobs/x/complete", "POST", {
        outcome: "partial",
        extractionError: "TikTok blocked media download",
        title: "TikTok video fallback title",
      }),
      idContext(newJob.jobId)
    );
    expect(partialRes.status).toBe(200);
    const partialItem = (await partialRes.json()).item;
    expect(partialItem.ingestStatus).toBe("partial");
    expect(partialItem.extractionMethod).toBe("metadata_only");
    expect(partialItem.title).toBe("TikTok video fallback title");
    expect(partialItem.slug).toBe("tiktok-video-fallback-title");
  });

  describe("job ownership guards", () => {
    const readyPayload = (attempt?: number) => ({
      outcome: "ready",
      extractionMethod: "article",
      ...(attempt !== undefined ? { attempt } : {}),
      summary: {
        title: "Next.js 16 bật Turbopack mặc định",
        tldr: "Turbopack trở thành bundler mặc định của Next.js 16.",
        takeaways: ["Turbopack ổn định cho dev và build."],
        tags: ["nextjs"],
        language: "vi",
      },
    });

    async function ingestAndClaim(url: string) {
      const ingestRes = await ingestPost(
        jsonRequest("http://localhost/api/ingest", "POST", { url, origin: "manual" })
      );
      expect(ingestRes.status).toBe(202);
      const item = (await ingestRes.json()).item;
      // nextRunAt defaults to the DB clock, which can be a fraction of a ms ahead of claim's `now`
      await prisma.ingestJob.updateMany({
        where: { newsItemId: item.id },
        data: { nextRunAt: new Date(Date.now() - 1000) },
      });
      const claimRes = await claimPost(jsonRequest("http://localhost/api/news/jobs/claim", "POST"));
      const job = (await claimRes.json()).job;
      expect(job).not.toBeNull();
      return { item, job };
    }

    it("returns 409 for a late report on a finished job and keeps the item unchanged", async () => {
      const { item, job } = await ingestAndClaim("https://github.com/vercel/next.js");

      const ok = await completePost(
        jsonRequest("http://localhost/api/news/jobs/x/complete", "POST", readyPayload(job.attempts)),
        idContext(job.jobId)
      );
      expect(ok.status).toBe(200);

      const late = await completePost(
        jsonRequest("http://localhost/api/news/jobs/x/complete", "POST", {
          outcome: "failed",
          error: "Late duplicate report",
          retryable: true,
        }),
        idContext(job.jobId)
      );
      expect(late.status).toBe(409);

      const stored = await prisma.newsItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(stored.ingestStatus).toBe("ready");
      const storedJob = await prisma.ingestJob.findUniqueOrThrow({ where: { id: job.jobId } });
      expect(storedJob.status).toBe("done");
    });

    it("returns 409 when the reported attempt is not the current one", async () => {
      const { item, job } = await ingestAndClaim("https://github.com/vercel/turbo");

      const stale = await completePost(
        jsonRequest("http://localhost/api/news/jobs/x/complete", "POST", readyPayload(job.attempts + 1)),
        idContext(job.jobId)
      );
      expect(stale.status).toBe(409);

      const stored = await prisma.newsItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(stored.ingestStatus).toBe("processing");
    });

    it("supersedes the running job on reingest so its late report gets 409", async () => {
      const { item, job } = await ingestAndClaim("https://github.com/vercel/swr");

      const reingestRes = await reingestPost(
        jsonRequest(`http://localhost/api/news/${item.id}/reingest`, "POST", { forceDeep: true }),
        idContext(item.id)
      );
      expect(reingestRes.status).toBe(202);
      const { jobId: newJobId } = await reingestRes.json();

      const oldJob = await prisma.ingestJob.findUniqueOrThrow({ where: { id: job.jobId } });
      expect(oldJob.status).toBe("failed");
      expect(oldJob.stage).toBe("superseded");

      const late = await completePost(
        jsonRequest("http://localhost/api/news/jobs/x/complete", "POST", readyPayload(job.attempts)),
        idContext(job.jobId)
      );
      expect(late.status).toBe(409);

      const claimRes = await claimPost(jsonRequest("http://localhost/api/news/jobs/claim", "POST"));
      const claimed = (await claimRes.json()).job;
      expect(claimed.jobId).toBe(newJobId);
      expect(await prisma.ingestJob.count({ where: { newsItemId: item.id, status: "running" } })).toBe(1);
    });

    it("does not touch the item when an expired lease was already completed", async () => {
      const { item, job } = await ingestAndClaim("https://github.com/vercel/ai");
      await completePost(
        jsonRequest("http://localhost/api/news/jobs/x/complete", "POST", readyPayload(job.attempts)),
        idContext(job.jobId)
      );
      // A stale lease value left on a finished job must not be reclaimed
      await prisma.ingestJob.update({
        where: { id: job.jobId },
        data: { lockedUntil: new Date(Date.now() - 60_000) },
      });

      const claimRes = await claimPost(jsonRequest("http://localhost/api/news/jobs/claim", "POST"));
      expect((await claimRes.json()).job).toBeNull();

      const stored = await prisma.newsItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(stored.ingestStatus).toBe("ready");
    });

    it("re-queues a running job whose lease expired", async () => {
      const { item, job } = await ingestAndClaim("https://github.com/vercel/vercel");
      await prisma.ingestJob.update({
        where: { id: job.jobId },
        data: { lockedUntil: new Date(Date.now() - 60_000) },
      });

      const claimRes = await claimPost(jsonRequest("http://localhost/api/news/jobs/claim", "POST"));
      const reclaimed = (await claimRes.json()).job;
      expect(reclaimed.jobId).toBe(job.jobId);
      expect(reclaimed.attempts).toBe(job.attempts + 1);

      const stale = await completePost(
        jsonRequest("http://localhost/api/news/jobs/x/complete", "POST", readyPayload(job.attempts)),
        idContext(job.jobId)
      );
      expect(stale.status).toBe(409);
      const stored = await prisma.newsItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(stored.ingestStatus).toBe("processing");
    });

    it("dedupes colliding titles with -2 suffix and preserves slug across reingest", async () => {
      const first = await ingestAndClaim("https://github.com/vercel/next.js");
      const firstComplete = await completePost(
        jsonRequest("http://localhost/api/news/jobs/x/complete", "POST", readyPayload(first.job.attempts)),
        idContext(first.job.jobId)
      );
      expect(firstComplete.status).toBe(200);
      const firstItem = (await firstComplete.json()).item;
      expect(firstItem.slug).toMatch(/^[a-z0-9-]+$/);

      const second = await ingestAndClaim("https://github.com/vercel/turborepo");
      const secondComplete = await completePost(
        jsonRequest("http://localhost/api/news/jobs/x/complete", "POST", readyPayload(second.job.attempts)),
        idContext(second.job.jobId)
      );
      expect(secondComplete.status).toBe(200);
      const secondItem = (await secondComplete.json()).item;
      expect(secondItem.slug).toBe(`${firstItem.slug}-2`);

      const reingestRes = await reingestPost(
        jsonRequest(`http://localhost/api/news/${firstItem.id}/reingest`, "POST", { forceDeep: true }),
        idContext(firstItem.id)
      );
      expect(reingestRes.status).toBe(202);
      const { jobId: newJobId } = await reingestRes.json();
      await prisma.ingestJob.update({
        where: { id: newJobId },
        data: { nextRunAt: new Date(Date.now() - 1000) },
      });
      const claimRes = await claimPost(jsonRequest("http://localhost/api/news/jobs/claim", "POST"));
      const reclaimed = (await claimRes.json()).job;
      expect(reclaimed.jobId).toBe(newJobId);

      const basePayload = readyPayload(reclaimed.attempts);
      const reingestComplete = await completePost(
        jsonRequest("http://localhost/api/news/jobs/x/complete", "POST", {
          ...basePayload,
          summary: {
            ...basePayload.summary,
            title: "Completely Different Title After Reingest",
          },
        }),
        idContext(reclaimed.jobId)
      );
      expect(reingestComplete.status).toBe(200);
      const reingestedItem = (await reingestComplete.json()).item;
      expect(reingestedItem.title).toBe("Completely Different Title After Reingest");
      expect(reingestedItem.slug).toBe(firstItem.slug);
    });

    it("requeues only IP-blocked partial items via /api/news/reingest-blocked", async () => {
      const blocked = await ingestAndClaim("https://tiktok.com/@tv360.bongda/video/7711882164685573382");
      await completePost(
        jsonRequest("http://localhost/api/news/jobs/x/complete", "POST", {
          outcome: "partial",
          extractionError: "[IP_BLOCKED] Your IP address is blocked from accessing this post",
          author: "@tv360.bongda",
        }),
        idContext(blocked.job.jobId)
      );

      const otherPartial = await ingestAndClaim("https://tiktok.com/@other/video/111");
      await completePost(
        jsonRequest("http://localhost/api/news/jobs/x/complete", "POST", {
          outcome: "partial",
          extractionError: "Vision không đọc được chữ/nội dung trên frame.",
        }),
        idContext(otherPartial.job.jobId)
      );

      const res = await reingestBlockedPost(
        jsonRequest("http://localhost/api/news/reingest-blocked", "POST", { skipWake: true })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.count).toBe(1);
      expect(data.itemIds).toEqual([blocked.item.id]);

      const blockedStored = await prisma.newsItem.findUniqueOrThrow({ where: { id: blocked.item.id } });
      const otherStored = await prisma.newsItem.findUniqueOrThrow({ where: { id: otherPartial.item.id } });
      expect(blockedStored.ingestStatus).toBe("queued");
      expect(otherStored.ingestStatus).toBe("partial");
    });
  });
});
