import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { CHAT_OBSERVATION, CHAT_TRACE_NAME, FEEDBACK_SCORE_NAME } from "../lib/ai/chat-config";

// ts-node does not load Next.js env files, so read .env.local explicitly
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const DASHBOARD_NAME = "Cris AI";
const WIDGET_PREFIX = "Cris AI ·";

// Observation names come from the shared contract with app/api/chat/route.ts
const CHAT_STEPS = [CHAT_TRACE_NAME, ...Object.values(CHAT_OBSERVATION)];

type Filter = { column: string; operator: string; type: string; value?: unknown };

const byName = (name: string): Filter => ({ column: "name", operator: "=", type: "string", value: name });
const feedbackScore: Filter = byName(FEEDBACK_SCORE_NAME);

interface WidgetSpec {
  name: string;
  description: string;
  view: "observations" | "scores-boolean";
  metrics: Array<{ measure: string; agg: string }>;
  dimensions: Array<{ field: string }>;
  filters: Filter[];
  chartType: string;
  // Placement on the 12-column dashboard grid
  layout: { x: number; y: number; width: number; height: number };
}

const WIDGETS: WidgetSpec[] = [
  // Row 1: headline numbers
  {
    name: `${WIDGET_PREFIX} Lượt chat`,
    description: "Số request /api/chat (trace gốc).",
    view: "observations",
    metrics: [{ measure: "count", agg: "count" }],
    dimensions: [],
    filters: [byName(CHAT_TRACE_NAME)],
    chartType: "NUMBER",
    layout: { x: 0, y: 0, width: 3, height: 4 },
  },
  {
    name: `${WIDGET_PREFIX} Latency p95`,
    description: "Thời gian toàn request (ms), gồm cả stream câu trả lời.",
    view: "observations",
    metrics: [{ measure: "latency", agg: "p95" }],
    dimensions: [],
    filters: [byName(CHAT_TRACE_NAME)],
    chartType: "NUMBER",
    layout: { x: 3, y: 0, width: 3, height: 4 },
  },
  {
    name: `${WIDGET_PREFIX} Tỉ lệ 👍`,
    description: "Tỉ lệ feedback tích cực (1 = 100% 👍).",
    view: "scores-boolean",
    metrics: [{ measure: "value", agg: "avg" }],
    dimensions: [],
    filters: [feedbackScore],
    chartType: "NUMBER",
    layout: { x: 6, y: 0, width: 3, height: 4 },
  },
  {
    name: `${WIDGET_PREFIX} Chi phí (USD)`,
    description: "Tổng chi phí sinh câu trả lời (generation answer).",
    view: "observations",
    metrics: [{ measure: "totalCost", agg: "sum" }],
    dimensions: [],
    filters: [byName(CHAT_OBSERVATION.answer)],
    chartType: "NUMBER",
    layout: { x: 9, y: 0, width: 3, height: 4 },
  },
  // Row 2: traffic and latency breakdown
  {
    name: `${WIDGET_PREFIX} Lượt chat theo thời gian`,
    description: "Số request /api/chat theo thời gian.",
    view: "observations",
    metrics: [{ measure: "count", agg: "count" }],
    dimensions: [],
    filters: [byName(CHAT_TRACE_NAME)],
    chartType: "BAR_TIME_SERIES",
    layout: { x: 0, y: 4, width: 6, height: 6 },
  },
  {
    name: `${WIDGET_PREFIX} Latency p95 theo bước`,
    description: "Bước nào chậm nhất: rewrite / embed / retrieve / answer (ms).",
    view: "observations",
    metrics: [{ measure: "latency", agg: "p95" }],
    dimensions: [{ field: "name" }],
    filters: [{ column: "name", operator: "any of", type: "stringOptions", value: CHAT_STEPS }],
    chartType: "VERTICAL_BAR",
    layout: { x: 6, y: 4, width: 6, height: 6 },
  },
  // Row 3: quality signals
  {
    name: `${WIDGET_PREFIX} Retrieval có / không có context`,
    description: "WARNING = no-context: câu hỏi knowledge base chưa trả lời được.",
    view: "observations",
    metrics: [{ measure: "count", agg: "count" }],
    dimensions: [{ field: "level" }],
    filters: [byName(CHAT_OBSERVATION.retrieve)],
    chartType: "PIE",
    layout: { x: 0, y: 10, width: 4, height: 6 },
  },
  {
    name: `${WIDGET_PREFIX} Trạng thái trả lời`,
    description: "DEFAULT = trả lời bằng AI, ERROR = fallback do lỗi LLM (vd. hết quota), WARNING = thiếu API key.",
    view: "observations",
    metrics: [{ measure: "count", agg: "count" }],
    dimensions: [{ field: "level" }],
    filters: [byName(CHAT_TRACE_NAME)],
    chartType: "PIE",
    layout: { x: 4, y: 10, width: 4, height: 6 },
  },
  {
    name: `${WIDGET_PREFIX} Feedback 👍/👎`,
    description: "true = 👍, false = 👎.",
    view: "scores-boolean",
    metrics: [{ measure: "count", agg: "count" }],
    dimensions: [{ field: "booleanValue" }],
    filters: [feedbackScore],
    chartType: "PIE",
    layout: { x: 8, y: 10, width: 4, height: 6 },
  },
  // Row 4: cost and responsiveness trends
  {
    name: `${WIDGET_PREFIX} Token theo thời gian`,
    description: "Tổng token của generation answer.",
    view: "observations",
    metrics: [{ measure: "totalTokens", agg: "sum" }],
    dimensions: [],
    filters: [byName(CHAT_OBSERVATION.answer)],
    chartType: "LINE_TIME_SERIES",
    layout: { x: 0, y: 16, width: 6, height: 6 },
  },
  {
    name: `${WIDGET_PREFIX} Time to first token`,
    description: "Thời gian tới token đầu tiên của câu trả lời (ms), p50 và p95.",
    view: "observations",
    metrics: [
      { measure: "timeToFirstToken", agg: "p50" },
      { measure: "timeToFirstToken", agg: "p95" },
    ],
    dimensions: [],
    filters: [byName(CHAT_OBSERVATION.answer)],
    chartType: "LINE_TIME_SERIES",
    layout: { x: 6, y: 16, width: 6, height: 6 },
  },
];

