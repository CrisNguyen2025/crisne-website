import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import type { NewsWorkerHealthDto } from "@/lib/news/schemas";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const WORKER_HEALTH_TIMEOUT_MS = 3_000;

export async function GET(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  const baseUrl = process.env.NEWS_WORKER_URL?.trim();
  if (!baseUrl) {
    const payload: NewsWorkerHealthDto = { configured: false, status: "unconfigured" };
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }

  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(WORKER_HEALTH_TIMEOUT_MS),
    });
    const payload: NewsWorkerHealthDto = {
      configured: true,
      status: res.ok ? "ok" : "offline",
    };
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    const payload: NewsWorkerHealthDto = { configured: true, status: "offline" };
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }
}
