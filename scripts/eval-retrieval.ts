import * as fs from "fs";
import * as path from "path";
import { getLlmProvider } from "../lib/ai/llm-provider";
import { findRelevantChunks, rewriteQuery, shouldRewriteQuery } from "../lib/ai/rag-engine";
import { computeKnowledgeHash, loadKnowledgeBase } from "../lib/ai/knowledge-base";
import { PORTFOLIO_KNOWLEDGE_BASE } from "../lib/ai/portfolio-knowledge";
import { RETRIEVAL_TOP_K as TOP_K } from "../lib/ai/chat-config";

// ts-node does not load Next.js env files, so read .env.local explicitly
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

interface EvalCase {
  query: string;
  // Empty = off-topic, retrieval must return nothing
  expected: string[];
  // Previous turns; when present the query goes through rewriteQuery like in the route
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

async function evaluateRetrieval() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  // Embeddings must match the current knowledge text, otherwise scores are meaningless
  const meta = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../lib/ai/data/knowledge-vectors.meta.json"), "utf-8")
  );
  if (meta.hash !== computeKnowledgeHash(PORTFOLIO_KNOWLEDGE_BASE)) {
    throw new Error("Vector index is stale. Run `yarn index:knowledge` first.");
  }

  // Same loader as the chat route
  const knowledgeBase = loadKnowledgeBase();
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
  // Cases that could not run (e.g. Gemini quota exhausted) — never counted as pass
  const skipped: string[] = [];

  for (const { query, expected, history } of cases) {
    let retrievalQuery = query;
    if (history && shouldRewriteQuery(history)) {
      const rewrite = await rewriteQuery(query, history);
      // A failed rewrite silently keeps the original query; that would not test the rewrite path
      if (rewrite.errorKind) {
        console.log(`⚠️  ${query}\n   → skipped: rewrite failed (${rewrite.errorKind})`);
        skipped.push(query);
        continue;
      }
      retrievalQuery = rewrite.query;
    }
    const embedding = await getLlmProvider().embed(retrievalQuery, "RETRIEVAL_QUERY");
    const retrievedIds = findRelevantChunks(retrievalQuery, embedding, knowledgeBase, TOP_K).map(
      (c) => c.id
    );

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
    const rewriteNote = retrievalQuery !== query ? `  (rewritten: "${retrievalQuery}")` : "";
    console.log(
      `${label} ${query}${rewriteNote}\n   → [${retrievedIds.join(", ")}]  expected: [${expected.join(", ")}]`
    );
    if (!isPass) failures.push(query);
  }

  const toPercent = (value: number, total: number) =>
    total === 0 ? "n/a" : `${((value / total) * 100).toFixed(0)}%`;

  console.log("\n===== Retrieval eval summary =====");
  console.log(`Hit@${TOP_K} (on-topic):        ${hitCount}/${onTopicCount} (${toPercent(hitCount, onTopicCount)})`);
  console.log(`MRR (on-topic):           ${onTopicCount ? (reciprocalRankSum / onTopicCount).toFixed(2) : "n/a"}`);
  console.log(`Precision@${TOP_K} (on-topic):  ${onTopicCount ? (precisionSum / onTopicCount).toFixed(2) : "n/a"}`);
  console.log(`Off-topic rejection:      ${rejectedCount}/${offTopicCount} (${toPercent(rejectedCount, offTopicCount)})`);

  if (skipped.length > 0) {
    console.log(`\n⚠️  ${skipped.length} case(s) skipped — eval is incomplete.`);
  }
  if (failures.length > 0 || skipped.length > 0) {
    console.log(`\n${failures.length} failed case(s).`);
    process.exit(1);
  }
}

evaluateRetrieval().catch((err) => {
  console.error("Eval failed:", err);
  process.exit(1);
});
