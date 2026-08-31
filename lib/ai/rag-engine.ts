import { genAI, DEFAULT_EMBEDDING_MODEL } from "./gemini";
import { PORTFOLIO_KNOWLEDGE_BASE, type KnowledgeChunk } from "./portfolio-knowledge";

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
 * Keyword match score for hybrid search fallback
 */
export function keywordMatchScore(query: string, chunk: KnowledgeChunk): number {
  const normalizedQuery = query.toLowerCase();
  let score = 0;

  for (const kw of chunk.keywords) {
    if (normalizedQuery.includes(kw.toLowerCase())) {
      score += 0.35;
    }
  }

  const queryWords = normalizedQuery.split(/[\s,?.!]+/).filter((w) => w.length >= 2);
  const titleLower = chunk.title.toLowerCase();
  const contentLower = chunk.content.toLowerCase();

  for (const word of queryWords) {
    if (titleLower.includes(word)) {
      score += 0.2;
    } else if (contentLower.includes(word)) {
      score += 0.1;
    }
  }

  return Math.min(score, 1.0);
}

/**
 * Generates an embedding for a text query using Gemini embedding model.
 */
export async function getQueryEmbedding(text: string): Promise<number[] | null> {
  try {
    const response = await genAI.models.embedContent({
      model: DEFAULT_EMBEDDING_MODEL,
      contents: [text],
    });

    if (response.embeddings && response.embeddings.length > 0) {
      return response.embeddings[0].values || null;
    }
    return null;
  } catch (error) {
    console.warn("Failed to generate query embedding:", error);
    return null;
  }
}

/**
 * Finds top K most relevant knowledge chunks using Hybrid (Vector + Keyword) search.
 */
export function findRelevantChunks(
  query: string,
  queryEmbedding: number[] | null,
  knowledgeBase: KnowledgeChunk[],
  topK = 3,
  minScore = 0.35
): KnowledgeChunk[] {
  const scoredItems = knowledgeBase.map((chunk) => {
    let vectorScore = 0;
    if (queryEmbedding && chunk.embedding && chunk.embedding.length > 0) {
      vectorScore = cosineSimilarity(queryEmbedding, chunk.embedding);
    }

    const keywordScore = keywordMatchScore(query, chunk);

    // Hybrid score: 70% vector + 30% keyword if vector is available, else 100% keyword
    const finalScore =
      queryEmbedding && chunk.embedding
        ? vectorScore * 0.7 + keywordScore * 0.3
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
