import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const [
  ,,
  k6JsonPath = path.join(__dirname, 'results', 'phase2-k6-summary.json'),
  ttftJsonPath = path.join(__dirname, 'results', 'phase2-ttft-summary.json'),
  rateLimitJsonPath = path.join(__dirname, 'results', 'phase2-rate-limit.json'),
  resourceCsvPath = path.join(__dirname, 'results', 'phase2-resources.csv'),
  summaryOutPath = path.join(__dirname, 'results', 'phase2-summary.json'),
] = process.argv;

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`[WARN] File does not exist: ${filePath}`);
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`[ERROR] Reading JSON from ${filePath}:`, err.message);
    return null;
  }
}

const round1 = n => Math.round(n * 10) / 10;
const round2 = n => Math.round(n * 100) / 100;

// ============================================================================
// 1. Process Telemetry Parsing (Resource CSV)
// ============================================================================
const resourcesByPid = {};
if (fs.existsSync(resourceCsvPath)) {
  const content = fs.readFileSync(resourceCsvPath, 'utf8').trim();
  const lines = content.split('\n');
  const dataLines = lines.slice(1);

  for (const line of dataLines) {
    const parts = line.split(',');
    if (parts.length < 4) continue;

    let timestamp, phase, pid, cpuStr, rssStr;
    if (parts.length >= 5) {
      [timestamp, phase, pid, cpuStr, rssStr] = parts;
    } else {
      [timestamp, pid, cpuStr, rssStr] = parts;
      phase = 'unsegmented';
    }

    const cleanPid = pid.trim();
    if (!cleanPid) continue;

    if (!resourcesByPid[cleanPid]) {
      resourcesByPid[cleanPid] = { samples: [], phases: {} };
    }

    const cpu = parseFloat(cpuStr) || 0;
    const rssMb = (parseInt(rssStr, 10) || 0) / 1024;
    const cleanPhase = (phase || 'unknown').trim();

    const sample = { timestamp: timestamp.trim(), phase: cleanPhase, cpu, rssMb };
    resourcesByPid[cleanPid].samples.push(sample);

    if (!resourcesByPid[cleanPid].phases[cleanPhase]) {
      resourcesByPid[cleanPid].phases[cleanPhase] = [];
    }
    resourcesByPid[cleanPid].phases[cleanPhase].push(sample);
  }
}

const resourceSummary = {};
for (const [pid, data] of Object.entries(resourcesByPid)) {
  const s = data.samples;
  if (s.length === 0) continue;

  const rsss = s.map(x => x.rssMb);
  const cpus = s.map(x => x.cpu);

  const baselineSamples = (data.phases['baseline'] && data.phases['baseline'].length > 0)
    ? data.phases['baseline']
    : s.slice(0, Math.min(5, s.length));
  const baselineRss = baselineSamples.reduce((a, b) => a + b.rssMb, 0) / baselineSamples.length;

  const peakRss = Math.max(...rsss);
  const peakCpu = Math.max(...cpus);
  const avgCpu = cpus.reduce((a, b) => a + b, 0) / cpus.length;

  const cooldownSamples = (data.phases['cooldown'] && data.phases['cooldown'].length > 0)
    ? data.phases['cooldown']
    : s.slice(-Math.min(5, s.length));
  const cooldownRss = cooldownSamples.reduce((a, b) => a + b.rssMb, 0) / cooldownSamples.length;

  const deltaRss = Math.max(0, peakRss - baselineRss);
  const residualRss = Math.max(0, cooldownRss - baselineRss);
  const retentionRate = deltaRss > 0 ? (residualRss / deltaRss) * 100 : 0;

  const activeSamples = s.filter(x => x.phase.startsWith('active_'));
  const activeAvgCpu = activeSamples.length > 0
    ? activeSamples.reduce((a, b) => a + b.cpu, 0) / activeSamples.length
    : avgCpu;

  const phaseSummary = {};
  for (const [pName, pList] of Object.entries(data.phases)) {
    if (pList.length === 0) continue;
    const pCpus = pList.map(x => x.cpu);
    const pRsss = pList.map(x => x.rssMb);
    const pPeakRss = Math.max(...pRsss);
    const pStartRss = pRsss[0];
    const pEndRss = pRsss[pRsss.length - 1];

    phaseSummary[pName] = {
      samples: pList.length,
      avg_cpu_pct: round1(pCpus.reduce((a, b) => a + b, 0) / pCpus.length),
      peak_cpu_pct: round1(Math.max(...pCpus)),
      start_rss_mb: round1(pStartRss),
      peak_rss_mb: round1(pPeakRss),
      end_rss_mb: round1(pEndRss),
      delta_rss_mb: round1(pPeakRss - pStartRss),
    };
  }

  resourceSummary[pid] = {
    samples: s.length,
    baseline_rss_mb: round1(baselineRss),
    peak_rss_mb: round1(peakRss),
    delta_rss_mb: round1(deltaRss),
    cooldown_rss_mb: round1(cooldownRss),
    residual_rss_mb: round1(residualRss),
    retention_rate_pct: round1(retentionRate),
    peak_cpu_pct: round1(peakCpu),
    avg_cpu_pct: round1(avgCpu),
    active_avg_cpu_pct: round1(activeAvgCpu),
    phases: phaseSummary,
  };
}

