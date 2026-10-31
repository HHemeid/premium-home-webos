# Test report: Premium Home Helper 0.1.0 (offline)

- **Date:** 2026-10-28.
- **Scope:** every test ran inside Docker containers on the Mac.
- **Not tested on the TV:** nothing was run on a TV, and no TV or network device was contacted.
- **Evidence:** raw output is in `test-output/`.
- **Rerun:** `sh tools/run-all.sh`.

## Summary
| Category | Evidence file | Result |
|---|---|---|
| C unit tests: upstream `test_filter`, `test_startup`, `test_relay_startup` + fork `test_filter_fork` | `unit-c.txt` | **15 passed, 0 failed**. Each of the 4 tests ran in 3 variants: native arm64, arm64 ASan+UBSan, and the ARMv7 hard-float static build under qemu-arm. Plus 3 smoke checks of the real TV `relay` binary under qemu-arm. |
| Node unit tests (Node 18.20.4) | `unit-node.txt` | **46 cases passed, 0 failed**: upstream `test-runtime-policy` and `test-boot-state` (2), `node --check` (6), ES5 check (6), controller fake-TV (22), helper-entry (5), boot service (5). |
| Packaging fixer (synthetic ipk) | `packaging.txt` | **1 passed, 0 failed** |
| Static audit of shipped code (old ids, SSAP, EIM, /tmp, control files, stall hooks, URLs) | `static-audit.txt` | **25 patterns absent, 0 found** |
| uinput virtual-remote simulation (privileged container, real relay + controller + detach) | `uinput-sim.txt` | **22 scenarios, 94 checks passed, 0 failed**. An earlier complete run (`uinput-sim-previous-run.txt`) also passed 94/94. |
| Build (both targets, reproducibility) | `build-info.txt`, `build-log.txt` | OK. The ARMv7 rebuild is byte-identical. |

**History of failures before the final runs.**
- The first full simulation run had 4 failed checks, all caused by test design, not by the helper:
  - `s05` pressed Home three times within 2 s. The filter correctly treated this as the triple-Home emergency stop. The test now uses two presses.
  - `s21` raced its own stray `[1]` event against the press under test. A 0.3 s gap was added.
- One run of the C suite failed on a test-script bug: `rmdir` of a directory that was not empty.

## 1. C unit tests (`tools/unit-c.sh`)
- **Upstream tests, unchanged apart from the `sizeof` assertion:**
  - `test_filter`: triple-Home timing, holds, repeats, interruption, cursor code 1198, other input, SYN_DROPPED.
  - `test_startup`: release wait, deadline, destination busy, ioctl failure, controller loss.
  - `test_relay_startup`: includes the real `relay.c` with mocked syscalls; checks the startup drain, heartbeat and stop guards.
- **New `test_filter_fork`:**
  - **Home → launch.** Key-down gives OPEN_HOME. Repeat and up give DROP. Home is never PASS.
  - **Triple Home.** 3 launch requests, then RELEASE on the third key-up. Tap bounds are 40 and 500 ms (39 and 501 ms are rejected). Taps spread over more than 2 s never release.
  - **Back passthrough.** Down, repeat and up are all PASS. Long Back (1200 ms or more) gives OPEN_LG exactly once; a short Back gives nothing.
  - Back in between resets a triple sequence.
  - REL, ABS and SYN pass through. SYN_DROPPED gives RELEASE.
  - `sizeof(struct ev)` is 16 on ARMv7 and 24 on arm64.
- **ARMv7 smoke (real `build/armv7/relay` under qemu-arm):**
  - With no devices it exits 10 and never grabs. `relay cleanup` also exits 10.
  - With the state directory missing it exits 18 (lock) before touching input.

**Burst suppression is a controller feature, so it is tested in section 2 and section 5 (s05).**

## 2. Node / fake-TV harness (`tools/unit-node.sh`)
Upstream's fake-TV approach was adapted as `src/tests/fake-tv.cjs`: the real `native.js` runs in a `vm` context with fake Luna, the relay child, fs and a virtual clock. It derives from `tests/controller-home.cjs` and `tests/helper-runtime.js`.

