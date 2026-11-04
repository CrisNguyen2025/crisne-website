import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// ============================================================================
// Configuration & Environment Defaults
// ============================================================================
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3334';
const THINK_TIME = parseFloat(__ENV.THINK_TIME || '0.02'); // 20ms think time
const SUMMARY_JSON_PATH = __ENV.SUMMARY_JSON_PATH || 'tests/load/results/phase1-full-export-summary.json';

// ============================================================================
// Custom Metrics
// ============================================================================
export const exportDuration = new Trend('full_export_duration', true);
export const payloadSize = new Trend('payload_size_chars');
export const checkFailRate = new Rate('check_failures');
export const roadmapsExportedCount = new Counter('roadmaps_exported_count');

// ============================================================================
// k6 Options & Concurrency Schedule
// ============================================================================
export const options = {
  // Ramp-up concurrency schedule (total 60s)
  stages: [
    { duration: '15s', target: 10 }, // Stage 1: Warm-up and ramp to 10 VUs (15s)
    { duration: '15s', target: 20 }, // Stage 2: Ramp up to 20 VUs (15s)
    { duration: '20s', target: 30 }, // Stage 3: Peak sustained stress at 30 VUs (20s)
    { duration: '10s', target: 0 },  // Stage 4: Graceful drain to 0 VUs (10s)
  ],

  // Compute full percentile spectrum including P50 and P99
  summaryTrendStats: ['avg', 'min', 'med', 'p(50)', 'p(90)', 'p(95)', 'p(99)', 'max'],

  // SLO Verification Thresholds
  thresholds: {
    // SLO 1: P95 latency must be strictly less than 350ms
    'http_req_duration{endpoint:full-export}': ['p(95)<350'],
    // SLO 2: 0% HTTP error rate
    'http_req_failed{endpoint:full-export}': ['rate==0'],
    // SLO 3: 100% check pass rate
    'checks{endpoint:full-export}': ['rate==1.0'],
    'check_failures': ['rate==0'],
  },

  // Retain response bodies for structural validation
  discardResponseBodies: false,
  noConnectionReuse: false,
  insecureSkipTLSVerify: true,
};

// ============================================================================
// Main Execution Function
// ============================================================================
export default function () {
  const url = `${BASE_URL}/api/v1/roadmaps/full-export`;
  const params = {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'k6-stress-tester/1.0',
    },
    tags: {
      endpoint: 'full-export',
      phase: 'phase1-read',
    },
  };

  const res = http.get(url, params);

  exportDuration.add(res.timings.duration, { endpoint: 'full-export' });
  if (res.body) {
    payloadSize.add(res.body.length, { endpoint: 'full-export' });
  }

  let jsonBody = null;
  let isValidPayload = false;
  if (res.status === 200 && res.body) {
    try {
      jsonBody = JSON.parse(res.body);
      isValidPayload = Boolean(
        jsonBody &&
        typeof jsonBody.total_roadmaps === 'number' &&
        jsonBody.total_roadmaps > 0 &&
        Array.isArray(jsonBody.roadmaps) &&
        jsonBody.roadmaps.length === jsonBody.total_roadmaps &&
        jsonBody.roadmaps[0] &&
        Array.isArray(jsonBody.roadmaps[0].items) &&
        jsonBody.roadmaps[0].items.length > 0
      );
    } catch (_err) {
      jsonBody = null;
      isValidPayload = false;
    }
  }

  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'content-type is json': (r) => Boolean(r.headers['Content-Type'] && r.headers['Content-Type'].includes('application/json')),
    'cache-control is no-store': (r) => Boolean(r.headers['Cache-Control'] && r.headers['Cache-Control'].includes('no-store')),
    'payload size > 40k chars': (r) => Boolean(r.body && r.body.length > 40000),
    'total_roadmaps is valid': () => Boolean(jsonBody && jsonBody.total_roadmaps > 0),
    'roadmaps array matches total': () => Boolean(jsonBody && Array.isArray(jsonBody.roadmaps) && jsonBody.roadmaps.length === jsonBody.total_roadmaps),
    'roadmaps has items': () => Boolean(jsonBody && jsonBody.roadmaps[0] && jsonBody.roadmaps[0].items && jsonBody.roadmaps[0].items.length > 0),
    'payload fully valid': () => isValidPayload,
  }, { endpoint: 'full-export' });

  checkFailRate.add(!ok);
  if (isValidPayload && jsonBody) {
    roadmapsExportedCount.add(jsonBody.total_roadmaps);
  }

  if (THINK_TIME > 0) {
    sleep(THINK_TIME);
  }
}

