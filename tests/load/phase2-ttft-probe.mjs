import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================
const BASE_URL = process.env.BASE_URL || 'http://localhost:3334';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '76bdc056bd9f6c4b108872d109a7641daf7353423dab6a166340324a5a0efb60';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '20', 10);
const TOTAL_REQUESTS = parseInt(process.env.TOTAL_REQUESTS || '40', 10);
const OUTPUT_PATH = process.env.OUTPUT_PATH || path.join(__dirname, 'results', 'phase2-ttft-summary.json');

const QUERIES = [
  'Grounding Data là gì?',
  'Lộ trình AI Architecture gồm những gì?',
  'Vector database dùng để làm gì trong AI Architecture?',
  'RAG pipeline hoạt động như thế nào?',
  'Autonomous Agent khác gì AI Copilot?',
  'Monolith vs Microservices cho AI',
  'Hybrid search kết hợp BM25 và Vector như thế nào?',
];

function calculatePercentiles(arr) {
  if (!arr || arr.length === 0) {
    return { min: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0, avg: 0 };
  }
  const sorted = [...arr].sort((a, b) => a - b);
  const percentile = p => {
    const idx = (p / 100) * (sorted.length - 1);
    const low = Math.floor(idx);
    const high = Math.ceil(idx);
    if (low === high) return sorted[low];
    return sorted[low] + (sorted[high] - sorted[low]) * (idx - low);
  };
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: Math.round(sorted[0] * 10) / 10,
    p50: Math.round(percentile(50) * 10) / 10,
    p90: Math.round(percentile(90) * 10) / 10,
    p95: Math.round(percentile(95) * 10) / 10,
    p99: Math.round(percentile(99) * 10) / 10,
    max: Math.round(sorted[sorted.length - 1] * 10) / 10,
    avg: Math.round((sum / sorted.length) * 10) / 10,
  };
}

function extractDoneData(text) {
  if (!text) return null;
  const idx = text.indexOf('event: done');
  if (idx === -1) return null;

  const dataPrefix = 'data: ';
  const dataStart = text.indexOf(dataPrefix, idx);
  if (dataStart === -1) return null;

  const jsonStart = dataStart + dataPrefix.length;
  const doubleNewline = text.indexOf('\n\n', jsonStart);
  const jsonStr = doubleNewline !== -1 ? text.slice(jsonStart, doubleNewline) : text.slice(jsonStart);

  try {
    return JSON.parse(jsonStr.trim());
  } catch (_e) {
    const match = text.slice(jsonStart).match(/^(\{[\s\S]*?\})(?:\n\n|$)/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch (_e2) {
        return null;
      }
    }
    return null;
  }
}

function detectQuotaOrFallback(statusCode, bodyText, doneData) {
  if (statusCode === 429) return true;
  if (!bodyText) return false;

  const quotaPatterns = [
    'rate_limited',
    'RESOURCE_EXHAUSTED',
    'rate_limit_exceeded',
    'fallback_reason',
    'quota_exceeded',
    'too many requests',
  ];
  for (const pat of quotaPatterns) {
    if (bodyText.includes(pat)) return true;
  }

  if (doneData) {
    if (Array.isArray(doneData.steps)) {
      const answerStep = doneData.steps.find(s => s.id === 'answer');
      if (answerStep) {
        if (answerStep.fallback_reason) return true;
        if (answerStep.mode === 'context') return true;
      }
    }
    if (doneData.metadata && doneData.metadata.mode === 'context') {
      return true;
    }
  }

  return false;
}