**The 22 controller cases cover:**
- **Startup.**
  - The boot launch is `{premiumHome:"start"}` and the relay is spawned only after it succeeds.
  - The manual start waits 1 s and clears the latch.
  - An automatic start with the latch present exits 0.
- **Home and Back.**
  - HOME launches the target with no params.
  - A duplicate HOME during an in-flight launch is suppressed.
  - Bursts under 800 ms count as one (the boundary is 799 vs 800 ms).
  - LGHOME gives LG Home once, and it can be disabled.
  - BACK lines are only logged.
- **Stopping.**
  - Triple-Home exit 27: latch, cleanup, exit 27, and one launch.
  - Exit 25 (device HUP) leaves no latch.
- **Launch failures.**
  - A Home launch timeout at 3 s ends the relay's stdin.
  - A failed Home launch ends the relay's stdin.
  - A missing target at start gives exit 3 with no relay.
  - A start timeout gives exit 3.
- **Bootstrap and watchdog.**
  - A missing webos-service gives the latch and exit 2 with no relay.
  - The heartbeat runs every 400 ms; the watchdog tolerates 2.4 s and kills at 2.8 s.
- **Shutdown and housekeeping.**
  - Package removal sends Q.
  - SIGTERM sends Q, then SIGKILL after 2 s.
  - An uncaught exception gives the latch, ends stdin and exits 2.
  - The boot activity is created once, with the new names.
  - Only the new ids are used. There is no showHelper, no SSAP, and every write stays inside `state/`.

**Other Node tests.**
- **helper-entry (5):** auto start; tile start; tile tap while running (opens Premium Home with premiumHome:start); bad params are treated as manual; no showHelper.
- **Boot service (5):** only 4 methods; once per boot; latch respected; disable cancels the new activity name; the running check and no /tmp writes.
- **ES5 check:** an acorn `ecmaVersion:5` parse of all 6 shipped JS files, plus a scan for banned APIs (Object.assign, Promise, arrow functions, let/const, templates, includes, Buffer.from, …).

**Upstream tests not applied, and why:**
- `tests/controller-home.cjs`, `controller-resume*.cjs` and `resume.cjs` exercise the file RPC, the routing toggle, screen-watch and resume, all of which were removed. Their Home and LGHOME assertions were ported.
- `tests/helper-entry.cjs` asserts the `showHelper` relaunch, which was deliberately removed. It was replaced.
- `tests/helper-runtime.js` is mostly WebSocket and SSAP. Its controller start and uncaught-exception parts were ported.
- The `state-permissions`, `screen-policy`, `power-policy` and `screen-watch` tests cover modules that were removed.
- `test-launcher-bootstrap` tests a launcher that is not part of the fork.
- The Node 0.12 runtime run (upstream `compile-helper` + `helper-runtime.js` on 0.12.2) was **not done**. Only the static ES5 check was.

## 3. Packaging fixer
`fix-package-data.py`, with only its paths renamed, was run on a synthetic ar/tar ipk. Both `state/` directories became 5999:5000, mode 0770.

## 4. Static audit
- **Absent from code lines:**
  - Old ids: `com.local.nativehome`, `com.gathin.tvhome`, `nativehome`.
  - The removed relaunch: `showHelper`.
  - SSAP and power: `ssap`/`SSAP`, `:3001`, `CONTROL_POWER`.
  - EIM: `eim/`, `addDevice`.
  - Writes outside the app: `/tmp`.
  - File-based control: `control.json`, `home-request`, `home-control`.
  - Stall and resume hooks: `stall`, `SIGSTOP`, `resume`.
  - Removed modules: `websocket`, `screen-watch`, `app-inventory`, `updater`.
  - Network URLs: `http(s)://`, `wss://`.
- **Only absolute install path:** the new id.
- **Luna URIs used:**
  - `applicationManager/launch`
  - `activitymanager/create` and `activitymanager/cancel`
  - the helper's own service `status`, `enable` and `tick`

