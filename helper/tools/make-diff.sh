#!/bin/sh
# Regenerates upstream.diff: pinned upstream (upstream-ref/, git archive of b473fae) -> src/.
# Modified and added shipped files are shown in full unified diff; removed upstream
# files are listed (name + line count) in the header instead of as deletions.
set -eu
cd "$(dirname "$0")/.."
T=$(mktemp -d); mkdir -p $T/a/native $T/b/native $T/a/packaging $T/b/packaging
cp -R upstream-ref/native/app upstream-ref/native/prototype upstream-ref/native/service $T/a/native/
cp -R src/native/app src/native/prototype src/native/service $T/b/native/
cp upstream-ref/fix-package-data.py $T/a/packaging/; cp src/packaging/fix-package-data.py $T/b/packaging/
find $T -name '*.png' -delete
{
echo "# upstream.diff  Razdva122/clean-your-tv-lg-webos@b473faeb944eeaff89df083d840bb90126e49253 -> HOME-HELPER-OFFLINE/src"
echo "# Paths: a/native = upstream native/, a/packaging = upstream scripts/fix-package-data.py"
echo "# Icons (*.png) excluded (upstream brand art not used; fork icons are generated)."
echo "# Upstream native/app/vendor/ (ws 8.21.0, ws-legacy 6.2.4) removed entirely (SSAP client only)."
echo "#"
echo "# Removed upstream files (not shipped by the fork):"
( cd $T/a && find . -type f | LC_ALL=C sort ) | while read f; do
  if [ ! -e "$T/b/$f" ]; then echo "#   - ${f#./} ($(wc -l < "$T/a/$f" | tr -d ' ') lines)"; rm "$T/a/$f"; fi
done
echo "#"
echo "# New fork files (shown below as additions):"
( cd $T/b && find . -type f | LC_ALL=C sort ) | while read f; do [ -e "$T/a/$f" ] || echo "#   + ${f#./}"; done
echo
( cd $T && diff -ruN a b ) || true
} > upstream.diff
rm -rf $T
grep -c '' upstream.diff
