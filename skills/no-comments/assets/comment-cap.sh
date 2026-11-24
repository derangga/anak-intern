#!/bin/sh
set -euf

usage() {
  cat >&2 <<'EOF'
usage: comment-cap.sh count|check|update [dir]
  count   print "<lines> <file>" for every file under dir with comment lines
  check   exit 1 if a file has more comment lines than dir/.comment-cap allows
  update  lower each cap to the current count, or create dir/.comment-cap
A file missing from .comment-cap has a cap of 0.
Raise a cap only by editing .comment-cap by hand, so the change shows in review.
When you rename a file, move its line in .comment-cap by hand.
EOF
  exit 2
}

[ $# -ge 1 ] || usage
cmd=$1
dir=${2:-.}
cap="$dir/.comment-cap"

count() {
  git -C "$dir" grep -c -I --untracked -E '^[[:space:]]*(//|#([^![]|$)|/\*|\*([^)]|$)|-- |<!--)' -- . \
    ':!*.md' ':!*.json' ':!*.lock' ':!*.yaml' ':!*.yml' ':!.comment-cap' |
    awk '{ n = $0; sub(/.*:/, "", n); print n, substr($0, 1, length($0) - length(n) - 1) }' |
    LC_ALL=C sort -k2
}

load='BEGIN {
  while ((getline line < capfile) > 0) {
    n = line; sub(/ .*/, "", n); cap[substr(line, length(n) + 2)] = n + 0
  }
}
{ f = substr($0, length($1) + 2); c = (f in cap) ? cap[f] : 0 }'

case $cmd in
  count) count ;;
  check)
    [ -f "$cap" ] || { echo "no $cap, run: comment-cap.sh update $dir" >&2; exit 1; }
    count | awk -v capfile="$cap" "$load"'
      $1 + 0 > c { print f ": " $1 " comment lines, cap " c; bad = 1 }
      $1 + 0 < c { low++ }
      { seen[f] = 1 }
      END {
        for (f in cap) if (!(f in seen) && cap[f] > 0) low++
        if (low) print low " file(s) under their cap, run update to lower it"; exit bad }'
    ;;
  update)
    if [ -f "$cap" ]; then
      tmp=$(mktemp)
      count | awk -v capfile="$cap" "$load"'
        f in cap { print ($1 + 0 < c ? $1 : c), f }' > "$tmp"
      mv "$tmp" "$cap"
    else
      count > "$cap"
    fi
    ;;
  *) usage ;;
esac
