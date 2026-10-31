#!/bin/sh
# Stages the ARMv7 package tree an ipk would contain (NOT packaged: ares-package is
# deliberately not run). Usage: sh tools/stage.sh   (run after tools/build.sh)
set -eu
S=src/native; O=build/stage
rm -rf $O; mkdir -p $O/app/state $O/service/state
cp $S/app/appinfo.json $S/app/native.js $S/app/helper-entry.js $S/app/config.js $S/app/runtime-policy.js $S/app/icon.png $S/app/largeIcon.png $O/app/
cp build/armv7/relay build/armv7/detach build/armv7/guard $O/app/; chmod 755 $O/app/relay $O/app/detach $O/app/guard
cp $S/service/service.js $S/service/boot-state.js $S/service/services.json $S/service/package.json $O/service/
for d in app service; do cp src/LICENSE src/NOTICE $O/$d/; touch $O/$d/state/.keep; done
( cd $O && find . -type f | LC_ALL=C sort | xargs sha256sum ) > test-output/stage-manifest.txt
cat test-output/stage-manifest.txt
