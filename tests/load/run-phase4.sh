#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3334}"
RAG_URL="${RAG_URL:-http://127.0.0.1:8000}"
ADMIN_API_KEY="${ADMIN_API_KEY:-76bdc056bd9f6c4b108872d109a7641daf7353423dab6a166340324a5a0efb60}"
INTERNAL_KEY="${INTERNAL_KEY:-0b9d9d6b1bbee6eed442ddec456a3452e96ec1bfb4863341ab20afa5527ad9b8}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
RAG_DIR="${REPO_ROOT}/roadmap-rag-assistant"

RESULTS_DIR="${SCRIPT_DIR}/results"
RESOURCE_CSV="${RESOURCE_CSV:-${RESULTS_DIR}/phase4-resources.csv}"
FAILOVER_JSON="${FAILOVER_JSON:-${RESULTS_DIR}/phase4-failover-results.json}"
ROUTER_JSON="${ROUTER_JSON:-${RESULTS_DIR}/phase4-router-eval.json}"
SUMMARY_JSON="${SUMMARY_JSON:-${RESULTS_DIR}/phase4-summary.json}"
PHASE_FILE="${PHASE_FILE:-${RESULTS_DIR}/.phase4_current_phase_$$}"

mkdir -p "${RESULTS_DIR}"

# Purge stale test artifacts from previous runs
rm -f "${FAILOVER_JSON}" "${ROUTER_JSON}" "${SUMMARY_JSON}" "${RESOURCE_CSV}" "${PHASE_FILE}"

# Clean up abandoned phase files from dead processes
for old_phase in "${RESULTS_DIR}"/.phase4_current_phase_*; do
  if [ -f "${old_phase}" ]; then
    dead_pid="${old_phase##*_}"
    if ! kill -0 "${dead_pid}" 2>/dev/null; then
      rm -f "${old_phase}" 2>/dev/null || true
    fi
  fi
done

echo "================================================================================"
echo "Phase 4: Robustness & LLM Circuit Breaker Master Runner"
echo "Target Base URL   : ${BASE_URL}"
echo "Target RAG URL    : ${RAG_URL}"
echo "Results Directory : ${RESULTS_DIR}"
echo "================================================================================"

echo "[1/7] Resolving Next.js and FastAPI process hierarchy..."
NEXT_SERVER_PID=$(lsof -ti :3334 -sTCP:LISTEN | head -n 1 || true)
if [ -z "${NEXT_SERVER_PID}" ]; then
  echo "ERROR: No server listening on port 3334! Is Next.js running?" >&2
  exit 1
fi
NEXT_PARENT_PID=$(ps -o ppid= -p "${NEXT_SERVER_PID}" 2>/dev/null | tr -d ' ' || true)

FASTAPI_PIDS_RAW=$(lsof -ti :8000 -sTCP:LISTEN | sort -u || true)
if [ -z "${FASTAPI_PIDS_RAW}" ]; then
  echo "ERROR: No server listening on port 8000! Is FastAPI running?" >&2
  exit 1
fi
FASTAPI_PIDS=$(echo "${FASTAPI_PIDS_RAW}" | tr '\n' ' ')

MONITOR_PIDS="${NEXT_SERVER_PID}"
[ -n "${NEXT_PARENT_PID}" ] && [ "${NEXT_PARENT_PID}" != "1" ] && MONITOR_PIDS="${MONITOR_PIDS},${NEXT_PARENT_PID}"
for fpid in ${FASTAPI_PIDS}; do
  MONITOR_PIDS="${MONITOR_PIDS},${fpid}"
done

echo "      Next.js Server PID : ${NEXT_SERVER_PID} (Parent: ${NEXT_PARENT_PID:-none})"
echo "      FastAPI PIDs       : ${FASTAPI_PIDS}"
echo "      Monitoring PIDs    : ${MONITOR_PIDS}"

echo "[2/7] Initializing background resource monitor..."
echo "timestamp,phase,pid,cpu_pct,rss_kb" > "${RESOURCE_CSV}"
echo "baseline" > "${PHASE_FILE}"

