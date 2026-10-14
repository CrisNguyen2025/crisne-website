import * as fs from "fs";
import * as path from "path";
import { computeKnowledgeHash } from "../lib/ai/knowledge-base";
import { PORTFOLIO_KNOWLEDGE_BASE } from "../lib/ai/portfolio-knowledge";

// Offline check (no API key): fails when portfolio-knowledge.ts changed without re-indexing
const metaPath = path.join(__dirname, "../lib/ai/data/knowledge-vectors.meta.json");
const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));

if (meta.hash !== computeKnowledgeHash(PORTFOLIO_KNOWLEDGE_BASE)) {
  console.error("❌ Vector index is stale. Run `yarn index:knowledge` and commit the updated vectors.");
  process.exit(1);
}

console.log(`✅ Vector index is up to date (indexed at ${meta.indexedAt}).`);
