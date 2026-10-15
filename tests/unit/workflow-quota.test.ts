import { describe, expect, it, vi } from "vitest";
import {
  withQuota,
  QuotaExceededError,
} from "@/lib/workflow/quota";
import type { LlmGenerateParams, LlmProvider } from "@/lib/ai/llm-provider";
import { DEFAULT_EMBEDDING_MODEL } from "@/lib/ai/gemini";
import type { PrismaClient } from "@prisma/client";

function createMockPrisma() {
  const store = new Map<string, number>();

  const txClient = {
    workflowQuotaUsage: {
      async upsert({ where }: { where: { day_model: { day: string; model: string } } }) {
        const key = `${where.day_model.day}:${where.day_model.model}`;
        const current = store.get(key) ?? 0;
        const next = current + 1;
        store.set(key, next);
        return { count: next };
      },
    },
  };

  const client = {
    _store: store,
    async $transaction<T>(fn: (tx: typeof txClient) => Promise<T>): Promise<T> {
      // Snapshot before transaction for rollback on error
      const snapshot = new Map(store);
      try {
        return await fn(txClient);
      } catch (err) {
        // Rollback
        store.clear();
        for (const [k, v] of snapshot.entries()) {
          store.set(k, v);
        }
        throw err;
      }
    },
  } as unknown as PrismaClient & { _store: Map<string, number> };

  return client;
}

function createMockProvider() {
  let generateCalls = 0;
  let embedCalls = 0;

  const provider: LlmProvider = {
    generate: vi.fn(async (params: LlmGenerateParams) => {
      generateCalls++;
      return { text: `generated for ${params.model}`, usage: { input: 10, output: 5, total: 15 } };
    }),
    generateStream: vi.fn(),
    embed: vi.fn(async () => {
      embedCalls++;
      return [0.1, 0.2];
    }),
  };

  return {
    provider,
    getGenerateCalls: () => generateCalls,
    getEmbedCalls: () => embedCalls,
  };
}

describe("withQuota", () => {
  it("allows up to N calls, calling provider each time, and rejects N+1 without calling provider", async () => {
    const mockDb = createMockPrisma();
    const mock = createMockProvider();
    const now = () => new Date("2026-10-15T10:00:00Z");

    const limit = 3;
    const providerWithQuota = withQuota(mock.provider, {
      limit,
      now,
      prisma: mockDb,
    });

    const params: LlmGenerateParams = {
      model: "gemini-2.5-flash-lite",
      systemInstruction: "",
      contents: "test",
      temperature: 0.3,
      maxOutputTokens: 100,
    };

    // Calls 1, 2, 3 should succeed
    const res1 = await providerWithQuota.generate(params);
    expect(res1.text).toContain("gemini-2.5-flash-lite");
    const res2 = await providerWithQuota.generate(params);
    expect(res2.text).toContain("gemini-2.5-flash-lite");
    const res3 = await providerWithQuota.generate(params);
    expect(res3.text).toContain("gemini-2.5-flash-lite");

    expect(mock.getGenerateCalls()).toBe(3);

    // Call 4 must throw QuotaExceededError and NOT call provider
    await expect(providerWithQuota.generate(params)).rejects.toThrow(QuotaExceededError);
    await expect(providerWithQuota.generate(params)).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
      limit: 3,
      model: "gemini-2.5-flash-lite",
      day: "2026-10-15",
    });

    // Provider calls must remain 3
    expect(mock.getGenerateCalls()).toBe(3);
  });

  it("resets quota on a new UTC day", async () => {
    const mockDb = createMockPrisma();
    const mock = createMockProvider();

    let currentTime = new Date("2026-10-15T23:59:59Z");
    const now = () => currentTime;

    const limit = 2;
    const providerWithQuota = withQuota(mock.provider, {
      limit,
      now,
      prisma: mockDb,
    });

    const params: LlmGenerateParams = {
      model: "gemini-2.5-flash-lite",
      systemInstruction: "",
      contents: "hello",
      temperature: 0.3,
      maxOutputTokens: 100,
    };

    await providerWithQuota.generate(params);
    await providerWithQuota.generate(params);
    expect(mock.getGenerateCalls()).toBe(2);

    // Exceeded on day 1
    await expect(providerWithQuota.generate(params)).rejects.toThrow(QuotaExceededError);

    // Move to next UTC day
    currentTime = new Date("2026-10-16T00:00:01Z");

    // Succeeds again on day 2
    const res = await providerWithQuota.generate(params);
    expect(res.text).toBeDefined();
    expect(mock.getGenerateCalls()).toBe(3);
  });

  it("enforces quota across concurrent calls without exceeding limit", async () => {
    const mockDb = createMockPrisma();
    const mock = createMockProvider();
    const now = () => new Date("2026-10-15T12:00:00Z");

    const limit = 5;
    const providerWithQuota = withQuota(mock.provider, {
      limit,
      now,
      prisma: mockDb,
    });

    const params: LlmGenerateParams = {
      model: "gemini-2.5-flash-lite",
      systemInstruction: "",
      contents: "concurrent test",
      temperature: 0.3,
      maxOutputTokens: 100,
    };

    // Dispatch 10 calls concurrently
    const results = await Promise.allSettled(
      Array.from({ length: 10 }).map(() => providerWithQuota.generate(params))
    );

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    expect(succeeded.length).toBe(limit);
    expect(failed.length).toBe(5);
    expect(mock.getGenerateCalls()).toBe(limit);

    for (const rejected of failed) {
      if (rejected.status === "rejected") {
        expect(rejected.reason).toBeInstanceOf(QuotaExceededError);
        expect((rejected.reason as QuotaExceededError).code).toBe("QUOTA_EXCEEDED");
      }
    }
  });

  it("checks quota on generateStream before opening the stream", async () => {
    const mockDb = createMockPrisma();
    const mock = createMockProvider();
    const stream = (async function* () {})();
    vi.mocked(mock.provider.generateStream).mockResolvedValue(stream);
    const providerWithQuota = withQuota(mock.provider, {
      limit: 1,
      now: () => new Date("2026-10-15T12:00:00Z"),
      prisma: mockDb,
    });
    const params: LlmGenerateParams = {
      model: "gemini-2.5-flash",
      systemInstruction: "",
      contents: "test",
      temperature: 0.3,
      maxOutputTokens: 100,
    };

    await expect(providerWithQuota.generateStream(params)).resolves.toBe(stream);
    await expect(providerWithQuota.generateStream(params)).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
      model: "gemini-2.5-flash",
    });
    expect(mock.provider.generateStream).toHaveBeenCalledTimes(1);
  });

  it("checks quota on embed calls for DEFAULT_EMBEDDING_MODEL", async () => {
    const mockDb = createMockPrisma();
    const mock = createMockProvider();
    const now = () => new Date("2026-10-15T12:00:00Z");

    const limit = 1;
    const providerWithQuota = withQuota(mock.provider, {
      limit,
      now,
      prisma: mockDb,
    });

    await providerWithQuota.embed("sample query", "RETRIEVAL_QUERY");
    expect(mock.getEmbedCalls()).toBe(1);

    await expect(
      providerWithQuota.embed("another query", "RETRIEVAL_QUERY")
    ).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
      model: DEFAULT_EMBEDDING_MODEL,
    });

    expect(mock.getEmbedCalls()).toBe(1);
  });
});
