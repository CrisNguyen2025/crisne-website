import { type KnowledgeChunk } from "./portfolio-knowledge";
import type { LlmUsage } from "./llm-provider";
import { generateWithFallback } from "./resilient-llm";
import { classifyLlmError, type LlmErrorKind } from "./llm-errors";

/**
 * Lowercases and strips Vietnamese diacritics so "kinh nghiem" matches "kinh nghiệm".
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

const RAW_STOP_WORDS = [
  "có", "làm", "được", "đc", "dc", "không", "k", "ko", "khong", "gì", "như", "thế", "nào",
  "ở", "và", "của", "cho", "về", "với", "là", "ai", "tôi", "bạn", "mình", "ơi", "hả", "sao",
  "hay", "các", "những", "một", "này", "đó", "vậy", "nhé", "nha", "ạ", "ạk", "thì", "đã", "sẽ",
  // Subject of the whole knowledge base — appears in almost every query, so it carries no signal
  "cris", "nguyen"
];

const STOP_WORDS = new Set(RAW_STOP_WORDS.map(normalizeText));

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
 * Splits normalized text into whole words, so "bo" does not match inside "booking".
 */
function tokenize(text: string): string[] {
  return normalizeText(text).split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Keyword match score for hybrid search with stop-word filtering (whole-word matching)
 */
export function keywordMatchScore(query: string, chunk: KnowledgeChunk): number {
  const queryWords = tokenize(query);
  // Padded with spaces so multi-word keywords only match on word boundaries
  const paddedQuery = ` ${queryWords.join(" ")} `;
  const keywords = chunk.keywords.map((kw) => tokenize(kw).join(" "));
  // Multi-word keywords only count as a whole phrase (below), not word by word
  const keywordWords = new Set(keywords.filter((kw) => !kw.includes(" ")));
  const titleWords = new Set(tokenize(chunk.title));
  const contentWords = new Set(tokenize(chunk.content));
  let score = 0;

  // Exact keyword (phrase) match from chunk.keywords
  for (const kw of keywords) {
    if (kw && paddedQuery.includes(` ${kw} `)) {
      score += 0.45;
    }
  }

  // Meaningful query tokens (excluding stop words)
  const tokens = queryWords.filter((t) => t.length >= 2 && !STOP_WORDS.has(t));

  for (const token of tokens) {
    if (keywordWords.has(token)) {
      score += 0.35;
    }
    if (titleWords.has(token)) {
      score += 0.3;
    } else if (contentWords.has(token)) {
      score += 0.15;
    }
  }

  return Math.min(score, 1.0);
}

// Measured with gemini-embedding-001 (768d): on-topic queries ~0.66-0.79, off-topic ~0.48-0.57
const MIN_VECTOR_SCORE = 0.6;
const VECTOR_WEIGHT = 0.75;
// Every chunk is about Cris, so on-topic queries pass MIN_VECTOR_SCORE broadly;
// keep only chunks close to the best match to cut noise (measured via `yarn eval:rag`)
const MAX_SCORE_GAP = 0.15;

export type ScoredChunk = KnowledgeChunk & {
  score: number;
  vectorScore: number | null;
  keywordScore: number;
};

/**
 * Finds top K most relevant knowledge chunks using Hybrid (Vector + Keyword) search.
 * Returns an empty array when nothing is relevant enough, so the caller can answer "no info".
 */
export function findRelevantChunks(
  query: string,
  queryEmbedding: number[] | null,
  knowledgeBase: KnowledgeChunk[],
  topK = 3,
  minKeywordScore = 0.3
): ScoredChunk[] {
  const scoredItems = knowledgeBase.map((chunk) => {
    const keywordScore = keywordMatchScore(query, chunk);

    const hasVector =
      !!queryEmbedding &&
      !!chunk.embedding &&
      chunk.embedding.length === queryEmbedding.length;

    // Keyword-only when vectors are unavailable (e.g. missing API key or embedding error)
    if (!hasVector) {
      return {
        chunk,
        score: keywordScore,
        vectorScore: null,
        keywordScore,
        isRelevant: keywordScore >= minKeywordScore,
      };
    }

    // Relevance is gated by vector score; keyword only re-ranks among relevant chunks
    const vectorScore = cosineSimilarity(queryEmbedding, chunk.embedding!);
    return {
      chunk,
      score: vectorScore * VECTOR_WEIGHT + keywordScore * (1 - VECTOR_WEIGHT),
      vectorScore,
      keywordScore,
      isRelevant: vectorScore >= MIN_VECTOR_SCORE,
    };
  });

  const relevantItems = scoredItems
    .filter((item) => item.isRelevant)
    .sort((a, b) => b.score - a.score);
  const topScore = relevantItems[0]?.score ?? 0;

  return relevantItems
    .filter((item) => topScore - item.score <= MAX_SCORE_GAP)
    .slice(0, topK)
    .map(({ chunk, score, vectorScore, keywordScore }) => ({
      ...chunk,
      score,
      vectorScore,
      keywordScore,
    }));
}

/**
 * Builds the context string from relevant chunks. Empty when nothing is relevant.
 */
export function buildRAGContext(chunks: KnowledgeChunk[]): string {
  return chunks
    .map((c) => `--- [TÀI LIỆU: ${c.title}] ---\n${c.content}`)
    .join("\n\n");
}

type ChatTurn = { role: "user" | "assistant"; content: string };

const REWRITE_HISTORY_TURNS = 4;

function getRewriteHistory(history: ChatTurn[]): ChatTurn[] {
  return history.filter((h) => h.content?.trim()).slice(-REWRITE_HISTORY_TURNS);
}

/**
 * Rewriting only makes sense when there is a previous user turn to resolve references against.
 */
export function shouldRewriteQuery(history: ChatTurn[]): boolean {
  return getRewriteHistory(history).some((h) => h.role === "user");
}

export interface RewriteResult {
  query: string;
  usage?: LlmUsage;
  // Model that produced the rewrite (may be the fallback model)
  model?: string;
  // Set when the LLM call failed and the original query was kept
  errorKind?: LlmErrorKind;
}

/**
 * Rewrites a follow-up question into a standalone query using recent conversation,
 * so retrieval works for questions like "dự án đó dùng stack gì?".
 * Never throws: on failure it keeps the original query and reports `errorKind`.
 */
export async function rewriteQuery(query: string, history: ChatTurn[]): Promise<RewriteResult> {
  if (!shouldRewriteQuery(history)) return { query };

  const transcript = getRewriteHistory(history)
    .map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content.trim().slice(0, 500)}`)
    .join("\n");

  try {
    const { result, model } = await generateWithFallback({
      contents: `Hội thoại:\n${transcript}\n\nCâu hỏi mới: ${query}`,
      systemInstruction:
        "Viết lại câu hỏi mới thành một câu hỏi độc lập, đầy đủ ngữ cảnh (thay đại từ như 'đó', 'nó', 'dự án này' bằng tên cụ thể từ hội thoại). Giữ nguyên ngôn ngữ của câu hỏi. Nếu câu hỏi đã độc lập thì giữ nguyên. Chỉ trả về câu hỏi, không giải thích.",
      temperature: 0,
      maxOutputTokens: 120,
    });

    return { query: result.text.trim() || query, usage: result.usage, model };
  } catch (error) {
    console.error("Query rewrite error:", error);
    return { query, errorKind: classifyLlmError(error) };
  }
}