// ============================================================================
// 2. Parse k6 Load Test Summary
// ============================================================================
const k6Raw = safeReadJson(k6JsonPath);
let k6Metrics = {
  total_requests: 0,
  throughput_rps: 0,
  retrieval_latency_ms: { min: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0 },
  stream_duration_ms: { p50: 0, p90: 0, p95: 0, p99: 0 },
  tokens_received: 0,
  error_rate_pct: 100,
  quota_error_rate_pct: 0,
  slo_status: 'FAIL',
};

if (k6Raw) {
  if (k6Raw.metrics && k6Raw.slo) {
    const m = k6Raw.metrics;
    const slo = k6Raw.slo;
    k6Metrics = {
      total_requests: m.total_requests || 0,
      throughput_rps: round2(m.throughput_rps || 0),
      retrieval_latency_ms: {
        min: round1(m.retrieval_latency_ms?.min || 0),
        p50: round1(m.retrieval_latency_ms?.p50 || 0),
        p90: round1(m.retrieval_latency_ms?.p90 || 0),
        p95: round1(m.retrieval_latency_ms?.p95 || 0),
        p99: round1(m.retrieval_latency_ms?.p99 || 0),
        max: round1(m.retrieval_latency_ms?.max || 0),
      },
      stream_duration_ms: {
        p50: round1(m.stream_duration_ms?.p50 || 0),
        p90: round1(m.stream_duration_ms?.p90 || 0),
        p95: round1(m.stream_duration_ms?.p95 || 0),
        p99: round1(m.stream_duration_ms?.p99 || 0),
      },
      tokens_received: m.tokens_received || 0,
      error_rate_pct: round2(slo.error_rate_actual_percent || 0),
      quota_error_rate_pct: round2(m.quota_error_rate_percent || 0),
      slo_status: slo.verdict || 'FAIL',
    };
  } else if (k6Raw.metrics) {
    const m = k6Raw.metrics;
    const ret = m.rag_retrieval_latency?.values || {};
    const stream = m.rag_stream_duration?.values || {};
    const reqs = m.http_reqs?.values || {};
    const err = m.rag_error_rate?.values || {};
    const quota = m.rag_quota_errors?.values || {};
    const tokens = m.rag_tokens_received?.values?.count || 0;

    const p95Ret = ret['p(95)'] || 0;
    const errRate = (err.rate !== undefined ? err.rate : 0) * 100;
    const passed = p95Ret < 100 && errRate < 1.0;

    k6Metrics = {
      total_requests: reqs.count || 0,
      throughput_rps: round2(reqs.rate || 0),
      retrieval_latency_ms: {
        min: round1(ret.min || 0),
        p50: round1(ret['p(50)'] || ret.med || 0),
        p90: round1(ret['p(90)'] || 0),
        p95: round1(p95Ret),
        p99: round1(ret['p(99)'] || 0),
        max: round1(ret.max || 0),
      },
      stream_duration_ms: {
        p50: round1(stream['p(50)'] || stream.med || 0),
        p90: round1(stream['p(90)'] || 0),
        p95: round1(stream['p(95)'] || 0),
        p99: round1(stream['p(99)'] || 0),
      },
      tokens_received: tokens,
      error_rate_pct: round2(errRate),
      quota_error_rate_pct: round2((quota.rate !== undefined ? quota.rate : 0) * 100),
      slo_status: passed ? 'PASS' : 'FAIL',
    };
  }
}

