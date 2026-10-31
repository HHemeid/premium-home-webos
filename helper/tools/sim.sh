#!/bin/sh
# Runs the virtual-remote simulation. Must be started in a privileged container:
#   docker run --rm --privileged -v "$PWD":/work -w /work hh-offline:bookworm sh tools/sim.sh [scenario-prefix...]
# Nothing is loaded on the Mac host; uinput belongs to Docker Desktop's linuxkit VM kernel.
set -eu
echo "kernel: $(uname -srm)"; ls -l /dev/uinput
# Docker's /dev is a static tmpfs: expose the kernel's devtmpfs input nodes so
# uinput-created /dev/input/eventN appear inside the container.
mkdir -p /run/devtmp && mount -t devtmpfs devtmpfs /run/devtmp && mount --bind /run/devtmp/input /dev/input
echo "pre-existing input devices:"; grep -E '^N: ' /proc/bus/input/devices || echo "  (none)"
mkdir -p /usr/lib/node_modules && cp -r src/tests/sim/fakes/webos-service /usr/lib/node_modules/
install -m 755 src/tests/sim/fakes/fake-luna /usr/local/bin/fake-luna
install -m 755 src/tests/sim/fakes/luna-send-pub /usr/bin/luna-send-pub
echo "node: $(node --version)  python-evdev: $(python3 -c 'import evdev,importlib.metadata as m;print(m.version("evdev"))' 2>/dev/null || echo ?)"
echo "relay under test: $(sha256sum build/arm64-sim/relay)"
python3 -I src/tests/sim/sim.py "$@"
