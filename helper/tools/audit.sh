#!/bin/sh
# Static audit (code lines, not comments) of the shipped sources (src/native, src/packaging) for dropped features and old ids.
cd "$(dirname "$0")/.."
fail=0
for pat in 'com.local.nativehome' 'com.gathin.tvhome' 'nativehome' 'showHelper' 'ssap' 'SSAP' ':3001' 'CONTROL_POWER' 'eim/' 'addDevice' '/tmp' 'control.json' 'home-request' 'home-control' '\\bstall' 'SIGSTOP' 'resume' 'websocket' 'screen-watch' 'app-inventory' 'updater' 'http://' 'https://' 'wss://'; do
  # code only: comment lines (// /* *) that merely document removed features are skipped
  hits=$(grep -rnE --include='*.js' --include='*.c' --include='*.h' --include='*.json' --include='*.py' -- "$pat" src/native src/packaging | grep -v '/test' | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|/\*|\*)' || true)
  if [ -n "$hits" ]; then echo "FOUND '$pat':"; echo "$hits"; fail=$((fail+1)); else echo "PASS absent: $pat"; fi
done
echo "-- absolute paths in shipped code (all must be the new id or system paths):"
grep -rhoE "/media/developer/apps/usr/palm/[a-z]+/[a-zA-Z0-9._-]+" src/native src/packaging | sort | uniq -c
echo "-- every Luna URI used by shipped code:"
grep -rhoE "luna://[a-zA-Z0-9._/-]+" src/native/app src/native/service | sort | uniq -c
grep -rhoE "'luna://'\+config\.service\+'/[a-z]+'" src/native/app | sort | uniq -c
echo "audit: $fail forbidden patterns found"
[ $fail = 0 ]
