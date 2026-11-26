import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { GlobalSearchQuerySchema, searchGlobalWorkspace } from "@/lib/search/global-search";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  const sp = req.nextUrl.searchParams;
  const parsed = GlobalSearchQuerySchema.safeParse({
    q: sp.get("q") ?? "",
    scope: sp.get("scope") ?? undefined,
    limit: sp.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Tham số tìm kiếm không hợp lệ." },
      { status: 400 }
    );
  }

  try {
    const result = await searchGlobalWorkspace(parsed.data);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    console.error("[API GET /api/v1/search] Error:", error);
    return NextResponse.json(
      { error: "Không thể thực hiện tìm kiếm." },
      { status: 500 }
    );
  }
}
