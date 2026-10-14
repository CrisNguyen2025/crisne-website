import { createHash } from "crypto";
import { DEFAULT_EMBEDDING_MODEL, EMBEDDING_DIMENSION } from "./gemini";
import { PORTFOLIO_KNOWLEDGE_BASE, type KnowledgeChunk } from "./portfolio-knowledge";
import cachedVectors from "./data/knowledge-vectors.json";

/**
 * Fingerprint of everything that affects embeddings. Stored by `yarn index:knowledge`
 * and compared by `yarn eval:rag` to detect a stale vector index.
 */
export function computeKnowledgeHash(chunks: KnowledgeChunk[]): string {
  const payload = JSON.stringify({
    model: DEFAULT_EMBEDDING_MODEL,
    dimension: EMBEDDING_DIMENSION,
    chunks: chunks.map(({ id, title, keywords, content }) => ({ id, title, keywords, content })),
  });
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Knowledge base used at runtime: text always comes from portfolio-knowledge.ts,
 * only embeddings come from the generated vector file (matched by id).
 * Chunks added after the last index run fall back to keyword-only scoring.
 */
export function loadKnowledgeBase(): KnowledgeChunk[] {
  const embeddingsById = new Map(
    (cachedVectors as KnowledgeChunk[]).map((chunk) => [chunk.id, chunk.embedding])
  );

  return PORTFOLIO_KNOWLEDGE_BASE.map((chunk) => ({
    ...chunk,
    embedding: embeddingsById.get(chunk.id),
  }));
}
