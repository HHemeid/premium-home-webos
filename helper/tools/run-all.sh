#!/bin/sh
# Rebuild everything and rerun every offline test, writing evidence to test-output/.
# Run from the Mac in HOME-HELPER-OFFLINE/ (Docker Desktop required; nothing touches a TV):
#   sh tools/run-all.sh
set -u
cd "$(dirname "$0")/.."
IMG=hh-offline:bookworm
docker build -q -t $IMG tools >/dev/null
docker image inspect $IMG --format 'image {{.Id}} created {{.Created}}' > test-output/image.txt
docker run --rm -v "$PWD":/work -w /work $IMG sh tools/build.sh > test-output/build-log.txt 2>&1; b=$?
docker run --rm -v "$PWD":/work -w /work $IMG sh tools/stage.sh > /dev/null 2>&1
docker run --rm -v "$PWD":/work -w /work $IMG sh tools/unit-c.sh > test-output/unit-c.txt 2>&1; c=$?
docker run --rm -v "$PWD":/work -w /work $IMG sh tools/unit-node.sh > test-output/unit-node.txt 2>&1; n=$?
docker run --rm -v "$PWD":/work -w /work $IMG python3 -I tools/test-packaging.py src/packaging/fix-package-data.py > test-output/packaging.txt 2>&1; p=$?
sh tools/audit.sh > test-output/static-audit.txt 2>&1; a=$?
docker run --rm --privileged -v "$PWD":/work -w /work $IMG sh tools/sim.sh > test-output/uinput-sim.txt 2>&1; s=$?
sh tools/make-diff.sh > /dev/null
echo "build=$b unit-c=$c unit-node=$n packaging=$p audit=$a uinput-sim=$s" | tee test-output/run-all-summary.txt
