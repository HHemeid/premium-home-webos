# Risk report: Premium Home Helper 0.1.0 (`com.local.premiumhome.homehelper`)

> **NOT installed. NOT run on the TV.**
> - No ipk was built.
> - No `ares-*` command, SSAP, ssh or other network or device access was used.
> - Installing on the LG OLED65C4PUA (fw 33.31.69) needs **separate, explicit approval from the owner**, and it should follow the pre-flight and test matrix in `../HOME-BUTTON-INTEGRATION-PLAN.md` §4.

## 1. What the offline work proves
Evidence is in `TEST-REPORT.md` and `test-output/`. All of it was run on a Linux 6.10 arm64 kernel with virtual uinput devices and a fake Luna.

**Correctness**
- **Event logic** (C and controller):
  - Home becomes a launch of `local.lgc4.premiumhome` and is never forwarded.
  - Triple Home (40–500 ms taps within 2 s) gives one launch and then a release.
  - Long Back gives LG Home once, and Back is always forwarded.
  - Every other key, plus pointer REL/ABS events, is forwarded unchanged and in order, including a burst of 200 events.
- **No relaunch storms:**
  - one launch at a time;
  - presses less than 800 ms apart count as one;
  - boot and tile launches always carry `{"premiumHome":"start"}`.

**Fail-open behaviour.** Every one of these leaves the remote ungrabbed, with release times measured by an independent EVIOCGRAB probe and by evtest:

| Trigger | Time to release |
|---|---|
| Controller SIGKILL | ~60 ms |
| Controller SIGSTOP | ~2.06 s |
| Relay SIGKILL | ~65 ms |
| Relay SIGSTOP | ~2.85 s |
| SIGTERM to either process | <0.1 s |
| Missing target app | never grabbed |
| Home launch failure | ~45 ms |
| Home launch timeout | 3 s |
| Bootstrap failures (no node, no webos-service, no relay binary, key held at start, devices absent or incompatible) | never grabbed |
| Devices vanish (standby model) | immediate |
| Package directory removed | ~0.4 s |
| Injected keys silently dropped (`[1]` grabbed by another process, or stuck key state) | ~0.5 s, via the new delivery check |

**Build**
- The ARMv7 hard-float static binaries build from source and are reproducible byte for byte.
- The filter, startup and relay-startup unit tests pass on the ARMv7 build under qemu-arm, which also confirms the 16-byte `input_event` layout.

