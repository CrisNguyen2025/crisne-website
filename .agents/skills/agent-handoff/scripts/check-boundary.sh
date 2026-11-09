#!/usr/bin/env bash
# So working tree hiện tại với baseline, đối chiếu boundaries của spec.
# Dùng: bash .agents/skills/agent-handoff/scripts/check-boundary.sh <task_id>
# Exit 0: không vi phạm. Exit 1: có FORBIDDEN hoặc OUT_OF_SCOPE. Exit 2: lỗi dùng.
# Glob: `*` khớp cả `/` (nên `dir/**` và `dir/*` đều là prefix). Mẫu kết thúc bằng `/` coi như `dir/**`.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$here/lib.sh"

id="${1:-}"
[ -n "$id" ] || die "usage: check-boundary.sh <task_id>"
cd "$(repo_root)"

spec=".handoff/specs/$id.md"
base=".handoff/runs/$id/baseline.txt"
[ -f "$spec" ] || die "không thấy spec: $spec"
[ -f "$base" ] || die "chưa có baseline: chạy baseline.sh $id trước khi giao"

base_head="$(sed -n 's/^HEAD //p' "$base" | head -1)"
task_type="$(scalar_field "$spec" type)"
[ -n "$task_type" ] || task_type=implement

allowed="$(list_field "$spec" allowed_to_modify)"
forbidden="$(list_field "$spec" strictly_forbidden)"
[ "$task_type" = review ] && allowed=""

changed="$(mktemp)"
trap 'rm -f "$changed"' EXIT

baseline_hash() {
  awk -F'\t' -v p="$1" '$1 == "FILE" && $3 == p { print $2; exit }' "$base"
}

dirty_paths | while IFS= read -r p; do
  bh="$(baseline_hash "$p")"
  if [ -z "$bh" ] || [ "$bh" != "$(file_hash "$p")" ]; then echo "$p" >> "$changed"; fi
done
awk -F'\t' '$1 == "FILE" { print $3 }' "$base" | while IFS= read -r p; do
  if [ "$(baseline_hash "$p")" != "$(file_hash "$p")" ]; then echo "$p" >> "$changed"; fi
done
git diff --name-only "$base_head" HEAD >> "$changed" 2>/dev/null || true
committed="$(git rev-list --count "$base_head"..HEAD 2>/dev/null || echo 0)"

matches() { # $1 = file, $2 = danh sách pattern (mỗi dòng một mẫu)
  local f=$1 pat
  while IFS= read -r pat; do
    [ -n "$pat" ] || continue
    case "$pat" in */) pat="${pat}**" ;; esac
    # shellcheck disable=SC2053
    if [[ $f == $pat ]]; then return 0; fi
  done <<EOP
$2
EOP
  return 1
}

bad=0
total=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  total=$((total + 1))
  [ "$f" = "$spec" ] && { echo "OK $f (spec)"; continue; }
  if matches "$f" "$forbidden"; then
    echo "FORBIDDEN $f"; bad=$((bad + 1))
  elif [ -n "$allowed" ] && ! matches "$f" "$allowed"; then
    echo "OUT_OF_SCOPE $f"; bad=$((bad + 1))
  elif [ -z "$allowed" ]; then
    echo "OUT_OF_SCOPE $f (task $task_type không được sửa file)"; bad=$((bad + 1))
  else
    echo "OK $f"
  fi
done <<EOL
$(sort -u "$changed")
EOL

[ "$committed" -gt 0 ] && echo "WARN executor đã tạo $committed commit kể từ baseline (quy ước: không commit)"
echo "SUMMARY changed=$total violations=$bad"
[ "$bad" -eq 0 ]