## 5. Virtual-input simulation (`tools/sim.sh` → `src/tests/sim/sim.py`)
**Environment.**
- Kernel: Docker Desktop linuxkit `6.10.14-linuxkit aarch64`. `/dev/uinput` is available to `--privileged` containers.
- `devtmpfs` is mounted inside the container so that `/dev/input/eventN` appear. **Nothing was loaded on the Mac host.**
- No input devices existed before the run, and none were left afterwards (checked).

**Devices.**
- Two uinput devices are named exactly `LGE M-RCU - Builtin [0]` and `LGE M-RCU - Builtin [1]`.
- They have identical capabilities: 15 keys including 412 (Back) and 172 (Home stand-in), REL_X/Y/WHEEL, and ABS_X/Y.

**What is real and what is faked.**
- **Real:** the fork's actual `detach` → `helper-entry.js` → `detach --controller` → `native.js` → `relay` chain, from `build/arm64-sim`, installed at the real TV path.
- **Faked:** only Luna:
  - `webos-service` forwards to `fake-luna`, which records calls and answers ok / missing / hang / delay.
  - `luna-send-pub` is faked the same way.

**How the grab is verified independently of the relay.**
- A probe process takes `EVIOCGRAB` on `[0]`; EBUSY means it is grabbed.
- A passive reader on `[0]` receives nothing while it is grabbed.
- `evtest --grab` prints "grabbed by another process".
- Key state on `[1]` is read with EVIOCGKEY (`active_keys`).

| # | Scenario | Key result (final run; previous run in brackets) |
|---|---|---|
| s01 | Start as SAM would (`detach '{"nativeHomeAuto":true}'`) | READY 0.105 s after detach. First launch is `{"id":"local.lgc4.premiumhome","params":{"premiumHome":"start"}}`. `[0]` is grabbed: probe EBUSY, evtest reports the grab, and the passive reader sees nothing. `[1]` is not grabbed. Exactly one controller and one relay. |
| s02 | Non-Home passthrough | 26 events (arrows, OK, volume, mute, 1, red, Back, REL, ABS) appear on `[1]` identical and in order. A burst of 200 key events arrives with no loss. |
| s03 | Home → launch | One launch of `{"id":"local.lgc4.premiumhome"}` with no params. No Home event on `[1]`. Forwarding continues. A second Home 1 s later launches again. |
| s04 | Long Back 1.3 s | Back down and up are forwarded. Exactly one `com.webos.app.home` launch. A short Back launches nothing. |
| s05 | Duplicate Home in flight; burst | A second Home while a 2 s launch is in flight gives no second launch (logged `home-suppressed in-flight`). Two presses 420 ms apart give one launch. |
| s06 | Triple Home | `[0]` released 68 ms after the third key-up (67 ms). Exit 27, latch written. One launch for the whole gesture. Nothing leaks to `[1]`. Keys then go natively to `[0]`. A boot-style start with the latch does not grab. A tile tap clears the latch and grabs again. |
| s07 | SIGKILL controller | Released in 62 ms (66 ms). The relay exits 24. |
| s08 | SIGSTOP controller | Released in 2064 ms (2074 ms) by the relay's 2 s heartbeat watchdog, exit 20. After SIGCONT the controller exits. |
| s09 | SIGKILL relay | Released in 63 ms (71 ms): the kernel drops the grab with the fd. The controller logs SIGKILL and runs `relay cleanup`, so the key left down on `[1]` is released. Latch written. |
| s10 | SIGSTOP relay | Released in 2884 ms (2828 ms): the controller watchdog SIGKILLs the relay. |
| s11 | **Residual:** SIGSTOP of both processes | `[0]` is **still grabbed after 6 s**. Killing the relay releases it at once. |
| s12 | **Residual:** relay SIGSTOPped, controller SIGKILLed before its watchdog | `[0]` is **still grabbed after 5 s**. On SIGCONT the relay releases it within 0.06 s. |
| s13 | SIGTERM relay / controller | Released in 80 ms and 87 ms. Graceful exit 0. |
| s14 | Target app missing at start | `[0]` was never grabbed and the relay never spawned (polled for 3 s). Exit 3, the Luna "not found" error is logged, latch written. |
| s15 | Target removed later | The next Home launch fails and `[0]` is released in 44 ms (exit 24). |
| s16 | Home launch never answered | Released at 2.967 s after key-up (2.922 s), which is the 3 s timeout counted from key-down. `launch-timeout` logged. |
| s17 | Bootstrap failures | No grab in any case: webos-service missing (exit 2 + latch); `/usr/bin/node` missing; relay binary missing (spawn ENOENT); key held for 5 s at start (exit 14, waits without grabbing); no devices (exit 10); `[0]`/`[1]` capabilities differ (exit 12). |
| s18 | Standby: devices vanish and reappear | Both removed: exit 25, no latch. The re-created `[0]` is not grabbed and keys are not copied (fail-open, no self re-arm). A tile tap re-arms on the new devices. Only `[1]` removed: released in 14 ms (exit 28). Only `[0]` removed: exit 25. |
| s19 | Package directory removed while running | Released in 0.41 s (0.44 s). Both processes exit. |
| s20 | `[1]` grabbed by a third process | The fork's delivery check releases in 0.51 s (0.52 s) (exit 30, latch). With the **upstream-equivalent build** (`-DHELPER_NO_ECHO_CHECK`), `[0]` **stays grabbed while every key vanishes**. |
| s21 | Stuck key on `[1]` | The dropped press is detected and `[0]` is released in 0.52 s (0.50 s) (exit 30). No key is left down on `[1]`. |
| s22 | Second start / tile tap while running | Still one controller and one relay. The tile tap sends `luna-send-pub` launch `{"id":"local.lgc4.premiumhome","params":{"premiumHome":"start"}}`. Still grabbed. |

