import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import { ingestDocument } from "../lib/workflow/kb/ingest";
import { retrieve } from "../lib/workflow/kb/retrieval";
import type { LlmProvider, EmbeddingTaskType, LlmGenerateParams } from "../lib/ai/llm-provider";
import { normalizeText } from "../lib/ai/rag-engine";

// Ensure local SQLite is used for evaluation
const dbPath = path.resolve(process.cwd(), "prisma/dev.db");
const prisma = new PrismaClient({
  datasources: { db: { url: `file:${dbPath}` } },
});

interface EvalQuery {
  id: string;
  query: string;
  expectedHeading: string;
  expectedKeywords: string[];
}

/**
 * Creates a deterministic word-frequency embedding vector for offline testing
 */
function createDeterministicProvider(): LlmProvider {
  return {
    async generate(params: LlmGenerateParams) {
      return { text: `[eval] answer for ${params.contents}` };
    },
    async generateStream(params: LlmGenerateParams) {
      async function* stream() {
        yield { text: `[eval] answer for ${params.contents}` };
      }
      return stream();
    },
    async embed(text: string, _taskType: EmbeddingTaskType): Promise<number[] | null> {
      const vec = new Array(768).fill(0.001);
      const words = normalizeText(text).split(/[^a-z0-9]+/).filter(Boolean);
      for (let i = 0; i < words.length; i++) {
        const hash = words[i].split("").reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 0);
        const idx = Math.abs(hash) % 768;
        vec[idx] += 1.0;
      }
      // Normalize vector
      const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
      return norm === 0 ? vec : vec.map((v) => v / norm);
    },
  };
}

async function runEvaluation() {
  console.log("=== Knowledge Base Retrieval Evaluation (Hit@4) ===");

  const fixtureDir = path.join(process.cwd(), "lib/workflow/fixtures/kb-eval");
  const docDir = path.join(fixtureDir, "documents");
  const queriesFile = path.join(fixtureDir, "queries.json");

  const queries: EvalQuery[] = JSON.parse(fs.readFileSync(queriesFile, "utf-8"));
  console.log(`Loaded ${queries.length} evaluation queries.`);

  // Setup test evaluation project
  const evalOwnerId = "eval-tester@portfolio.dev";
  const project = await prisma.workflowProject.upsert({
    where: { id: "kb-eval-project-test" },
    create: {
      id: "kb-eval-project-test",
      name: "KB Evaluation Benchmark",
      ownerId: evalOwnerId,
    },
    update: {
      name: "KB Evaluation Benchmark",
    },
  });

  const provider = createDeterministicProvider();

  // Ingest sample documents
  const docFiles = fs.readdirSync(docDir).filter((f) => f.endsWith(".md"));
  console.log(`Ingesting ${docFiles.length} benchmark documents...`);

  for (const filename of docFiles) {
    const filePath = path.join(docDir, filename);
    const buffer = fs.readFileSync(filePath);

    await ingestDocument({
      projectId: project.id,
      ownerId: evalOwnerId,
      filename,
      mimeType: "text/markdown",
      buffer,
      prisma,
      llm: provider,
      quotaLimit: 1000,
    });
  }

  console.log("Documents ingested successfully. Starting retrieval evaluation...\n");

  let hits = 0;

  for (const item of queries) {
    const results = await retrieve({
      projectId: project.id,
      query: item.query,
      topK: 4,
      prisma,
      llm: provider,
      quotaLimit: 1000,
    });

    const isHit = results.some((doc) => {
      const headingMatch = doc.heading?.toLowerCase() === item.expectedHeading.toLowerCase();
      const contentNormalized = normalizeText(doc.content);
      const keywordsMatch = item.expectedKeywords.some((kw) =>
        contentNormalized.includes(normalizeText(kw))
      );
      return headingMatch || keywordsMatch;
    });

    if (isHit) {
      hits++;
      console.log(`[PASS] ${item.id}: "${item.query}" -> Hit in Top 4`);
    } else {
      console.log(`[FAIL] ${item.id}: "${item.query}" -> Expected "${item.expectedHeading}"`);
    }
  }

  const hitAt4 = hits / queries.length;
  console.log(`\n========================================`);
  console.log(`Total Queries: ${queries.length}`);
  console.log(`Hits: ${hits}`);
  console.log(`Hit@4 Score: ${(hitAt4 * 100).toFixed(1)}%`);
  console.log(`Target: >= 80.0%`);
  console.log(`========================================`);

  // Clean up test project
  await prisma.workflowProject.delete({ where: { id: project.id } }).catch(() => {});

  if (hitAt4 < 0.8) {
    console.error("Evaluation failed: Hit@4 is below 0.8");
    process.exit(1);
  } else {
    console.log("Evaluation PASSED successfully!\n");
  }
}

runEvaluation()
  .catch((err) => {
    console.error("Evaluation error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
