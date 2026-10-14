import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  CHAT_OBSERVATION,
  CHAT_TRACE_NAME,
  FEEDBACK_SCORE_NAME,
  RETRIEVAL_DATASET_NAME,
} from "../lib/ai/chat-config";
import { createLangfuseApi, LangfuseApiError } from "./lib/langfuse-api";

// How far back to look for 👎 feedback
const FEEDBACK_LOOKBACK_DAYS = 30;

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface EvalCase {
  query: string;
  expected: string[];
  history?: ChatTurn[];
}

interface FeedbackScore {
  value: boolean;
  timestamp: string;
  subject?: { kind: string; id: string };
}

interface Observation {
  name: string;
  input: unknown;
}

const api = createLangfuseApi();

const parseJson = (value: unknown) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

async function ensureDataset(): Promise<void> {
  try {
    await api.request("GET", `/v2/datasets/${encodeURIComponent(RETRIEVAL_DATASET_NAME)}`);
  } catch (error) {
    if (!(error instanceof LangfuseApiError) || error.status !== 404) throw error;
    await api.request("POST", "/v2/datasets", {
      name: RETRIEVAL_DATASET_NAME,
      description:
        "Cris AI retrieval cases. source=eval-cases: synced from scripts/data/retrieval-eval-cases.json. " +
        "source=user-feedback: 👎 traces — fill expectedOutput.chunkIds, then copy them into the eval cases file.",
    });
    console.log(`✅ created dataset ${RETRIEVAL_DATASET_NAME}`);
  }
}

/** The repo file is the source of truth for these items, so they are upserted (same id → overwrite). */
async function syncEvalCases(): Promise<number> {
  const cases: EvalCase[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data/retrieval-eval-cases.json"), "utf-8")
  );

  for (const { query, expected, history } of cases) {
    const caseKey = createHash("sha256").update(JSON.stringify({ query, history })).digest("hex");
    await api.request("POST", "/dataset-items", {
      datasetName: RETRIEVAL_DATASET_NAME,
      id: `eval-${caseKey.slice(0, 24)}`,
      input: { query, history: history ?? [] },
      expectedOutput: { chunkIds: expected },
      metadata: { source: "eval-cases", isOffTopic: expected.length === 0 },
    });
  }
  return cases.length;
}

async function itemExists(id: string): Promise<boolean> {
  try {
    await api.request("GET", `/dataset-items/${encodeURIComponent(id)}`);
    return true;
  } catch (error) {
    if (error instanceof LangfuseApiError && error.status === 404) return false;
    throw error;
  }
}

async function getDownvotedTraces(): Promise<Array<{ traceId: string; timestamp: string }>> {
  const from = new Date(Date.now() - FEEDBACK_LOOKBACK_DAYS * 86_400_000).toISOString();
  const traces: Array<{ traceId: string; timestamp: string }> = [];
  let cursor: string | undefined;

  do {
    const query = new URLSearchParams({
      name: FEEDBACK_SCORE_NAME,
      fields: "subject",
      fromTimestamp: from,
      limit: "100",
      ...(cursor ? { cursor } : {}),
    });
    const page = await api.request<{ data: FeedbackScore[]; meta: { cursor?: string } }>(
      "GET",
      `/v3/scores?${query}`
    );
    for (const score of page.data) {
      if (score.value === false && score.subject?.kind === "trace") {
        traces.push({ traceId: score.subject.id, timestamp: score.timestamp });
      }
    }
    cursor = page.meta.cursor;
  } while (cursor);

  return traces;
}

/**
 * Feedback items are only ever created, never overwritten: a human may have labeled
 * expectedOutput in the Langfuse UI. Inputs come from traces, which are already PII-masked.
 */
async function syncDownvotedTraces(): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;

  for (const { traceId, timestamp } of await getDownvotedTraces()) {
    const id = `feedback-${traceId}`;
    if (await itemExists(id)) {
      skipped++;
      continue;
    }

    // Observations of a trace start within seconds of the feedback; ±1 day is a safe window
    const around = new Date(timestamp).getTime();
    const query = new URLSearchParams({
      traceId,
      fields: "core,basic,io",
      fromStartTime: new Date(around - 86_400_000).toISOString(),
      toStartTime: new Date(around + 86_400_000).toISOString(),
    });
    const { data } = await api.request<{ data: Observation[] }>("GET", `/v2/observations?${query}`);

    const rootInput = parseJson(data.find((o) => o.name === CHAT_TRACE_NAME)?.input) as
      | { message?: string }
      | undefined;
    const rewriteInput = parseJson(data.find((o) => o.name === CHAT_OBSERVATION.rewrite)?.input) as
      | { history?: ChatTurn[] }
      | undefined;
    if (!rootInput?.message) {
      console.log(`⚠️  trace ${traceId}: no ${CHAT_TRACE_NAME} input found (not ingested yet?), skipped`);
      skipped++;
      continue;
    }

    await api.request("POST", "/dataset-items", {
      datasetName: RETRIEVAL_DATASET_NAME,
      id,
      input: { query: rootInput.message, history: rewriteInput?.history ?? [] },
      // To be labeled by a human in the Langfuse UI
      expectedOutput: null,
      metadata: { source: "user-feedback", needsLabel: true },
      sourceTraceId: traceId,
    });
    added++;
  }

  return { added, skipped };
}

async function main() {
  await ensureDataset();

  const caseCount = await syncEvalCases();
  console.log(`✅ eval cases upserted: ${caseCount}`);

  const feedback = await syncDownvotedTraces();
  console.log(`✅ 👎 traces added: ${feedback.added} (already present / skipped: ${feedback.skipped})`);
  console.log(`   ${api.baseUrl} → Datasets → ${RETRIEVAL_DATASET_NAME}`);
}

main().catch((err) => {
  console.error("Dataset sync failed:", err);
  process.exit(1);
});
