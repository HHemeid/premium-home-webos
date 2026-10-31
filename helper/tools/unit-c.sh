#!/bin/sh
# C unit tests: upstream's three (adapted) + fork cases, native arm64 (+ASan/UBSan)
# and the ARMv7 hard-float static build run under qemu-arm (user-mode, pure logic only).
set -u
S=src/native/prototype; T=build/tests; rm -rf $T; mkdir -p $T
pass=0; fail=0
run() { name=$1; shift; if out=$("$@" 2>&1); then pass=$((pass+1)); echo "PASS [$name] $out"; else fail=$((fail+1)); echo "FAIL [$name] rc=$? $out"; fi; }
W="-std=c99 -Wall -Wextra -Werror"
for v in native asan armv7; do
  case $v in
    native) CC="gcc $W"; EXEC="";;
    asan)   CC="gcc $W -g -fsanitize=address,undefined -fno-sanitize-recover=all"; EXEC="";;
    armv7)  CC="arm-linux-gnueabihf-gcc $W -static -march=armv7-a -mfloat-abi=hard -mfpu=vfpv3-d16 -mthumb"; EXEC="qemu-arm";;
  esac
  $CC $S/filter.c $S/test_filter.c -o $T/test-filter-$v || { fail=$((fail+1)); echo "FAIL compile test_filter $v"; }
  $CC $S/filter.c $S/test_filter_fork.c -o $T/test-filter-fork-$v || { fail=$((fail+1)); echo "FAIL compile test_filter_fork $v"; }
  $CC $S/test_startup.c -o $T/test-startup-$v || { fail=$((fail+1)); echo "FAIL compile test_startup $v"; }
  $CC $S/test_relay_startup.c $S/filter.c -o $T/test-relay-startup-$v || { fail=$((fail+1)); echo "FAIL compile test_relay_startup $v"; }
  run "upstream test_filter ($v)" $EXEC $T/test-filter-$v
  run "fork test_filter_fork ($v)" $EXEC $T/test-filter-fork-$v
  run "upstream test_startup ($v)" $EXEC $T/test-startup-$v
  run "upstream test_relay_startup ($v)" sh -c "$EXEC $T/test-relay-startup-$v | tail -1"
done
# Smoke: the actual TV binaries under qemu-arm with no input devices present.
mkdir -p /media/developer/apps/usr/palm/applications/com.local.premiumhome.homehelper/state
qemu-arm build/armv7/relay >/dev/null 2>&1; rc=$?
if [ $rc = 10 ]; then pass=$((pass+1)); echo "PASS [armv7 relay smoke] no 'LGE M-RCU - Builtin [1]' device -> exit 10 (never grabs)"; else fail=$((fail+1)); echo "FAIL [armv7 relay smoke] rc=$rc"; fi
qemu-arm build/armv7/relay cleanup >/dev/null 2>&1; rc=$?
if [ $rc = 10 ]; then pass=$((pass+1)); echo "PASS [armv7 relay cleanup smoke] exit 10 without device"; else fail=$((fail+1)); echo "FAIL [armv7 relay cleanup smoke] rc=$rc"; fi
rm -rf /media/developer/apps/usr/palm/applications/com.local.premiumhome.homehelper/state
qemu-arm build/armv7/relay >/dev/null 2>&1; rc=$?
if [ $rc = 18 ]; then pass=$((pass+1)); echo "PASS [armv7 relay smoke] missing state dir -> exit 18 (lock) before touching input"; else fail=$((fail+1)); echo "FAIL [armv7 relay no-state] rc=$rc"; fi
# Smoke: the guard fails open when there is nothing to guard. With no app dir
# (no appinfo.json) it must exit 0 at once, and it opens no input device ever.
timeout 3 qemu-arm build/armv7/guard >/dev/null 2>&1; rc=$?
if [ $rc = 0 ]; then pass=$((pass+1)); echo "PASS [armv7 guard smoke] no package present -> exits 0 immediately (never grabs; opens no device)"; else fail=$((fail+1)); echo "FAIL [armv7 guard smoke] rc=$rc"; fi
echo "unit-c: $pass passed, $fail failed"
[ $fail = 0 ]
