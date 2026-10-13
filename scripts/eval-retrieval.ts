import * as fs from "fs";
import * as path from "path";
import { embedText } from "../lib/ai/gemini";
import { findRelevantChunks } from "../lib/ai/rag-engine";
import type { KnowledgeChunk } from "../lib/ai/portfolio-knowledge";

// ts-node does not load Next.js env files, so read .env.local explicitly
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

// Must match topK used in app/api/chat/route.ts
const TOP_K = 4;

interface EvalCase {
  query: string;
  // Empty = off-topic, retrieval must return nothing
  expected: string[];
}

async function evaluateRetrieval() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  const knowledgeBase: KnowledgeChunk[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../lib/ai/data/knowledge-vectors.json"), "utf-8")
  );
  const cases: EvalCase[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data/retrieval-eval-cases.json"), "utf-8")
  );

  let onTopicCount = 0;
  let hitCount = 0;
  let reciprocalRankSum = 0;
  // Share of retrieved chunks that are expected — measures noise in the context
  let precisionSum = 0;
  let offTopicCount = 0;
  let rejectedCount = 0;
  const failures: string[] = [];

  for (const { query, expected } of cases) {
    const embedding = await embedText(query, "RETRIEVAL_QUERY");
    const retrievedIds = findRelevantChunks(query, embedding, knowledgeBase, TOP_K).map((c) => c.id);

    let isPass: boolean;
    if (expected.length === 0) {
      offTopicCount++;
      isPass = retrievedIds.length === 0;
      if (isPass) rejectedCount++;
    } else {
      onTopicCount++;
      const firstHitIndex = retrievedIds.findIndex((id) => expected.includes(id));
      isPass = firstHitIndex !== -1;
      if (retrievedIds.length > 0) {
        precisionSum += retrievedIds.filter((id) => expected.includes(id)).length / retrievedIds.length;
      }
      if (isPass) {
        hitCount++;
        reciprocalRankSum += 1 / (firstHitIndex + 1);
      }
    }

    const label = isPass ? "✅" : "❌";
    console.log(`${label} ${query}\n   → [${retrievedIds.join(", ")}]  expected: [${expected.join(", ")}]`);
    if (!isPass) failures.push(query);
  }

  const toPercent = (value: number, total: number) =>
    total === 0 ? "n/a" : `${((value / total) * 100).toFixed(0)}%`;

  console.log("\n===== Retrieval eval summary =====");
  console.log(`Hit@${TOP_K} (on-topic):        ${hitCount}/${onTopicCount} (${toPercent(hitCount, onTopicCount)})`);
  console.log(`MRR (on-topic):           ${onTopicCount ? (reciprocalRankSum / onTopicCount).toFixed(2) : "n/a"}`);
  console.log(`Precision@${TOP_K} (on-topic):  ${onTopicCount ? (precisionSum / onTopicCount).toFixed(2) : "n/a"}`);
  console.log(`Off-topic rejection:      ${rejectedCount}/${offTopicCount} (${toPercent(rejectedCount, offTopicCount)})`);

  if (failures.length > 0) {
    console.log(`\n${failures.length} failed case(s).`);
    process.exit(1);
  }
}

evaluateRetrieval().catch((err) => {
  console.error("Eval failed:", err);
  process.exit(1);
});
