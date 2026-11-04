import { execSync } from 'node:child_process';

const BASE_URL = 'http://localhost:3334';
const ADMIN_API_KEY = '76bdc056bd9f6c4b108872d109a7641daf7353423dab6a166340324a5a0efb60';

function queryDb(sql) {
  const out = execSync(`sqlite3 prisma/dev.db "${sql}"`, { encoding: 'utf-8' });
  return out.trim();
}

async function main() {
  console.log('================================================================================');
  console.log('[Challenger] SQLite WAL Concurrency & Schema Integrity Verification');
  console.log('================================================================================\n');

  // Step 1: Pre-check DB Invariants
  console.log('[Step 1] Verifying baseline database invariants directly via sqlite3...');
  const integrity = queryDb('PRAGMA integrity_check;');
  const foreignKeys = queryDb('PRAGMA foreign_key_check;');
  const journalMode = queryDb('PRAGMA journal_mode;');
  const synchronous = queryDb('PRAGMA synchronous;');
  const busyTimeout = queryDb('PRAGMA busy_timeout;');
  const counts = queryDb('SELECT (SELECT COUNT(*) FROM Roadmap) as r, (SELECT COUNT(*) FROM RoadmapItem) as i;');
  const [roadmapsCount, itemsCount] = counts.split('|').map(Number);
  const orphanedCount = Number(queryDb('SELECT COUNT(*) FROM RoadmapItem WHERE roadmapId NOT IN (SELECT id FROM Roadmap);'));

  console.log(`- Integrity Check : ${integrity}`);
  console.log(`- Foreign Keys    : ${foreignKeys || '0 violations (clean)'}`);
  console.log(`- Journal Mode    : ${journalMode}`);
  console.log(`- Synchronous     : ${synchronous}`);
  console.log(`- Busy Timeout    : ${busyTimeout}`);
  console.log(`- Roadmaps Count  : ${roadmapsCount} (Target: 2)`);
  console.log(`- Items Count     : ${itemsCount} (Target: 115)`);
  console.log(`- Orphaned Rows   : ${orphanedCount} (Target: 0)`);

  if (integrity !== 'ok' || roadmapsCount !== 2 || itemsCount !== 115 || orphanedCount !== 0) {
    throw new Error('Baseline DB state invalid!');
  }

  // Step 2: Concurrent Read Stress during Live Mutation
  console.log('\n[Step 2] Testing concurrent read throughput during write mutation...');
  const tempTopicTitle = `__challenger_probe_${Date.now()}__`;
  
  // Create topic
  const createRes = await fetch(`${BASE_URL}/api/v1/roadmaps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_API_KEY },
    body: JSON.stringify({ title: tempTopicTitle, description: 'Challenger probe topic' }),
  });
  const createData = await createRes.json();
  const slug = createData.roadmap.slug;
  console.log(`Created temporary topic: ${slug}`);

  // Create an item
  const itemRes = await fetch(`${BASE_URL}/api/v1/roadmaps/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_API_KEY },
    body: JSON.stringify({ roadmapSlug: slug, title: 'Probe Item 1', section: 'Main' }),
  });
  const itemData = await itemRes.json();
  const itemId = itemData.item.id;

  // Now launch 50 parallel reads while simultaneously updating the item
  console.log('Firing 50 parallel reads concurrently with a PATCH mutation...');
  const readPromises = Array.from({ length: 50 }, async (_, i) => {
    const t0 = performance.now();
    const endpoint = i % 2 === 0 ? '/api/v1/roadmaps/ai-architecture' : '/api/v1/roadmaps/full-export';
    const res = await fetch(`${BASE_URL}${endpoint}`);
    const t1 = performance.now();
    return { status: res.status, latency: t1 - t0 };
  });

  const writePromise = (async () => {
    const t0 = performance.now();
    const res = await fetch(`${BASE_URL}/api/v1/roadmaps/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_API_KEY },
      body: JSON.stringify({ description: 'Updated during concurrent read storm' }),
    });
    const t1 = performance.now();
    return { status: res.status, latency: t1 - t0 };
  })();

  const [writeResult, ...readResults] = await Promise.all([writePromise, ...readPromises]);

  const successfulReads = readResults.filter(r => r.status === 200).length;
  console.log(`Concurrent Writes Result: HTTP ${writeResult.status} in ${writeResult.latency.toFixed(2)}ms`);
  console.log(`Concurrent Reads Result : ${successfulReads}/50 HTTP 200`);

  // Teardown temporary topic
  console.log('\nTearing down temporary probe topic...');
  const delRes = await fetch(`${BASE_URL}/api/v1/roadmaps/${slug}`, {
    method: 'DELETE',
    headers: { 'x-admin-key': ADMIN_API_KEY },
  });
  console.log(`Delete Topic Result: HTTP ${delRes.status}`);

  // Step 3: Post-check DB Invariants
  console.log('\n[Step 3] Verifying database invariants after concurrent stress and teardown...');
  const postCounts = queryDb('SELECT (SELECT COUNT(*) FROM Roadmap) as r, (SELECT COUNT(*) FROM RoadmapItem) as i;');
  const [postRoadmaps, postItems] = postCounts.split('|').map(Number);
  const postOrphaned = Number(queryDb('SELECT COUNT(*) FROM RoadmapItem WHERE roadmapId NOT IN (SELECT id FROM Roadmap);'));
  const postIntegrity = queryDb('PRAGMA integrity_check;');

  console.log(`- Final Roadmaps Count : ${postRoadmaps} (Expected: 2)`);
  console.log(`- Final Items Count    : ${postItems} (Expected: 115)`);
  console.log(`- Orphaned Rows        : ${postOrphaned} (Expected: 0)`);
  console.log(`- Integrity Check      : ${postIntegrity}`);

  if (postRoadmaps !== 2 || postItems !== 115 || postOrphaned !== 0 || postIntegrity !== 'ok') {
    throw new Error('Database drift or corruption detected!');
  }

  console.log('\n[PASS] SQLite schema integrity and zero-drift confirmed under concurrent load!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
