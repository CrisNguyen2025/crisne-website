import { createLangfuseApi, LangfuseApiError } from "./lib/langfuse-api";

/**
 * Creates what the 👎 review loop needs in Langfuse; safe to run again (existing ones are kept).
 *
 *   yarn setup:langfuse-review
 *
 * - Score config REVIEW_SCORE_NAME: what a reviewer records in the queue (is this answer worth a golden sample?).
 * - Annotation queue REVIEW_QUEUE_NAME: /api/chat/feedback adds every 👎 trace to it when
 *   LANGFUSE_ANNOTATION_QUEUE_ID is set to the id printed below.
 * - Dataset GOLDEN_SET_NAME: reviewers "Add to Dataset" from the queue; `python -m evals sync-dataset`
 *   freezes it into roadmap-rag-assistant/evals/datasets/_answer/samples.jsonl.
 */

const REVIEW_QUEUE_NAME = "Roadmap Assistant 👎 review";
const GOLDEN_SET_NAME = "cris-ai-golden-set";
const REVIEW_SCORE_NAME = "golden-set-ready";

interface Page<T> {
  data: T[];
  meta: { totalPages: number };
}

async function main() {
  const api = createLangfuseApi();

  try {
    await api.request("GET", `/v2/datasets/${encodeURIComponent(GOLDEN_SET_NAME)}`);
    console.log(`Dataset "${GOLDEN_SET_NAME}" already exists.`);
  } catch (error) {
    if (!(error instanceof LangfuseApiError) || error.status !== 404) throw error;
    await api.request("POST", "/v2/datasets", {
      name: GOLDEN_SET_NAME,
      description:
        "Golden set of the roadmap assistant. Items come from the 👎 review queue; input = the question " +
        "(or {message, history}), expectedOutput = the sample's expected object ({behavior, facts, contexts, ...}). " +
        "Frozen into Git with `python -m evals sync-dataset`.",
    });
    console.log(`✅ created dataset "${GOLDEN_SET_NAME}"`);
  }

  // A queue needs at least one score config
  const configs = await api.request<Page<{ id: string; name: string }>>("GET", "/score-configs?limit=100");
  let config = configs.data.find((c) => c.name === REVIEW_SCORE_NAME);
  if (config) {
    console.log(`Score config "${REVIEW_SCORE_NAME}" already exists.`);
  } else {
    config = await api.request<{ id: string; name: string }>("POST", "/score-configs", {
      name: REVIEW_SCORE_NAME,
      dataType: "BOOLEAN",
      description: "Reviewer: true when the answer, once labeled, should be added to " + GOLDEN_SET_NAME,
    });
    console.log(`✅ created score config "${REVIEW_SCORE_NAME}"`);
  }

  const queues = await api.request<Page<{ id: string; name: string }>>("GET", "/annotation-queues?limit=100");
  let queue = queues.data.find((q) => q.name === REVIEW_QUEUE_NAME);
  if (queue) {
    console.log(`Annotation queue "${REVIEW_QUEUE_NAME}" already exists.`);
  } else {
    queue = await api.request<{ id: string; name: string }>("POST", "/annotation-queues", {
      name: REVIEW_QUEUE_NAME,
      description: "Roadmap assistant answers rated 👎. Label them, then Add to Dataset: " + GOLDEN_SET_NAME,
      scoreConfigIds: [config.id],
    });
    console.log(`✅ created annotation queue "${REVIEW_QUEUE_NAME}"`);
  }

  console.log(`\nSet in .env.local (and the deployment env): LANGFUSE_ANNOTATION_QUEUE_ID=${queue.id}`);
  console.log(`   ${api.baseUrl} → Annotation Queues → ${REVIEW_QUEUE_NAME}`);
}

main().catch((err) => {
  console.error("Langfuse review setup failed:", err);
  process.exit(1);
});
