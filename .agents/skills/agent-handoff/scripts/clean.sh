#!/usr/bin/env bash
# Dọn thư mục runtime của handoff (.handoff/runs/). Mặc định chỉ liệt kê (dry-run).
# Không bao giờ đụng spec hay file nào ngoài .handoff/runs/TASK-*/ (và .lock khi có --remove-lock).
#
# Dùng: bash .agents/skills/agent-handoff/scripts/clean.sh [--apply] [--days N] [--force-uncommitted] [--remove-lock]
#   --apply              xoá thật (không có cờ này thì chỉ liệt kê)
#   --days N             ABORTED chỉ bị xoá khi thư mục cũ hơn N ngày (mặc định 7)
#   --force-uncommitted  cho phép xoá task COMPLETED dù spec chưa commit
#   --remove-lock        xoá .handoff/runs/.lock nếu nó mồ côi (task giữ lock không còn IN_PROGRESS); cần Dev đồng ý trước
#
# Quy tắc xoá thư mục runs/<task_id>/:
#   COMPLETED/DONE  + spec đã commit và sạch  -> xoá
#   ABORTED         + cũ hơn N ngày           -> xoá
#   ESCALATED, IN_PROGRESS, READY, khác, hoặc thiếu spec -> giữ (ESCALATED/ABORTED in thêm danh sách file Executor đã đổi)
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$here/lib.sh"

apply=0
days=7
force_uncommitted=0
remove_lock=0
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) apply=1 ;;
    --days) shift; days="${1:-}" ;;
    --force-uncommitted) force_uncommitted=1 ;;
    --remove-lock) remove_lock=1 ;;
    -h|--help) sed -n '2,13p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) die "tham số lạ: $1" ;;
  esac
  shift
done
case "$days" in ''|*[!0-9]*) die "--days phải là số nguyên không âm" ;; esac

cd "$(repo_root)"
runs=".handoff/runs"
[ -d "$runs" ] || { echo "Không có $runs, không có gì để dọn."; exit 0; }

is_committed() {
  git ls-files --error-unmatch -- "$1" >/dev/null 2>&1 && [ -z "$(git status --porcelain -- "$1")" ]
}

list_modified() {
  awk '/"modified_files"/ { f = 1; next } f && /\]/ { exit } f { gsub(/^[[:space:]]*"/, ""); gsub(/",?[[:space:]]*$/, ""); if ($0 != "") print "      - " $0 }' "$1"
}

safe_rm() {
  case "$1" in
    .handoff/runs/TASK-*) ;;
    *) die "từ chối xoá đường dẫn ngoài phạm vi: $1" ;;
  esac
  [ -L "$1" ] && die "từ chối xoá symlink: $1"
  rm -r -- "$1"
}

del_count=0
del_kb=0
keep_count=0

for d in "$runs"/TASK-*; do
  [ -e "$d" ] || continue
  id="${d##*/}"
  if [ -L "$d" ] || [ ! -d "$d" ]; then
    echo "GIỮ  $id (không phải thư mục thường)"; keep_count=$((keep_count + 1)); continue
  fi
  spec=".handoff/specs/$id.md"
  if [ ! -f "$spec" ]; then
    echo "GIỮ  $id (không thấy spec $spec)"; keep_count=$((keep_count + 1)); continue
  fi
  status="$(scalar_field "$spec" status | sed 's/[[:space:]].*//')"
  kb="$(du -sk "$d" | cut -f1)"
  reason=""
  case "$status" in
    COMPLETED|DONE)
      if is_committed "$spec" || [ "$force_uncommitted" = 1 ]; then
        reason="$status, spec đã commit"
        [ "$force_uncommitted" = 1 ] && reason="$status, bỏ qua kiểm commit (--force-uncommitted)"
      else
        echo "GIỮ  $id ($status nhưng spec chưa commit hoặc còn thay đổi; dùng --force-uncommitted để bỏ qua)"
        keep_count=$((keep_count + 1)); continue
      fi
      ;;
    ABORTED)
      if [ -n "$(find "$d" -maxdepth 0 -mtime +"$days" 2>/dev/null)" ]; then
        reason="ABORTED quá $days ngày"
      else
        echo "GIỮ  $id (ABORTED, chưa quá $days ngày)"
        [ -f "$d/result.json" ] && list_modified "$d/result.json"
        keep_count=$((keep_count + 1)); continue
      fi
      ;;
    ESCALATED)
      echo "GIỮ  $id (ESCALATED, chờ Dev quyết). File Executor đã đổi/tạo:"
      [ -f "$d/result.json" ] && list_modified "$d/result.json"
      keep_count=$((keep_count + 1)); continue
      ;;
    *)
      echo "GIỮ  $id (trạng thái ${status:-không rõ})"; keep_count=$((keep_count + 1)); continue
      ;;
  esac

  if [ "$apply" = 1 ]; then
    safe_rm "$d"
    echo "XOÁ  $id ($reason, ${kb} KB)"
  else
    echo "SẼ XOÁ  $id ($reason, ${kb} KB)"
  fi
  del_count=$((del_count + 1)); del_kb=$((del_kb + kb))
done

lock="$runs/.lock"
if [ -f "$lock" ]; then
  lock_id="$(sed -n 's/.*"task_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$lock" | head -1)"
  lock_status=""
  [ -n "$lock_id" ] && [ -f ".handoff/specs/$lock_id.md" ] && lock_status="$(scalar_field ".handoff/specs/$lock_id.md" status | sed 's/[[:space:]].*//')"
  if [ "$lock_status" = "IN_PROGRESS" ]; then
    echo "LOCK $lock_id đang IN_PROGRESS: không đụng."
  else
    echo "LOCK MỒ CÔI: .lock thuộc '${lock_id:-không đọc được}' (spec: ${lock_status:-không có}). Chỉ xoá khi Dev đồng ý, bằng --apply --remove-lock."
    if [ "$apply" = 1 ] && [ "$remove_lock" = 1 ]; then
      rm -- "$lock"
      echo "XOÁ  .lock"
    fi
  fi
fi

esc_count="$(ls "$runs"/escalations/ESC-*.md 2>/dev/null | wc -l | tr -d ' ')"
[ "$esc_count" -gt 0 ] && echo "GHI CHÚ: có $esc_count báo cáo trong $runs/escalations/ (script không xoá)."

if [ "$apply" = 1 ]; then
  echo "Đã xoá $del_count thư mục (${del_kb} KB), giữ $keep_count."
else
  echo "Dry-run: sẽ xoá $del_count thư mục (${del_kb} KB), giữ $keep_count. Thêm --apply để xoá thật."
fi