cleanup() {
  rm -f "${PHASE_FILE}" 2>/dev/null || true
  if [ -n "${MONITOR_PID:-}" ]; then
    kill "${MONITOR_PID}" 2>/dev/null || true
    wait "${MONITOR_PID}" 2>/dev/null || true
  fi
  if [ -n "${FASTAPI_PIDS:-}" ]; then
    kill -CONT ${FASTAPI_PIDS} 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM HUP

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

echo "      Capturing 3s baseline idle metrics..."
sleep 3

echo "[3/7] Preflight warmup and health inspection..."
echo "preflight" > "${PHASE_FILE}"
NEXT_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/v1/roadmaps/full-export" || echo "000")
RAG_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${RAG_URL}/health" || echo "000")
PROXY_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/roadmap-assistant/health" || echo "000")
echo "      Next.js full-export check: HTTP ${NEXT_HTTP}"
echo "      FastAPI health check     : HTTP ${RAG_HTTP}"
echo "      Next.js proxy health     : HTTP ${PROXY_HTTP}"

if [ "${NEXT_HTTP}" != "200" ] || [ "${RAG_HTTP}" != "200" ] || [ "${PROXY_HTTP}" != "200" ]; then
  echo "ERROR: Preflight health check failed! Next.js HTTP=${NEXT_HTTP}, FastAPI HTTP=${RAG_HTTP}, Proxy HTTP=${PROXY_HTTP}" >&2
  exit 1
fi
sleep 1

echo "[4/7] Executing Phase 4 Failover & Recovery Test..."
echo "failover_recovery" > "${PHASE_FILE}"
FAILOVER_EXIT=0
BASE_URL="${BASE_URL}" \
RAG_URL="${RAG_URL}" \
ADMIN_API_KEY="${ADMIN_API_KEY}" \
INTERNAL_KEY="${INTERNAL_KEY}" \
OUTPUT_PATH="${FAILOVER_JSON}" \
PHASE_FILE="${PHASE_FILE}" \
node "${SCRIPT_DIR}/phase4-failover-recovery.mjs" || FAILOVER_EXIT=$?

echo "      Failover & Recovery test completed with exit code: ${FAILOVER_EXIT}"

echo "[5/7] Executing Phase 4 Router Invariant & Confuse Evaluation..."
echo "router_eval" > "${PHASE_FILE}"
ROUTER_EXIT=0
PYTHON_BIN="${RAG_DIR}/.venv/bin/python"
if [ ! -f "${PYTHON_BIN}" ]; then
  PYTHON_BIN="python3"
fi

"${PYTHON_BIN}" "${SCRIPT_DIR}/phase4-router-eval.py" \
  --output "${ROUTER_JSON}" \
  --rag-dir "${RAG_DIR}" || ROUTER_EXIT=$?

echo "      Router Evaluation completed with exit code: ${ROUTER_EXIT}"

echo "[6/7] Capturing 3s post-test cooldown..."
echo "cooldown" > "${PHASE_FILE}"
sleep 3

cleanup
trap - EXIT INT TERM HUP

echo "[7/7] Aggregating results and generating summary scorecard..."
AGGREGATOR_EXIT=0
node "${SCRIPT_DIR}/aggregate-phase4.js" \
  "${FAILOVER_JSON}" \
  "${ROUTER_JSON}" \
  "${RESOURCE_CSV}" \
  "${SUMMARY_JSON}" || AGGREGATOR_EXIT=$?

echo "================================================================================"
if [ "${FAILOVER_EXIT}" -ne 0 ] || [ "${ROUTER_EXIT}" -ne 0 ] || [ "${AGGREGATOR_EXIT}" -ne 0 ]; then
  echo "Phase 4 FAILED! Check ${SUMMARY_JSON}"
  echo "Exit codes: Failover=${FAILOVER_EXIT}, Router=${ROUTER_EXIT}, Aggregator=${AGGREGATOR_EXIT}"
  if [ "${FAILOVER_EXIT}" -ne 0 ]; then
    exit "${FAILOVER_EXIT}"
  elif [ "${ROUTER_EXIT}" -ne 0 ]; then
    exit "${ROUTER_EXIT}"
  else
    exit "${AGGREGATOR_EXIT}"
  fi
fi

echo "Phase 4 Complete! Consolidated Summary: ${SUMMARY_JSON}"
exit 0
