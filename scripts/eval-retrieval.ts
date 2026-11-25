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

function toPercent(value: number, total: number): string {
  return total === 0 ? "n/a" : `${((value / total) * 100).toFixed(0)}%`;
}

async function resolveRetrievalQuery(
  query: string,
  history: EvalCase["history"]
): Promise<{ retrievalQuery: string } | { skipped: true }> {
  if (!history || !shouldRewriteQuery(history)) {
    return { retrievalQuery: query };
  }
  const rewrite = await rewriteQuery(query, history);
  // A failed rewrite silently keeps the original query; that would not test the rewrite path
  if (rewrite.errorKind) {
    console.log(`⚠️  ${query}\n   → skipped: rewrite failed (${rewrite.errorKind})`);
    return { skipped: true };
  }
  return { retrievalQuery: rewrite.query };
}

interface EvalStats {
  onTopicCount: number;
  hitCount: number;
  reciprocalRankSum: number;
  precisionSum: number;
  offTopicCount: number;
  rejectedCount: number;
  failures: string[];
  skipped: string[];
}

function recordEvalCaseOutcome(
  evalCase: EvalCase,
  retrievalQuery: string,
  retrievedIds: string[],
  stats: EvalStats
): void {
  const { query, expected } = evalCase;
  let isPass: boolean;

  if (expected.length === 0) {
    stats.offTopicCount++;
    isPass = retrievedIds.length === 0;
    if (isPass) stats.rejectedCount++;
  } else {
    stats.onTopicCount++;
    const firstHitIndex = retrievedIds.findIndex((id) => expected.includes(id));
    isPass = firstHitIndex !== -1;
    if (retrievedIds.length > 0) {
      stats.precisionSum += retrievedIds.filter((id) => expected.includes(id)).length / retrievedIds.length;
    }
    if (isPass) {
      stats.hitCount++;
      stats.reciprocalRankSum += 1 / (firstHitIndex + 1);
    }
  }

  const label = isPass ? "✅" : "❌";
  const rewriteNote = retrievalQuery !== query ? `  (rewritten: "${retrievalQuery}")` : "";
  console.log(
    `${label} ${query}${rewriteNote}\n   → [${retrievedIds.join(", ")}]  expected: [${expected.join(", ")}]`
  );
  if (!isPass) stats.failures.push(query);
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

  const stats: EvalStats = {
    onTopicCount: 0,
    hitCount: 0,
    reciprocalRankSum: 0,
    precisionSum: 0,
    offTopicCount: 0,
    rejectedCount: 0,
    failures: [],
    skipped: [],
  };

  for (const evalCase of cases) {
    const queryResult = await resolveRetrievalQuery(evalCase.query, evalCase.history);
    if ("skipped" in queryResult) {
      stats.skipped.push(evalCase.query);
      continue;
    }
    const { retrievalQuery } = queryResult;
    const embedding = await getLlmProvider().embed(retrievalQuery, "RETRIEVAL_QUERY");
    const retrievedIds = findRelevantChunks(retrievalQuery, embedding, knowledgeBase, TOP_K).map(
      (c) => c.id
    );
    recordEvalCaseOutcome(evalCase, retrievalQuery, retrievedIds, stats);
  }

  console.log("\n===== Retrieval eval summary =====");
  console.log(`Hit@${TOP_K} (on-topic):        ${stats.hitCount}/${stats.onTopicCount} (${toPercent(stats.hitCount, stats.onTopicCount)})`);
  console.log(`MRR (on-topic):           ${stats.onTopicCount ? (stats.reciprocalRankSum / stats.onTopicCount).toFixed(2) : "n/a"}`);
  console.log(`Precision@${TOP_K} (on-topic):  ${stats.onTopicCount ? (stats.precisionSum / stats.onTopicCount).toFixed(2) : "n/a"}`);
  console.log(`Off-topic rejection:      ${stats.rejectedCount}/${stats.offTopicCount} (${toPercent(stats.rejectedCount, stats.offTopicCount)})`);

  if (stats.skipped.length > 0) {
    console.log(`\n⚠️  ${stats.skipped.length} case(s) skipped — eval is incomplete.`);
  }
  if (stats.failures.length > 0 || stats.skipped.length > 0) {
    console.log(`\n${stats.failures.length} failed case(s).`);
    process.exit(1);
  }
}

evaluateRetrieval().catch((err) => {
  console.error("Eval failed:", err);
  process.exit(1);
});