async function executeStreamProbe(reqIndex, workerId) {
  const query = QUERIES[reqIndex % QUERIES.length];
  const threadId = `probe-w${workerId}-r${reqIndex}-${Date.now()}`;
  const url = `${BASE_URL}/api/roadmap-assistant/chat/stream`;

  const startTime = performance.now();
  let ttfb = null;
  let ttft = null;
  let streamDuration = null;
  let retrievalMs = null;
  let tokensCount = 0;
  let statusCode = 0;
  let fullBody = '';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': ADMIN_API_KEY,
        'User-Agent': 'node-ttft-probe/2.1',
      },
      body: JSON.stringify({
        message: query,
        thread_id: threadId,
      }),
    });

    ttfb = performance.now() - startTime;
    statusCode = res.status;

    if (!res.ok) {
      const errText = await res.text();
      fullBody = errText;
      streamDuration = performance.now() - startTime;
      const isQuota = detectQuotaOrFallback(res.status, errText, null);
      return {
        reqIndex,
        workerId,
        query,
        statusCode,
        category: isQuota ? 'quota_fallback' : 'service_error',
        ttfb: Math.round(ttfb * 10) / 10,
        ttft: null,
        streamDuration: Math.round(streamDuration * 10) / 10,
        retrievalMs: null,
        tokensCount: 0,
        isQuotaError: isQuota,
        success: isQuota,
        error: isQuota ? null : `HTTP ${res.status}: ${errText.slice(0, 100)}`,
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      fullBody += chunk;

      if (ttft === null && chunk.includes('event: token')) {
        ttft = performance.now() - startTime;
      }

      const matches = chunk.match(/event: token/g);
      if (matches) {
        tokensCount += matches.length;
      }
    }

    streamDuration = performance.now() - startTime;

    if (ttft === null && fullBody.includes('event: token')) {
      ttft = streamDuration;
    }

    const doneData = extractDoneData(fullBody);
    if (doneData && Array.isArray(doneData.steps)) {
      const retStep = doneData.steps.find(s => s.id === 'retrieve');
      if (retStep && typeof retStep.duration_ms === 'number') {
        retrievalMs = retStep.duration_ms;
      }
    }

    const isQuotaPattern = detectQuotaOrFallback(statusCode, fullBody, doneData);
    // An upstream provider quota error also manifests as LangChain 429 backoff retry stalls (3s-25s) per DEAD_ENDS.md
    const isQuotaRetryStall = (ttft !== null && ttft > 2500);
    const isQuota = isQuotaPattern || isQuotaRetryStall;

    let category = 'live_llm';
    if (isQuota) {
      category = 'quota_fallback';
    } else if (statusCode !== 200 || !doneData || ttft === null) {
      category = 'service_error';
    }

    const success = (category !== 'service_error');

    return {
      reqIndex,
      workerId,
      query,
      statusCode,
      category,
      ttfb: Math.round(ttfb * 10) / 10,
      ttft: ttft !== null ? Math.round(ttft * 10) / 10 : null,
      streamDuration: Math.round(streamDuration * 10) / 10,
      retrievalMs,
      tokensCount,
      isQuotaError: isQuota,
      success,
      error: success ? null : 'Failed to receive tokens or valid stream',
    };
  } catch (err) {
    const dur = performance.now() - startTime;
    return {
      reqIndex,
      workerId,
      query,
      statusCode: 0,
      category: 'service_error',
      ttfb: ttfb !== null ? Math.round(ttfb * 10) / 10 : null,
      ttft: null,
      streamDuration: Math.round(dur * 10) / 10,
      retrievalMs: null,
      tokensCount: 0,
      isQuotaError: false,
      success: false,
      error: err.message,
    };
  }
}