// ============================================================================
// 3. Parse TTFT Probe Summary (Harmonized with Remediated Probe Schema)
// ============================================================================
const ttftRaw = safeReadJson(ttftJsonPath);
let ttftMetrics = {
  total_requests: 0,
  concurrency_vus: 0,
  successful_requests: 0,
  failed_requests: 0,
  quota_throttled_requests: 0,
  unthrottled_live_requests: 0,
  tokens_received_total: 0,
  ttft_ms: { p50: 0, p90: 0, p95: 0, p99: 0 },
  ttft_unthrottled_ms: null,
  ttft_quota_fallback_ms: null,
  ttfb_ms: { p50: 0, p95: 0 },
  retrieval_latency_ms: { p50: 0, p95: 0 },
  stream_duration_ms: { p50: 0, p95: 0 },
  slo_status: 'FAIL',
};

if (ttftRaw && ttftRaw.metrics && ttftRaw.slo) {
  const m = ttftRaw.metrics;
  const slo = ttftRaw.slo;
  ttftMetrics = {
    total_requests: ttftRaw.total_requests || 0,
    concurrency_vus: ttftRaw.concurrency_vus || 0,
    successful_requests: m.successful_requests || 0,
    failed_requests: m.failed_requests || 0,
    quota_throttled_requests: m.quota_throttled_requests || 0,
    unthrottled_live_requests: m.unthrottled_live_requests !== undefined
      ? m.unthrottled_live_requests
      : Math.max(0, (ttftRaw.total_requests || 0) - (m.quota_throttled_requests || 0)),
    tokens_received_total: m.tokens_received_total || 0,
    ttft_ms: m.ttft_ms || {},
    ttft_unthrottled_ms: m.ttft_unthrottled_ms || null,
    ttft_quota_fallback_ms: m.ttft_quota_fallback_ms || null,
    ttfb_ms: m.ttfb_ms || {},
    retrieval_latency_ms: m.retrieval_latency_ms || {},
    stream_duration_ms: m.stream_duration_ms || {},
    slo_status: slo.verdict || 'FAIL',
  };
}

// ============================================================================
// 4. Parse Rate Limit Check Summary
// ============================================================================
const rateLimitRaw = safeReadJson(rateLimitJsonPath);
let rateLimitMetrics = {
  total_requests: 0,
  accepted_count: 0,
  throttled_count: 0,
  requests_1_to_30_allowed: false,
  requests_31_to_35_throttled_429: false,
  retry_after_header_enforced: false,
  rate_limit_message_verified: false,
  route_integration_test_passed: false,
  slo_status: 'FAIL',
};

if (rateLimitRaw && rateLimitRaw.verification_results) {
  const v = rateLimitRaw.verification_results;
  const c = rateLimitRaw.counts || {};
  rateLimitMetrics = {
    total_requests: c.total || 0,
    accepted_count: c.accepted_count || 0,
    throttled_count: c.throttled_count || 0,
    requests_1_to_30_allowed: Boolean(v.requests_1_to_30_allowed),
    requests_31_to_35_throttled_429: Boolean(v.requests_31_to_35_throttled_429),
    retry_after_header_enforced: Boolean(v.retry_after_header_enforced),
    rate_limit_message_verified: Boolean(v.rate_limit_message_verified),
    route_integration_test_passed: Boolean(v.route_integration_test_passed),
    slo_status: v.verdict || 'FAIL',
  };
}

// ============================================================================
// 5. Overall Evaluation (Fail-Closed, Harmonized with ORIGINAL_REQUEST.md)
// ============================================================================
// SLO Targets:
// 1. TTFT P95 < 1200ms (strictly excluding upstream LLM provider quota errors)
// 2. Retrieval Latency P95 < 100ms (worst-case between k6 and TTFT probe)
// 3. Error rate < 1.0% (excluding upstream provider quota errors)
// 4. Rate Limiting Verified (requests 1-30 allowed, 31-35 throttled with 429)