// ============================================================================
// Summary Export Hook
// ============================================================================
export function handleSummary(data) {
  const dur = data.metrics['http_req_duration{endpoint:full-export}']
    ? data.metrics['http_req_duration{endpoint:full-export}'].values
    : (data.metrics.http_req_duration ? data.metrics.http_req_duration.values : {});
  const reqs = data.metrics.http_reqs ? data.metrics.http_reqs.values : {};
  const failed = data.metrics['http_req_failed{endpoint:full-export}']
    ? data.metrics['http_req_failed{endpoint:full-export}'].values
    : (data.metrics.http_req_failed ? data.metrics.http_req_failed.values : {});
  const checks = data.metrics['checks{endpoint:full-export}']
    ? data.metrics['checks{endpoint:full-export}'].values
    : (data.metrics.checks ? data.metrics.checks.values : {});
  const bytes = data.metrics.data_received ? data.metrics.data_received.values : {};

  const p95 = dur['p(95)'] || 0;
  const p50 = dur['p(50)'] || dur.med || 0;
  const p90 = dur['p(90)'] || 0;
  const p99 = dur['p(99)'] || 0;
  const errorRatePercent = (failed.rate !== undefined ? failed.rate : (failed.value || 0)) * 100;
  const checksPassRate = checks.rate !== undefined ? checks.rate : (checks.value || 0);

  const p95Passed = p95 < 350;
  const errorRatePassed = errorRatePercent === 0;
  const checksPassed = checksPassRate === 1.0;
  const overallVerdict = (p95Passed && errorRatePassed && checksPassed) ? 'PASS' : 'FAIL';

  const summary = {
    phase: 'Phase 1: Full Export Stress',
    endpoint: 'GET /api/v1/roadmaps/full-export',
    target: `${BASE_URL}/api/v1/roadmaps/full-export`,
    timestamp: new Date().toISOString(),
    concurrency_vus: 30,
    duration_seconds: 60,
    slo: {
      p95_target_ms: 350,
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
        pass_rate: checks.rate !== undefined ? checks.rate : (checks.value || 0),
      },
      network: {
        data_received_bytes: bytes.count || 0,
        data_received_mb: (bytes.count || 0) / (1024 * 1024),
      },
    },
  };

  const textOutput = `
================================================================================
Phase 1: Full Export Stress Summary (/api/v1/roadmaps/full-export)
================================================================================
Target URL         : ${summary.target}
Timestamp          : ${summary.timestamp}
Concurrency        : Up to 30 VUs over 60s
Total Requests     : ${summary.metrics.total_requests}
Throughput         : ${summary.metrics.throughput_rps.toFixed(2)} req/s
Data Received      : ${summary.metrics.network.data_received_mb.toFixed(2)} MB

Latency Percentiles:
  - Min            : ${summary.metrics.latency_ms.min.toFixed(2)} ms
  - P50 (Median)   : ${summary.metrics.latency_ms.p50.toFixed(2)} ms
  - Avg            : ${summary.metrics.latency_ms.avg.toFixed(2)} ms
  - P90            : ${summary.metrics.latency_ms.p90.toFixed(2)} ms
  - P95            : ${summary.metrics.latency_ms.p95.toFixed(2)} ms (SLO < 350 ms) -> ${p95Passed ? 'PASS [OK]' : 'FAIL [BREACH]'}
  - P99            : ${summary.metrics.latency_ms.p99.toFixed(2)} ms
  - Max            : ${summary.metrics.latency_ms.max.toFixed(2)} ms

Integrity & Reliability:
  - Error Rate     : ${summary.slo.error_rate_actual_percent.toFixed(2)} % (SLO == 0 %) -> ${errorRatePassed ? 'PASS [OK]' : 'FAIL [BREACH]'}
  - Checks Passed  : ${summary.metrics.checks.succeeded} / ${summary.metrics.checks.total} (${(summary.metrics.checks.pass_rate * 100).toFixed(2)}%)
  - Overall Status : ${summary.slo.verdict}
================================================================================
`;

  return {
    'stdout': textOutput,
    [SUMMARY_JSON_PATH]: JSON.stringify(summary, null, 2),
  };
}
