#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3334}"
RAG_URL="${RAG_URL:-http://127.0.0.1:8000}"
ADMIN_API_KEY="${ADMIN_API_KEY:-76bdc056bd9f6c4b108872d109a7641daf7353423dab6a166340324a5a0efb60}"
INTERNAL_KEY="${INTERNAL_KEY:-0b9d9d6b1bbee6eed442ddec456a3452e96ec1bfb4863341ab20afa5527ad9b8}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="${SCRIPT_DIR}/results"
RESOURCE_CSV="${RESOURCE_CSV:-${RESULTS_DIR}/phase3-resources.csv}"
MUTATION_JSON="${MUTATION_JSON:-${RESULTS_DIR}/phase3-mutation-results.json}"
SUMMARY_JSON="${SUMMARY_JSON:-${RESULTS_DIR}/phase3-summary.json}"
PHASE_FILE="${PHASE_FILE:-${RESULTS_DIR}/.phase3_current_phase_$$}"

mkdir -p "${RESULTS_DIR}"

# Purge stale test artifacts from previous runs to ensure clean isolation
rm -f "${MUTATION_JSON}" "${SUMMARY_JSON}" "${RESOURCE_CSV}" "${PHASE_FILE}"

# Clean up abandoned phase files from dead processes (preserving any active parallel runners)
for old_phase in "${RESULTS_DIR}"/.phase3_current_phase_*; do
  if [ -f "${old_phase}" ]; then
    dead_pid="${old_phase##*_}"
    if ! kill -0 "${dead_pid}" 2>/dev/null; then
      rm -f "${old_phase}" 2>/dev/null || true
    fi
  fi
done

echo "================================================================================"
echo "Phase 3: Burst Mutation & Reindex Debounce Throttling Master Runner"
echo "Target Base URL   : ${BASE_URL}"
echo "Target RAG URL    : ${RAG_URL}"
echo "Results Directory : ${RESULTS_DIR}"
echo "================================================================================"

echo "[1/6] Resolving Next.js and FastAPI process hierarchy..."
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

echo "[2/6] Initializing background resource monitor and capturing baseline..."
echo "timestamp,phase,pid,cpu_pct,rss_kb" > "${RESOURCE_CSV}"
echo "baseline" > "${PHASE_FILE}"

cleanup() {
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

echo "      Phase 1/5: Capturing 5s baseline idle metrics..."
sleep 5

echo "[3/6] Phase 2/5: Preflight warmup and health inspection..."
echo "preflight" > "${PHASE_FILE}"
NEXT_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/v1/roadmaps/full-export" || echo "000")
RAG_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${RAG_URL}/health" || echo "000")
echo "      Next.js full-export check: HTTP ${NEXT_HTTP}"
echo "      FastAPI health check     : HTTP ${RAG_HTTP}"
if [ "${NEXT_HTTP}" != "200" ] || [ "${RAG_HTTP}" != "200" ]; then
  echo "ERROR: Preflight health check failed! Next.js HTTP=${NEXT_HTTP}, FastAPI HTTP=${RAG_HTTP}" >&2
  exit 1
fi
sleep 2

echo "[4/6] Executing Phase 3 Burst Mutation Test (Phases 3/5 & 4/5)..."
echo "burst_mutation" > "${PHASE_FILE}"
MUTATION_EXIT=0
BASE_URL="${BASE_URL}" \
RAG_URL="${RAG_URL}" \
ADMIN_API_KEY="${ADMIN_API_KEY}" \
INTERNAL_KEY="${INTERNAL_KEY}" \
OUTPUT_PATH="${MUTATION_JSON}" \
PHASE_FILE="${PHASE_FILE}" \
node "${SCRIPT_DIR}/phase3-burst-mutation.mjs" || MUTATION_EXIT=$?

echo "      Mutation test completed with exit code: ${MUTATION_EXIT}"

echo "[5/6] Phase 5/5: Capturing 5s post-test cooldown..."
echo "cooldown" > "${PHASE_FILE}"
sleep 5

cleanup
trap - EXIT INT TERM

echo "[6/6] Aggregating results and generating summary scorecard..."
AGGREGATOR_EXIT=0
node "${SCRIPT_DIR}/aggregate-phase3.js" \
  "${MUTATION_JSON}" \
  "${RESOURCE_CSV}" \
  "${SUMMARY_JSON}" || AGGREGATOR_EXIT=$?

echo "================================================================================"
if [ "${MUTATION_EXIT}" -ne 0 ] || [ "${AGGREGATOR_EXIT}" -ne 0 ]; then
  echo "Phase 3 FAILED! Check ${SUMMARY_JSON}"
  echo "Exit codes: Mutation=${MUTATION_EXIT}, Aggregator=${AGGREGATOR_EXIT}"
  if [ "${MUTATION_EXIT}" -ne 0 ]; then
    exit "${MUTATION_EXIT}"
  else
    exit "${AGGREGATOR_EXIT}"
  fi
fi

echo "Phase 3 Complete! Consolidated Summary: ${SUMMARY_JSON}"
exit 0
