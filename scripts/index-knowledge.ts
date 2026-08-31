import * as fs from "fs";
import * as path from "path";
import { GoogleGenAI } from "@google/genai";
import { PORTFOLIO_KNOWLEDGE_BASE } from "../lib/ai/portfolio-knowledge";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("⚠️  GEMINI_API_KEY is not set. Chunks will be saved without vector embeddings.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || "" });

async function generateKnowledgeVectors() {
  console.log(`🚀 Indexing ${PORTFOLIO_KNOWLEDGE_BASE.length} knowledge chunks...`);

  const updatedChunks = [];

  for (let i = 0; i < PORTFOLIO_KNOWLEDGE_BASE.length; i++) {
    const chunk = PORTFOLIO_KNOWLEDGE_BASE[i];
    console.log(`[${i + 1}/${PORTFOLIO_KNOWLEDGE_BASE.length}] Embedding: "${chunk.title}"`);

    let embedding: number[] | undefined = undefined;

    if (apiKey) {
      try {
        const textToEmbed = `${chunk.title}\n${chunk.keywords.join(", ")}\n${chunk.content}`;
        const response = await ai.models.embedContent({
          model: "text-embedding-004",
          contents: [textToEmbed],
        });

        if (response.embeddings && response.embeddings.length > 0) {
          embedding = response.embeddings[0].values;
        }
      } catch (err) {
        console.error(`❌ Failed to embed chunk ${chunk.id}:`, err);
      }
    }

    updatedChunks.push({
      ...chunk,
      embedding: embedding || undefined,
    });
  }

  const outputPath = path.join(__dirname, "../lib/ai/data/knowledge-vectors.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(updatedChunks, null, 2), "utf-8");

  console.log(`✅ Successfully wrote ${updatedChunks.length} chunks to ${outputPath}`);
}

generateKnowledgeVectors().catch((err) => {
  console.error("Index failed:", err);
  process.exit(1);
});
