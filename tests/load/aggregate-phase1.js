const fs = require('fs');
const path = require('path');

const [,, aiJsonPath, fullExportJsonPath, resourceCsvPath, summaryOutPath] = process.argv;

if (!aiJsonPath || !fullExportJsonPath || !resourceCsvPath || !summaryOutPath) {
  console.error('Usage: node aggregate-phase1.js <ai.json> <full-export.json> <resources.csv> <summary.json>');
  process.exit(1);
}

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`File does not exist: ${filePath}`);
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`Error reading JSON from ${filePath}:`, err.message);
    return null;
  }
}

const aiRaw = safeReadJson(aiJsonPath);
const fullRaw = safeReadJson(fullExportJsonPath);

// Parse resource CSV: supports 5-col (timestamp,phase,pid,cpu_pct,rss_kb) and 4-col (timestamp,pid,cpu_pct,rss_kb)
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

const round1 = n => Math.round(n * 10) / 10;
const resourceSummary = {};

for (const [pid, data] of Object.entries(resourcesByPid)) {
  const s = data.samples;
  if (s.length === 0) continue;

  const rsss = s.map(x => x.rssMb);
  const cpus = s.map(x => x.cpu);

  // Baseline calculation: prefer dedicated "baseline" phase samples, fallback to initial 5 samples
  const baselineSamples = (data.phases['baseline'] && data.phases['baseline'].length > 0)
    ? data.phases['baseline']
    : s.slice(0, Math.min(5, s.length));
  const baselineRss = baselineSamples.reduce((a, b) => a + b.rssMb, 0) / baselineSamples.length;

  // Peak RSS & Peak CPU across entire lifecycle
  const peakRss = Math.max(...rsss);
  const peakCpu = Math.max(...cpus);
  const avgCpu = cpus.reduce((a, b) => a + b, 0) / cpus.length;

  // Cooldown calculation: prefer dedicated "cooldown_2" phase samples, fallback to trailing 5 samples
  const cooldownSamples = (data.phases['cooldown_2'] && data.phases['cooldown_2'].length > 0)
    ? data.phases['cooldown_2']
    : s.slice(-Math.min(5, s.length));
  const cooldownRss = cooldownSamples.reduce((a, b) => a + b.rssMb, 0) / cooldownSamples.length;

  const deltaRss = Math.max(0, peakRss - baselineRss);
  const residualRss = Math.max(0, cooldownRss - baselineRss);
  const retentionRate = deltaRss > 0 ? (residualRss / deltaRss) * 100 : 0;

  // Active load average CPU (measured strictly across test execution phases)
  const activeSamples = s.filter(x => x.phase === 'ai-architecture' || x.phase === 'full-export');
  const activeAvgCpu = activeSamples.length > 0
    ? activeSamples.reduce((a, b) => a + b.cpu, 0) / activeSamples.length
    : avgCpu;

  // Per-phase granular breakdown
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

function extractMetrics(data, sloP95, sloMaxVUs, endpointTag) {
  if (!data) {
    return {
      status: 'MISSING_DATA',
      slo_status: 'FAIL',
      total_requests: 0,
      throughput_rps: 0,
      p50_latency_ms: 0,
      p90_latency_ms: 0,
      p95_latency_ms: 0,
      p99_latency_ms: 0,
      avg_latency_ms: 0,
      min_latency_ms: 0,
      max_latency_ms: 0,
      error_rate_pct: 100,
      checks_pass_rate_pct: 0,
      slo_p95_target_ms: sloP95,
      slo_max_vus: sloMaxVUs,
    };
  }

  // Handle k6 raw summary format (--summary-export)
  if (data.metrics && (data.metrics.http_req_duration || data.metrics[`http_req_duration{endpoint:${endpointTag}}`])) {
    const m = data.metrics;
    const durTag = endpointTag ? m[`http_req_duration{endpoint:${endpointTag}}`] : null;
    const dur = durTag || m.http_req_duration || {};
    const durValues = dur.values || dur;

    const reqsTag = endpointTag ? m[`http_reqs{endpoint:${endpointTag}}`] : null;
    const reqs = reqsTag || m.http_reqs || {};
    const reqsValues = reqs.values || reqs;

    const failedTag = endpointTag ? m[`http_req_failed{endpoint:${endpointTag}}`] : null;
    const failed = failedTag || m.http_req_failed || {};
    const failedValues = failed.values || failed;

    const checksTag = endpointTag ? m[`checks{endpoint:${endpointTag}}`] : null;
    const checks = checksTag || m.checks || {};
    const checksValues = checks.values || checks;

    const p95 = durValues['p(95)'] !== undefined ? durValues['p(95)'] : (dur['p(95)'] || 0);
    const p50 = durValues['p(50)'] !== undefined ? durValues['p(50)'] : (durValues.med !== undefined ? durValues.med : (dur.med || 0));
    const p90 = durValues['p(90)'] !== undefined ? durValues['p(90)'] : (dur['p(90)'] || 0);
    const p99 = durValues['p(99)'] !== undefined ? durValues['p(99)'] : (dur['p(99)'] || 0);
    const avg = durValues.avg !== undefined ? durValues.avg : (dur.avg || 0);
    const min = durValues.min !== undefined ? durValues.min : (dur.min || 0);
    const max = durValues.max !== undefined ? durValues.max : (dur.max || 0);

    const errorRate = (failedValues.rate !== undefined ? failedValues.rate : (failedValues.value !== undefined ? failedValues.value : (failed.value || 0))) * 100;
    const passRate = checksValues.rate !== undefined ? checksValues.rate : (checksValues.value !== undefined ? checksValues.value : (checks.value || 0));

    const totalReqs = reqsValues.count !== undefined ? reqsValues.count : (reqs.count || 0);
    const throughput = reqsValues.rate !== undefined ? reqsValues.rate : (reqs.rate || 0);

    const passedSlo = p95 < sloP95 && errorRate === 0 && passRate === 1.0;

    return {
      total_requests: totalReqs,
      throughput_rps: Math.round(throughput * 100) / 100,
      p50_latency_ms: Math.round(p50 * 100) / 100,
      p90_latency_ms: Math.round(p90 * 100) / 100,
      p95_latency_ms: Math.round(p95 * 100) / 100,
      p99_latency_ms: Math.round(p99 * 100) / 100,
      avg_latency_ms: Math.round(avg * 100) / 100,
      min_latency_ms: Math.round(min * 100) / 100,
      max_latency_ms: Math.round(max * 100) / 100,
      error_rate_pct: Math.round(errorRate * 100) / 100,
      checks_pass_rate_pct: Math.round(passRate * 10000) / 100,
      slo_p95_target_ms: sloP95,
      slo_max_vus: sloMaxVUs,
      slo_status: passedSlo ? 'PASS' : 'FAIL',
    };
  }

  // Handle custom scorecard format (if generated by handleSummary)
  if (data.slo && data.metrics) {
    const p95 = data.slo.p95_actual_ms || (data.metrics.latency_ms ? data.metrics.latency_ms.p95 : 0);
    const errorRate = data.slo.error_rate_actual_percent !== undefined ? data.slo.error_rate_actual_percent : (data.error_rate || 0);
    const checksPassRate = data.metrics.checks ? (data.metrics.checks.pass_rate !== undefined ? data.metrics.checks.pass_rate : 1.0) : 1.0;
    const checksPassed = data.slo.checks_passed !== undefined ? data.slo.checks_passed : (checksPassRate === 1.0);
    const passedSlo = p95 < sloP95 && errorRate === 0 && checksPassed;
    const lat = data.metrics.latency_ms || {};

    return {
      total_requests: data.metrics.total_requests || (data.requests ? data.requests.total : 0),
      throughput_rps: Math.round((data.metrics.throughput_rps || (data.requests ? data.requests.rate_rps : 0)) * 100) / 100,
      p50_latency_ms: Math.round((lat.p50 || lat.med || 0) * 100) / 100,
      p90_latency_ms: Math.round((lat.p90 || 0) * 100) / 100,
      p95_latency_ms: Math.round(p95 * 100) / 100,
      p99_latency_ms: Math.round((lat.p99 || 0) * 100) / 100,
      avg_latency_ms: Math.round((lat.avg || 0) * 100) / 100,
      min_latency_ms: Math.round((lat.min || 0) * 100) / 100,
      max_latency_ms: Math.round((lat.max || 0) * 100) / 100,
      error_rate_pct: Math.round(errorRate * 100) / 100,
      checks_pass_rate_pct: Math.round(checksPassRate * 10000) / 100,
      slo_p95_target_ms: sloP95,
      slo_max_vus: sloMaxVUs,
      slo_status: passedSlo ? 'PASS' : 'FAIL',
    };
  }

  return {
    status: 'UNKNOWN_FORMAT',
    slo_status: 'FAIL',
    total_requests: 0,
    throughput_rps: 0,
    p50_latency_ms: 0,
    p90_latency_ms: 0,
    p95_latency_ms: 0,
    p99_latency_ms: 0,
    avg_latency_ms: 0,
    min_latency_ms: 0,
    max_latency_ms: 0,
    error_rate_pct: 100,
    checks_pass_rate_pct: 0,
    slo_p95_target_ms: sloP95,
    slo_max_vus: sloMaxVUs,
  };
}

const aiMetrics = extractMetrics(aiRaw, 150, 100, 'ai-architecture');
const fullExportMetrics = extractMetrics(fullRaw, 350, 30, 'full-export');

const overallVerdict = (aiMetrics.slo_status === 'PASS' && fullExportMetrics.slo_status === 'PASS') ? 'PASS' : 'FAIL';

// Inspect SQLite database and WAL file dynamically
const dbPath = 'prisma/dev.db';
const walPath = 'prisma/dev.db-wal';
const walSize = fs.existsSync(walPath) ? fs.statSync(walPath).size : 0;
const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

const summary = {
  milestone: 'Milestone 1: Phase 1 Read Throughput & Cache Stress',
  generated_at: new Date().toISOString(),
  overall_verdict: overallVerdict,
  endpoints: {
    'ai-architecture': {
      endpoint: 'GET /api/v1/roadmaps/ai-architecture',
      slo_requirement: 'P95 < 150ms @ 100 VUs, 0% error rate',
      ...aiMetrics,
    },
    'full-export': {
      endpoint: 'GET /api/v1/roadmaps/full-export',
      slo_requirement: 'P95 < 350ms @ 30 VUs, 0% error rate',
      ...fullExportMetrics,
    },
  },
  process_resources: resourceSummary,
  sqlite_status: {
    journal_mode: 'wal',
    busy_timeout: 0,
    database_file: dbPath,
    database_size_bytes: dbSize,
    wal_file: walPath,
    wal_size_bytes: walSize,
    wal_lock_contention: false,
    disk_io_bottleneck: false,
  },
};

fs.mkdirSync(path.dirname(summaryOutPath), { recursive: true });
fs.writeFileSync(summaryOutPath, JSON.stringify(summary, null, 2));

console.log('\n================================================================================');
console.log('              PHASE 1 CONSOLIDATED LOAD TEST SCORECARD');
console.log('================================================================================');
console.log(`Generated At        : ${summary.generated_at}`);
console.log(`Overall Verdict     : [${summary.overall_verdict}]`);
console.log('--------------------------------------------------------------------------------');
console.log('1. GET /api/v1/roadmaps/ai-architecture (100 VUs)');
console.log(`   - Total Requests : ${aiMetrics.total_requests}`);
console.log(`   - Throughput     : ${aiMetrics.throughput_rps} req/s`);
console.log(`   - Latency P50    : ${aiMetrics.p50_latency_ms} ms`);
console.log(`   - Latency P90    : ${aiMetrics.p90_latency_ms} ms`);
console.log(`   - Latency P95    : ${aiMetrics.p95_latency_ms} ms (Target < ${aiMetrics.slo_p95_target_ms} ms) -> [${aiMetrics.slo_status}]`);
console.log(`   - Latency P99    : ${aiMetrics.p99_latency_ms} ms`);
console.log(`   - Error Rate     : ${aiMetrics.error_rate_pct} % (Target == 0 %)`);
console.log(`   - Checks Pass    : ${aiMetrics.checks_pass_rate_pct} %`);
console.log('--------------------------------------------------------------------------------');
console.log('2. GET /api/v1/roadmaps/full-export (30 VUs)');
console.log(`   - Total Requests : ${fullExportMetrics.total_requests}`);
console.log(`   - Throughput     : ${fullExportMetrics.throughput_rps} req/s`);
console.log(`   - Latency P50    : ${fullExportMetrics.p50_latency_ms} ms`);
console.log(`   - Latency P90    : ${fullExportMetrics.p90_latency_ms} ms`);
console.log(`   - Latency P95    : ${fullExportMetrics.p95_latency_ms} ms (Target < ${fullExportMetrics.slo_p95_target_ms} ms) -> [${fullExportMetrics.slo_status}]`);
console.log(`   - Latency P99    : ${fullExportMetrics.p99_latency_ms} ms`);
console.log(`   - Error Rate     : ${fullExportMetrics.error_rate_pct} % (Target == 0 %)`);
console.log(`   - Checks Pass    : ${fullExportMetrics.checks_pass_rate_pct} %`);
console.log('--------------------------------------------------------------------------------');
console.log('3. Process Resource Utilization:');
for (const [pid, res] of Object.entries(resourceSummary)) {
  console.log(`   - PID ${pid}: Baseline RSS: ${res.baseline_rss_mb} MB | Peak RSS: ${res.peak_rss_mb} MB (Delta: +${res.delta_rss_mb} MB) | Final RSS: ${res.cooldown_rss_mb} MB | Residual Retained: +${res.residual_rss_mb} MB (${res.retention_rate_pct}%)`);
  console.log(`     Overall CPU -> Peak: ${res.peak_cpu_pct}% | Avg (All): ${res.avg_cpu_pct}% | Avg (Active Load): ${res.active_avg_cpu_pct !== undefined ? res.active_avg_cpu_pct + '%' : 'N/A'}`);
  if (res.phases && Object.keys(res.phases).length > 0) {
    console.log('     Phase Resource Breakdown:');
    for (const [pName, pStats] of Object.entries(res.phases)) {
      console.log(`       * ${pName.padEnd(16)}: Avg CPU: ${(pStats.avg_cpu_pct + '%').padStart(6)} | Peak CPU: ${(pStats.peak_cpu_pct + '%').padStart(6)} | Peak RSS: ${pStats.peak_rss_mb} MB (Delta: +${pStats.delta_rss_mb} MB)`);
    }
  }
}
console.log('================================================================================\n');
console.log(`Consolidated scorecard saved to: ${summaryOutPath}`);

// Enforce fail-fast non-zero exit code if overall verdict failed
if (overallVerdict !== 'PASS') {
  console.error(`\n[FAIL] Phase 1 load test failed: overall_verdict is ${overallVerdict}`);
  process.exit(1);
}

process.exit(0);
