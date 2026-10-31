#!/bin/sh
# Builds every native artifact from src/ inside the hh-offline:bookworm container.
# Usage (from the Mac): docker run --rm -v "$PWD":/work -w /work hh-offline:bookworm sh tools/build.sh
set -eu
S=src/native; B=build
rm -rf "$B/armv7" "$B/arm64" "$B/arm64-sim" "$B/arm64-sim-noecho" "$B/repro"
mkdir -p "$B/armv7" "$B/arm64" "$B/arm64-sim" "$B/arm64-sim-noecho" "$B/repro"
WARN="-std=gnu99 -Wall -Wextra"
REPRO="-ffile-prefix-map=/work=. -fno-ident"
# TV target: ARMv7-A, hard-float (EABI5 armhf), statically linked glibc, stripped.
ARMCC=arm-linux-gnueabihf-gcc
ARMFLAGS="$WARN -Os -static -s $REPRO -march=armv7-a -mfloat-abi=hard -mfpu=vfpv3-d16 -mthumb"
NATFLAGS="$WARN -Os -static -s $REPRO"
build() { # cc flags outdir [extra]
  cc=$1; fl=$2; out=$3; shift 3
  $cc $fl "$@" $S/prototype/relay.c $S/prototype/filter.c -o "$out/relay"
  $cc $fl "$@" $S/app/detach.c -o "$out/detach"
  # Independent fail-open guard (guard.c): tiny, never opens an input device.
  $cc $fl "$@" $S/app/guard.c -o "$out/guard"
}
build "$ARMCC" "$ARMFLAGS" "$B/armv7"
build gcc "$NATFLAGS" "$B/arm64"
# Simulation-only build: identical source, Home mapped to KEY_HOMEPAGE (172)
# because stock kernels reject key codes above KEY_MAX (767). Never for the TV.
build gcc "$NATFLAGS" "$B/arm64-sim" -DHELPER_HOME_CODE=172
# Simulation-only, upstream-equivalent relay (fork delivery check compiled out) to show the residual it closes.
build gcc "$NATFLAGS" "$B/arm64-sim-noecho" -DHELPER_HOME_CODE=172 -DHELPER_NO_ECHO_CHECK
# Reproducibility: rebuild the TV artifacts and compare.
build "$ARMCC" "$ARMFLAGS" "$B/repro"
cmp "$B/armv7/relay" "$B/repro/relay" && cmp "$B/armv7/detach" "$B/repro/detach" && cmp "$B/armv7/guard" "$B/repro/guard" && echo "REPRODUCIBLE: armv7 relay+detach+guard rebuild byte-identical"
rm -rf "$B/repro"
{
  echo "== toolchain"; $ARMCC --version | head -1; gcc --version | head -1
  dpkg-query -W -f='${Package} ${Version}\n' gcc-arm-linux-gnueabihf gcc-12-arm-linux-gnueabihf libc6-dev-armhf-cross gcc libc6-dev nodejs qemu-user python3-evdev
  echo "== flags"; echo "armv7: $ARMCC $ARMFLAGS"; echo "arm64: gcc $NATFLAGS"; echo "arm64-sim: gcc $NATFLAGS -DHELPER_HOME_CODE=172"; echo "arm64-sim-noecho: gcc $NATFLAGS -DHELPER_HOME_CODE=172 -DHELPER_NO_ECHO_CHECK"
  echo "== file"; file $B/armv7/* $B/arm64/* $B/arm64-sim/* $B/arm64-sim-noecho/*
  echo "== sha256"; sha256sum $B/armv7/* $B/arm64/* $B/arm64-sim/* $B/arm64-sim-noecho/*
  echo "== armv7 ELF attributes (relay)"; arm-linux-gnueabihf-readelf -A $B/armv7/relay | grep -E 'Tag_CPU_arch|Tag_FP_arch|Tag_ABI_VFP_args|Tag_THUMB'
  echo "== armv7 dynamic section (expect none)"; arm-linux-gnueabihf-readelf -d $B/armv7/relay 2>&1 | head -2
  echo "== required glibc symbols version max (static, informational)"; arm-linux-gnueabihf-readelf -h $B/armv7/relay | grep -E 'Class|Machine|Flags|OS/ABI'
} > test-output/build-info.txt 2>&1
cat test-output/build-info.txt
