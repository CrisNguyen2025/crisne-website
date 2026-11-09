#!/usr/bin/env bash
# Helper dùng chung cho baseline.sh, check-boundary.sh, wait-result.sh. Chạy được trên bash 3.2 (macOS).

die() { echo "ERROR: $*" >&2; exit 2; }

repo_root() { git rev-parse --show-toplevel; }

file_hash() {
  local p=$1
  if [ -L "$p" ]; then
    printf %s "$(readlink "$p")" | git hash-object --stdin
  elif [ -e "$p" ]; then
    git hash-object -- "$p"
  else
    echo DELETED
  fi
}

# In ra đường dẫn của mọi file đang khác HEAD (modified, staged, untracked, renamed).
dirty_paths() {
  git status --porcelain -uall | while IFS= read -r line; do
    path="${line:3}"
    case "$path" in *" -> "*) path="${path##* -> }" ;; esac
    printf '%s\n' "$path"
  done
}

# scalar_field <spec> <key>: giá trị một dòng `key: "value"` trong frontmatter.
scalar_field() {
  awk -v key="$2" '
    /^---[[:space:]]*$/ { fm++; next }
    fm == 1 && $0 ~ "^" key ":" {
      s = $0
      sub("^" key ":[[:space:]]*", "", s)
      sub(/[[:space:]]+#.*$/, "", s)
      gsub(/^["\047]|["\047]$/, "", s)
      print s
      exit
    }
  ' "$1"
}

# list_field <spec> <key>: các mục `- value` bên dưới `key:` trong frontmatter.
list_field() {
  awk -v key="$2" '
    /^---[[:space:]]*$/ { fm++; next }
    fm == 1 {
      if (inlist) {
        if ($0 ~ /^[[:space:]]*-[[:space:]]*/) {
          s = $0
          sub(/^[[:space:]]*-[[:space:]]*/, "", s)
          sub(/[[:space:]]+#.*$/, "", s)
          gsub(/^["\047]|["\047]$/, "", s)
          print s
          next
        }
        inlist = 0
      }
      if ($0 ~ "^[[:space:]]*" key ":[[:space:]]*$") inlist = 1
    }
  ' "$1"
}
