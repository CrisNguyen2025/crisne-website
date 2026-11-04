import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// ============================================================================
// Configuration & Environment Defaults
// ============================================================================
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3334';
const MIN_THINK = parseFloat(__ENV.MIN_THINK || '0.7');
const JITTER = parseFloat(__ENV.JITTER || '0.6');
const SUMMARY_JSON_PATH = __ENV.SUMMARY_JSON_PATH || 'tests/load/results/phase1-ai-architecture-summary.json';

// ============================================================================
// Custom Metrics
// ============================================================================
export const roadmapDuration = new Trend('roadmap_read_duration', true);
export const roadmapSuccess = new Rate('roadmap_read_success');
export const itemsValidatedCount = new Counter('items_validated_count');

// ============================================================================
// k6 Options & Concurrency Schedule
// ============================================================================
export const options = {
  // Ramp-up concurrency schedule over 60 seconds (70s total with ramp-down)
  // Aligned strictly to ORIGINAL_REQUEST.md (10 -> 50 -> 100 VUs over 60 seconds)
  stages: [
    { duration: '15s', target: 10 },  // Stage 1: Warmup & ramp to 10 VUs per ORIGINAL_REQUEST.md (15s)
    { duration: '30s', target: 50 },  // Stage 2: Sustained mid-load at 50 VUs (30s)
    { duration: '15s', target: 100 }, // Stage 3: Stress peak ramp to 100 VUs (15s)
    { duration: '10s', target: 0 },   // Stage 4: Graceful ramp-down to 0 VUs (10s)
  ],

  // Compute full percentile spectrum including P50 and P99
  summaryTrendStats: ['avg', 'min', 'med', 'p(50)', 'p(90)', 'p(95)', 'p(99)', 'max'],

  // SLO Verification Thresholds
  thresholds: {
    // SLO 1: P95 latency must be strictly less than 150ms
    'http_req_duration{endpoint:ai-architecture}': ['p(95)<150'],
    // SLO 2: 0% HTTP error rate
    'http_req_failed{endpoint:ai-architecture}': ['rate==0'],
    // SLO 3: 100% check pass rate on response payload integrity
    'checks{endpoint:ai-architecture}': ['rate==1.0'],
    // Custom metrics verification
    'roadmap_read_success': ['rate==1.0'],
  },

  // Retain bodies for validation; bounded memory footprint
  discardResponseBodies: false,
  noConnectionReuse: false,
  insecureSkipTLSVerify: true,
};

// ============================================================================
// Main Execution Function
// ============================================================================
export default function () {
  const url = `${BASE_URL}/api/v1/roadmaps/ai-architecture`;
  const params = {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'k6-stress-tester/1.0',
    },
    tags: {
      endpoint: 'ai-architecture',
      phase: 'phase1-read',
    },
  };

  const res = http.get(url, params);

  // Fail-closed initialization: default to invalid/non-passing values
  let jsonBody = null;
  let itemsCount = -1;
  let sectionsCount = -1;
  let parseOk = false;
  let isValidPayload = false;

  // 100% genuine validation: parse response on EVERY iteration when status is 200
  if (res.status === 200 && res.body) {
    try {
      jsonBody = JSON.parse(res.body);
      if (jsonBody && typeof jsonBody === 'object') {
        itemsCount = Array.isArray(jsonBody.items) ? jsonBody.items.length : -1;
        sectionsCount = Array.isArray(jsonBody.sections) ? jsonBody.sections.length : -1;
        parseOk = true;
        isValidPayload = Boolean(
          jsonBody.roadmap &&
          jsonBody.roadmap.slug === 'ai-architecture' &&
          jsonBody.roadmap.id === '01a18bc0-4e87-76c0-84da-356c46774241' &&
          itemsCount === 109 &&
          sectionsCount === 15
        );
      }
    } catch (_err) {
      jsonBody = null;
      itemsCount = -1;
      sectionsCount = -1;
      parseOk = false;
      isValidPayload = false;
    }
  }

  // Register strict, fail-closed verification checks
  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'content-type is json': (r) => Boolean(r.headers['Content-Type'] && r.headers['Content-Type'].includes('application/json')),
    'cache-control is no-store': (r) => Boolean(r.headers['Cache-Control'] && r.headers['Cache-Control'].includes('no-store')),
    'has ai-architecture slug': () => Boolean(jsonBody && jsonBody.roadmap && jsonBody.roadmap.slug === 'ai-architecture'),
    'has roadmap id': () => Boolean(jsonBody && jsonBody.roadmap && jsonBody.roadmap.id === '01a18bc0-4e87-76c0-84da-356c46774241'),
    'size > 35000 chars': (r) => Boolean(r.body && r.body.length > 35000),
    'payload parsed successfully': () => parseOk,
    'has 109 items': () => itemsCount === 109,
    'has 15 sections': () => sectionsCount === 15,
    'payload fully valid': () => isValidPayload,
  }, { endpoint: 'ai-architecture' });

  // Record metrics
  roadmapDuration.add(res.timings.duration, { endpoint: 'ai-architecture' });
  roadmapSuccess.add(ok);

  // Strictly increment itemsValidatedCount ONLY when payload is verified valid
  if (isValidPayload && itemsCount === 109) {
    itemsValidatedCount.add(itemsCount);
  }

  // De-correlated think-time to prevent VU phase-locking / convoy waves
  const thinkTime = MIN_THINK + Math.random() * JITTER;
  if (thinkTime > 0) {
    sleep(thinkTime);
  }
}

