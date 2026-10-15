import { prisma as defaultPrisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";
import {
  wrapProvider,
  type EmbeddingTaskType,
  type LlmGenerateParams,
  type LlmMiddleware,
  type LlmProvider,
  type LlmStreamChunk,
  type LlmUsage,
} from "@/lib/ai/llm-provider";
import { DEFAULT_EMBEDDING_MODEL } from "@/lib/ai/gemini";
import { DEFAULT_WORKFLOW_DAILY_LLM_LIMIT } from "./constants";

export class QuotaExceededError extends Error {
  readonly code = "QUOTA_EXCEEDED";
  readonly model: string;
  readonly day: string;
  readonly limit: number;

  constructor(model: string, day: string, limit: number) {
    super(`Daily LLM quota exceeded for model "${model}" on ${day} (limit: ${limit}).`);
    this.name = "QuotaExceededError";
    this.model = model;
    this.day = day;
    this.limit = limit;
  }
}

export interface WithQuotaOptions {
  limit?: number;
  now?: () => Date;
  prisma?: PrismaClient;
}

export function getUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getWorkflowDailyLimit(override?: number): number {
  if (override !== undefined && Number.isFinite(override) && override > 0) {
    return override;
  }
  const envVal = process.env.WORKFLOW_DAILY_LLM_LIMIT;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_WORKFLOW_DAILY_LLM_LIMIT;
}

/**
 * Atomically checks and increments the quota for (day, model).
 * Throws QuotaExceededError if the limit is exceeded.
 */
export async function recordAndCheckQuota(
  prismaClient: PrismaClient,
  model: string,
  limit: number,
  now: () => Date
): Promise<void> {
  const day = getUtcDay(now());

  await prismaClient.$transaction(async (tx) => {
    const updated = await tx.workflowQuotaUsage.upsert({
      where: { day_model: { day, model } },
      create: { day, model, count: 1 },
      update: { count: { increment: 1 } },
    });

    if (updated.count > limit) {
      throw new QuotaExceededError(model, day, limit);
    }
  });
}

/**
 * Middleware enforcing the atomic daily quota on each generate, generateStream and embed call.
 * If quota is exceeded, QuotaExceededError is thrown immediately and the underlying provider is not called.
 */
export const quotaMiddleware = (options: WithQuotaOptions = {}): LlmMiddleware => (provider) => {
  const limit = getWorkflowDailyLimit(options.limit);
  const now = options.now ?? (() => new Date());
  const db = options.prisma ?? defaultPrisma;

  return {
    async generate(params: LlmGenerateParams): Promise<{ text: string; usage?: LlmUsage }> {
      await recordAndCheckQuota(db, params.model, limit, now);
      return provider.generate(params);
    },

    async generateStream(params: LlmGenerateParams): Promise<AsyncIterable<LlmStreamChunk>> {
      await recordAndCheckQuota(db, params.model, limit, now);
      return provider.generateStream(params);
    },

    async embed(text: string, taskType: EmbeddingTaskType): Promise<number[] | null> {
      await recordAndCheckQuota(db, DEFAULT_EMBEDDING_MODEL, limit, now);
      return provider.embed(text, taskType);
    },
  };
};

/** Same as `wrapProvider(provider, quotaMiddleware(options))`; kept for existing callers. */
export function withQuota(provider: LlmProvider, options: WithQuotaOptions = {}): LlmProvider {
  return wrapProvider(provider, quotaMiddleware(options));
}
