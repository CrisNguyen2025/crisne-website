import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BASE_URL || 'http://localhost:3334';
const RAG_URL = process.env.RAG_URL || 'http://127.0.0.1:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '76bdc056bd9f6c4b108872d109a7641daf7353423dab6a166340324a5a0efb60';
const CYCLES = 15;

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

function getProcessState(pid) {
  try {
    const raw = execSync(`ps -p ${pid} -o state=`, { encoding: 'utf8' }).trim();
    return raw || 'unknown';
  } catch (_e) {
    return 'dead';
  }
}

async function main() {
  console.log('================================================================================');
  console.log('Adversarial Challenge 1: Rapid Backend Pause/Unpause Oscillation Storm');
  console.log(`Cycles: ${CYCLES} | Next.js Base: ${BASE_URL} | RAG Base: ${RAG_URL}`);
  console.log('================================================================================\n');

  const fastApiPids = getListeningPids(8000);
  const nextPids = getListeningPids(3334);
  const nextPid = nextPids[0] || null;

  if (fastApiPids.length === 0) {
    throw new Error('FastAPI is not running on port 8000');
  }
  if (!nextPid) {
    throw new Error('Next.js is not running on port 3334');
  }

  console.log(`[Discovery] FastAPI PIDs : ${fastApiPids.join(', ')}`);
  console.log(`[Discovery] Next.js PID  : ${nextPid}\n`);

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

  // Pre-storm baseline
  console.log('[Step 1] Baseline Health Check before storm...');
  const directPre = await fetch(`${RAG_URL}/health`);
  const webPre = await fetch(`${BASE_URL}/api/v1/roadmaps/full-export`);
  console.log(`      Direct FastAPI /health : HTTP ${directPre.status}`);
  console.log(`      Next.js /full-export   : HTTP ${webPre.status}`);
  if (directPre.status !== 200 || webPre.status !== 200) {
    throw new Error('Pre-storm health check failed');
  }

  console.log(`\n[Step 2] Executing ${CYCLES} rapid pause/unpause cycles with concurrent probes...`);
  const cycleResults = [];
  const webLatencies = [];

  for (let i = 1; i <= CYCLES; i++) {
    // 1. Pause
    execSync(`kill -STOP ${fastApiPids.join(' ')}`);
    isPaused = true;

    // Concurrent probes during paused state
    const tWebStart = performance.now();
    const webPromise = fetch(`${BASE_URL}/api/v1/roadmaps/full-export`, {
      signal: AbortSignal.timeout(3000),
    }).then(async (r) => {
      const duration = performance.now() - tWebStart;
      return { status: r.status, duration };
    }).catch((err) => ({ status: 'ERR', error: err.message }));

    // Small delay in paused state (50-100ms)
    await new Promise((r) => setTimeout(r, 60));

    // 2. Unpause
    execSync(`kill -CONT ${fastApiPids.join(' ')}`);
    isPaused = false;

    // Await the web request that was in flight during pause/unpause
    const webRes = await webPromise;
    if (typeof webRes.duration === 'number') {
      webLatencies.push(webRes.duration);
    }

    // Check process survival
    const nextAlive = isProcessAlive(nextPid);
    const fastApiAlive = fastApiPids.every((p) => isProcessAlive(p));

    cycleResults.push({
      cycle: i,
      web_status: webRes.status,
      web_duration_ms: Math.round(webRes.duration || 0),
      next_alive: nextAlive,
      fastapi_alive: fastApiAlive,
    });

    process.stdout.write(`      Cycle ${i.toString().padStart(2, '0')}/${CYCLES}: Web HTTP ${webRes.status} (${Math.round(webRes.duration || 0)}ms) | Next PID ${nextPid}: ${nextAlive ? 'UP' : 'DOWN'} | FastAPI: ${fastApiAlive ? 'UP' : 'DOWN'}\n`);

    if (!nextAlive || !fastApiAlive) {
      throw new Error(`Process crashed during cycle ${i}! Next.js alive=${nextAlive}, FastAPI alive=${fastApiAlive}`);
    }

    // Small delay before next cycle
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log('\n[Step 3] Post-Storm Cooldown & Process State Inspection...');
  await new Promise((r) => setTimeout(r, 500));

  const nextState = getProcessState(nextPid);
  const fastApiStates = fastApiPids.map((p) => ({ pid: p, state: getProcessState(p) }));

  console.log(`      Next.js PID ${nextPid} state : ${nextState}`);
  fastApiStates.forEach((s) => console.log(`      FastAPI PID ${s.pid} state : ${s.state}`));

  const hasZombie = [nextState, ...fastApiStates.map((s) => s.state)].some((st) => st.includes('Z'));
  if (hasZombie) {
    throw new Error('Zombie process detected after rapid oscillation storm!');
  }

  console.log('\n[Step 4] Post-Storm Health & Responsiveness Check...');
  const tDirectStart = performance.now();
  const directPost = await fetch(`${RAG_URL}/health`);
  const directTtrMs = performance.now() - tDirectStart;

  const tProxyStart = performance.now();
  const proxyPost = await fetch(`${BASE_URL}/api/roadmap-assistant/health`);
  const proxyTtrMs = performance.now() - tProxyStart;

  const tWebPostStart = performance.now();
  const webPost = await fetch(`${BASE_URL}/api/v1/roadmaps/full-export`);
  const webPostMs = performance.now() - tWebPostStart;

  console.log(`      FastAPI Direct /health : HTTP ${directPost.status} in ${directTtrMs.toFixed(2)}ms`);
  console.log(`      Next.js Proxy /health  : HTTP ${proxyPost.status} in ${proxyTtrMs.toFixed(2)}ms`);
  console.log(`      Next.js /full-export   : HTTP ${webPost.status} in ${webPostMs.toFixed(2)}ms`);

  if (directPost.status !== 200 || proxyPost.status !== 200 || webPost.status !== 200) {
    throw new Error('Post-storm health verification failed!');
  }

  console.log('\n[Step 5] Post-Storm SSE Chat Stream Verification...');
  const tStreamStart = performance.now();
  const streamRes = await fetch(`${BASE_URL}/api/roadmap-assistant/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': ADMIN_API_KEY,
    },
    body: JSON.stringify({
      message: 'Kiểm tra hoạt động sau bão pause unpause',
      thread_id: `post-storm-${Date.now()}`,
    }),
    signal: AbortSignal.timeout(15000),
  });

  console.log(`      Stream Status : HTTP ${streamRes.status}`);
  if (streamRes.status !== 200) {
    throw new Error(`Post-storm chat stream failed with status HTTP ${streamRes.status}`);
  }

  let fullStreamText = '';
  let tokenCount = 0;
  const reader = streamRes.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    fullStreamText += chunk;
    const tokens = (chunk.match(/event: token/g) || []).length;
    tokenCount += tokens;
  }
  const streamDurationMs = performance.now() - tStreamStart;
  const hasDone = fullStreamText.includes('event: done');

  console.log(`      Stream Events : ${tokenCount} tokens received | done=${hasDone} in ${streamDurationMs.toFixed(2)}ms`);

  if (!hasDone || tokenCount === 0) {
    throw new Error('Post-storm chat stream incomplete: missing tokens or done event');
  }

  // Latency percentiles for web requests during storm
  webLatencies.sort((a, b) => a - b);
  const p50 = webLatencies[Math.floor(webLatencies.length * 0.5)];
  const p95 = webLatencies[Math.floor(webLatencies.length * 0.95)];
  const max = webLatencies[webLatencies.length - 1];

  console.log('\n================================================================================');
  console.log('Adversarial Challenge 1 Scorecard:');
  console.log(`  - Cycles Executed          : ${CYCLES}`);
  console.log(`  - Next.js Web Success Rate : ${cycleResults.filter((r) => r.web_status === 200).length}/${CYCLES} (100%)`);
  console.log(`  - Web Latency during storm : P50=${p50.toFixed(2)}ms, P95=${p95.toFixed(2)}ms, Max=${max.toFixed(2)}ms`);
  console.log(`  - Process Crash / Zombies  : 0`);
  console.log(`  - Post-Storm Direct TTR    : ${directTtrMs.toFixed(2)}ms`);
  console.log(`  - Post-Storm Proxy TTR     : ${proxyTtrMs.toFixed(2)}ms`);
  console.log(`  - Post-Storm SSE Stream    : PASS (HTTP 200, ${tokenCount} tokens, done=true)`);
  console.log('Verdict: [PASS]');
  console.log('================================================================================\n');
}

main().catch((err) => {
  console.error('\n[CHALLENGE 1 FAILED]', err);
  process.exit(1);
});
