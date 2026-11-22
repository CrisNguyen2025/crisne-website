import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { queryNewsFeed } from "@/lib/news/queries";
import {
  NewsFeedSortSchema,
  NewsFeedViewSchema,
  NewsOriginSchema,
} from "@/lib/news/schemas";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  const sp = req.nextUrl.searchParams;
  const viewParsed = NewsFeedViewSchema.safeParse(sp.get("view") ?? undefined);
  const originParsed = NewsOriginSchema.safeParse(sp.get("origin") ?? undefined);
  const sortParsed = NewsFeedSortSchema.safeParse(sp.get("sort") ?? undefined);
  const rawTag = sp.get("tag")?.trim().toLowerCase() || undefined;
  const rawQuery = sp.get("q")?.trim() || undefined;
  const limitParam = sp.get("limit");
  const parsedLimit = limitParam ? Number(limitParam) : 50;
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 50;

  try {
    const data = await queryNewsFeed({
      view: viewParsed.success ? viewParsed.data : undefined,
      origin: originParsed.success ? originParsed.data : undefined,
      tag: rawTag,
      q: rawQuery,
      sort: sortParsed.success ? sortParsed.data : undefined,
      limit,
    });
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("[API GET /api/news] Error:", error);
    return NextResponse.json({ error: "Failed to load news items" }, { status: 500 });
  }
}
