import { createLangfuseApi } from "../../../../scripts/lib/langfuse-api";

/**
 * Read-only: prints one Langfuse trace as JSON for the abot-trace-report skill.
 *
 *   ts-node --compiler-options '{"module":"CommonJS"}' .agents/skills/abot-trace-report/scripts/fetch-trace.ts <traceId> [--days 30]
 *
 * Output: { traceId, traceUrl, observations: [...tree order], scores: [...] }.
 * Long input/output strings are cut so the report stays readable; the trace URL has the full data.
 */

const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;
const MAX_IO_CHARS = 4000;
const DAY_MS = 86_400_000;

interface Observation {
  id: string;
  traceId: string;
  parentObservationId: string | null;
  name: string | null;
  type: string;
  level: string;
  statusMessage: string | null;
  startTime: string;
  endTime: string | null;
  input?: unknown;
  output?: unknown;
  metadata?: unknown;
  providedModelName?: string | null;
  usageDetails?: Record<string, number>;
  costDetails?: Record<string, number>;
  totalCost?: number | null;
  latency?: number | null;
  timeToFirstToken?: number | null;
  environment?: string | null;
  traceName?: string | null;
  sessionId?: string | null;
}

interface Score {
  name: string;
  value: number | null;
  stringValue?: string | null;
  dataType: string;
  comment?: string | null;
  metadata?: unknown;
  timestamp: string;
}

function cut(value: unknown): unknown {
  const text = typeof value === "string" ? value : value == null ? value : JSON.stringify(value);
  if (typeof text !== "string") return text;
  return text.length > MAX_IO_CHARS ? `${text.slice(0, MAX_IO_CHARS)}… [cut, ${text.length} chars]` : text;
}

// SDK / OTel bookkeeping that every observation repeats; it says nothing about the answer
const NOISE_KEY = /^(scope|resourceAttributes)\./;

function cleanMetadata(value: unknown): unknown {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return cut(value);
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return cut(parsed);
  const kept = Object.entries(parsed).filter(([key]) => !NOISE_KEY.test(key));
  return kept.length ? Object.fromEntries(kept) : null;
}

// The v2 endpoint leaves `environment` empty for Python traces; the OTel resource still carries it
function environmentOf(metadata: unknown): string | null {
  let parsed = metadata;
  if (typeof metadata === "string") {
    try {
      parsed = JSON.parse(metadata);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const value = (parsed as Record<string, unknown>)["resourceAttributes.langfuse.environment"];
  return typeof value === "string" ? value : null;
}

function depthOf(obs: Observation, byId: Map<string, Observation>): number {
  let depth = 0;
  let parent = obs.parentObservationId ? byId.get(obs.parentObservationId) : undefined;
  while (parent && depth < 50) {
    depth += 1;
    parent = parent.parentObservationId ? byId.get(parent.parentObservationId) : undefined;
  }
  return depth;
}

async function main() {
  const [traceId, ...rest] = process.argv.slice(2);
  if (!traceId || !TRACE_ID_PATTERN.test(traceId)) {
    throw new Error("Usage: fetch-trace.ts <traceId: 32 lowercase hex> [--days N]");
  }
  const daysFlag = rest.indexOf("--days");
  const days = daysFlag >= 0 ? Number(rest[daysFlag + 1]) : 30;
  const api = createLangfuseApi();
  const fromStartTime = new Date(Date.now() - days * DAY_MS).toISOString();

  const observations: Observation[] = [];
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({
      traceId,
      fields: "core,basic,time,io,metadata,model,usage,metrics,trace_context",
      limit: "100",
      fromStartTime,
    });
    if (cursor) params.set("cursor", cursor);
    const page = await api.request<{ data: Observation[]; meta: { cursor?: string } }>(
      "GET",
      `/v2/observations?${params}`
    );
    observations.push(...page.data);
    cursor = page.meta.cursor;
  } while (cursor);

  const scores = await api
    .request<{ data: Score[] }>("GET", `/v3/scores?${new URLSearchParams({ traceId, fields: "details", limit: "50" })}`)
    .then((res) => res.data)
    .catch((error: Error) => [{ error: error.message }]);

  const projectId = await api
    .request<{ data: { id: string }[] }>("GET", "/projects")
    .then((res) => res.data[0]?.id)
    .catch(() => undefined);

  const byId = new Map(observations.map((obs) => [obs.id, obs]));
  const ordered = [...observations].sort((a, b) => a.startTime.localeCompare(b.startTime));
  // Python traces point the root at an OTel parent span that is not returned, so "no parent in this trace"
  const root = ordered.find((obs) => !obs.parentObservationId || !byId.has(obs.parentObservationId));

  console.log(
    JSON.stringify(
      {
        traceId,
        found: observations.length > 0,
        searchedDays: days,
        traceUrl: projectId ? `${api.baseUrl}/project/${projectId}/traces/${traceId}` : null,
        traceName: root?.traceName ?? root?.name ?? null,
        environment: root?.environment || environmentOf(root?.metadata),
        startTime: root?.startTime ?? null,
        totalLatencyMs: root?.latency != null ? Math.round(root.latency * 1000) : null,
        sessionId: root?.sessionId ?? null,
        observations: ordered.map((obs) => ({
          depth: depthOf(obs, byId),
          name: obs.name,
          type: obs.type,
          level: obs.level,
          statusMessage: obs.statusMessage,
          startTime: obs.startTime,
          latencyMs: obs.latency != null ? Math.round(obs.latency * 1000) : null,
          timeToFirstTokenMs: obs.timeToFirstToken != null ? Math.round(obs.timeToFirstToken * 1000) : null,
          model: obs.providedModelName ?? null,
          usage: obs.usageDetails ?? null,
          cost: obs.totalCost ?? null,
          metadata: cleanMetadata(obs.metadata),
          input: cut(obs.input),
          output: cut(obs.output),
        })),
        scores,
      },
      null,
      2
    )
  );
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