// ============================================================================
// Summary Export Hook (Console & JSON Scorecard)
// ============================================================================
export function handleSummary(data) {
  const dur = data.metrics['http_req_duration{endpoint:ai-architecture}']
    ? data.metrics['http_req_duration{endpoint:ai-architecture}'].values
    : (data.metrics.http_req_duration ? data.metrics.http_req_duration.values : {});
  const reqs = data.metrics.http_reqs ? data.metrics.http_reqs.values : {};
  const failed = data.metrics['http_req_failed{endpoint:ai-architecture}']
    ? data.metrics['http_req_failed{endpoint:ai-architecture}'].values
    : (data.metrics.http_req_failed ? data.metrics.http_req_failed.values : {});
  const checks = data.metrics['checks{endpoint:ai-architecture}']
    ? data.metrics['checks{endpoint:ai-architecture}'].values
    : (data.metrics.checks ? data.metrics.checks.values : {});
  const itemsValidated = data.metrics.items_validated_count
    ? data.metrics.items_validated_count.values.count
    : 0;
  const bytes = data.metrics.data_received ? data.metrics.data_received.values : {};

  const p95 = dur['p(95)'] || 0;
  const p50 = dur['p(50)'] || dur.med || 0;
  const p90 = dur['p(90)'] || 0;
  const p99 = dur['p(99)'] || 0;
  const errorRatePercent = (failed.rate !== undefined ? failed.rate : (failed.value || 0)) * 100;
  const checksPassRate = checks.rate !== undefined ? checks.rate : (checks.value || 0);

  const p95Passed = p95 < 150;
  const errorRatePassed = errorRatePercent === 0;
  const checksPassed = checksPassRate === 1.0;
  const overallVerdict = (p95Passed && errorRatePassed && checksPassed) ? 'PASS' : 'FAIL';

  const scorecard = {
    phase: 'Phase 1: Topic Read Stress',
    endpoint: 'GET /api/v1/roadmaps/ai-architecture',
    target: `${BASE_URL}/api/v1/roadmaps/ai-architecture`,
    timestamp: new Date().toISOString(),
    concurrency_vus: 100,
    duration_seconds: 70,
    slo: {
      p95_target_ms: 150,
      p95_actual_ms: p95,
      p95_passed: p95Passed,
      error_rate_target_percent: 0.0,
      error_rate_actual_percent: errorRatePercent,
      error_rate_passed: errorRatePassed,
      checks_pass_rate_percent: checksPassRate * 100,
      checks_passed: checksPassed,
      verdict: overallVerdict,
    },
    metrics: {
      total_requests: reqs.count || 0,
      throughput_rps: reqs.rate || 0,
      items_validated: itemsValidated,
      latency_ms: {
        min: dur.min || 0,
        p50: p50,
        avg: dur.avg || 0,
        med: dur.med || 0,
        p90: p90,
        p95: p95,
        p99: p99,
        max: dur.max || 0,
      },
      checks: {
        total: (checks.passes || 0) + (checks.fails || 0),
        succeeded: checks.passes || 0,
        failed: checks.fails || 0,
        pass_rate: checksPassRate,
      },
      network: {
        data_received_bytes: bytes.count || 0,
        data_received_mb: (bytes.count || 0) / (1024 * 1024),
      },
    },
  };

  const textOutput = `
================================================================================
Phase 1: Topic Read Stress Summary (/api/v1/roadmaps/ai-architecture)
================================================================================
Target URL         : ${scorecard.target}
Timestamp          : ${scorecard.timestamp}
Concurrency        : Up to 100 VUs over 70s
Total Requests     : ${scorecard.metrics.total_requests}
Throughput         : ${scorecard.metrics.throughput_rps.toFixed(2)} req/s
Items Validated    : ${scorecard.metrics.items_validated}
Data Received      : ${scorecard.metrics.network.data_received_mb.toFixed(2)} MB

Latency Percentiles:
  - Min            : ${scorecard.metrics.latency_ms.min.toFixed(2)} ms
  - P50 (Median)   : ${scorecard.metrics.latency_ms.p50.toFixed(2)} ms
  - Avg            : ${scorecard.metrics.latency_ms.avg.toFixed(2)} ms
  - P90            : ${scorecard.metrics.latency_ms.p90.toFixed(2)} ms
  - P95            : ${scorecard.metrics.latency_ms.p95.toFixed(2)} ms (SLO < 150 ms) -> ${p95Passed ? 'PASS [OK]' : 'FAIL [BREACH]'}
  - P99            : ${scorecard.metrics.latency_ms.p99.toFixed(2)} ms
  - Max            : ${scorecard.metrics.latency_ms.max.toFixed(2)} ms

Integrity & Reliability:
  - Error Rate     : ${scorecard.slo.error_rate_actual_percent.toFixed(2)} % (SLO == 0 %) -> ${errorRatePassed ? 'PASS [OK]' : 'FAIL [BREACH]'}
  - Checks Passed  : ${scorecard.metrics.checks.succeeded} / ${scorecard.metrics.checks.total} (${(scorecard.metrics.checks.pass_rate * 100).toFixed(2)}%)
  - Overall Status : ${scorecard.slo.verdict}
================================================================================
`;

  return {
    'stdout': textOutput,
    [SUMMARY_JSON_PATH]: JSON.stringify(scorecard, null, 2),
  };
}