## 2. Only provable on the real TV
| Topic | Why it cannot be settled offline | What to check on the TV, after approval |
|---|---|---|
| **Remote device names and capabilities** | The relay requires `LGE M-RCU - Builtin [0]` and `[1]` with identical key, rel and abs bits. Upstream reports these on a C4 (55C46LA, 33.31.68), but not on this unit or this firmware. | If the names or capabilities differ, the relay exits 10 or 12 and never grabs. That is safe, but Home is then not redirected. |
| **Home key code 773 and LG KEY_MAX** | A stock kernel rejects 773, so the simulation used 172. | Short Home opens Premium Home; Home is not delivered to LG Home. |
| **ARMv7 binary against real evdev** | The 32-bit event ABI was never exercised on a real device: Apple Silicon has no AArch32. | Covered by the first TV test. |
| **Sandbox permissions** | Whether a Developer Mode native app may open `/dev/input/event*`, EVIOCGRAB and write to `[1]` is an undocumented allowance. It is reported to work upstream. | If it is denied, the relay exits 10 or 17 and never grabs. |
| **Echo / delivery check on LG's kernel** | Standard evdev delivers injected events to the writer's own client. If LG's kernel does not, every key press makes the helper stop within 0.5 s (exit 30). | That would be safe, but unusable. Fallback: rebuild with `-DHELPER_NO_ECHO_CHECK`, which gives the upstream behaviour and its residual risk. |
| **SAM tolerance** | Whether SAM tolerates a detached, setsid daemon from a `noWindow` native app, or kills it. Upstream issue #10 shows SAM closing apps on some models. | Run for an hour; check `controller.log`. |
| **Node version and APIs** | TV Node is unknown. The code is ES5 and was static-checked, but it was executed only on Node 18. It needs `/usr/bin/node`, `/usr/lib/node_modules/webos-service` and `/usr/bin/luna-send-pub`. | If Node is missing or broken, nothing grabs (s17). |
| **LS2 / ACG** | Registering `com.local.premiumhome.homehelper` and `.service` on the bus, calling `applicationManager/launch` and creating a persistent Activity Manager activity with the declared ACGs. | Whether the boot activity runs once per boot. |
| **New: namespace overlap** | The required id `com.local.premiumhome.homehelper` is a dotted child of the existing app id `local.lgc4.premiumhome`. webOS uses the `<appid>.` prefix for an app's own services and LS2 names. | The installer or ls-hubd might reject the helper or treat its names as Premium Home's, and either app's update might interfere. **If install or registration fails, use a non-overlapping id**, for example `com.local.premiumhome.homehelper` as the earlier plan proposed. That needs only `config.js`, `paths.h`, `service.js`, `services.json`, `package.json` and `appinfo.json` changed. |
| **Launch reply timing** | The 3 s timeout assumes SAM answers within 3 s. A slow cold start of Premium Home would stop the helper (fail-open, and the latch is written). | Watch for `launch-timeout` in `controller.log`. |
| **Ambient interplay** | Whether a Home relaunch while Premium Home is in front toggles Ambient, and whether `{"premiumHome":"start"}` never does. This was verified in Premium Home v0.8 with manual relaunches, but not with this helper. | Covered by the test matrix. |
| **Standby / issue #96 (arrows dead after standby on a C5, webOS 25)** | The cause is unknown. The simulation covers devices disappearing (fail-open, exit 25/28), `[1]` grabbed by someone else and a stuck `[1]` key (exit 30). | It does **not** cover webOS ignoring `[1]` after resume while our echo still arrives. In that case the remote is dead except for triple Home, which is read from `[0]`, still works, and releases. The test matrix §4 step 4 is mandatory. |
| **Quick Start+ / suspend freezer** | If the freezer thaws the controller and relay at different times, a watchdog may fire after resume. That fails open: the helper stops until the next boot or a tile tap. | Check after a standby → wake cycle. |
| **Developer Mode expiry** | Apps are removed. The uninstall watchdog (`appinfo.json` gone → quit) is simulated as a directory removal. The real removal may differ, for example unmounting or killing processes. | — |
| **Firmware updates** | They may rename devices (giving exit 10 or 12, no grab), change key codes (Home then goes to LG Home), change sandbox rules or SAM behaviour, or re-enable Home handling. Any of these can silently disable the redirect. | Re-test after every firmware update. |
| **Magic Remote pointer and wheel, voice, number keys, long-press OK** | Only key and REL/ABS passthrough was simulated. | Covered by the test matrix. |

## 3. Residual paths where the remote can stay grabbed
1. **Relay and controller both stopped (SIGSTOP), proven in s11.**
   - Nothing is left to fail open, so the grab lasts until a process continues or is killed.
   - The fork has no code that sends SIGSTOP; upstream's `S` hook and `stall-*` hooks were removed.
   - Only an external actor could cause this: a debugger, the cgroup freezer, or a system-wide freeze during suspend.
2. **Relay stopped and controller killed before its 2.5 s watchdog fired, proven in s12.**
   - The grab is held until the relay is continued; it then releases within 0.06 s.
3. **Relay healthy, but webOS stops consuming `[1]`.**
   - The relay cannot detect this, because its own echo still arrives.
   - Escape: **triple Home** (read from `[0]`, so it still works), long Back (opens LG Home without releasing), or the Mac CLI (section 4).
4. **`[0]` stops delivering events while the device node stays open.**
   - Triple Home cannot be seen, and the heartbeat stays healthy.
   - The remote would be dead even without the helper. Use section 4.
5. **Relay stuck in an uninterruptible syscall (D state).** SIGKILL does not take effect until the syscall returns. This was not reproducible offline.
6. **Limits of the delivery check.** An identical key event from another source at the same instant can mask a drop (see the s21 note). Key repeats (value 2) are not checked.
7. **Not a grab, but worth knowing:**
   - **Three quick Home presses**, for example when Premium Home is slow, trigger the emergency stop: the helper exits and writes the latch.
   - After a **reboot** the boot activity starts the helper again, unless the latch exists or the app has been removed. **Unplugging the TV alone does not disable the helper.**
