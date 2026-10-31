# Fork notes: Premium Home Helper (`com.local.premiumhome.homehelper`)

> **Status: offline engineering only.** I have not built a package (`ares-package` was not run), installed anything, or run anything on the TV, and no TV or network device was contacted. Installing needs separate approval from the owner.

## Fork point
- **Upstream:** https://github.com/Razdva122/clean-your-tv-lg-webos (MIT)
- **Forked from:** `b473faeb944eeaff89df083d840bb90126e49253` on `main` (merge of PR #98, 2026-10-27 18:40 +0500). This is the commit the earlier read-only review covered.
- **Upstream re-checked 2026-10-28 ~04:42 UTC with `git ls-remote` / `fetch`:**
  - `main` is still `b473fae`.
  - `release/next` is now `1ac16a5` (2026-10-28 00:14 +0500), but it changes nothing under `native/`.
  - The helper branches `codex/helper-diagnostics`, `codex/helper-node012`, `codex/helper-status-start` and `fix/next-release-candidate` are all already merged into `main`.
  - **Conclusion: there are no newer relay, filter or controller fixes to pick up.**
- **Pinned upstream source:** `upstream-ref/` holds a `git archive` of the files this fork uses, so the diff can be regenerated (`sh tools/make-diff.sh`).
- **No upstream binaries used.** `native/published/*.ipk` and the pinned 0.6.19 bytes were never read for this fork. Every binary is compiled from `src/` (see BUILD.md).

## Layout
```
src/LICENSE                 upstream MIT license, unchanged
src/NOTICE                  attribution + what was / was not taken
src/native/app/             detach.c lock.h paths.h(new) config.js(new) helper-entry.js native.js
                            runtime-policy.js appinfo.json icon.png largeIcon.png (generated)
src/native/prototype/       relay.c filter.c filter.h startup.h + C tests (upstream 3 + test_filter_fork.c)
                            + upstream test-runtime-policy.cjs, test-boot-state.cjs
src/native/service/         service.js boot-state.js services.json package.json
src/packaging/              fix-package-data.py (state dirs -> prisoner:jailer 0770), renamed paths only
src/tests/                  fake-TV harness (fake-tv.cjs) + controller/helper-entry/service/ES5 tests
src/tests/sim/              uinput simulation (sim.py) + SIMULATION-ONLY fakes (webos-service, fake-luna, luna-send-pub)
tools/                      Dockerfile, build.sh, unit-c.sh, unit-node.sh, sim.sh, stage.sh, audit.sh, make-diff.sh, run-all.sh
build/                      artifacts (armv7 = TV, arm64 = native tests, arm64-sim* = simulation only, stage/ = ipk layout)
upstream.diff               full diff of shipped code vs pinned upstream
```

## Renames
| Upstream | Fork |
|---|---|
| app id `com.local.nativehome` | `com.local.premiumhome.homehelper` (title "Premium Home Helper", version 0.1.0) |
| service `com.local.nativehome.service` | `com.local.premiumhome.homehelper.service` |
| activity `com.local.nativehome.boot` | `com.local.premiumhome.homehelper.boot` |
| launch target `com.gathin.tvhome` | `local.lgc4.premiumhome` |
| `/media/developer/apps/usr/palm/applications/com.local.nativehome/...` hard-coded in `detach.c`, `relay.c`, `native.js`, `service.js`, `helper-entry.js` | C: `HELPER_APP_ROOT` / `HELPER_STATE` in `paths.h`. JS: `config.js` (app). `service.js` has its own constants, because the service is installed in a different directory. |

## Behaviour kept (unchanged unless noted)
- **detach.** SAM's `main`. It double-forks and calls setsid, and uses `state/controller.lock`. **Change:** a busy lock now returns 4 instead of 0, so a tile tap can tell "already running" apart.
- **relay + filter.**
  - Opens `"LGE M-RCU - Builtin [0]"` read-only and `"[1]"` read/write, and checks that their capabilities match.
  - Waits up to 5 s for keys to be released, then takes EVIOCGRAB on `[0]` and re-injects everything into `[1]` except Home (773).
  - Home key-down emits `HOME`. A held Home or a Home repeat is dropped.
  - **Triple Home:** three taps of 40–500 ms within 2 s give RELEASE (exit 27) and write the `state/blocked` latch.
  - **Long Back:** holding Back for 1.2 s or more emits `LGHOME` once. Back itself is always forwarded.
  - SYN_DROPPED gives RELEASE.
  - The relay exits after 2 s without a controller heartbeat. On exit it releases held keys on `[1]` and ungrabs.
- **controller (`native.js`, trimmed).**
  - Spawns the relay and sends a heartbeat `P` every 400 ms.
  - SIGKILLs the relay if its acks are more than 2.5 s late, then runs `relay cleanup`.
  - Has a 3 s launch timeout.
  - Writes the emergency latch, and on uncaught exceptions writes the latch and exits.
  - Arms the once-per-boot activity, as upstream does.
- **Boot service.** `status`, `enable`, `disable` and `tick`. `tick` launches the helper at most once per boot (boot_id + btime) and never while the latch exists.

## Behaviour added or changed (fork)
1. **Start params.**
   - The controller's start launch (boot or tile) is `{id:"local.lgc4.premiumhome", params:{"premiumHome":"start"}}`. Premium Home never toggles Ambient for these params.
   - A Home press launches `{id:"local.lgc4.premiumhome"}` with no params. A relaunch while Premium Home is in front then toggles Ambient, as Premium Home v0.8 does.
2. **No relaunch storms.**
   - Home is ignored while a launch is in flight.
   - Home presses less than 800 ms apart (sliding window, `config.homeBurstMs`) count as one, matching Premium Home's 0.8 s burst rule.
   - Result: a triple-Home emergency stop with taps less than 800 ms apart causes exactly one launch before the release.
3. **The tile is the manual start.**
   - Upstream's tile relaunched `com.gathin.tvhome` with `{showHelper:true}`. That is removed, because it would toggle Ambient.
   - A tile tap (any params without boolean `nativeHomeAuto:true`) now starts the controller and clears the latch.
   - If the controller is already running (detach exit 4), the tap only opens Premium Home with `{"premiumHome":"start"}` through `luna-send-pub`.
4. **Delivery check (new, `relay.c`, can be compiled out with `-DHELPER_NO_ECHO_CHECK`).**
   - Every key press or release written to `[1]` must come back on the relay's own `[1]` evdev client within 500 ms. Otherwise the relay exits 30 and fails open.
   - It catches the kernel silently dropping injected keys, which happens when `[1]` is grabbed by another process or its key state is stuck.
   - The simulation proves the residual this closes: an upstream-equivalent build keeps `[0]` grabbed while every key vanishes.
   - The loss of `[1]` (POLLHUP/POLLERR on the `[1]` fd) is now detected immediately (exit 28) instead of on the next key.
5. **Uninstall watchdog.**
   - On every 400 ms tick the controller checks `<app>/appinfo.json`.
   - If the package directory is gone (`ares-install --remove`, Dev Mode expiry or update), it tells the relay to quit (`Q`). In the simulation the remote was released in 0.37–0.44 s.
6. **SIGTERM** to the controller sends a graceful `Q` to the relay, then SIGKILL after 2 s.
7. **The controller log is capped at 256 KiB** (it truncates). Nothing is written outside the app's `state/` (controller) or the service's `state/` (service).
8. **The `struct ev` timeval fields are `unsigned long`.**
   - That is 16 bytes on ARM32, the same as upstream's `uint32_t` layout, and 24 bytes on LP64.
   - So the arm64 simulation build reads real `input_event`s.
   - The ARMv7 TV build keeps the exact upstream ABI (asserted in `test_filter_fork` under qemu-arm: `sizeof(struct ev)=16`).
9. **`HELPER_HOME_CODE`** (default 773) exists only so that the simulation build can use 172, because stock kernels reject codes above KEY_MAX=767. TV builds never set it.
10. **The controller and service are written directly in ES5**, with no Babel step. Static check: `tests/es5-check.cjs`.

## Dropped (with reason)
| Dropped | Reason |
|---|---|
| SSAP screen/power watch, `websocket.js`, `vendor/ws*`, `ssap-key.json`, `state-permissions.js`, `screen-policy`, `power-policy`, `resume-policy`, return-after-exit, resume relaunch after standby | No stored TV-control key (CONTROL_POWER was never used). The cost: no automatic return to Premium Home after an app exits or after standby. |
| `app-inventory.js` / service `listApps` | Used SSAP; nothing in Premium Home needs it. |
| EIM `addDevice` (setup script) | Persistent system configuration, not needed for Home routing. |
| `resume.c`, relay `'S'` (raise SIGSTOP), `stall-worker` / `stall-controller` | Test hooks that were reachable in production. |
| `control.json`, `home-request.json`, `home-control.json` (file-based control, routing toggle, diagnostics) | Unauthenticated file IPC. The relay still understands `D`/`E` on its private stdin, but the controller never sends them. |
| `/tmp/nativehome-boot-*.json` | Writes outside the app. |
| Exit-code-22 "open LG Home on stop" path | It was unreachable upstream. |
| Updater, launcher, renewal, root edition | Out of scope. |

## Test-only switches (never set for the TV build)
- `-DHELPER_HOME_CODE=172` is used only by `build/arm64-sim*`.
- `-DHELPER_NO_ECHO_CHECK` is used only by `build/arm64-sim-noecho`, to show the upstream residual.
- Production code has no runtime test hook: no env vars, no control files, no stall commands.

## v2 (2026-10-28)
- Renamed to `com.local.premiumhome.homehelper` (outside Premium Home's ID namespace).
- Added `src/native/app/guard.c`: an independent fail-open guard that SIGKILLs a stalled relay; detach spawns it as a sibling.
- Added the `state/disabled` owner revert latch (service + controller honour it; a tile tap does not clear it).
- Simulation extended to 25 scenarios (s23 guard killed, s24 all-three-frozen residual, s25 disable latch).
