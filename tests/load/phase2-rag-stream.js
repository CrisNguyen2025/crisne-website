import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// ============================================================================
// Configuration & Environment Defaults
// ============================================================================
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3334';
const ADMIN_API_KEY = __ENV.ADMIN_API_KEY || '76bdc056bd9f6c4b108872d109a7641daf7353423dab6a166340324a5a0efb60';
const MIN_THINK = parseFloat(__ENV.MIN_THINK || '1.0');
const JITTER = parseFloat(__ENV.JITTER || '1.0');
const STARTUP_JITTER = parseFloat(__ENV.STARTUP_JITTER || '2.0');
const SUMMARY_JSON_PATH = __ENV.SUMMARY_JSON_PATH || 'tests/load/results/phase2-k6-summary.json';

// Representative roadmap knowledge queries
const QUERIES = [
  'Grounding Data là gì?',
  'Lộ trình AI Architecture gồm những gì?',
  'Vector database dùng để làm gì trong AI Architecture?',
  'RAG pipeline hoạt động như thế nào?',
  'Monolith vs Microservices cho AI',
  'Autonomous Agent khác gì AI Copilot?',
  'Hybrid search kết hợp BM25 và Vector như thế nào?',
];

// ============================================================================
// Custom Metrics
// ============================================================================
export const ragStreamDuration = new Trend('rag_stream_duration', true);
export const ragRetrievalLatency = new Trend('rag_retrieval_latency', true);
export const ragTokensReceived = new Counter('rag_tokens_received');
export const ragErrorRate = new Rate('rag_error_rate');
export const ragQuotaErrors = new Rate('rag_quota_errors');
export const ragStreamSuccess = new Rate('rag_stream_success');

// ============================================================================
// k6 Options & Concurrency Schedule
// ============================================================================
export const options = {
  // Concurrency schedule: Ramp up to 20 concurrent VUs over 60 seconds
  stages: [
    { duration: '10s', target: 5 },  // Stage 1: Warmup & ramp to 5 VUs (10s)
    { duration: '15s', target: 10 }, // Stage 2: Ramp to 10 VUs (15s)
    { duration: '30s', target: 20 }, // Stage 3: Hold peak at 20 VUs (30s)
    { duration: '5s', target: 0 },   // Stage 4: Graceful ramp-down to 0 VUs (5s)
  ],

  summaryTrendStats: ['avg', 'min', 'med', 'p(50)', 'p(90)', 'p(95)', 'p(99)', 'max'],

  thresholds: {
    // SLO 1: Error rate < 1% (excluding quota throttles)
    'rag_error_rate': ['rate<0.01'],
    // SLO 2: Retrieval latency P95 < 100ms
    'rag_retrieval_latency': ['p(95)<100'],
    // SLO 3: Check pass rate >= 99%
    'checks': ['rate>0.99'],
  },

  discardResponseBodies: false,
  noConnectionReuse: false,
  insecureSkipTLSVerify: true,
};

// ============================================================================
// Helper: Robust Parsing of event: done from SSE Stream
// ============================================================================
function extractDoneData(body) {
  if (!body || typeof body !== 'string') return null;
  const idx = body.indexOf('event: done');
  if (idx === -1) return null;

  const dataPrefix = 'data: ';
  const dataStart = body.indexOf(dataPrefix, idx);
  if (dataStart === -1) return null;

  const jsonStart = dataStart + dataPrefix.length;
  const doubleNewline = body.indexOf('\n\n', jsonStart);
  const jsonStr = doubleNewline !== -1 ? body.slice(jsonStart, doubleNewline) : body.slice(jsonStart);

  try {
    return JSON.parse(jsonStr.trim());
  } catch (_err) {
    const match = body.slice(jsonStart).match(/^(\{[\s\S]*?\})(?:\n\n|$)/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch (_err2) {
        return null;
      }
    }
    return null;
  }
}

