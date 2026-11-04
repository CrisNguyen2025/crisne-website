# Stress Test Report — crisne-website & roadmap-rag-assistant

**Generated**: 2026-11-04T03:39:39Z  
**Executed by**: Teamwork Multi-Agent System (Orchestrator Gen-2 + 20+ specialist agents)  
**Working Directory**: `/Users/tienanhnguyen/Desktop/src_example/crisne-website`  
**Overall Verdict**: ✅ **ALL PHASES PASS**

---

## Table of Contents

1. [System Under Test](#1-system-under-test)
2. [Test Environment](#2-test-environment)
3. [SLO Scorecard — All Phases](#3-slo-scorecard--all-phases)
4. [Phase 1 — Read Throughput & Cache Stress](#4-phase-1--read-throughput--cache-stress)
5. [Phase 2 — Concurrent RAG Streaming Stress](#5-phase-2--concurrent-rag-streaming-stress)
6. [Phase 3 — Burst Mutation & Reindex Debounce](#6-phase-3--burst-mutation--reindex-debounce)
7. [Phase 4 — Robustness & LLM Circuit Breaker](#7-phase-4--robustness--llm-circuit-breaker)
8. [Resource Telemetry Summary](#8-resource-telemetry-summary)
9. [Bottleneck Analysis](#9-bottleneck-analysis)
10. [Artifact Index](#10-artifact-index)

---

## 1. System Under Test

| Component | Technology | Port |
|-----------|------------|------|
| **Next.js Web Server** | Next.js 16 App Router, Turbopack, TypeScript strict | `3334` |
| **FastAPI RAG Assistant** | Python 3.11, Uvicorn, LangChain, Groq LLM, FTS5 BM25 | `8000` |
| **Database** | SQLite (WAL mode), Prisma ORM | Local `prisma/dev.db` |
| **Embedding Cache** | JSON file-based SHA-1 keyed cache (Gemini API) | `rag_service/data/embedding_cache.json` |

**Key Endpoints Tested**:
- `GET /api/v1/roadmaps/ai-architecture` — JSON roadmap with 115 items
- `GET /api/v1/roadmaps/full-export` — Full database export
- `POST /api/roadmap-assistant/chat/stream` — SSE chat stream (proxy → RAG)
- `POST http://127.0.0.1:8000/internal/reindex` — RAG reindex trigger
- `GET http://127.0.0.1:8000/health` — FastAPI health
- `GET /api/roadmap-assistant/health` — Next.js proxy health

---

## 2. Test Environment

| Item | Value |
|------|-------|
| Machine | macOS, Apple Silicon |
| Load Tool | k6 (`/opt/homebrew/bin/k6`) |
| Node.js | System default (ESM scripts) |
| Python | 3.11 (`.venv` in `roadmap-rag-assistant/`) |
| Database seed | 2 roadmaps, 115 items (AI Architecture + Backend Roadmap) |
| Embedding cache warmth | 537 entries (117 active docs — 100% warm before benchmarks) |
| RAG LLM provider | Groq (free tier — quota events excluded from TTFT SLO per spec) |
| Visitor rate limit | 30 req / 5 min on `/api/roadmap-assistant/*` (dev bypass via `x-admin-key`) |

---

## 3. SLO Scorecard — All Phases

| # | Phase | Metric | Target | Actual | Status |
|---|-------|--------|--------|--------|--------|
| 1 | Phase 1 | `ai-architecture` P95 @ 100 VUs | < 150ms | **25.64ms** | ✅ PASS |
| 2 | Phase 1 | `full-export` P95 @ 30 VUs | < 350ms | **107.32ms** | ✅ PASS |
| 3 | Phase 1 | Error rate | 0% | **0.00%** | ✅ PASS |
| 4 | Phase 2 | TTFT P95 (native, excl. quota) | < 1200ms | **61.7ms** | ✅ PASS |
| 5 | Phase 2 | Retrieval latency P95 | < 100ms | **50.2ms** | ✅ PASS |
| 6 | Phase 2 | Streaming error rate | < 1% | **0.00%** | ✅ PASS |
| 7 | Phase 2 | Visitor rate limit enforcement | 429 after 30 req/5 min | **Verified** | ✅ PASS |
| 8 | Phase 3 | Mutation success rate | 20/20 | **20/20** | ✅ PASS |
| 9 | Phase 3 | SQLite BUSY errors | 0 | **0** | ✅ PASS |
| 10 | Phase 3 | Mutation latency P95 | < 200ms | **16.05ms** | ✅ PASS |
| 11 | Phase 3 | Reindex coalescing | ≥ 1 coalesced | **90% coalesced** | ✅ PASS |
| 12 | Phase 3 | Duplicate Gemini embedding calls | 0 | **0** | ✅ PASS |
| 13 | Phase 4 | Graceful 502 on RAG outage | HTTP 502 + no crash | **Verified** | ✅ PASS |
| 14 | Phase 4 | TTR direct health (SIGCONT) | < 30ms | **2.9ms** | ✅ PASS |
| 15 | Phase 4 | TTR proxy health (SIGCONT) | < 100ms | **9.9ms** | ✅ PASS |
| 16 | Phase 4 | Stream resumption post-recovery | HTTP 200 SSE, 0 stale sockets | **Verified** | ✅ PASS |
| 17 | Phase 4 | Index freshness post-recovery | Reindex < 1000ms | **421ms** | ✅ PASS |
| 18 | Phase 4 | Router `write_now_violation` | 0 across 498 samples | **0** | ✅ PASS |
| 19 | Phase 4 | Router eval ratchet | Zero regressions | **Zero regressions** | ✅ PASS |

**19 / 19 SLOs PASS**

---

## 4. Phase 1 — Read Throughput & Cache Stress

**Script**: [`tests/load/phase1-ai-architecture.js`](./phase1-ai-architecture.js), [`tests/load/phase1-full-export.js`](./phase1-full-export.js)  
**Runner**: [`tests/load/run-phase1.sh`](./run-phase1.sh)  
**Results**: [`tests/load/results/phase1-summary.json`](./results/phase1-summary.json)

### Endpoint: `GET /api/v1/roadmaps/ai-architecture`

| Metric | Value |
|--------|-------|
| VUs (peak) | 100 |
| Total requests | 2,608 |
| Throughput | 36.95 req/s |
| P50 latency | 6.87ms |
| P90 latency | 15.67ms |
| **P95 latency** | **25.64ms** ✅ (target < 150ms) |
| P99 latency | 197.57ms |
| Error rate | 0.00% ✅ |
| Check pass rate | 100% |

### Endpoint: `GET /api/v1/roadmaps/full-export`

| Metric | Value |
|--------|-------|
| VUs (peak) | 30 |
| Total requests | 13,904 |
| Throughput | 231.74 req/s |
| P50 latency | 43.15ms |
| P90 latency | 87.18ms |
| **P95 latency** | **107.32ms** ✅ (target < 350ms) |
| P99 latency | 132.83ms |
| Error rate | 0.00% ✅ |
| Check pass rate | 100% |

**Verdict**: ✅ GATE PASS (Iteration 2)

---

## 5. Phase 2 — Concurrent RAG Streaming Stress

**Scripts**: [`tests/load/phase2-rag-stream.js`](./phase2-rag-stream.js), [`tests/load/phase2-ttft-probe.mjs`](./phase2-ttft-probe.mjs), [`tests/load/phase2-rate-limit.mjs`](./phase2-rate-limit.mjs)  
**Runner**: [`tests/load/run-phase2.sh`](./run-phase2.sh)  
**Results**: [`tests/load/results/phase2-summary.json`](./results/phase2-summary.json)

| Metric | Value |
|--------|-------|
| VUs (peak) | 20 |
| **TTFT P95** (native, excl. quota) | **61.7ms** ✅ (target < 1200ms) |
| Retrieval latency P95 (k6) | 50.2ms ✅ (target < 100ms) |
| Retrieval latency P95 (probe standalone) | 26.1ms |
| Streaming error rate | 0.00% ✅ |
| Rate limit enforcement | 30 allowed / 5 throttled (HTTP 429) ✅ |
| Groq quota events | 40 excluded from SLO (classified as `quota-fallback`) |

**Key Finding**: TTFT SLO uses 3-way classification (native / quota-fallback / error). Groq free-tier 429 retries cause 15–25s stalls — excluded per spec. Native retrieval + first token consistently < 65ms with warm embedding cache.

**Verdict**: ✅ GATE PASS (Iteration 2)

---

## 6. Phase 3 — Burst Mutation & Reindex Debounce

**Script**: [`tests/load/phase3-burst-mutation.mjs`](./phase3-burst-mutation.mjs)  
**Runner**: [`tests/load/run-phase3.sh`](./run-phase3.sh)  
**Results**: [`tests/load/results/phase3-mutation-results.json`](./results/phase3-mutation-results.json)

### Mutation Results (20 rapid CUD operations)

| Metric | Value |
|--------|-------|
| Mutation success rate | 20/20 (100%) ✅ |
| SQLite BUSY errors | 0 ✅ |
| P50 latency | 8.49ms |
| P90 latency | 15.92ms |
| **P95 latency** | **16.05ms** ✅ (target < 200ms) |
| P99 latency | 16.07ms |

### Reindex Coalescing Verification

| Metric | Value |
|--------|-------|
| Burst reindex requests | 20 |
| Actual sync task executions | 2 (from 20 triggers) |
| **Coalescing ratio** | **90%** ✅ |
| Generation lock source | FastAPI `_sync_lock` + `_change_generation` |
| Telemetry endpoint | `GET /internal/sync-state` (added during Milestone 3) |

### Embedding Cache Integrity

| Metric | Value |
|--------|-------|
| Active documents | 117 |
| SHA-1 cache matches | 117/117 (100%) |
| **Duplicate Gemini calls** | **0** ✅ |
| Reindex elapsed | 0.99s |
| Minimum uncached duration (theoretical) | 78.39s |
| Orphaned rows post-teardown | 0 ✅ |

**Verdict**: ✅ GATE PASS (Iteration 2)

---

## 7. Phase 4 — Robustness & LLM Circuit Breaker

**Scripts**: [`tests/load/phase4-failover-recovery.mjs`](./phase4-failover-recovery.mjs), [`tests/load/phase4-router-eval.py`](./phase4-router-eval.py)  
**Runner**: [`tests/load/run-phase4.sh`](./run-phase4.sh)  
**Results**: [`tests/load/results/phase4-summary.json`](./results/phase4-summary.json), [`tests/load/results/phase4-failover-results.json`](./results/phase4-failover-results.json), [`tests/load/results/phase4-router-eval.json`](./results/phase4-router-eval.json)

### Failover & Recovery (5-stage test)

| Stage | Test | Result |
|-------|------|--------|
| 1 | Pre-failover baseline capture | Gen=396, is_synced=true |
| 2 | SIGSTOP FastAPI → outage probe | HTTP 502 `{"error":"Roadmap Assistant is unavailable."}` in 5107ms ✅ |
| 2 | Next.js web during outage | HTTP 200 `/api/v1/roadmaps/full-export` ✅ (no crash) |
| 3 | SIGCONT → TTR direct health | **2.9ms** ✅ (< 30ms) |
| 3 | SIGCONT → TTR proxy health | **9.9ms** ✅ (< 100ms) |
| 4 | Post-recovery chat stream | HTTP 200, TTFT 1498ms, events [trace, step, token, done], 0 stale sockets ✅ |
| 5 | Reindex convergence post-recovery | Converged in **421.2ms** ✅ (< 1000ms) |

> [!NOTE]
> TTR measured with concurrent `Promise.all` probes dispatched simultaneously post-SIGCONT using async `spawn` (not `execSync`) to eliminate 9–15ms shell overhead.

### Router Invariant Evaluation

| Harness | Samples | Result |
|---------|---------|--------|
| `evals.router.check` | 791 | ✅ PASS — `stress.wrong_write = 0`, `heldout.routing.correct = 223/223`, `heldout.intent.correct = 64/64` |
| `evals.router.confuse` | 498 | ✅ PASS — `write_now_violation = 0`, `wrong_branch = 91` (↓ from 103), `preview_violation = 23` (↓ from 35) |

**Verdict**: ✅ GATE PASS (Iteration 2 — after fixing TTR assertion masking and concurrent probe methodology)

---

## 8. Resource Telemetry Summary

Resource monitoring via `ps` polling across all 4 processes during Phase 4 (most demanding phase):

| Process | PID | Baseline RSS | Peak RSS | Delta | Peak CPU |
|---------|-----|-------------|----------|-------|----------|
| FastAPI (Uvicorn parent) | 51218 | 21.3 MB | **203.4 MB** | +182 MB | 55.9% |
| Next.js (parent) | 90370 | 4.2 MB | 4.2 MB | +0 MB | 0% |
| **Next.js (server worker)** | **90372** | **177.4 MB** | **431.9 MB** | **+254.5 MB** | **12%** |
| FastAPI (worker) | 90757 | 28.2 MB | 28.2 MB | +0 MB | 54.6% |

**Previous Phase 2 peak RSS** (from Phase 2 resource CSV):
- Next.js: ~720.9 MB RSS (peak under 20 VU concurrent RAG streaming)
- FastAPI: ~210.1 MB RSS (peak under streaming load)

**Observations**:
- Next.js RSS grows with request load due to Turbopack dev server behavior; no pathological leak pattern detected
- FastAPI RSS delta of +182 MB during stream processing is LangChain/embedding pipeline overhead, recovers to 176 MB in cooldown
- No process exceeded 1500 MB RSS threshold (resource stability SLO)

---

## 9. Bottleneck Analysis

### Identified Bottlenecks

| # | Component | Bottleneck | Impact | Severity |
|---|-----------|------------|--------|----------|
| 1 | **Groq LLM provider** | Free-tier rate limits cause 15–25s TTFT stalls during quota retry loops | P95 TTFT degrades from 62ms → timeout under sustained concurrent load | High |
| 2 | **Next.js Turbopack dev server** | RSS grows from 177 MB baseline to 431 MB peak under streaming; no stable steady-state ceiling | Memory pressure under sustained 20+ VU load | Medium |
| 3 | **SQLite WAL mode** | `PRAGMA busy_timeout = 0` with no retry; burst writes at < 10ms spacing require external sequencing | 0 BUSY errors observed in Phase 3 (writes were sequenced) but risk exists in production concurrent write scenarios | Medium |
| 4 | **Embedding cache warmup** | Cold Gemini API embedding calls: 1.5–2.5s per document. 117 docs × 2s = ~234s cold start | First reindex after cache expiry will block retrieval pipeline | High |
| 5 | **Phase 1 P99 tail** | `ai-architecture` P99 = 197.57ms vs P95 = 25.64ms — significant tail variance at peak 100 VU load | P99 outliers may affect user experience under traffic spikes | Low |

### Key Architecture Findings

**What worked well:**
- **Embedding SHA-1 cache** completely eliminated redundant Gemini API calls — 117/117 cache hits, mathematically verified
- **Generation lock coalescing** in FastAPI reduced 20 mutation-triggered reindex requests to 2 actual sync executions (90% debounce rate)
- **Next.js graceful degradation** — circuit breaker returns HTTP 502 with user-friendly error; web routes remain fully functional during RAG outage
- **TTR on SIGCONT** — FastAPI recovers in < 3ms (effectively instant), proxy health in < 10ms
- **Router write-now invariant** — zero violations across 498 adversarial confusing samples

**What needs attention in production:**
- Replace Groq free tier with paid tier or add fallback LLM provider to meet TTFT SLO under sustained load
- Add `PRAGMA busy_timeout` > 0 in Prisma for safer concurrent write handling
- Implement embedding cache TTL and async pre-warming strategy for long-lived deployments
- Replace Turbopack dev server with production Next.js build for stable memory baseline

---

## 10. Artifact Index

| File | Description |
|------|-------------|
| [`tests/load/phase1-ai-architecture.js`](./phase1-ai-architecture.js) | k6 script: `GET /api/v1/roadmaps/ai-architecture` @ 100 VUs |
| [`tests/load/phase1-full-export.js`](./phase1-full-export.js) | k6 script: `GET /api/v1/roadmaps/full-export` @ 30 VUs |
| [`tests/load/run-phase1.sh`](./run-phase1.sh) | Phase 1 master runner with 5-phase resource tagging |
| [`tests/load/aggregate-phase1.js`](./aggregate-phase1.js) | Phase 1 result aggregator |
| [`tests/load/phase2-rag-stream.js`](./phase2-rag-stream.js) | k6 script: SSE stream @ 20 VUs |
| [`tests/load/phase2-ttft-probe.mjs`](./phase2-ttft-probe.mjs) | TTFT 3-way classification probe (native/quota/error) |
| [`tests/load/phase2-rate-limit.mjs`](./phase2-rate-limit.mjs) | Visitor rate-limit enforcement probe |
| [`tests/load/run-phase2.sh`](./run-phase2.sh) | Phase 2 master runner with 2-pass cache warmup |
| [`tests/load/aggregate-phase2.js`](./aggregate-phase2.js) | Phase 2 result aggregator |
| [`tests/load/phase3-burst-mutation.mjs`](./phase3-burst-mutation.mjs) | 20 rapid CUD mutations + coalescing + cache verification |
| [`tests/load/run-phase3.sh`](./run-phase3.sh) | Phase 3 master runner |
| [`tests/load/aggregate-phase3.js`](./aggregate-phase3.js) | Phase 3 result aggregator |
| [`tests/load/phase4-failover-recovery.mjs`](./phase4-failover-recovery.mjs) | 5-stage SIGSTOP/SIGCONT failover + recovery test |
| [`tests/load/phase4-router-eval.py`](./phase4-router-eval.py) | Router invariant harness runner |
| [`tests/load/run-phase4.sh`](./run-phase4.sh) | Phase 4 master runner |
| [`tests/load/aggregate-phase4.js`](./aggregate-phase4.js) | Phase 4 result aggregator |
| [`tests/load/results/phase1-summary.json`](./results/phase1-summary.json) | Phase 1 consolidated results |
| [`tests/load/results/phase1-ai-architecture-summary.json`](./results/phase1-ai-architecture-summary.json) | Phase 1 endpoint detail |
| [`tests/load/results/phase1-full-export-summary.json`](./results/phase1-full-export-summary.json) | Phase 1 endpoint detail |
| [`tests/load/results/phase1-resources.csv`](./results/phase1-resources.csv) | Phase 1 resource telemetry |
| [`tests/load/results/phase2-summary.json`](./results/phase2-summary.json) | Phase 2 consolidated results |
| [`tests/load/results/phase2-k6-raw.json`](./results/phase2-k6-raw.json) | Phase 2 raw k6 output |
| [`tests/load/results/phase2-ttft-summary.json`](./results/phase2-ttft-summary.json) | Phase 2 TTFT probe results |
| [`tests/load/results/phase2-rate-limit.json`](./results/phase2-rate-limit.json) | Phase 2 rate-limit probe results |
| [`tests/load/results/phase2-resources.csv`](./results/phase2-resources.csv) | Phase 2 resource telemetry |
| [`tests/load/results/phase3-mutation-results.json`](./results/phase3-mutation-results.json) | Phase 3 mutation + coalescing + cache results |
| [`tests/load/results/phase4-failover-results.json`](./results/phase4-failover-results.json) | Phase 4 failover raw results |
| [`tests/load/results/phase4-router-eval.json`](./results/phase4-router-eval.json) | Phase 4 router eval raw results |
| [`tests/load/results/phase4-resources.csv`](./results/phase4-resources.csv) | Phase 4 resource telemetry |
| [`tests/load/results/phase4-summary.json`](./results/phase4-summary.json) | Phase 4 consolidated scorecard |

---

*Report generated by Teamwork multi-agent stress test system. All metrics sourced from live service runs against unmodified application code — no endpoints mocked, no metrics hardcoded.*
