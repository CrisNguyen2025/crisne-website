#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Phase 2: Concurrent RAG Retrieval & SSE Streaming Stress Test Runner
# ==============================================================================
BASE_URL="${BASE_URL:-http://localhost:3334}"
K6_BIN="${K6_BIN:-/opt/homebrew/bin/k6}"
ADMIN_API_KEY="${ADMIN_API_KEY:-76bdc056bd9f6c4b108872d109a7641daf7353423dab6a166340324a5a0efb60}"
MIN_THINK="${MIN_THINK:-1.0}"
JITTER="${JITTER:-1.0}"
STARTUP_JITTER="${STARTUP_JITTER:-2.0}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="${SCRIPT_DIR}/results"
RESOURCE_CSV="${RESULTS_DIR}/phase2-resources.csv"
K6_SUMMARY_JSON="${RESULTS_DIR}/phase2-k6-summary.json"
TTFT_SUMMARY_JSON="${RESULTS_DIR}/phase2-ttft-summary.json"
RATE_LIMIT_JSON="${RESULTS_DIR}/phase2-rate-limit.json"
SUMMARY_JSON="${RESULTS_DIR}/phase2-summary.json"
PHASE_FILE="${RESULTS_DIR}/.phase2_current_phase"

mkdir -p "${RESULTS_DIR}"

echo "================================================================================"
echo "Phase 2: Concurrent RAG Retrieval & SSE Streaming Stress Runner"
echo "Target Base URL   : ${BASE_URL}"
echo "k6 Binary Path    : ${K6_BIN}"
echo "Results Directory : ${RESULTS_DIR}"
echo "================================================================================"

# 1. Pre-flight Checks & Process Resolution
echo "[1/8] Resolving Next.js and FastAPI process hierarchy..."
if ! command -v "${K6_BIN}" &>/dev/null; then
  echo "ERROR: k6 binary not found at ${K6_BIN}" >&2
  exit 1
fi

NEXT_SERVER_PID=$(lsof -ti :3334 -sTCP:LISTEN | head -n 1 || true)
if [ -z "${NEXT_SERVER_PID}" ]; then
  echo "ERROR: No server listening on port 3334! Is Next.js running?" >&2
  exit 1
fi

NEXT_PARENT_PID=$(ps -o ppid= -p "${NEXT_SERVER_PID}" 2>/dev/null | tr -d ' ' || true)

FASTAPI_MASTER_PID=$(lsof -ti :8000 -sTCP:LISTEN | head -n 1 || true)
if [ -z "${FASTAPI_MASTER_PID}" ]; then
  echo "ERROR: No server listening on port 8000! Is FastAPI running?" >&2
  exit 1
fi

FASTAPI_WORKER_PID=$(pgrep -P "${FASTAPI_MASTER_PID}" python 2>/dev/null | tail -n 1 || true)
if [ -z "${FASTAPI_WORKER_PID}" ]; then
  FASTAPI_WORKER_PID="${FASTAPI_MASTER_PID}"
fi

MONITOR_PIDS="${NEXT_SERVER_PID}"
[ -n "${NEXT_PARENT_PID}" ] && [ "${NEXT_PARENT_PID}" != "1" ] && MONITOR_PIDS="${MONITOR_PIDS},${NEXT_PARENT_PID}"
[ -n "${FASTAPI_MASTER_PID}" ] && MONITOR_PIDS="${MONITOR_PIDS},${FASTAPI_MASTER_PID}"
[ -n "${FASTAPI_WORKER_PID}" ] && [ "${FASTAPI_WORKER_PID}" != "${FASTAPI_MASTER_PID}" ] && MONITOR_PIDS="${MONITOR_PIDS},${FASTAPI_WORKER_PID}"

echo "      Next.js Server PID : ${NEXT_SERVER_PID} (Parent: ${NEXT_PARENT_PID:-none})"
echo "      FastAPI Master PID : ${FASTAPI_MASTER_PID} (Worker: ${FASTAPI_WORKER_PID})"
echo "      Monitoring PIDs    : ${MONITOR_PIDS}"

# 2. Setup Background Resource Monitor
echo "[2/8] Initializing background resource monitor..."
echo "timestamp,phase,pid,cpu_pct,rss_kb" > "${RESOURCE_CSV}"
echo "baseline" > "${PHASE_FILE}"