// ============================================================================
// Main Execution Function
// ============================================================================
export default function () {
  // De-correlate initial VU startup to prevent t=0 thundering-herd waves on Python event loop
  if (__ITER === 0) {
    const startupDelay = ((__VU * 0.1) % STARTUP_JITTER) + Math.random() * 0.3;
    if (startupDelay > 0) {
      sleep(startupDelay);
    }
  }

  const queryIndex = (__VU + __ITER) % QUERIES.length;
  const message = QUERIES[queryIndex];
  const threadId = `k6-m2-${__VU}-${__ITER}-${Date.now()}`;

  const url = `${BASE_URL}/api/roadmap-assistant/chat/stream`;
  const payload = JSON.stringify({
    message,
    thread_id: threadId,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': ADMIN_API_KEY,
      'User-Agent': 'k6-stress-tester/2.0',
    },
    tags: {
      endpoint: 'chat-stream',
      phase: 'phase2-rag-stream',
    },
    timeout: '60s',
  };

  const res = http.post(url, payload, params);

  // Analyze response
  const body = res.body || '';
  const is200 = res.status === 200;
  const isSSE = Boolean(res.headers['Content-Type'] && res.headers['Content-Type'].includes('text/event-stream'));

  // Detect upstream quota/rate limit errors (HTTP 429 or fallback mode)
  const isUpstreamQuota = res.status === 429 ||
    body.includes('rate_limited') ||
    body.includes('RESOURCE_EXHAUSTED') ||
    body.includes('fallback_reason');

  // Count tokens
  const tokenMatches = body.match(/event: token/g);
  const tokensCount = tokenMatches ? tokenMatches.length : 0;

  // Extract event: done payload
  const doneData = extractDoneData(body);
  const hasDoneEvent = Boolean(doneData);

  // Extract step latencies
  let retrievalDurationMs = null;
  let hasRetrieveStep = false;
  let hasAnswerStep = false;

  if (doneData && Array.isArray(doneData.steps)) {
    const retrieveStep = doneData.steps.find(s => s.id === 'retrieve');
    if (retrieveStep) {
      hasRetrieveStep = true;
      if (typeof retrieveStep.duration_ms === 'number') {
        retrievalDurationMs = retrieveStep.duration_ms;
      }
    }
    const answerStep = doneData.steps.find(s => s.id === 'answer');
    if (answerStep) {
      hasAnswerStep = true;
    }
  }

  // Register strict fail-closed checks
  const checksPassed = check(res, {
    'status is 200': (r) => r.status === 200,
    'content-type is event-stream': () => isSSE,
    'contains event: trace': () => body.includes('event: trace'),
    'contains event: step': () => body.includes('event: step'),
    'contains event: done': () => hasDoneEvent,
    'steps contain retrieve': () => hasRetrieveStep,
    'steps contain answer': () => hasAnswerStep,
  }, { endpoint: 'chat-stream' });

  // Record metrics
  ragStreamDuration.add(res.timings.duration, { endpoint: 'chat-stream' });
  ragTokensReceived.add(tokensCount);

  if (retrievalDurationMs !== null) {
    ragRetrievalLatency.add(retrievalDurationMs, { endpoint: 'chat-stream' });
  }

  if (isUpstreamQuota) {
    ragQuotaErrors.add(1);
    ragErrorRate.add(0);
    ragStreamSuccess.add(1); // Service gracefully handled quota fallback
  } else if (!is200 || !hasDoneEvent || !hasRetrieveStep) {
    ragQuotaErrors.add(0);
    ragErrorRate.add(1);
    ragStreamSuccess.add(0);
  } else {
    ragQuotaErrors.add(0);
    ragErrorRate.add(0);
    ragStreamSuccess.add(1);
  }

  // De-correlated jitter sleep
  const thinkTime = MIN_THINK + Math.random() * JITTER;
  if (thinkTime > 0) {
    sleep(thinkTime);
  }
}