8. **Small items:**
   - The controller lock fd is inherited by the relay, so a stopped relay also blocks a new start (detach exit 4). A tile tap then only opens Premium Home.
   - The persistent boot activity may stay in Activity Manager after the app is removed. Its callback then targets a missing service, which is harmless. Call `service/disable` first if possible.

## 4. Required recovery procedure that does not depend on the remote
**Prepare these before any install.**
- The Mac must have `ares-cli` with the `<your-tv>` device profile and a working Developer Mode key.
- The TV power button and the LG ThinQ phone app must be available.
- **None of these commands were run as part of this work.**

1. **On the remote (if it still responds):**
   - Press **Home three times quickly**. The relay releases, the latch is written, and the helper stays off across reboots until the tile is tapped.
   - **Hold Back for 1.2 s** to open LG Home once. This does not release the helper.
2. **Wait about 3 s.** If either process is hung, the watchdogs release the remote: the relay after 2 s without a heartbeat, or the controller killing the relay after 2.5 s.
3. **From the Mac (primary).** Remove the app:
   ```
   ares-install --device <your-tv> --remove com.local.premiumhome.homehelper
   ```
   - The controller's uninstall watchdog sees `appinfo.json` disappear and stops the relay within about 0.5 s (simulated: 0.41–0.44 s).
   - Removing the app also removes the boot service, so nothing comes back after a reboot.
   - *TV-only unknowns:* whether removing a running native app is allowed, and whether SAM itself kills the detached processes.
4. **From the Mac (secondary, only if the Developer Mode shell allows signalling the app's uid; unverified):**
   ```
   ares-novacom --device <your-tv> --run 'kill $(cat /media/developer/apps/usr/palm/applications/com.local.premiumhome.homehelper/state/controller.pid)'
   ```
   - SIGTERM stops gracefully (simulated in 87 ms).
   - Use `kill -9` on the relay pid (`pgrep -f /com.local.premiumhome.homehelper/relay`) if needed; the kernel then drops the grab at once (simulated in about 65 ms).
   - `ares-launch --close` will **not** work, because the controller is detached from SAM.
5. **If the remote is dead and the Mac cannot reach the TV:**
   - Use the ThinQ app or the TV's power button.
   - Unplug for 60 s.
   - After the reboot, use step 3 straight away: the boot activity restarts the helper about 10 s after boot unless the latch is set.
   - Last resort: turn Developer Mode off, or let it expire. Sideloaded apps are removed, including Premium Home; reinstall it from `dist/`.
6. **Never** factory reset, downgrade firmware or root the TV as a "fix" (see `../RECOVERY-MANUAL.md`).

## 5. Recommendation
- The offline evidence supports a **single supervised trial** with the owner present, following plan §4.
- Before installing:
  - **Decide the app id** (the namespace-overlap risk above).
  - Package `build/stage/` with `ares-package` and the renamed `fix-package-data.py`, and hash the resulting ipk.
  - Confirm the step 3 recovery command is ready on the Mac.
- **Stop at the first failure.** In particular, stop if arrow keys die after standby (#96), or if the helper exits 30 on normal key presses (meaning the delivery check is incompatible with LG's kernel).
- **Still required:** separate approval from the owner. Nothing has been installed.

---

## v2 hardening update (2026-10-28)
- **Closed in simulation:**
  - "both relay and controller frozen" and "relay frozen + controller killed": the independent `guard` SIGKILLs the relay, releasing the remote in about 2.8 s (s11, s12)
  - The guard never opens an input device, sends at most one SIGKILL, checks it's killing our relay, and exits when the relay is gone.
- **Remaining residual (s24):** if **all three** processes are frozen at once (e.g. a system-wide freeze or suspend), nothing in the helper can act. Recovery is then the Mac removal command, or a standby/power cycle (see `PILOT-PLAN.md` §3).
- **Owner revert switch:** a `state/disabled` latch. While it exists, the helper never arms (boot or tile), and a tile tap does not clear it. Primary recovery is still package removal:

  ```bash
  ares-install --device <your-tv> --remove com.local.premiumhome.homehelper
  ```

- **ID-namespace risk removed:** the helper is now `com.local.premiumhome.homehelper`, outside Premium Home's namespace.
- **Still not provable offline:**
  - real remote device names and Home code 773
  - LG sandbox/SAM tolerance of the daemon and guard
  - standby #96 (arrows dead after wake)
  - Developer Mode expiry, firmware updates
  - **NOT installed, NOT run on the TV.**
