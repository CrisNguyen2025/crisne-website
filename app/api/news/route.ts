import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { queryNewsFeed } from "@/lib/news/queries";
import {
  NewsContentTypeTagSchema,
  NewsFeedSortSchema,
  NewsFeedViewSchema,
  NewsOriginSchema,
  ReadStateSchema,
} from "@/lib/news/schemas";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  const sp = req.nextUrl.searchParams;
  const viewParsed = NewsFeedViewSchema.safeParse(sp.get("view") ?? undefined);
  const originParsed = NewsOriginSchema.safeParse(sp.get("origin") ?? undefined);
  const contentTypeParsed = NewsContentTypeTagSchema.safeParse(sp.get("contentType") ?? undefined);
  const readStateParsed = ReadStateSchema.safeParse(sp.get("readState") ?? undefined);
  const sortParsed = NewsFeedSortSchema.safeParse(sp.get("sort") ?? undefined);
  const rawTag = sp.get("tag")?.trim().toLowerCase().slice(0, 64) || undefined;
  const rawQuery = sp.get("q")?.trim().slice(0, 200) || undefined;
  const limitParam = sp.get("limit");
  const parsedLimit = limitParam ? Math.trunc(Number(limitParam)) : 50;
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 300) : 50;

  try {
    const data = await queryNewsFeed({
      view: viewParsed.success ? viewParsed.data : undefined,
      origin: originParsed.success ? originParsed.data : undefined,
      tag: rawTag,
      contentType: contentTypeParsed.success ? contentTypeParsed.data : undefined,
      readState: readStateParsed.success ? readStateParsed.data : undefined,
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