**Limits of the simulation (do not read more into it).**
- **Home code.** It is 172 (KEY_HOMEPAGE), not 773: a stock kernel rejects codes above KEY_MAX=767. The filter itself is tested with 773 in section 1.
- **CPU and event layout.**
  - The simulated relay is the **arm64** build (24-byte `input_event`).
  - The **ARMv7 TV binary was never run against an evdev device.** Apple Silicon cannot execute AArch32, and qemu-user does not translate evdev reads.
  - The ARMv7 build ran only as unit tests and smoke tests under qemu-arm.
- **Kernel.** It is linuxkit 6.10, not LG's kernel. The virtual devices are not the Magic Remote. There was no webOS input stack, SAM, LS2 or Activity Manager. Luna was faked.
- **Root.** The processes ran as root in the container, whereas the TV app runs under the Developer Mode jail uid/gid.
- **Standby** was modelled only as devices disappearing and reappearing. Real suspend/resume (freezer, Quick Start+) was not modelled.
- **Node** was 18.20.4.

---

## v2 hardening run (2026-10-28, `sh tools/run-all.sh`, run by Claude)
`build=0 unit-c=0 unit-node=0 packaging=0 audit=0 uinput-sim=0`

| Category | Result |
|---|---|
| C unit (native, ASan/UBSan, ARMv7 under qemu) + smoke | **16 passed, 0 failed** (adds the guard smoke) |
| Node fake-TV harness | **12 files passed, 0 failed** |
| Packaging fixer | passed |
| Static audit (removed features, old IDs) | **0 forbidden patterns**; no `local.lgc4.premiumhome.homehelper` anywhere |
| uinput virtual-remote simulation | **25 scenarios, 110 checks passed, 0 failed** |

**Release times measured in the simulation** (v1 → v2):

| Scenario | v1 | **v2** |
|---|---|---|
| Triple Home | 68 ms | 89 ms |
| Controller SIGKILL | 62 ms | 73 ms |
| Controller SIGSTOP | 2.06 s | 2.04 s |
| Relay SIGKILL | 63 ms | 78 ms |
| Relay SIGSTOP | 2.88 s | 2.86 s |
| **Relay + controller both SIGSTOP (s11)** | **stayed grabbed** | **released in 2.78 s by the guard** |
| **Relay SIGSTOP + controller SIGKILL (s12)** | **stayed grabbed** | **released in 2.81 s by the guard** |
| Guard killed (s23) | — | still safe: the other watchdogs act |
| All three frozen (s24) | — | **still grabbed: honest residual** |
| Disable latch (s25) | — | the helper never arms; a tile tap still opens Premium Home |
