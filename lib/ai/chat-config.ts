/**
 * Shared contract between the chat route, the eval script and the Langfuse dashboard setup.
 * Renaming anything here changes what the dashboard widgets filter on, so update
 * `yarn setup:langfuse-dashboard` (recreate the dashboard) together with it.
 */

// Langfuse trace / observation names emitted by app/api/chat/route.ts
export const CHAT_TRACE_NAME = "chat";
export const CHAT_OBSERVATION = {
  rewrite: "rewrite-query",
  embed: "embed-query",
  retrieve: "retrieve",
  answer: "answer",
} as const;

// Langfuse score name for 👍/👎
export const FEEDBACK_SCORE_NAME = "user-feedback";

// Langfuse dataset holding retrieval eval cases and 👎 traces to label (`yarn sync:langfuse-dataset`)
export const RETRIEVAL_DATASET_NAME = "cris-ai-retrieval";

// Max chunks passed to the model (also used by `yarn eval:rag`)
export const RETRIEVAL_TOP_K = 4;
