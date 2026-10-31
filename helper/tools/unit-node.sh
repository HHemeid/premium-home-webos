#!/bin/sh
# Node unit tests (Debian nodejs). Upstream tests that still apply + fork fake-TV tests.
set -u
cd src; pass=0; fail=0
echo "node $(node --version)"
for t in native/prototype/test-runtime-policy.cjs native/prototype/test-boot-state.cjs; do
  if out=$(node $t 2>&1); then pass=$((pass+1)); echo "PASS [upstream $t] $(echo "$out" | tr '\n' ' ')"; else fail=$((fail+1)); echo "FAIL [upstream $t] $out"; fi
done
for f in native/app/*.js native/service/*.js; do
  if node --check $f; then pass=$((pass+1)); echo "PASS [node --check] $f"; else fail=$((fail+1)); echo "FAIL [node --check] $f"; fi
done
for t in tests/es5-check.cjs tests/controller.cjs tests/helper-entry.cjs tests/service.cjs; do
  node $t; rc=$?; [ $rc = 0 ] && pass=$((pass+1)) || fail=$((fail+1)); echo "-- $t rc=$rc"
done
echo "unit-node files: $pass passed, $fail failed"
[ $fail = 0 ]
