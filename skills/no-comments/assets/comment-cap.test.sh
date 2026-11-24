#!/bin/sh
set -eu
script="$(cd "$(dirname "$0")" && pwd)/comment-cap.sh"
repo=$(mktemp -d)
trap 'rm -rf "$repo"' EXIT
cd "$repo"
git init -q

fail() { echo "FAIL: $1" >&2; exit 1; }
expect_cap() { [ "$(cat .comment-cap)" = "$1" ] || fail "$2: got $(cat .comment-cap)"; }

printf '// a\n// b\ncode\n' > a.ts
printf '#!/bin/sh\n# c\necho\n' > b.sh
mkdir "with space"
printf '// d\n' > "with space/c.ts"
printf '# heading\n' > notes.md
printf '#[derive(Debug)]\nstruct S;\n' > d.rs
printf 'case $x in\n  *) exit ;;\nesac\n' > e.sh

sh "$script" update
expect_cap "2 a.ts
1 b.sh
1 with space/c.ts" "first update"
sh "$script" check >/dev/null || fail "check after first update"

printf '// e\n' >> a.ts
! sh "$script" check >/dev/null || fail "added comment passed"
sh "$script" update
expect_cap "2 a.ts
1 b.sh
1 with space/c.ts" "update raised a cap"

printf 'code\n' > a.ts
printf '// f\n' > new.ts
! sh "$script" check >/dev/null || fail "new file with comment passed"
rm new.ts
sh "$script" check | grep -q 'under their cap' || fail "missing under-cap note"
sh "$script" update
expect_cap "1 b.sh
1 with space/c.ts" "update did not lower"

mkdir sub
printf '// g\n' > sub/x.ts
sh "$script" update sub
[ "$(cat sub/.comment-cap)" = "1 x.ts" ] || fail "dir scope"

echo ok
