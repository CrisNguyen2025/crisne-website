import * as fs from "fs";
import * as path from "path";
import { embedText } from "../lib/ai/gemini";
import { PORTFOLIO_KNOWLEDGE_BASE } from "../lib/ai/portfolio-knowledge";

// ts-node does not load Next.js env files, so read .env.local explicitly
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

async function generateKnowledgeVectors() {
  if (!process.env.GEMINI_API_KEY) {
    // Writing chunks without embeddings silently disables vector search at runtime
    throw new Error("GEMINI_API_KEY is not set. Aborting to keep existing vectors intact.");
  }

  console.log(`🚀 Indexing ${PORTFOLIO_KNOWLEDGE_BASE.length} knowledge chunks...`);

  const updatedChunks = [];

  for (let i = 0; i < PORTFOLIO_KNOWLEDGE_BASE.length; i++) {
    const chunk = PORTFOLIO_KNOWLEDGE_BASE[i];
    console.log(`[${i + 1}/${PORTFOLIO_KNOWLEDGE_BASE.length}] Embedding: "${chunk.title}"`);

    const textToEmbed = `${chunk.title}\n${chunk.keywords.join(", ")}\n${chunk.content}`;
    const embedding = await embedText(textToEmbed, "RETRIEVAL_DOCUMENT");

    if (!embedding) {
      throw new Error(`Empty embedding for chunk ${chunk.id}`);
    }

    updatedChunks.push({ ...chunk, embedding });
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
