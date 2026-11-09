#!/usr/bin/env bash
# Chờ Executor báo xong. In đúng một dòng rồi thoát (chạy bằng run_in_background để được gọi lại).
#   RESULT <status> <path>          result.json xuất hiện
#   SPEC_TERMINAL <status> ...      spec đã COMPLETED/ESCALATED/ABORTED nhưng 60s sau vẫn chưa có result.json
#   STALLED <giây>s ...             spec IN_PROGRESS mà không có file nào đổi suốt <stall> giây
#   TIMEOUT <giây>                  hết thời gian chờ
# STALLED chỉ đếm khi spec đã IN_PROGRESS (Executor đã bắt đầu). Spec còn READY thì không tính,
# để Dev dán prompt muộn không bị báo nhầm.
# "Có thay đổi" = dấu vân tay của mọi file đang dirty trong working tree và mọi file trong .handoff/runs/.
# Dùng: bash .agents/skills/agent-handoff/scripts/wait-result.sh <task_id> [timeout=14400] [chu_kỳ=5] [stall=1800]
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$here/lib.sh"

id="${1:-}"
[ -n "$id" ] || die "usage: wait-result.sh <task_id> [timeout] [interval] [stall]"
timeout="${2:-14400}"
interval="${3:-5}"
stall="${4:-1800}"
probe_every=$((interval * 6))
cd "$(repo_root)"

res=".handoff/runs/$id/result.json"
spec=".handoff/specs/$id.md"
start="$(date +%s)"
terminal_since=""
last_probe=0
last_fp=""
last_change="$start"

fingerprint() {
  {
    dirty_paths | while IFS= read -r p; do printf '%s %s\n' "$p" "$(file_hash "$p")"; done
    find .handoff/runs -type f 2>/dev/null | sort | while IFS= read -r f; do printf '%s %s\n' "$f" "$(file_hash "$f")"; done
  } | git hash-object --stdin
}

while :; do
  if [ -f "$res" ]; then
    st="$(sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([A-Z_]*\)".*/\1/p' "$res" | head -1)"
    echo "RESULT ${st:-UNKNOWN} $res"
    exit 0
  fi
  now="$(date +%s)"
  s=""
  [ -f "$spec" ] && s="$(scalar_field "$spec" status)"

  case "$s" in
    COMPLETED|ESCALATED|ABORTED)
      [ -n "$terminal_since" ] || terminal_since="$now"
      if [ $((now - terminal_since)) -ge 60 ]; then
        echo "SPEC_TERMINAL $s (không có result.json)"
        exit 0
      fi
      ;;
    *) terminal_since="" ;;
  esac

  if [ "$s" = "IN_PROGRESS" ]; then
    if [ $((now - last_probe)) -ge "$probe_every" ]; then
      fp="$(fingerprint)"
      last_probe="$now"
      if [ "$fp" != "$last_fp" ]; then
        last_fp="$fp"
        last_change="$now"
      fi
    fi
    if [ $((now - last_change)) -ge "$stall" ]; then
      echo "STALLED ${stall}s (spec IN_PROGRESS, không có file nào đổi)"
      exit 0
    fi
  else
    last_probe=0
    last_fp=""
    last_change="$now"
  fi

  if [ $((now - start)) -ge "$timeout" ]; then
    echo "TIMEOUT ${timeout}s"
    exit 0
  fi
  sleep "$interval"
done
