import { NextRequest, NextResponse } from "next/server";
import { hasWriteAccess } from "@/lib/auth/write-access";

export const dynamic = "force-dynamic";

// Tells the Roadmap Assistant widget whether this reader may change data. The widget only
// uses it to choose suggestions; the write itself is still checked by the service.
// Static path, so it is matched before the proxy's catch-all [...path] route.
// Caching: next.config.ts sets "no-store" on every /api route except v1/roadmaps, so nothing
// here sets Cache-Control; that rule is the one that applies.
export async function GET(req: NextRequest) {
  const canWrite = await hasWriteAccess(req);
  return NextResponse.json({ canWrite });
}
