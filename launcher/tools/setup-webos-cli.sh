#!/bin/zsh
# Installs LG's official webOS CLI (@webos-tools/cli) into tools/webos-cli/, inside this project only.
# No global or system changes; delete tools/webos-cli/ to remove it. Does not contact a TV.
cd "$(dirname "$0")/webos-cli" 2>/dev/null || { mkdir -p "$(dirname "$0")/webos-cli" && cd "$(dirname "$0")/webos-cli"; }
npm install --no-fund --no-audit --prefix . @webos-tools/cli && ./node_modules/.bin/ares -V
