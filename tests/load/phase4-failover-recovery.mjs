import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BASE_URL || 'http://localhost:3334';
const RAG_URL = process.env.RAG_URL || 'http://127.0.0.1:8000';
const INTERNAL_KEY = process.env.INTERNAL_KEY || '0b9d9d6b1bbee6eed442ddec456a3452e96ec1bfb4863341ab20afa5527ad9b8';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '76bdc056bd9f6c4b108872d109a7641daf7353423dab6a166340324a5a0efb60';
const OUTPUT_PATH = process.env.OUTPUT_PATH || path.join(__dirname, 'results', 'phase4-failover-results.json');
const PHASE_FILE = process.env.PHASE_FILE || null;

function setPhase(phaseName) {
  if (PHASE_FILE) {
    try {
      fs.writeFileSync(PHASE_FILE, phaseName, 'utf8');
    } catch (_e) {}
  }
}

function getListeningPids(port) {
  try {
    const raw = execSync(`lsof -ti :${port} -sTCP:LISTEN`, { encoding: 'utf8' }).trim();
    if (!raw) return [];
    return raw.split(/\s+/).map((p) => parseInt(p.trim(), 10)).filter(Boolean);
  } catch (_e) {
    return [];
  }
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (_e) {
    return false;
  }
}

function getProcessMetrics(pid) {
  try {
    const raw = execSync(`ps -p ${pid} -o %cpu=,rss=,state=`, { encoding: 'utf8' }).trim();
    const [cpu, rss, state] = raw.split(/\s+/);
    return {
      cpu: parseFloat(cpu) || 0,
      rssKb: parseInt(rss, 10) || 0,
      state: state || 'unknown',
    };
  } catch (_e) {
    return null;
  }
}

