import http from 'node:http';

const RAG_URL = 'http://127.0.0.1:8000';
const INTERNAL_KEY = '0b9d9d6b1bbee6eed442ddec456a3452e96ec1bfb4863341ab20afa5527ad9b8';

async function fetchSyncState(headers = {}) {
  const t0 = performance.now();
  const res = await fetch(`${RAG_URL}/internal/sync-state`, {
    headers: { 'x-internal-key': INTERNAL_KEY, ...headers },
  });
  const t1 = performance.now();
  const data = await res.json();
  return { status: res.status, latency: t1 - t0, data };
}

async function triggerReindex() {
  const t0 = performance.now();
  const res = await fetch(`${RAG_URL}/internal/reindex`, {
    method: 'POST',
    headers: { 'x-internal-key': INTERNAL_KEY },
  });
  const t1 = performance.now();
  return { status: res.status, latency: t1 - t0 };
}

async function main() {
  console.log('================================================================================');
  console.log('[Challenger] Adversarial Probe: /internal/sync-state Concurrency & Race Tests');
  console.log('================================================================================\n');

  // Test 1: Baseline inspection
  console.log('[Test 1] Inspecting baseline sync state...');
  const baseline = await fetchSyncState();
  console.log('Baseline Response:', JSON.stringify(baseline, null, 2));
  if (baseline.status !== 200) {
    throw new Error(`Baseline failed with status ${baseline.status}`);
  }

  // Test 2: High Concurrency Read Burst (100 parallel requests)
  console.log('\n[Test 2] High Concurrency: 100 simultaneous requests to /internal/sync-state...');
  const tStart2 = performance.now();
  const burst100 = await Promise.all(
    Array.from({ length: 100 }, (_, i) => fetchSyncState())
  );
  const tEnd2 = performance.now();

  const success2 = burst100.filter(r => r.status === 200).length;
  const latencies2 = burst100.map(r => r.latency);
  const avgLat2 = (latencies2.reduce((a, b) => a + b, 0) / latencies2.length).toFixed(2);
  const maxLat2 = Math.max(...latencies2).toFixed(2);
  const minLat2 = Math.min(...latencies2).toFixed(2);

  console.log(`Results: ${success2}/100 HTTP 200 responses in ${(tEnd2 - tStart2).toFixed(2)}ms`);
  console.log(`Latency: Min=${minLat2}ms, Avg=${avgLat2}ms, Max=${maxLat2}ms`);
  if (success2 !== 100) {
    throw new Error(`Failed Test 2: only ${success2}/100 succeeded`);
  }

  // Test 3: Race Condition Stress: 100 sync-state reads during 20 rapid reindex bursts
  console.log('\n[Test 3] Race Condition Stress: 100 sync-state reads concurrent with 20 reindex bursts...');
  const reindexPromises = Array.from({ length: 20 }, () => triggerReindex());
  const statePromises = Array.from({ length: 100 }, () => fetchSyncState());

  const tStart3 = performance.now();
  const [reindexResults, stateResults] = await Promise.all([
    Promise.all(reindexPromises),
    Promise.all(statePromises),
  ]);
  const tEnd3 = performance.now();

  const reindexSuccess = reindexResults.filter(r => r.status === 202).length;
  const stateSuccess = stateResults.filter(r => r.status === 200).length;

  console.log(`Results: ${reindexSuccess}/20 Reindex HTTP 202, ${stateSuccess}/100 Sync-State HTTP 200 in ${(tEnd3 - tStart3).toFixed(2)}ms`);
  
  // Verify state validity across all read results
  let stateAnomalies = 0;
  for (const r of stateResults) {
    const d = r.data;
    if (typeof d.change_generation !== 'number' ||
        typeof d.indexed_generation !== 'number' ||
        typeof d.is_synced !== 'boolean' ||
        typeof d.is_current !== 'boolean' ||
        typeof d.sync_task_active !== 'boolean' ||
        typeof d.sync_executions_count !== 'number') {
      stateAnomalies++;
    }
  }
  console.log(`State Invariant Anomalies Detected: ${stateAnomalies}`);

  // Test 4: Wait for convergence
  console.log('\n[Test 4] Waiting for RAG Engine convergence post-burst...');
  let converged = false;
  let finalState = null;
  for (let attempt = 0; attempt < 50; attempt++) {
    await new Promise(r => setTimeout(r, 100));
    const s = await fetchSyncState();
    if (s.data.is_current && !s.data.sync_task_active) {
      converged = true;
      finalState = s.data;
      break;
    }
  }
  console.log('Convergence Status:', converged ? 'CONVERGED' : 'TIMEOUT');
  console.log('Final State:', JSON.stringify(finalState, null, 2));

  // Test 5: Verify coalescing during race
  const genDelta = finalState.change_generation - baseline.data.change_generation;
  const execDelta = finalState.sync_executions_count - baseline.data.sync_executions_count;
  console.log(`Generation Delta: +${genDelta} | Execution Count Delta: +${execDelta}`);
  console.log(`Coalescing Efficiency: ${(((genDelta - execDelta) / genDelta) * 100).toFixed(1)}%`);

  if (!converged || stateAnomalies > 0 || reindexSuccess !== 20 || stateSuccess !== 100) {
    console.error('[FAIL] Concurrency stress test failed invariants!');
    process.exit(1);
  }

  console.log('\n[PASS] /internal/sync-state withstood high concurrency and burst race conditions with zero errors!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