const ttftP95 = ttftRaw?.slo?.ttft_p95_actual_ms ?? ttftMetrics.ttft_ms?.p95 ?? 0;
const ttftPassed = ttftRaw?.slo?.ttft_p95_passed !== undefined
  ? Boolean(ttftRaw.slo.ttft_p95_passed)
  : (ttftP95 > 0 && ttftP95 < 1200);

const k6RetrievalP95 = k6Metrics.retrieval_latency_ms?.p95 || 0;
const probeRetrievalP95 = ttftMetrics.retrieval_latency_ms?.p95 || 0;
const retrievalP95 = Math.max(k6RetrievalP95, probeRetrievalP95);
const retrievalPassed = retrievalP95 > 0 && retrievalP95 < 100;

const errorRatePct = k6Metrics.error_rate_pct;
const probeErrorPassed = ttftRaw?.slo?.error_rate_passed !== undefined
  ? Boolean(ttftRaw.slo.error_rate_passed)
  : (ttftMetrics.failed_requests === 0);
const errorRatePassed = errorRatePct < 1.0 && probeErrorPassed;

const rateLimitPassed = rateLimitMetrics.slo_status === 'PASS';

const overallVerdict = (ttftPassed && retrievalPassed && errorRatePassed && rateLimitPassed) ? 'PASS' : 'FAIL';

// Assemble Final Summary Object
const finalSummary = {
  milestone: 'Milestone 2: Phase 2 Concurrent RAG Retrieval & SSE Streaming Stress',
  generated_at: new Date().toISOString(),
  target_endpoints: {
    rag_stream_proxy: 'POST http://localhost:3334/api/roadmap-assistant/chat/stream',
    rag_backend_upstream: 'POST http://127.0.0.1:8000/chat/stream',
  },
  overall_verdict: overallVerdict,
  slos: {
    ttft_p95: {
      target_ms: 1200,
      actual_ms: ttftP95,
      passed: ttftPassed,
      unthrottled_requests_count: ttftMetrics.unthrottled_live_requests,
      quota_throttled_requests_count: ttftMetrics.quota_throttled_requests,
      quota_note: 'TTFT SLO strictly excludes upstream LLM provider quota errors per ORIGINAL_REQUEST.md',
    },
    retrieval_p95: {
      target_ms: 100,
      actual_ms: retrievalP95,
      k6_actual_ms: k6RetrievalP95,
      ttft_probe_actual_ms: probeRetrievalP95,
      passed: retrievalPassed,
    },
    error_rate: {
      target_percent: 1.0,
      actual_percent: errorRatePct,
      passed: errorRatePassed,
    },
    rate_limiting: {
      visitor_limit: 30,
      window_seconds: 300,
      throttle_status_code: 429,
      passed: rateLimitPassed,
    },
  },
  k6_stress_benchmark: k6Metrics,
  ttft_probe: ttftMetrics,
  rate_limit_verification: rateLimitMetrics,
  process_resources: resourceSummary,
};

fs.mkdirSync(path.dirname(summaryOutPath), { recursive: true });
fs.writeFileSync(summaryOutPath, JSON.stringify(finalSummary, null, 2), 'utf8');