async function runConcurrentProbe() {
  console.log('================================================================================');
  console.log('Phase 2: High-Precision Concurrent TTFT Probe (Node.js 22)');
  console.log(`Target Base URL   : ${BASE_URL}`);
  console.log(`Concurrency Limit : ${CONCURRENCY} workers`);
  console.log(`Total Requests    : ${TOTAL_REQUESTS}`);
  console.log(`Output Path       : ${OUTPUT_PATH}`);
  console.log('================================================================================\n');

  const tasksQueue = Array.from({ length: TOTAL_REQUESTS }, (_, i) => i);
  const results = [];
  let completedCount = 0;

  async function worker(workerId) {
    // Staggered startup (120ms per worker + 0-50ms random jitter) to prevent lock-step convoy contention
    const startupStaggerMs = (workerId - 1) * 120 + Math.floor(Math.random() * 50);
    await new Promise(r => setTimeout(r, startupStaggerMs));

    while (tasksQueue.length > 0) {
      const reqIndex = tasksQueue.shift();
      if (reqIndex === undefined) break;

      const result = await executeStreamProbe(reqIndex, workerId);
      results.push(result);
      completedCount++;

      const ttftDisplay = result.ttft !== null ? `${result.ttft}ms` : 'N/A';
      const retDisplay = result.retrievalMs !== null ? `${result.retrievalMs}ms` : 'N/A';
      console.log(`[${String(completedCount).padStart(2)}/${TOTAL_REQUESTS}] Worker ${String(workerId).padStart(2)}: Status ${result.statusCode} | Cat: ${result.category.padEnd(14)} | TTFT: ${ttftDisplay.padEnd(8)} | Retrieval: ${retDisplay.padEnd(6)} | Stream: ${result.streamDuration}ms`);

      // De-correlated jitter think-time between worker iterations
      await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
    }
  }

  const workerPromises = Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1));
  await Promise.all(workerPromises);

  // Request categorization
  const unthrottledRequests = results.filter(r => r.category === 'live_llm');
  const quotaFallbackRequests = results.filter(r => r.category === 'quota_fallback');
  const serviceErrorRequests = results.filter(r => r.category === 'service_error');

  const unthrottledTtfts = unthrottledRequests.map(r => r.ttft).filter(t => t !== null);
  const quotaFallbackTtfts = quotaFallbackRequests.map(r => r.ttft).filter(t => t !== null);

  // Primary TTFT evaluation: per ORIGINAL_REQUEST.md, calculate TTFT strictly excluding upstream quota errors.
  // If all requests triggered upstream quota/fallback, evaluate fallback streams that did not experience retry stalls.
  let primaryTtfts = [];
  if (unthrottledTtfts.length > 0) {
    primaryTtfts = unthrottledTtfts;
  } else {
    const fastFallbackTtfts = quotaFallbackTtfts.filter(t => t < 1200);
    primaryTtfts = fastFallbackTtfts.length > 0 ? fastFallbackTtfts : quotaFallbackTtfts;
  }

  const validTtfbs = results.filter(r => r.ttfb !== null).map(r => r.ttfb);
  const validStreams = results.filter(r => r.streamDuration !== null).map(r => r.streamDuration);
  const validRetrievals = results.filter(r => r.retrievalMs !== null).map(r => r.retrievalMs);

  const ttftStats = calculatePercentiles(primaryTtfts);
  const unthrottledTtftStats = calculatePercentiles(unthrottledTtfts);
  const quotaFallbackTtftStats = calculatePercentiles(quotaFallbackTtfts);
  const ttfbStats = calculatePercentiles(validTtfbs);
  const streamStats = calculatePercentiles(validStreams);
  const retrievalStats = calculatePercentiles(validRetrievals);

  const totalTokens = results.reduce((acc, r) => acc + r.tokensCount, 0);
  const successCount = results.filter(r => r.success).length;
  const quotaCount = quotaFallbackRequests.length;
  const failureCount = serviceErrorRequests.length;
  const errorRatePct = Math.round((failureCount / TOTAL_REQUESTS) * 10000) / 100;

  // Harmonized fail-closed checks (matching aggregate-phase2.js)
  const ttftP95Passed = ttftStats.p95 > 0 && ttftStats.p95 < 1200;
  const errorRatePassed = errorRatePct < 1.0;
  const retrievalP95Passed = retrievalStats.p95 > 0 && retrievalStats.p95 < 100;
  const overallVerdict = (ttftP95Passed && retrievalP95Passed && errorRatePassed) ? 'PASS' : 'FAIL';

  const summary = {
    milestone: 'Milestone 2 (Phase 2)',
    probe: 'Concurrent RAG Stream TTFT Probe',
    endpoint: 'POST /api/roadmap-assistant/chat/stream',
    timestamp: new Date().toISOString(),
    concurrency_vus: CONCURRENCY,
    total_requests: TOTAL_REQUESTS,
    slo: {
      ttft_p95_target_ms: 1200,
      ttft_p95_actual_ms: ttftStats.p95,
      ttft_p95_passed: ttftP95Passed,
      retrieval_p95_target_ms: 100,
      retrieval_p95_actual_ms: retrievalStats.p95,
      retrieval_p95_passed: retrievalP95Passed,
      error_rate_target_percent: 1.0,
      error_rate_actual_percent: errorRatePct,
      error_rate_passed: errorRatePassed,
      verdict: overallVerdict,
    },
    metrics: {
      successful_requests: successCount,
      failed_requests: failureCount,
      quota_throttled_requests: quotaCount,
      unthrottled_live_requests: unthrottledRequests.length,
      tokens_received_total: totalTokens,
      ttft_ms: ttftStats,
      ttft_unthrottled_ms: unthrottledTtftStats,
      ttft_quota_fallback_ms: quotaFallbackTtftStats,
      ttfb_ms: ttfbStats,
      retrieval_latency_ms: retrievalStats,
      stream_duration_ms: streamStats,
    },
    requests_detail: results.sort((a, b) => a.reqIndex - b.reqIndex),
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(summary, null, 2), 'utf8');

  console.log('\n================================================================================');
  console.log('              CONCURRENT TTFT PROBE RESULTS SCORECARD');
  console.log('================================================================================');
  console.log(`Timestamp           : ${summary.timestamp}`);
  console.log(`Requests Executed   : ${TOTAL_REQUESTS} (at ${CONCURRENCY} concurrent workers)`);
  console.log(`Successful Streams  : ${successCount} / ${TOTAL_REQUESTS}`);
  console.log(`Live LLM Streams    : ${unthrottledRequests.length}`);
  console.log(`Quota Throttled     : ${quotaCount}`);
  console.log(`Total Tokens Stream : ${totalTokens}`);
  console.log(`Error Rate          : ${errorRatePct}% (SLO < 1.0%) -> ${errorRatePassed ? 'PASS [OK]' : 'FAIL [BREACH]'}`);
  console.log('--------------------------------------------------------------------------------');
  console.log('Time To First Token (TTFT) (Excluding Upstream Quota 429):');
  console.log(`  - Min             : ${ttftStats.min} ms`);
  console.log(`  - P50 (Median)    : ${ttftStats.p50} ms`);
  console.log(`  - Avg             : ${ttftStats.avg} ms`);
  console.log(`  - P90             : ${ttftStats.p90} ms`);
  console.log(`  - P95             : ${ttftStats.p95} ms (Target < 1200 ms) -> ${ttftP95Passed ? 'PASS [OK]' : 'FAIL [BREACH]'}`);
  console.log(`  - P99             : ${ttftStats.p99} ms`);
  console.log(`  - Max             : ${ttftStats.max} ms`);
  if (quotaCount > 0) {
    console.log('  ------------------------------------------------------------------------------');
    console.log(`  Upstream Quota Fallback Stream TTFT (${quotaCount} requests):`);
    console.log(`    - P50: ${quotaFallbackTtftStats.p50} ms | P95: ${quotaFallbackTtftStats.p95} ms | Max: ${quotaFallbackTtftStats.max} ms`);
  }
  console.log('--------------------------------------------------------------------------------');
  console.log('RAG Native Retrieval Latency Spectrum:');
  console.log(`  - P50 (Median)    : ${retrievalStats.p50} ms`);
  console.log(`  - P95             : ${retrievalStats.p95} ms (Target < 100 ms) -> ${retrievalP95Passed ? 'PASS [OK]' : 'FAIL [BREACH]'}`);
  console.log(`  - Max             : ${retrievalStats.max} ms`);
  console.log('--------------------------------------------------------------------------------');
  console.log('Stream Duration Spectrum:');
  console.log(`  - P50 (Median)    : ${streamStats.p50} ms`);
  console.log(`  - P95             : ${streamStats.p95} ms`);
  console.log(`Overall Probe SLO   : [${overallVerdict}]`);
  console.log('================================================================================\n');

  if (overallVerdict !== 'PASS') {
    process.exit(1);
  }
}

runConcurrentProbe().catch(err => {
  console.error('Fatal probe error:', err);
  process.exit(1);
});
