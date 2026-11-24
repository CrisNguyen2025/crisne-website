import type { NewsWorkerHealthDto } from "./schemas";

/** Checks whether NEWS_WORKER_URL is configured and reachable via `/health`. */
export async function checkNewsWorkerHealth(
  timeoutMs = 3_000
): Promise<NewsWorkerHealthDto> {
  const baseUrl = process.env.NEWS_WORKER_URL?.trim();
  if (!baseUrl) {
    return { configured: false, status: "unconfigured" };
  }

  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      configured: true,
      status: res.ok ? "ok" : "offline",
    };
  } catch {
    return { configured: true, status: "offline" };
  }
}
