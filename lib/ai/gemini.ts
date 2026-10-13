import { GoogleGenAI } from "@google/genai";

export const DEFAULT_CHAT_MODEL = "gemini-2.5-flash";
export const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";
// Index script and runtime query must share this dimension, otherwise cosine similarity returns 0
export const EMBEDDING_DIMENSION = 768;

// Created lazily so scripts can load env files before the client reads the key
export function getGenAI() {
  return new GoogleGenAI({ apiKey: (process.env.GEMINI_API_KEY || "").trim() });
}

export async function embedText(
  text: string,
  taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT"
): Promise<number[] | null> {
  const response = await getGenAI().models.embedContent({
    model: DEFAULT_EMBEDDING_MODEL,
    contents: [text],
    config: { taskType, outputDimensionality: EMBEDDING_DIMENSION },
  });

  return response.embeddings?.[0]?.values ?? null;
}