// ============================================================================
// Summary Export Hook
// ============================================================================
export function handleSummary(data) {
  const streamDur = data.metrics.rag_stream_duration ? data.metrics.rag_stream_duration.values : {};
  const retDur = data.metrics.rag_retrieval_latency ? data.metrics.rag_retrieval_latency.values : {};
  const reqs = data.metrics.http_reqs ? data.metrics.http_reqs.values : {};
  const errRate = data.metrics.rag_error_rate ? data.metrics.rag_error_rate.values : {};
  const quotaErr = data.metrics.rag_quota_errors ? data.metrics.rag_quota_errors.values : {};
  const tokens = data.metrics.rag_tokens_received ? data.metrics.rag_tokens_received.values.count : 0;
  const checks = data.metrics.checks ? data.metrics.checks.values : {};

  const retP50 = retDur['p(50)'] || retDur.med || 0;
  const retP90 = retDur['p(90)'] || 0;
  const retP95 = retDur['p(95)'] || 0;
  const retP99 = retDur['p(99)'] || 0;

  const streamP50 = streamDur['p(50)'] || streamDur.med || 0;
  const streamP90 = streamDur['p(90)'] || 0;
  const streamP95 = streamDur['p(95)'] || 0;
  const streamP99 = streamDur['p(99)'] || 0;

  const errorRatePct = (errRate.rate !== undefined ? errRate.rate : (errRate.value || 0)) * 100;
  const quotaRatePct = (quotaErr.rate !== undefined ? quotaErr.rate : (quotaErr.value || 0)) * 100;
  const checksPassRate = checks.rate !== undefined ? checks.rate : (checks.value || 0);

  const retP95Passed = retP95 < 100;
  const errorRatePassed = errorRatePct < 1.0;
  const checksPassed = checksPassRate >= 0.99;
  const overallVerdict = (retP95Passed && errorRatePassed && checksPassed) ? 'PASS' : 'FAIL';

  const scorecard = {
    milestone: 'Milestone 2 (Phase 2)',
    endpoint: 'POST /api/roadmap-assistant/chat/stream',
    target: `${BASE_URL}/api/roadmap-assistant/chat/stream`,
    timestamp: new Date().toISOString(),
    concurrency_vus: 20,
    duration_seconds: 60,
    slo: {
      retrieval_p95_target_ms: 100,
      retrieval_p95_actual_ms: retP95,
      retrieval_p95_passed: retP95Passed,
      error_rate_target_percent: 1.0,
      error_rate_actual_percent: errorRatePct,
      error_rate_passed: errorRatePassed,
      checks_pass_rate_percent: checksPassRate * 100,
      checks_passed: checksPassed,
      verdict: overallVerdict,
    },
    metrics: {
      total_requests: reqs.count || 0,
      throughput_rps: reqs.rate || 0,
      tokens_received: tokens,
      quota_error_rate_percent: quotaRatePct,
      retrieval_latency_ms: {
        min: retDur.min || 0,
        p50: retP50,
        avg: retDur.avg || 0,
        med: retDur.med || 0,
        p90: retP90,
        p95: retP95,
        p99: retP99,
        max: retDur.max || 0,
      },
      stream_duration_ms: {
        min: streamDur.min || 0,
        p50: streamP50,
        avg: streamDur.avg || 0,
        med: streamDur.med || 0,
        p90: streamP90,
        p95: streamP95,
        p99: streamP99,
        max: streamDur.max || 0,
      },
      checks: {
        total: (checks.passes || 0) + (checks.fails || 0),
        succeeded: checks.passes || 0,
        failed: checks.fails || 0,
        pass_rate: checksPassRate,
      },
    },
  };

  const textOutput = `
================================================================================
Phase 2: k6 Concurrent RAG Chat Stream Stress Summary
================================================================================
Target URL           : ${scorecard.target}
Timestamp            : ${scorecard.timestamp}
Concurrency          : Up to 20 VUs over 60s
Total Requests       : ${scorecard.metrics.total_requests}
Throughput           : ${scorecard.metrics.throughput_rps.toFixed(2)} req/s
Tokens Received      : ${scorecard.metrics.tokens_received}
Quota Error Rate     : ${scorecard.metrics.quota_error_rate_percent.toFixed(2)}% (upstream 429 / rate_limited)
Service Error Rate   : ${scorecard.slo.error_rate_actual_percent.toFixed(2)}% (SLO < 1.0%) -> ${errorRatePassed ? 'PASS [OK]' : 'FAIL [BREACH]'}

RAG Retrieval Latency (BM25 FTS5 + Vector Cosine):
  - Min              : ${scorecard.metrics.retrieval_latency_ms.min.toFixed(2)} ms
  - P50 (Median)     : ${scorecard.metrics.retrieval_latency_ms.p50.toFixed(2)} ms
  - Avg              : ${scorecard.metrics.retrieval_latency_ms.avg.toFixed(2)} ms
  - P90              : ${scorecard.metrics.retrieval_latency_ms.p90.toFixed(2)} ms
  - P95              : ${scorecard.metrics.retrieval_latency_ms.p95.toFixed(2)} ms (SLO < 100 ms) -> ${retP95Passed ? 'PASS [OK]' : 'FAIL [BREACH]'}
  - P99              : ${scorecard.metrics.retrieval_latency_ms.p99.toFixed(2)} ms
  - Max              : ${scorecard.metrics.retrieval_latency_ms.max.toFixed(2)} ms

Full Stream Lifecycle Duration:
  - P50 (Median)     : ${scorecard.metrics.stream_duration_ms.p50.toFixed(2)} ms
  - P90              : ${scorecard.metrics.stream_duration_ms.p90.toFixed(2)} ms
  - P95              : ${scorecard.metrics.stream_duration_ms.p95.toFixed(2)} ms
  - P99              : ${scorecard.metrics.stream_duration_ms.p99.toFixed(2)} ms

Integrity & Checks:
  - Checks Passed    : ${scorecard.metrics.checks.succeeded} / ${scorecard.metrics.checks.total} (${(scorecard.metrics.checks.pass_rate * 100).toFixed(2)}%)
  - Overall Status   : ${scorecard.slo.verdict}
================================================================================
`;

  return {
    stdout: textOutput,
    [SUMMARY_JSON_PATH]: JSON.stringify(scorecard, null, 2),
  };
}
