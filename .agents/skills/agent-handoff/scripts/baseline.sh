#!/usr/bin/env bash
# Ghi mốc trạng thái working tree trước khi giao task cho Executor.
# Dùng: bash .agents/skills/agent-handoff/scripts/baseline.sh <task_id>
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$here/lib.sh"

id="${1:-}"
[ -n "$id" ] || die "usage: baseline.sh <task_id>"
cd "$(repo_root)"

dir=".handoff/runs/$id"
mkdir -p "$dir"
if [ -f "$dir/result.json" ]; then
  mv "$dir/result.json" "$dir/result.$(date +%Y%m%d-%H%M%S).json"
fi

out="$dir/baseline.txt"
{
  echo "HEAD $(git rev-parse HEAD)"
  echo "BRANCH $(git branch --show-current)"
  echo "AT $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  dirty_paths | while IFS= read -r p; do
    printf 'FILE\t%s\t%s\n' "$(file_hash "$p")" "$p"
  done
} > "$out"

echo "baseline: $out ($(grep -c '^FILE' "$out" || true) file đang dirty tại thời điểm giao)"