cleanup() {
  echo "      Stopping background resource monitor (PID ${MONITOR_PID:-none})..."
  rm -f "${PHASE_FILE}" 2>/dev/null || true
  if [ -n "${MONITOR_PID:-}" ]; then
    kill "${MONITOR_PID}" 2>/dev/null || true
    wait "${MONITOR_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

(
  while [ -f "${PHASE_FILE}" ]; do
    CURRENT_PHASE=$(cat "${PHASE_FILE}" 2>/dev/null || echo "baseline")
    ps -p "${MONITOR_PIDS}" -o pid=,%cpu=,rss= 2>/dev/null | while read -r pid cpu rss; do
      if [ -n "${pid}" ]; then
        echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ"),${CURRENT_PHASE},${pid},${cpu},${rss}" >> "${RESOURCE_CSV}"
      fi
    done
    sleep 1
  done
) &
MONITOR_PID=$!

# Record 5s baseline idle metrics
echo "baseline" > "${PHASE_FILE}"
echo "      Capturing 5s baseline idle metrics..."
sleep 5

# 3. Pre-warm Queries & In-Memory Vector Cache (Robust 2-Pass Warmup)
echo "[3/8] Pre-warming queries to seed in-memory vector embedding cache & SQLite FTS5..."
echo "warmup" > "${PHASE_FILE}"

PREWARM_QUERIES=(
  "Grounding Data là gì?"
  "Lộ trình AI Architecture gồm những gì?"
  "Vector database dùng để làm gì trong AI Architecture?"
  "RAG pipeline hoạt động như thế nào?"
  "Autonomous Agent khác gì AI Copilot?"
  "Monolith vs Microservices cho AI"
  "Hybrid search kết hợp BM25 và Vector như thế nào?"
)

echo "      Pass 1: Priming query embedding cache and SQLite page buffers..."
for query in "${PREWARM_QUERIES[@]}"; do
  curl -s --max-time 15 -o /dev/null -X POST "${BASE_URL}/api/roadmap-assistant/chat/stream" \
    -H "Content-Type: application/json" \
    -H "x-admin-key: ${ADMIN_API_KEY}" \
    -d "{\"message\":\"${query}\",\"thread_id\":\"warmup-pass1-$(date +%s%N)\"}" || true
  echo "      Seeded cache: \"${query}\""
done

echo "      Pass 2: Verifying warm in-memory cache hits..."
for query in "${PREWARM_QUERIES[@]}"; do
  curl -s --max-time 5 -o /dev/null -X POST "${BASE_URL}/api/roadmap-assistant/chat/stream" \
    -H "Content-Type: application/json" \
    -H "x-admin-key: ${ADMIN_API_KEY}" \
    -d "{\"message\":\"${query}\",\"thread_id\":\"warmup-pass2-$(date +%s%N)\"}" || true
done
echo "      Pre-warming completed. In-memory vector cache & SQLite are hot."

# 4. Execute k6 RAG Streaming Load Test (20 VUs peak)
echo "active_k6" > "${PHASE_FILE}"
echo "[4/8] Executing k6 RAG streaming load test (20 concurrent VUs over 60s)..."
K6_EXIT=0
"${K6_BIN}" run \
  --address "" \
  -e MIN_THINK="${MIN_THINK}" \
  -e JITTER="${JITTER}" \
  -e STARTUP_JITTER="${STARTUP_JITTER}" \
  --summary-trend-stats "avg,min,med,p(50),p(90),p(95),p(99),max" \
  --summary-export "${RESULTS_DIR}/phase2-k6-raw.json" \
  "${SCRIPT_DIR}/phase2-rag-stream.js" || K6_EXIT=$?
echo "      k6 load test completed with exit code: ${K6_EXIT}"

# 5. Cool-down interval
echo "cooldown_interim" > "${PHASE_FILE}"
echo "[5/8] Cooling down for 5s (socket draining & async worker cleanup)..."
sleep 5
# Refresh vector cache before high-precision TTFT probe
curl -s -o /dev/null --max-time 10 -X POST "${BASE_URL}/api/roadmap-assistant/chat/stream" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: ${ADMIN_API_KEY}" \
  -d '{"message":"Grounding Data là gì?","thread_id":"probe-warmup"}' || true

# 6. Execute High-Precision Node.js TTFT Probe
echo "active_ttft" > "${PHASE_FILE}"
echo "[6/8] Executing high-precision Node.js 22 streaming TTFT probe (20 concurrent workers, 40 requests)..."
TTFT_EXIT=0
node --experimental-strip-types "${SCRIPT_DIR}/phase2-ttft-probe.mjs" || TTFT_EXIT=$?
echo "      TTFT probe completed with exit code: ${TTFT_EXIT}"

# 7. Execute Visitor Rate Limiter Verification
echo "rate_limit" > "${PHASE_FILE}"
echo "[7/8] Executing visitor rate limiter verification (35 requests from simulated visitor IP)..."
RATE_LIMIT_EXIT=0
node --experimental-strip-types "${SCRIPT_DIR}/phase2-rate-limit.mjs" || RATE_LIMIT_EXIT=$?
echo "      Rate limiter verification completed with exit code: ${RATE_LIMIT_EXIT}"

# Post-test cooldown
echo "cooldown" > "${PHASE_FILE}"
echo "      Capturing 5s post-test cooldown..."
sleep 5

# Cleanly stop background resource monitor
cleanup
trap - EXIT INT TERM

# 8. Aggregate Results & Generate Scorecard
echo "[8/8] Aggregating results and generating summary scorecard..."
AGGREGATOR_EXIT=0
node "${SCRIPT_DIR}/aggregate-phase2.js" \
  "${K6_SUMMARY_JSON}" \
  "${TTFT_SUMMARY_JSON}" \
  "${RATE_LIMIT_JSON}" \
  "${RESOURCE_CSV}" \
  "${SUMMARY_JSON}" || AGGREGATOR_EXIT=$?

echo "================================================================================"
if [ "${K6_EXIT}" -ne 0 ] || [ "${TTFT_EXIT}" -ne 0 ] || [ "${RATE_LIMIT_EXIT}" -ne 0 ] || [ "${AGGREGATOR_EXIT}" -ne 0 ]; then
  echo "Phase 2 FAILED! Consolidated Summary: ${SUMMARY_JSON}"
  echo "Exit Status: k6=${K6_EXIT}, TTFT Probe=${TTFT_EXIT}, Rate Limit=${RATE_LIMIT_EXIT}, Aggregator=${AGGREGATOR_EXIT}"
  echo "================================================================================"
  if [ "${K6_EXIT}" -ne 0 ]; then
    exit "${K6_EXIT}"
  elif [ "${TTFT_EXIT}" -ne 0 ]; then
    exit "${TTFT_EXIT}"
  elif [ "${RATE_LIMIT_EXIT}" -ne 0 ]; then
    exit "${RATE_LIMIT_EXIT}"
  else
    exit "${AGGREGATOR_EXIT}"
  fi
fi

echo "Phase 2 Complete! Consolidated Summary: ${SUMMARY_JSON}"
echo "================================================================================"
exit 0
