import { PORTFOLIO_KNOWLEDGE_BASE, type KnowledgeChunk } from "./portfolio-knowledge";

const STOP_WORDS = new Set([
  "có", "làm", "được", "đc", "dc", "không", "k", "ko", "khong", "gì", "như", "thế", "nào",
  "ở", "và", "của", "cho", "về", "với", "là", "ai", "tôi", "bạn", "mình", "ơi", "hả", "sao",
  "hay", "các", "những", "một", "này", "đó", "vậy", "nhé", "nha", "ạ", "ạk", "thì", "đã", "sẽ"
]);

/**
 * Calculates cosine similarity between two numeric vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

/**
 * Keyword match score for hybrid search with stop-word filtering
 */
export function keywordMatchScore(query: string, chunk: KnowledgeChunk): number {
  const normalizedQuery = query.toLowerCase();
  let score = 0;

  // Exact keyword match from chunk.keywords
  for (const kw of chunk.keywords) {
    const lowerKw = kw.toLowerCase();
    if (normalizedQuery.includes(lowerKw)) {
      score += 0.45;
    }
  }

  // Meaningful query tokens (excluding stop words)
  const tokens = normalizedQuery
    .split(/[\s,?.!/\\-]+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));

  const titleLower = chunk.title.toLowerCase();
  const contentLower = chunk.content.toLowerCase();

  for (const token of tokens) {
    if (chunk.keywords.some((k) => k.toLowerCase().includes(token))) {
      score += 0.35;
    }
    if (titleLower.includes(token)) {
      score += 0.3;
    } else if (contentLower.includes(token)) {
      score += 0.15;
    }
  }

  return Math.min(score, 1.0);
}

/**
 * Finds top K most relevant knowledge chunks using Hybrid (Vector + Keyword) search.
 */
export function findRelevantChunks(
  query: string,
  queryEmbedding: number[] | null,
  knowledgeBase: KnowledgeChunk[],
  topK = 3,
  minScore = 0.2
): KnowledgeChunk[] {
  const scoredItems = knowledgeBase.map((chunk) => {
    let vectorScore = 0;
    if (queryEmbedding && chunk.embedding && chunk.embedding.length > 0) {
      vectorScore = cosineSimilarity(queryEmbedding, chunk.embedding);
    }

    const keywordScore = keywordMatchScore(query, chunk);

    // Hybrid score: 60% vector + 40% keyword if vector is available, else 100% keyword
    const finalScore =
      queryEmbedding && chunk.embedding
        ? vectorScore * 0.6 + keywordScore * 0.4
        : keywordScore;

    return {
      chunk,
      score: finalScore,
    };
  });

  return scoredItems
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((item) => item.chunk);
}

/**
 * Builds the context string from relevant chunks.
 */
export function buildRAGContext(chunks: KnowledgeChunk[]): string {
  if (chunks.length === 0) {
    const overview = PORTFOLIO_KNOWLEDGE_BASE.find((c) => c.id === "bio-overview");
    return overview ? `[${overview.title}]:\n${overview.content}` : "";
  }

  return chunks
    .map((c) => `--- [TÀI LIỆU: ${c.title}] ---\n${c.content}`)
    .join("\n\n");
}
