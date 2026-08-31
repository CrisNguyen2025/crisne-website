import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || "";

export const genAI = new GoogleGenAI({ apiKey });

export const DEFAULT_CHAT_MODEL = "gemini-2.0-flash";
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-004";
