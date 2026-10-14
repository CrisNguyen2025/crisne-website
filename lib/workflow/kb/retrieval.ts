import { prisma as defaultPrisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";
import { geminiProvider } from "@/lib/ai/gemini";
import type { LlmProvider } from "@/lib/ai/llm-provider";
import { cosineSimilarity, normalizeText } from "@/lib/ai/rag-engine";
import type { RetrievedDocument } from "../dag-executor";
import {
  DEFAULT_RETRIEVAL_MIN_SCORE,
  DEFAULT_RETRIEVAL_TOP_K,
  RETRIEVAL_KEYWORD_WEIGHT,
  RETRIEVAL_VECTOR_WEIGHT,
} from "../constants";
import { withQuota } from "../quota";

export interface RetrieveOptions {
  projectId: string;
  query: string;
  topK?: number;
  minScore?: number;
  documentIds?: string[];
  prisma?: PrismaClient;
  llm?: LlmProvider;
  quotaLimit?: number;
}

/**
 * Computes normalized keyword match score [0.0, 1.0] across heading and content.
 */
export function computeKeywordScore(query: string, heading: string | null, content: string): number {
  const normalizedQuery = normalizeText(query);
  const words = normalizedQuery.split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  if (words.length === 0) return 0;

  const targetText = normalizeText(`${heading ?? ""} ${content}`);
  let matchedCount = 0;
  for (const word of words) {
    if (targetText.includes(word)) {
      matchedCount++;
    }
  }
  return matchedCount / words.length;
}

/**
 * Converts stored SQLite Bytes buffer to number[] vector
 */
export function bytesToVector(bytes: Buffer | Uint8Array | null): number[] | null {
  if (!bytes || bytes.length === 0) return null;
  const f32 = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / Float32Array.BYTES_PER_ELEMENT);
  return Array.from(f32);
}

/**
 * Retrieves top-K relevant chunks for a project using hybrid search (vector cosine + keyword match).
 * ALWAYS filtered by projectId.
 */
export async function retrieve(options: RetrieveOptions): Promise<RetrievedDocument[]> {
  const {
    projectId,
    query,
    topK = DEFAULT_RETRIEVAL_TOP_K,
    minScore = DEFAULT_RETRIEVAL_MIN_SCORE,
    documentIds,
    prisma: db = defaultPrisma,
  } = options;

  if (!query || !query.trim()) {
    return [];
  }

  // 1. Fetch chunks belonging strictly to this project (and optionally restricted to documentIds)
  const chunks = await db.projectChunk.findMany({
    where: {
      projectId,
      ...(documentIds && documentIds.length > 0 ? { documentId: { in: documentIds } } : {}),
    },
    select: {
      id: true,
      documentId: true,
      heading: true,
      content: true,
      embedding: true,
    },
  });

  if (chunks.length === 0) {
    return [];
  }

  // 2. Obtain query embedding through quota-managed provider
  const baseLlm = options.llm ?? geminiProvider;
  const llmWithQuota = withQuota(baseLlm, {
    prisma: db,
    limit: options.quotaLimit,
  });

  let queryVector: number[] | null = null;
  try {
    queryVector = await llmWithQuota.embed(query, "RETRIEVAL_QUERY");
  } catch {
    // If embedding fails (e.g. offline/dry-run), fallback to pure keyword matching
    queryVector = null;
  }

  // 3. Compute hybrid scores
  const scoredChunks: Array<{ doc: RetrievedDocument; finalScore: number }> = [];

  for (const chunk of chunks) {
    const chunkVector = bytesToVector(chunk.embedding);

    const vectorScore =
      queryVector && chunkVector ? Math.max(0, cosineSimilarity(queryVector, chunkVector)) : 0;
    const keywordScore = computeKeywordScore(query, chunk.heading, chunk.content);

    const finalScore =
      queryVector && chunkVector
        ? vectorScore * RETRIEVAL_VECTOR_WEIGHT + keywordScore * RETRIEVAL_KEYWORD_WEIGHT
        : keywordScore; // If no vector, rely on keyword score

    if (finalScore >= minScore) {
      scoredChunks.push({
        doc: {
          id: chunk.id,
          documentId: chunk.documentId,
          heading: chunk.heading ?? undefined,
          content: chunk.content,
          score: Math.round(finalScore * 1000) / 1000,
        },
        finalScore,
      });
    }
  }

  // 4. Sort descending and limit to topK
  scoredChunks.sort((a, b) => b.finalScore - a.finalScore);

  return scoredChunks.slice(0, topK).map((s) => s.doc);
}
