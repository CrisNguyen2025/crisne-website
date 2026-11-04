import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BASE_URL || 'http://localhost:3334';
const RAG_URL = process.env.RAG_URL || 'http://127.0.0.1:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '76bdc056bd9f6c4b108872d109a7641daf7353423dab6a166340324a5a0efb60';

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
    const raw = execSync(`ps -p ${pid} -o %cpu=,rss=`, { encoding: 'utf8' }).trim();
    const [cpu, rss] = raw.split(/\s+/);
    return {
      cpu: parseFloat(cpu) || 0,
      rssKb: parseInt(rss, 10) || 0,
    };
  } catch (_e) {
    return null;
  }
}

async function main() {
  console.log('================================================================================');
  console.log('Adversarial Challenge 2: Next.js Web Route Resilience Under Backend Outage');
  console.log('  Testing concurrent hanging proxy requests vs concurrent web queries');
  console.log(`  Base URL: ${BASE_URL} | RAG URL: ${RAG_URL}`);
  console.log('================================================================================\n');

  const fastApiPids = getListeningPids(8000);
  const nextPids = getListeningPids(3334);
  const nextPid = nextPids[0] || null;

  if (fastApiPids.length === 0 || !nextPid) {
    throw new Error('Required services are not running');
  }

  let isPaused = false;
  const ensureCont = () => {
    if (isPaused && fastApiPids.length > 0) {
      console.log('\n[CLEANUP] Safety unpause (kill -CONT)...');
      try {
        execSync(`kill -CONT ${fastApiPids.join(' ')} 2>/dev/null || true`);
      } catch (_e) {}
      isPaused = false;
    }
  };

  process.on('exit', ensureCont);
  process.on('SIGINT', () => { ensureCont(); process.exit(130); });
  process.on('SIGTERM', () => { ensureCont(); process.exit(143); });
  process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION]', err);
    ensureCont();
    process.exit(1);
  });

  const nextBaseline = getProcessMetrics(nextPid);
  console.log(`[Baseline] Next.js PID ${nextPid}: RSS = ${Math.round((nextBaseline?.rssKb || 0) / 1024)} MB`);

  console.log('\n[Stage 1] Inducing Backend Outage (kill -STOP)...');
  execSync(`kill -STOP ${fastApiPids.join(' ')}`);
  isPaused = true;
  await new Promise((r) => setTimeout(r, 200));

  console.log('\n[Stage 2] Launching 15 Concurrent Hanging Proxy Requests (expected to hang for ~5s)...');
  const PROXY_CONCURRENCY = 15;
  const proxyPromises = Array.from({ length: PROXY_CONCURRENCY }).map(async (_, idx) => {
    const tStart = performance.now();
    try {
      const res = await fetch(`${BASE_URL}/api/roadmap-assistant/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': ADMIN_API_KEY,
        },
        body: JSON.stringify({
          message: `Hanging proxy probe #${idx + 1}`,
          thread_id: `hanging-probe-${idx}-${Date.now()}`,
        }),
        signal: AbortSignal.timeout(8000),
      });
      const duration = performance.now() - tStart;
      const text = await res.text();
      return { status: res.status, duration, body: text, error: null };
    } catch (err) {
      const duration = performance.now() - tStart;
      return { status: 'ERR', duration, body: null, error: err.message };
    }
  });

  // Wait 500ms so proxy requests are actively hanging inside fetch / AbortSignal
  await new Promise((r) => setTimeout(r, 500));

  console.log('[Stage 3] Concurrently firing 30 Burst Web Queries (/api/v1/roadmaps/full-export)...');
  const WEB_BURST = 30;
  const webStart = performance.now();
  const webPromises = Array.from({ length: WEB_BURST }).map(async (_, idx) => {
    const tStart = performance.now();
    try {
      const res = await fetch(`${BASE_URL}/api/v1/roadmaps/full-export`, {
        signal: AbortSignal.timeout(5000),
      });
      const duration = performance.now() - tStart;
      return { idx, status: res.status, duration, error: null };
    } catch (err) {
      const duration = performance.now() - tStart;
      return { idx, status: 'ERR', duration, error: err.message };
    }
  });

  const webResults = await Promise.all(webPromises);
  const totalWebTime = performance.now() - webStart;
  console.log(`      Completed all ${WEB_BURST} web queries in ${totalWebTime.toFixed(2)}ms`);

  console.log('\n[Stage 4] Awaiting resolution of the 15 hanging proxy requests (5s timeout)...');
  const proxyResults = await Promise.all(proxyPromises);
  console.log(`      All ${PROXY_CONCURRENCY} proxy requests resolved.`);

  console.log('\n[Stage 5] Resuming FastAPI backend (kill -CONT)...');
  execSync(`kill -CONT ${fastApiPids.join(' ')}`);
  isPaused = false;

  await new Promise((r) => setTimeout(r, 300));

  const nextPostOutage = getProcessMetrics(nextPid);
  const nextAlive = isProcessAlive(nextPid);
  console.log(`      Next.js PID ${nextPid} Alive: ${nextAlive}`);
  console.log(`      Next.js Post-Outage RSS: ${Math.round((nextPostOutage?.rssKb || 0) / 1024)} MB (Delta: +${Math.round(((nextPostOutage?.rssKb || 0) - (nextBaseline?.rssKb || 0)) / 1024)} MB)`);

  // Web Request Analysis
  const webStatuses = webResults.map((r) => r.status);
  const webSuccessCount = webResults.filter((r) => r.status === 200).length;
  const webLatencies = webResults.map((r) => r.duration).sort((a, b) => a - b);
  const webP50 = webLatencies[Math.floor(webLatencies.length * 0.5)];
  const webP95 = webLatencies[Math.floor(webLatencies.length * 0.95)];
  const webMax = webLatencies[webLatencies.length - 1];

  console.log('\n--- Web Route (/api/v1/roadmaps/full-export) Metrics ---');
  console.log(`  Success Rate : ${webSuccessCount}/${WEB_BURST} (${((webSuccessCount / WEB_BURST) * 100).toFixed(1)}%)`);
  console.log(`  Latency P50  : ${webP50.toFixed(2)}ms`);
  console.log(`  Latency P95  : ${webP95.toFixed(2)}ms (Target < 350ms)`);
  console.log(`  Latency Max  : ${webMax.toFixed(2)}ms`);

  // Proxy Request Analysis
  const proxy502Count = proxyResults.filter((r) => r.status === 502).length;
  const proxyDurations = proxyResults.map((r) => r.duration).sort((a, b) => a - b);
  const proxyP50 = proxyDurations[Math.floor(proxyDurations.length * 0.5)];
  const proxyMin = proxyDurations[0];
  const proxyMax = proxyDurations[proxyDurations.length - 1];

  const gracefulBodyMatches = proxyResults.filter((r) => {
    try {
      const parsed = JSON.parse(r.body);
      return parsed.error === 'Roadmap Assistant is unavailable.';
    } catch (_e) {
      return false;
    }
  }).length;

  console.log('\n--- Proxy Route (/api/roadmap-assistant/chat/stream) Metrics ---');
  console.log(`  HTTP 502 Rate : ${proxy502Count}/${PROXY_CONCURRENCY} (${((proxy502Count / PROXY_CONCURRENCY) * 100).toFixed(1)}%)`);
  console.log(`  Graceful Body : ${gracefulBodyMatches}/${PROXY_CONCURRENCY} matched {"error":"Roadmap Assistant is unavailable."}`);
  console.log(`  Timeout Range : min=${proxyMin.toFixed(2)}ms, p50=${proxyP50.toFixed(2)}ms, max=${proxyMax.toFixed(2)}ms`);

  // Assertions
  const passed =
    webSuccessCount === WEB_BURST &&
    webP95 < 350 &&
    proxy502Count === PROXY_CONCURRENCY &&
    gracefulBodyMatches === PROXY_CONCURRENCY &&
    nextAlive;

  console.log('\n================================================================================');
  console.log(`Adversarial Challenge 2 Verdict: [${passed ? 'PASS' : 'FAIL'}]`);
  console.log('================================================================================\n');

  if (!passed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n[CHALLENGE 2 FAILED]', err);
  process.exit(1);
});
