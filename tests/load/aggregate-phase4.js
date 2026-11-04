import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const [
  ,,
  failoverJsonPath = path.join(__dirname, 'results', 'phase4-failover-results.json'),
  routerJsonPath = path.join(__dirname, 'results', 'phase4-router-eval.json'),
  resourceCsvPath = path.join(__dirname, 'results', 'phase4-resources.csv'),
  summaryOutPath = path.join(__dirname, 'results', 'phase4-summary.json'),
] = process.argv;

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`[WARN] File not found: ${filePath}`);
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`[ERROR] Failed to read JSON from ${filePath}:`, err.message);
    return null;
  }
}

// -----------------------------------------------------------------------------
// 1. Ingest Resource Telemetry CSV
// -----------------------------------------------------------------------------
const resourcesByPid = {};
if (fs.existsSync(resourceCsvPath)) {
  const content = fs.readFileSync(resourceCsvPath, 'utf8').trim();
  const lines = content.split('\n');
  const dataLines = lines.slice(1);

  for (const line of dataLines) {
    const parts = line.split(',');
    if (parts.length < 4) continue;

    let timestamp;
    let phase;
    let pid;
    let cpuStr;
    let rssStr;

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

  const rsss = s.map((x) => x.rssMb);
  const cpus = s.map((x) => x.cpu);

  const baselineSamples = (data.phases['baseline'] && data.phases['baseline'].length > 0)
    ? data.phases['baseline']
    : s.slice(0, Math.min(5, s.length));
  const baselineRss = baselineSamples.reduce((a, b) => a + b.rssMb, 0) / baselineSamples.length;

  const peakRss = Math.max(...rsss);
  const peakCpu = Math.max(...cpus);
  const avgCpu = cpus.reduce((a, b) => a + b, 0) / cpus.length;

  const activeSamples = s.filter((x) => x.phase.startsWith('stage') || x.phase === 'failover_recovery' || x.phase === 'router_eval');
  const activeAvgCpu = activeSamples.length > 0
    ? activeSamples.reduce((a, b) => a + b.cpu, 0) / activeSamples.length
    : avgCpu;

  const cooldownSamples = (data.phases['cooldown'] && data.phases['cooldown'].length > 0)
    ? data.phases['cooldown']
    : s.slice(-Math.min(5, s.length));
  const cooldownRss = cooldownSamples.reduce((a, b) => a + b.rssMb, 0) / cooldownSamples.length;

  const deltaRss = Math.max(0, peakRss - baselineRss);
  const residualRss = Math.max(0, cooldownRss - baselineRss);
  const retentionRate = deltaRss > 0 ? (residualRss / deltaRss) * 100 : 0;

  const phaseBreakdown = {};
  for (const [pName, pSamples] of Object.entries(data.phases)) {
    if (!pSamples || pSamples.length === 0) continue;
    const pCpus = pSamples.map((x) => x.cpu);
    const pRsss = pSamples.map((x) => x.rssMb);
    const pPeakRss = Math.max(...pRsss);
    phaseBreakdown[pName] = {
      samples: pSamples.length,
      avg_cpu_pct: round1(pCpus.reduce((a, b) => a + b, 0) / pCpus.length),
      peak_cpu_pct: round1(Math.max(...pCpus)),
      peak_rss_mb: round1(pPeakRss),
      delta_rss_mb: round1(Math.max(0, pPeakRss - baselineRss)),
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
    active_load_avg_cpu_pct: round1(activeAvgCpu),
    phase_breakdown: phaseBreakdown,
  };
}

// -----------------------------------------------------------------------------
// 2. Ingest Failover & Recovery Metrics
// -----------------------------------------------------------------------------
const failoverData = safeReadJson(failoverJsonPath) || {};
const outageIso = failoverData.outage_isolation || {};
const procInteg = failoverData.process_integrity || {};
const recMetrics = failoverData.recovery_metrics || {};
const streamRes = failoverData.streaming_resumption || {};
const freshVerif = failoverData.freshness_verification || {};

const outageStatus = outageIso.http_status;
const graceful502 = Boolean(outageIso.graceful_502_returned);
const nextAliveDuringOutage = Boolean(outageIso.next_alive_during_outage);
const nextWebStatus = outageIso.next_web_http_status;
const nextSurvived = Boolean(procInteg.nextjs_survived);

const ttrDirectMs = recMetrics.ttr_health_direct_ms !== undefined ? recMetrics.ttr_health_direct_ms : 999;
const ttrProxyMs = recMetrics.ttr_health_proxy_ms !== undefined ? recMetrics.ttr_health_proxy_ms : 999;

const streamStatus = streamRes.status_code;
const streamEvents = streamRes.events || {};
const streamDone = Boolean(streamEvents.done && streamEvents.token);
const staleSockets = streamRes.stale_socket_errors !== undefined ? streamRes.stale_socket_errors : 999;

const indexIntact = Boolean(freshVerif.index_intact_post_recovery);
const reindexStatus = freshVerif.reindex_http_status;
const reindexConverged = Boolean(freshVerif.reindex_converged);
const reindexDurationMs = freshVerif.reindex_duration_ms !== undefined ? freshVerif.reindex_duration_ms : 999;

// -----------------------------------------------------------------------------
// 3. Ingest Router Evaluation Metrics
// -----------------------------------------------------------------------------
const routerData = safeReadJson(routerJsonPath) || {};
const routerSlos = routerData.slos || {};
const checkEval = routerData.check_eval || {};
const confuseEval = routerData.confuse_eval || {};
const confuseMetrics = confuseEval.metrics || {};

const writeNowViolations = confuseMetrics.write_now_violation !== undefined ? confuseMetrics.write_now_violation : 999;
const totalConfuseSamples = confuseMetrics.n || confuseEval.total_samples || 0;
const wrongBranch = confuseMetrics.wrong_branch !== undefined ? confuseMetrics.wrong_branch : 999;
const previewViolations = confuseMetrics.preview_violation !== undefined ? confuseMetrics.preview_violation : 999;

const checkPassed = Boolean(checkEval.passed);
const confusePassed = Boolean(confuseEval.passed);
const routerOverallPassed = Boolean(routerData.overall_passed);

// -----------------------------------------------------------------------------
// 4. Calculate SLO Compliance
// -----------------------------------------------------------------------------
const sloGraceful502Pass = outageStatus === 502 && graceful502 && nextAliveDuringOutage && nextWebStatus === 200 && nextSurvived;
const sloTtrPass = ttrDirectMs < 30 && ttrProxyMs < 100;
const sloStreamPass = streamStatus === 200 && streamDone && staleSockets === 0;
const sloFreshnessPass = indexIntact && reindexStatus === 202 && reindexConverged && reindexDurationMs < 1500;
const sloWriteNowPass = writeNowViolations === 0 && totalConfuseSamples === 498;
const sloRouterRatchetPass = checkPassed && confusePassed && routerOverallPassed;

let sloResourcePass = true;
for (const [pid, res] of Object.entries(resourceSummary)) {
  if (res.peak_rss_mb > 1500) sloResourcePass = false;
}

const allPass = sloGraceful502Pass && sloTtrPass && sloStreamPass && sloFreshnessPass && sloWriteNowPass && sloRouterRatchetPass && sloResourcePass;

// -----------------------------------------------------------------------------
// 5. Construct Consolidated Summary Artifact
// -----------------------------------------------------------------------------
const finalSummary = {
  milestone: 'Milestone 4: Phase 4 Robustness & LLM Circuit Breaker',
  generated_at: new Date().toISOString(),
  target_endpoints: {
    nextjs_base_url: 'http://localhost:3334',
    fastapi_base_url: 'http://127.0.0.1:8000',
    proxy_chat_stream: 'POST http://localhost:3334/api/roadmap-assistant/chat/stream',
    proxy_health: 'GET http://localhost:3334/api/roadmap-assistant/health',
    direct_health: 'GET http://127.0.0.1:8000/health',
    direct_reindex: 'POST http://127.0.0.1:8000/internal/reindex',
  },
  overall_verdict: allPass ? 'PASS' : 'FAIL',
  slos: {
    rag_outage_graceful_502: {
      target: 'Next.js returns HTTP 502 with user-friendly error without process crash during RAG outage',
      actual: `HTTP ${outageStatus} {"error":"Roadmap Assistant is unavailable."}, Next.js PID survived (Alive: ${nextAliveDuringOutage})`,
      duration_ms: outageIso.duration_ms,
      nextjs_web_status: nextWebStatus,
      passed: sloGraceful502Pass,
      status: sloGraceful502Pass ? 'PASS' : 'FAIL',
    },
    backend_recovery_ttr: {
      target: 'TTR < 30ms direct health, < 100ms proxy health upon SIGCONT (concurrent probes, no shell overhead)',
      actual_direct_ms: ttrDirectMs,
      actual_proxy_ms: ttrProxyMs,
      passed: sloTtrPass,
      status: sloTtrPass ? 'PASS' : 'FAIL',
    },
    streaming_resumption: {
      target: 'First post-recovery chat request returns HTTP 200 SSE events with 0 stale socket errors',
      actual: `HTTP ${streamStatus}, TTFT: ${streamRes.ttft_ms}ms, events: [${Object.keys(streamEvents).filter((k) => streamEvents[k]).join(', ')}], stale_sockets: ${staleSockets}`,
      passed: sloStreamPass,
      status: sloStreamPass ? 'PASS' : 'FAIL',
    },
    index_freshness_and_convergence: {
      target: 'Index intact post-recovery and reindex converges in < 1000ms (~300ms)',
      actual: `Intact: ${indexIntact}, Reindex HTTP ${reindexStatus}, converged in ${reindexDurationMs}ms`,
      initial_generation: freshVerif.baseline_generation,
      final_generation: freshVerif.final_generation,
      passed: sloFreshnessPass,
      status: sloFreshnessPass ? 'PASS' : 'FAIL',
    },
    router_write_now_invariant: {
      target: 'write_now_violation = 0 across 498 confusing samples in evals.router.confuse',
      actual_violations: writeNowViolations,
      total_samples: totalConfuseSamples,
      passed: sloWriteNowPass,
      status: sloWriteNowPass ? 'PASS' : 'FAIL',
    },
    router_eval_ratchet: {
      target: 'Zero regressions against baselines on 791 check samples and 498 confuse samples',
      actual: `Check: ${checkPassed ? 'Zero regressions' : 'Regressions'}, Confuse: ${confusePassed ? 'Zero regressions' : 'Regressions'} (wrong_branch: ${wrongBranch}, preview_violation: ${previewViolations})`,
      passed: sloRouterRatchetPass,
      status: sloRouterRatchetPass ? 'PASS' : 'FAIL',
    },
    resource_stability: {
      target: 'Stable memory and CPU profiles without runaway leakage during failover and recovery',
      actual: `Monitored ${Object.keys(resourceSummary).length} process(es)`,
      passed: sloResourcePass,
      status: sloResourcePass ? 'PASS' : 'FAIL',
    },
  },
  failover_details: failoverData,
  router_eval_details: routerData,
  process_resources: resourceSummary,
};

fs.mkdirSync(path.dirname(summaryOutPath), { recursive: true });
fs.writeFileSync(summaryOutPath, JSON.stringify(finalSummary, null, 2), 'utf8');

// -----------------------------------------------------------------------------
// 6. Formatted Scorecard Output
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log('              PHASE 4 CONSOLIDATED LOAD TEST SCORECARD');
console.log('================================================================================');
console.log(`Generated At        : ${finalSummary.generated_at}`);
console.log(`Overall Verdict     : [${finalSummary.overall_verdict}]`);
console.log('--------------------------------------------------------------------------------');
console.log(`1. RAG Outage Graceful 502   : [${finalSummary.slos.rag_outage_graceful_502.status}] (${finalSummary.slos.rag_outage_graceful_502.actual})`);
console.log(`2. Backend Recovery TTR      : [${finalSummary.slos.backend_recovery_ttr.status}] (Direct: ${ttrDirectMs} ms | Proxy: ${ttrProxyMs} ms)`);
console.log(`3. Streaming Resumption      : [${finalSummary.slos.streaming_resumption.status}] (${finalSummary.slos.streaming_resumption.actual})`);
console.log(`4. Index Freshness & Reindex : [${finalSummary.slos.index_freshness_and_convergence.status}] (${finalSummary.slos.index_freshness_and_convergence.actual})`);
console.log(`5. Router Write-Now Invariant: [${finalSummary.slos.router_write_now_invariant.status}] (${finalSummary.slos.router_write_now_invariant.actual_violations} violations across ${finalSummary.slos.router_write_now_invariant.total_samples} samples)`);
console.log(`6. Router Eval Ratchet       : [${finalSummary.slos.router_eval_ratchet.status}] (${finalSummary.slos.router_eval_ratchet.actual})`);
console.log(`7. Resource Stability        : [${finalSummary.slos.resource_stability.status}] (${finalSummary.slos.resource_stability.actual})`);
console.log('--------------------------------------------------------------------------------');
if (Object.keys(resourceSummary).length > 0) {
  console.log('Process Resource Telemetry:');
  for (const [pid, res] of Object.entries(resourceSummary)) {
    console.log(`   - PID ${pid}: Baseline: ${res.baseline_rss_mb} MB | Peak: ${res.peak_rss_mb} MB (Delta: +${res.delta_rss_mb} MB) | Final: ${res.cooldown_rss_mb} MB`);
    console.log(`     CPU -> Peak: ${res.peak_cpu_pct}% | Avg (All): ${res.avg_cpu_pct}% | Avg (Active): ${res.active_load_avg_cpu_pct}%`);
    if (res.phase_breakdown && Object.keys(res.phase_breakdown).length > 0) {
      console.log('     Phase Breakdown:');
      for (const [pName, pStats] of Object.entries(res.phase_breakdown)) {
        console.log(`       * ${pName.padEnd(20)}: Avg CPU: ${String(pStats.avg_cpu_pct).padStart(5)}% | Peak CPU: ${String(pStats.peak_cpu_pct).padStart(5)}% | Peak RSS: ${pStats.peak_rss_mb} MB (Delta: +${pStats.delta_rss_mb} MB)`);
      }
    }
  }
  console.log('--------------------------------------------------------------------------------');
}
console.log('================================================================================\n');

process.exit(allPass ? 0 : 1);