// ============================================================================
// Console Scorecard Output
// ============================================================================
console.log('\n================================================================================');
console.log('              PHASE 2 CONSOLIDATED LOAD TEST SCORECARD');
console.log('================================================================================');
console.log(`Generated At         : ${finalSummary.generated_at}`);
console.log(`Overall Verdict      : [${finalSummary.overall_verdict}]`);
console.log('--------------------------------------------------------------------------------');
console.log('1. Time To First Token (TTFT) (20 Concurrent VUs, Excluding Upstream Quota 429):');
console.log(`   - Live LLM Streams: ${ttftMetrics.unthrottled_live_requests} / ${ttftMetrics.total_requests}`);
console.log(`   - P50 (Median)    : ${ttftMetrics.ttft_ms?.p50 ?? 'N/A'} ms`);
console.log(`   - P90             : ${ttftMetrics.ttft_ms?.p90 ?? 'N/A'} ms`);
console.log(`   - P95             : ${ttftP95} ms (Target < 1200 ms) -> [${ttftPassed ? 'PASS' : 'FAIL'}]`);
console.log(`   - P99             : ${ttftMetrics.ttft_ms?.p99 ?? 'N/A'} ms`);
console.log(`   - Total Tokens    : ${ttftMetrics.tokens_received_total}`);
if (ttftMetrics.quota_throttled_requests > 0 && ttftMetrics.ttft_quota_fallback_ms) {
  console.log(`   - Quota Fallbacks : ${ttftMetrics.quota_throttled_requests} streams (P50: ${ttftMetrics.ttft_quota_fallback_ms.p50}ms, P95: ${ttftMetrics.ttft_quota_fallback_ms.p95}ms)`);
}
console.log('--------------------------------------------------------------------------------');
console.log('2. RAG Hybrid Retrieval Latency (BM25 FTS5 + Vector Cosine):');
console.log(`   - k6 Load Test P95: ${k6RetrievalP95} ms`);
console.log(`   - TTFT Probe P95  : ${probeRetrievalP95} ms`);
console.log(`   - Consolidated P95: ${retrievalP95} ms (Target < 100 ms) -> [${retrievalPassed ? 'PASS' : 'FAIL'}]`);
console.log('--------------------------------------------------------------------------------');
console.log('3. Reliability & Throughput:');
console.log(`   - Total Requests  : ${k6Metrics.total_requests}`);
console.log(`   - Throughput      : ${k6Metrics.throughput_rps} req/s`);
console.log(`   - Quota Throttled : ${k6Metrics.quota_error_rate_pct}% (upstream LLM 429 / fallback)`);
console.log(`   - Error Rate      : ${errorRatePct}% (Target < 1.0%) -> [${errorRatePassed ? 'PASS' : 'FAIL'}]`);
console.log('--------------------------------------------------------------------------------');
console.log('4. Visitor Rate Limiter & Security Evaluation:');
console.log(`   - Requests 1 - 30 : ${rateLimitMetrics.accepted_count} Accepted (HTTP 200)`);
console.log(`   - Requests 31 - 35: ${rateLimitMetrics.throttled_count} Throttled (HTTP 429)`);
console.log(`   - Retry-After Hdr : ${rateLimitMetrics.retry_after_header_enforced ? 'Enforced' : 'Missing'}`);
console.log(`   - Route Contract  : ${rateLimitMetrics.route_integration_test_passed ? 'Verified' : 'Unverified'}`);
console.log(`   - Limiter Verdict : [${rateLimitMetrics.slo_status}]`);
console.log('--------------------------------------------------------------------------------');
console.log('5. Process Resource Utilization:');
for (const [pid, res] of Object.entries(resourceSummary)) {
  console.log(`   - PID ${pid}: Baseline RSS: ${res.baseline_rss_mb} MB | Peak RSS: ${res.peak_rss_mb} MB (Delta: +${res.delta_rss_mb} MB) | Final RSS: ${res.cooldown_rss_mb} MB`);
  console.log(`     Overall CPU -> Peak: ${res.peak_cpu_pct}% | Avg (All): ${res.avg_cpu_pct}% | Avg (Active Load): ${res.active_avg_cpu_pct}%`);
  if (res.phases && Object.keys(res.phases).length > 0) {
    console.log('     Phase Resource Breakdown:');
    for (const [pName, pStats] of Object.entries(res.phases)) {
      console.log(`       * ${pName.padEnd(16)}: Avg CPU: ${(pStats.avg_cpu_pct + '%').padStart(6)} | Peak CPU: ${(pStats.peak_cpu_pct + '%').padStart(6)} | Peak RSS: ${pStats.peak_rss_mb} MB (Delta: +${pStats.delta_rss_mb} MB)`);
    }
  }
}
console.log('================================================================================\n');
console.log(`Consolidated scorecard saved to: ${summaryOutPath}`);

if (overallVerdict !== 'PASS') {
  console.error(`\n[FAIL] Phase 2 load test failed: overall_verdict is ${overallVerdict}`);
  process.exit(1);
}

process.exit(0);
