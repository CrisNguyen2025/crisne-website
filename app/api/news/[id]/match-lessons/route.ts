import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { parseJsonStringArray } from "@/lib/news/schemas";
import { prisma } from "@/lib/prisma";
import type { MatchLessonsResponseDto } from "@/lib/provenance/relations";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const UpstreamMatchItemSchema = z
  .object({
    lesson_id: z.string(),
    lesson_slug: z.string(),
    title: z.string(),
    topic_slug: z.string(),
    topic_title: z.string(),
    section: z.string().nullable().optional(),
    score: z.number(),
    duplicate_warning: z.boolean().optional(),
    version_update_hint: z.boolean().optional(),
  })
  .passthrough();

const UpstreamMatchResponseSchema = z
  .object({
    suggested_topic_slug: z.string().nullable().optional(),
    suggested_topic_title: z.string().nullable().optional(),
    suggested_section: z.string().nullable().optional(),
    matches: z.array(UpstreamMatchItemSchema).optional(),
  })
  .passthrough();

export async function POST(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  const baseUrl = process.env.RAG_SERVICE_URL;
  const internalKey = process.env.RAG_INTERNAL_KEY;
  if (!baseUrl || !internalKey) {
    return NextResponse.json(
      { error: "Roadmap Assistant chưa được cấu hình." },
      { status: 503 }
    );
  }

  try {
    const { id } = await context.params;
    const newsItem = await prisma.newsItem.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        tldr: true,
        takeaways: true,
        tags: true,
      },
    });
    if (!newsItem) {
      return NextResponse.json({ error: "News item not found" }, { status: 404 });
    }

    const upstream = await fetch(`${baseUrl.replace(/\/+$/, "")}/internal/match-lessons`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": internalKey,
      },
      body: JSON.stringify({
        title: newsItem.title,
        tldr: newsItem.tldr ?? "",
        takeaways: parseJsonStringArray(newsItem.takeaways),
        tags: parseJsonStringArray(newsItem.tags),
        limit: 5,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Không thể lấy gợi ý từ Abot (HTTP ${upstream.status}).` },
        { status: 502 }
      );
    }

    const parsedRaw = UpstreamMatchResponseSchema.safeParse(await upstream.json());
    if (!parsedRaw.success) {
      return NextResponse.json({ error: "Phản hồi từ Abot không đúng định dạng." }, { status: 502 });
    }
    const raw = parsedRaw.data;
    const body: MatchLessonsResponseDto = {
      suggestedTopicSlug: raw.suggested_topic_slug ?? null,
      suggestedTopicTitle: raw.suggested_topic_title ?? null,
      suggestedSection: raw.suggested_section ?? null,
      matches: (raw.matches ?? []).map((m) => ({
        lessonId: m.lesson_id,
        lessonSlug: m.lesson_slug,
        title: m.title,
        topicSlug: m.topic_slug,
        topicTitle: m.topic_title,
        section: m.section ?? null,
        score: m.score,
        duplicateWarning: Boolean(m.duplicate_warning),
        versionUpdateHint: Boolean(m.version_update_hint),
      })),
    };

    return NextResponse.json(body, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("[API POST /api/news/[id]/match-lessons] Error:", error);
    return NextResponse.json({ error: "Không thể đối chiếu Lesson liên quan." }, { status: 502 });
  }
}