async function fetchSyncState() {
  const res = await fetch(`${RAG_URL}/internal/sync-state`, {
    headers: { 'x-internal-key': INTERNAL_KEY },
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function main() {
  console.log('================================================================================');
  console.log('Phase 4: Robustness & LLM Circuit Breaker — Failover & Recovery Verification');
  console.log(`Target Web Base URL : ${BASE_URL}`);
  console.log(`Target RAG Base URL : ${RAG_URL}`);
  console.log('================================================================================\n');

  const fastApiPids = getListeningPids(8000);
  const nextPids = getListeningPids(3334);
  const nextPid = nextPids[0] || null;

  if (fastApiPids.length === 0) {
    throw new Error('No processes listening on port 8000 (FastAPI is not running)');
  }
  if (!nextPid) {
    throw new Error('No process listening on port 3334 (Next.js is not running)');
  }

  console.log(`[Discovery] Target FastAPI PIDs : ${fastApiPids.join(', ')}`);
  console.log(`[Discovery] Target Next.js PID  : ${nextPid}\n`);

  let isBackendPaused = false;
  const resumeFastApiSafety = () => {
    if (isBackendPaused && fastApiPids.length > 0) {
      console.log(`[SAFETY TRAP] Resuming FastAPI processes via SIGCONT: ${fastApiPids.join(' ')}`);
      try {
        execSync(`kill -CONT ${fastApiPids.join(' ')} 2>/dev/null || true`);
      } catch (_e) {}
      isBackendPaused = false;
    }
  };

  process.on('exit', resumeFastApiSafety);
  process.on('SIGINT', () => { resumeFastApiSafety(); process.exit(130); });
  process.on('SIGTERM', () => { resumeFastApiSafety(); process.exit(143); });
  process.on('SIGHUP', () => { resumeFastApiSafety(); process.exit(129); });
  process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION]', err);
    resumeFastApiSafety();
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED REJECTION]', reason);
    resumeFastApiSafety();
    process.exit(1);
  });

  setPhase('stage1_baseline');
  console.log('[Stage 1/5] Capturing pre-failover baseline health & sync state...');
  const baselineNextMetrics = getProcessMetrics(nextPid);
  const directHealthPre = await fetch(`${RAG_URL}/health`);
  const directHealthPreJson = await directHealthPre.json();
  if (directHealthPre.status !== 200 || directHealthPreJson.status !== 'ok') {
    throw new Error(`FastAPI pre-flight health failed: HTTP ${directHealthPre.status}`);
  }

  const proxyHealthPre = await fetch(`${BASE_URL}/api/roadmap-assistant/health`);
  const proxyHealthPreJson = await proxyHealthPre.json();
  if (proxyHealthPre.status !== 200 || proxyHealthPreJson.status !== 'ok') {
    throw new Error(`Next.js proxy pre-flight health failed: HTTP ${proxyHealthPre.status}`);
  }

  const baseSync = await fetchSyncState();
  console.log(`      Next.js RSS: ${Math.round((baselineNextMetrics?.rssKb || 0) / 1024)} MB | State: ${baselineNextMetrics?.state}`);
  console.log(`      FastAPI Sync State: Gen=${baseSync.data.change_generation}, is_synced=${baseSync.data.is_synced}, is_current=${baseSync.data.is_current}`);

  setPhase('stage2_outage');
  console.log('\n[Stage 2/5] Inducing backend outage via kill -STOP...');
  execSync(`kill -STOP ${fastApiPids.join(' ')}`);
  isBackendPaused = true;
  console.log(`      Sent SIGSTOP to FastAPI PIDs: ${fastApiPids.join(' ')}`);

  await new Promise((r) => setTimeout(r, 200));

  const outageStart = performance.now();
  let outageStatus = null;
  let outageBody = '';
  let graceful502Returned = false;

  try {
    const res = await fetch(`${BASE_URL}/api/roadmap-assistant/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': ADMIN_API_KEY,
      },
      body: JSON.stringify({
        message: 'Outage simulation test query',
        thread_id: `failover-probe-${Date.now()}`,
      }),
      signal: AbortSignal.timeout(8000),
    });
    outageStatus = res.status;
    outageBody = await res.text();
    if (res.status === 502) {
      try {
        const parsed = JSON.parse(outageBody);
        if (parsed.error === 'Roadmap Assistant is unavailable.') {
          graceful502Returned = true;
        }
      } catch (_e) {
        if (outageBody.includes('Roadmap Assistant is unavailable.')) {
          graceful502Returned = true;
        }
      }
    }
  } catch (err) {
    console.log(`      Outage probe client exception: ${err.message}`);
  }

  const outageDurationMs = Math.round(performance.now() - outageStart);
  console.log(`      Outage probe status  : HTTP ${outageStatus || 'Timed Out'} in ${outageDurationMs}ms`);
  console.log(`      Graceful 502 payload : ${graceful502Returned ? 'YES (Verified)' : 'NO'}`);

  const nextAliveDuringOutage = isProcessAlive(nextPid);
  const nextWebRes = await fetch(`${BASE_URL}/api/v1/roadmaps/full-export`);
  console.log(`      Next.js Server PID ${nextPid} Alive: ${nextAliveDuringOutage ? 'YES' : 'NO'}`);
  console.log(`      Next.js Web /full-export Status  : HTTP ${nextWebRes.status}`);

  if (!nextAliveDuringOutage || nextWebRes.status !== 200) {
    resumeFastApiSafety();
    throw new Error('Next.js web process failed or crashed during backend outage!');
  }

  setPhase('stage3_recovery_ttr');
  console.log('\n[Stage 3/5] Resuming FastAPI backend via kill -CONT & measuring TTR (concurrent probes)...');

  await new Promise((resolve, reject) => {
    const killer = spawn('kill', ['-CONT', ...fastApiPids.map(String)]);
    killer.on('error', reject);
    killer.on('close', code => (code === 0 ? resolve() : reject(new Error(`kill -CONT exited ${code}`))));
  });
  const tContStart = performance.now();
  isBackendPaused = false;

  let tDirectEndMs = null;
  let tProxyEndMs = null;

  const directProbe = fetch(`${RAG_URL}/health`).then(r => { tDirectEndMs = performance.now() - tContStart; return r; });
  const proxyProbe = fetch(`${BASE_URL}/api/roadmap-assistant/health`).then(r => { tProxyEndMs = performance.now() - tContStart; return r; });
  const [directHealthRes, proxyHealthRes] = await Promise.all([directProbe, proxyProbe]);

  const ttrHealthDirectMs = tDirectEndMs;
  const ttrHealthProxyMs = tProxyEndMs;

  console.log(`      FastAPI Direct /health: HTTP ${directHealthRes.status} in ${ttrHealthDirectMs.toFixed(2)}ms`);
  console.log(`      Next.js Proxy /health : HTTP ${proxyHealthRes.status} in ${ttrHealthProxyMs.toFixed(2)}ms`);

  const ttrDirectPassed = directHealthRes.status === 200 && ttrHealthDirectMs < 30;
  const ttrProxyPassed = proxyHealthRes.status === 200 && ttrHealthProxyMs < 100;

  setPhase('stage4_stream_resumption');
  console.log('\n[Stage 4/5] Verifying immediate post-recovery chat streaming (HTTP 200 SSE)...');
  const tStreamStart = performance.now();
  let streamStatus = null;
  let ttfbMs = null;
  let ttftMs = null;
  let receivedTrace = false;
  let receivedStep = false;
  let receivedToken = false;
  let receivedDone = false;
  let fullStreamText = '';
  let staleSocketErrors = 0;

  try {
    const streamController = new AbortController();
    const streamTimeoutId = setTimeout(() => streamController.abort(new Error('Stream connect timeout (15s)')), 15000);

    const streamRes = await fetch(`${BASE_URL}/api/roadmap-assistant/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': ADMIN_API_KEY,
      },
      body: JSON.stringify({
        message: 'Kiến trúc RAG là gì?',
        thread_id: `recovery-verify-${Date.now()}`,
      }),
      signal: streamController.signal,
    });

    clearTimeout(streamTimeoutId);

    streamStatus = streamRes.status;
    ttfbMs = performance.now() - tStreamStart;

    if (streamRes.status === 200) {
      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullStreamText += chunk;
        if (ttftMs === null && fullStreamText.includes('event: token')) {
          ttftMs = performance.now() - tStreamStart;
        }
        if (fullStreamText.includes('event: trace')) receivedTrace = true;
        if (fullStreamText.includes('event: step')) receivedStep = true;
        if (fullStreamText.includes('event: token')) receivedToken = true;
        if (fullStreamText.includes('event: done')) receivedDone = true;
      }
    }
  } catch (err) {
    console.error(`      Streaming request failed: ${err.message}`);
    staleSocketErrors++;
  }

  const streamDurationMs = performance.now() - tStreamStart;
  console.log(`      Stream Status : HTTP ${streamStatus} (TTFB: ${ttfbMs ? ttfbMs.toFixed(2) + 'ms' : 'N/A'}, Duration: ${streamDurationMs.toFixed(2)}ms)`);
  console.log(`      TTFT Post-Rec : ${ttftMs ? ttftMs.toFixed(2) + 'ms' : 'N/A'}`);
  console.log(`      Events Seen   : trace=${receivedTrace}, step=${receivedStep}, token=${receivedToken}, done=${receivedDone}`);
  console.log(`      Stale Sockets : ${staleSocketErrors}`);

  setPhase('stage5_reindex_freshness');
  console.log('\n[Stage 5/5] Verifying index freshness and post-recovery reindex convergence...');
  const postSyncState = await fetchSyncState();
  const indexIntact = postSyncState.data.is_synced && postSyncState.data.is_current;
  console.log(`      Index Intact Post-Recovery: ${indexIntact} (gen=${postSyncState.data.indexed_generation})`);

  const tReindexStart = performance.now();
  const reindexRes = await fetch(`${RAG_URL}/internal/reindex`, {
    method: 'POST',
    headers: { 'x-internal-key': INTERNAL_KEY },
  });
  console.log(`      Trigger Reindex: HTTP ${reindexRes.status}`);

  let reindexConverged = false;
  let finalSyncState = null;
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 50));
    const s = await fetchSyncState();
    if (s.data.is_current && !s.data.sync_task_active) {
      reindexConverged = true;
      finalSyncState = s.data;
      break;
    }
  }
  const reindexDurationMs = performance.now() - tReindexStart;
  console.log(`      Reindex Converged: ${reindexConverged} in ${reindexDurationMs.toFixed(2)}ms`);

  const postFailoverNextMetrics = getProcessMetrics(nextPid);
  const nextSurvived = isProcessAlive(nextPid);

  const isGraceful502Pass = outageStatus === 502 && graceful502Returned && nextAliveDuringOutage && nextWebRes.status === 200;
  const isTtrPass = ttrDirectPassed && ttrProxyPassed;
  const isStreamPass = streamStatus === 200 && receivedToken && receivedDone && staleSocketErrors === 0;
  const isFreshnessPass = indexIntact && reindexRes.status === 202 && reindexConverged;
  const overallPassed = isGraceful502Pass && isTtrPass && isStreamPass && isFreshnessPass && nextSurvived;

  const results = {
    test_timestamp: new Date().toISOString(),
    targets: {
      fastapi_pids: fastApiPids,
      next_pid: nextPid,
    },
    pre_flight: {
      direct_health_status: directHealthPre.status,
      proxy_health_status: proxyHealthPre.status,
      initial_sync_state: baseSync.data,
    },
    outage_isolation: {
      failover_signal: 'SIGSTOP',
      http_status: outageStatus,
      response_body: outageBody,
      error_message: 'Roadmap Assistant is unavailable.',
      graceful_502_returned: graceful502Returned,
      duration_ms: outageDurationMs,
      next_alive_during_outage: nextAliveDuringOutage,
      next_web_http_status: nextWebRes.status,
      passed: isGraceful502Pass,
    },
    process_integrity: {
      nextjs_pid: nextPid,
      nextjs_survived: nextSurvived,
      nextjs_state: postFailoverNextMetrics?.state || 'unknown',
      baseline_rss_kb: baselineNextMetrics?.rssKb || 0,
      post_rss_kb: postFailoverNextMetrics?.rssKb || 0,
      rss_delta_kb: (postFailoverNextMetrics?.rssKb || 0) - (baselineNextMetrics?.rssKb || 0),
    },
    recovery_metrics: {
      ttr_health_direct_ms: Math.round(ttrHealthDirectMs * 10) / 10,
      ttr_health_proxy_ms: Math.round(ttrHealthProxyMs * 10) / 10,
      ttr_health_direct_passed: ttrDirectPassed,
      ttr_health_proxy_passed: ttrProxyPassed,
      passed: isTtrPass,
    },
    streaming_resumption: {
      status_code: streamStatus,
      ttfb_ms: ttfbMs ? Math.round(ttfbMs * 10) / 10 : null,
      ttft_ms: ttftMs ? Math.round(ttftMs * 10) / 10 : null,
      stream_duration_ms: Math.round(streamDurationMs * 10) / 10,
      events: {
        trace: receivedTrace,
        step: receivedStep,
        token: receivedToken,
        done: receivedDone,
      },
      stale_socket_errors: staleSocketErrors,
      passed: isStreamPass,
    },
    freshness_verification: {
      index_intact_post_recovery: indexIntact,
      reindex_http_status: reindexRes.status,
      reindex_converged: reindexConverged,
      reindex_duration_ms: Math.round(reindexDurationMs * 10) / 10,
      baseline_generation: baseSync.data.indexed_generation,
      final_generation: finalSyncState?.indexed_generation,
      passed: isFreshnessPass,
    },
    verdict: overallPassed ? 'PASS' : 'FAIL',
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2), 'utf8');

  console.log(`\nResults written to: ${OUTPUT_PATH}`);
  console.log(`Phase 4 Failover & Recovery Verdict: [${results.verdict}]`);

  if (!overallPassed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
