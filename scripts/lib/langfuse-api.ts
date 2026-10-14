import * as fs from "fs";
import * as path from "path";

// ts-node does not load Next.js env files, so read .env.local explicitly
const envPath = path.join(__dirname, "../../.env.local");
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const MAX_ATTEMPTS = 4;

export class LangfuseApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/**
 * Minimal Langfuse public REST client for scripts: basic auth from env,
 * and waits/retries on 429 (the public API allows ~30 requests/minute).
 */
export function createLangfuseApi() {
  const { LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL } = process.env;
  if (!LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY || !LANGFUSE_BASE_URL) {
    throw new Error("LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_BASE_URL are not set.");
  }
  const auth = "Basic " + Buffer.from(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`).toString("base64");

  async function request<T>(method: string, apiPath: string, body?: unknown, attempt = 1): Promise<T> {
    const res = await fetch(`${LANGFUSE_BASE_URL}/api/public${apiPath}`, {
      method,
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);

    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      const retryAfterSeconds = data?.details?.retryAfterSeconds ?? 60;
      console.log(`⏳ rate limited, retrying in ${retryAfterSeconds}s...`);
      await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1000));
      return request<T>(method, apiPath, body, attempt + 1);
    }
    if (!res.ok) {
      throw new LangfuseApiError(`${method} ${apiPath} → ${res.status} ${JSON.stringify(data)}`, res.status);
    }
    return data as T;
  }

  return { request, baseUrl: LANGFUSE_BASE_URL };
}
