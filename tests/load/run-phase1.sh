#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Phase 1: Read Throughput & Cache Stress Test Runner (Hardened)
# ==============================================================================
BASE_URL="${BASE_URL:-http://localhost:3334}"
K6_BIN="${K6_BIN:-/opt/homebrew/bin/k6}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="${SCRIPT_DIR}/results"
RESOURCE_CSV="${RESULTS_DIR}/phase1-resources.csv"
SUMMARY_JSON="${RESULTS_DIR}/phase1-summary.json"
PHASE_FILE="${RESULTS_DIR}/.current_phase"

mkdir -p "${RESULTS_DIR}"

echo "================================================================================"
echo "Phase 1: Read Throughput & Cache Stress Test Runner (Hardened)"
echo "Target Base URL   : ${BASE_URL}"
echo "k6 Binary Path    : ${K6_BIN}"
echo "Results Directory : ${RESULTS_DIR}"
echo "================================================================================"

# 1. Pre-flight Checks & Process Hierarchy Resolution
echo "[1/7] Resolving Next.js process hierarchy..."
if ! command -v "${K6_BIN}" &>/dev/null; then
  echo "ERROR: k6 binary not found at ${K6_BIN}" >&2
  exit 1
fi

SERVER_PID=$(lsof -ti :3334 -sTCP:LISTEN | head -n 1 || true)
if [ -z "${SERVER_PID}" ]; then
  echo "ERROR: No server listening on port 3334! Is Next.js running?" >&2
  exit 1
fi

PARENT_PID=$(ps -o ppid= -p "${SERVER_PID}" | tr -d ' ' || true)
MONITOR_PIDS="${SERVER_PID}"
if [ -n "${PARENT_PID}" ] && [ "${PARENT_PID}" != "1" ]; then
  MONITOR_PIDS="${PARENT_PID},${SERVER_PID}"
fi
echo "      Detected Next.js Server PID: ${SERVER_PID}, Parent PID: ${PARENT_PID:-none}"
echo "      Monitoring PIDs: ${MONITOR_PIDS}"

# 2. Pre-warm Endpoints (Turbopack JIT De-jittering)
echo "[2/7] Pre-warming endpoints to complete JIT compilation..."
curl -s -o /dev/null -w "      ai-architecture warm-up 1: %{http_code} (%{time_total}s)\n" "${BASE_URL}/api/v1/roadmaps/ai-architecture"
curl -s -o /dev/null -w "      ai-architecture warm-up 2: %{http_code} (%{time_total}s)\n" "${BASE_URL}/api/v1/roadmaps/ai-architecture"
curl -s -o /dev/null -w "      full-export warm-up 1:     %{http_code} (%{time_total}s)\n" "${BASE_URL}/api/v1/roadmaps/full-export"
curl -s -o /dev/null -w "      full-export warm-up 2:     %{http_code} (%{time_total}s)\n" "${BASE_URL}/api/v1/roadmaps/full-export"

# 3. Setup Resource Monitor & Signal Traps
echo "[3/7] Initializing background resource monitor..."
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

# Record 5-second baseline idle metrics
echo "baseline" > "${PHASE_FILE}"
echo "      Capturing 5s baseline idle metrics..."
sleep 5

# 4. Execute Test 1: ai-architecture (100 VUs peak)
echo "ai-architecture" > "${PHASE_FILE}"
echo "[4/7] Executing Test 1: GET /api/v1/roadmaps/ai-architecture (100 VUs peak over 60s)..."
K6_AI_EXIT=0
"${K6_BIN}" run \
  --address "" \
  --summary-trend-stats "avg,min,med,p(50),p(90),p(95),p(99),max" \
  --summary-export "${RESULTS_DIR}/phase1-ai-architecture.json" \
  "${SCRIPT_DIR}/phase1-ai-architecture.js" || K6_AI_EXIT=$?
echo "      Test 1 completed with exit code: ${K6_AI_EXIT}"

# 5. Cool-down & GC interval
echo "cooldown_1" > "${PHASE_FILE}"
echo "[5/7] Cooling down for 10s (V8 GC and TCP socket drainage)..."
sleep 10

# 6. Execute Test 2: full-export (30 VUs peak)
echo "full-export" > "${PHASE_FILE}"
echo "[6/7] Executing Test 2: GET /api/v1/roadmaps/full-export (30 VUs peak over 60s)..."
K6_FULL_EXIT=0
"${K6_BIN}" run \
  --address "" \
  --summary-trend-stats "avg,min,med,p(50),p(90),p(95),p(99),max" \
  --summary-export "${RESULTS_DIR}/phase1-full-export.json" \
  "${SCRIPT_DIR}/phase1-full-export.js" || K6_FULL_EXIT=$?
echo "      Test 2 completed with exit code: ${K6_FULL_EXIT}"

# Capture 5s post-test cooldown
echo "cooldown_2" > "${PHASE_FILE}"
echo "      Capturing 5s post-test cooldown..."
sleep 5

# Cleanly stop resource monitor
cleanup
trap - EXIT INT TERM

# 7. Aggregate Results & Scorecard Generation
echo "[7/7] Aggregating results and generating summary scorecard..."
AGGREGATOR_EXIT=0
node "${SCRIPT_DIR}/aggregate-phase1.js" \
  "${RESULTS_DIR}/phase1-ai-architecture.json" \
  "${RESULTS_DIR}/phase1-full-export.json" \
  "${RESOURCE_CSV}" \
  "${SUMMARY_JSON}" || AGGREGATOR_EXIT=$?

echo "================================================================================"
if [ "${K6_AI_EXIT}" -ne 0 ] || [ "${K6_FULL_EXIT}" -ne 0 ] || [ "${AGGREGATOR_EXIT}" -ne 0 ]; then
  echo "Phase 1 FAILED! Consolidated Summary: ${SUMMARY_JSON}"
  echo "Exit Status: Test 1 (ai-architecture)=${K6_AI_EXIT}, Test 2 (full-export)=${K6_FULL_EXIT}, Aggregator=${AGGREGATOR_EXIT}"
  echo "================================================================================"
  # Propagate non-zero failure code (prioritizing k6 threshold failure code 99, then aggregator)
  if [ "${K6_AI_EXIT}" -ne 0 ]; then
    exit "${K6_AI_EXIT}"
  elif [ "${K6_FULL_EXIT}" -ne 0 ]; then
    exit "${K6_FULL_EXIT}"
  else
    exit "${AGGREGATOR_EXIT}"
  fi
fi

echo "Phase 1 Complete! Consolidated Summary: ${SUMMARY_JSON}"
echo "================================================================================"
exit 0