// Minimal shape of the Langfuse responses used below
interface ApiResponse {
  id: string;
  name: string;
  data: Array<{ id: string; name: string }>;
}

async function main() {
  const { LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL } = process.env;
  if (!LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY || !LANGFUSE_BASE_URL) {
    throw new Error("LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_BASE_URL are not set.");
  }

  const auth = "Basic " + Buffer.from(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`).toString("base64");
  const request = async (method: string, apiPath: string, body?: unknown, attempt = 1): Promise<ApiResponse> => {
    const res = await fetch(`${LANGFUSE_BASE_URL}/api/public/unstable${apiPath}`, {
      method,
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    // Langfuse public API allows ~30 requests/minute; wait as instructed and retry
    if (res.status === 429 && attempt <= 3) {
      const retryAfterSeconds = data?.details?.retryAfterSeconds ?? 60;
      console.log(`⏳ rate limited, retrying in ${retryAfterSeconds}s...`);
      await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1000));
      return request(method, apiPath, body, attempt + 1);
    }
    if (!res.ok) throw new Error(`${method} ${apiPath} → ${res.status} ${JSON.stringify(data)}`);
    return data;
  };

  // Idempotency: never create a second copy
  const dashboards = await request("GET", "/dashboards?limit=100");
  const existing = dashboards.data.find((d) => d.name === DASHBOARD_NAME);
  if (existing) {
    console.log(`Dashboard "${DASHBOARD_NAME}" already exists (${existing.id}). Delete it in Langfuse to recreate.`);
    return;
  }

  // Remove widgets left behind by a previously failed run
  const widgets = await request("GET", "/dashboard-widgets?limit=100");
  for (const widget of widgets.data.filter((w) => w.name.startsWith(WIDGET_PREFIX))) {
    await request("DELETE", `/dashboard-widgets/${widget.id}`);
    console.log(`🧹 removed leftover widget: ${widget.name}`);
  }

  const placements: Array<{ id: string; type: "widget"; widgetId: string } & WidgetSpec["layout"]> = [];
  let dashboard;
  try {
    for (const { layout, ...widget } of WIDGETS) {
      const created = await request("POST", "/dashboard-widgets", widget);
      console.log(`✅ widget: ${widget.name}`);
      placements.push({ id: randomUUID(), type: "widget", widgetId: created.id, ...layout });
    }

    dashboard = await request("POST", "/dashboards", {
      name: DASHBOARD_NAME,
      description: "Monitoring cho chatbot portfolio /api/chat: traffic, latency theo bước, chất lượng retrieval, feedback, chi phí.",
      definition: { widgets: placements },
    });
  } catch (error) {
    // Roll back widgets created in this run so a rerun does not leave duplicates
    for (const { widgetId } of placements) {
      await request("DELETE", `/dashboard-widgets/${widgetId}`).catch(() => undefined);
    }
    throw error;
  }
  console.log(`✅ dashboard: ${dashboard.name} (${dashboard.id})`);
  console.log(`   ${LANGFUSE_BASE_URL} → Dashboards → ${DASHBOARD_NAME}`);
}

main().catch((err) => {
  console.error("Dashboard setup failed:", err);
  process.exit(1);
});
