# The Home-button helper (optional, experimental)

**Read this whole page before installing it.** The helper takes control of the Magic Remote's input device so the Home key opens Premium Home instead of LG Home. If it misbehaves, your remote can stop working until the helper is removed. You install it at your own risk, with a second way to control the TV at hand.

## What it does
- **Home** from any app → Premium Home. **Home** again on Premium Home → the ambient view.
- **Triple-press Home** (within 2 s) → LG Home, and the helper switches itself off until you resume it (Premium Home › ⚙ › Home button › Resume, or open the "Premium Home Helper" tile).
- **Hold Back** 1–2 s → LG Home once.
- Every other key, the pointer, wheel, volume and power are passed through untouched.
- It re-arms once per boot through a webOS activity.

## How it works, and the safety nets
A small native relay (`helper/src/native/prototype/relay.c`) grabs the remote's two input devices (`LGE M-RCU - Builtin [0]` and `[1]`), forwards every event, and turns Home presses into an Application Manager launch of Premium Home. Three independent things release the remote:
1. the relay's own watchdog (no controller heartbeat for 2 s → release);
2. a separate `guard` process that kills the relay if its liveness token stalls;
3. removing the package, which the relay also watches for.

It only grabs those two exact device names; with any other remote it exits without grabbing. It has no network code and no credentials. It was built from source in Docker (reproducible, byte-identical rebuilds), with 16 C unit tests, 12 Node test files and 110 simulated remote scenarios. **Simulation is not proof it works on your TV.** On the author's C4, Home, Home-again, triple-Home and resume were verified; standby/wake and cold boot were still being tested at the time of writing.

## Known risks
- **Standby/wake:** on some webOS versions the arrow keys don't return after wake while an input-grabbing helper runs. Test it with the recovery command ready.
- **Developer Mode expiry** removes the helper (and Premium Home). The remote then goes back to LG; no lock-out.
- **Firmware updates** may break or block it.

## Build, install, remove
```bash
cd helper && sh tools/run-all.sh        # Docker: builds the ARMv7 binaries and runs every test
cd ../launcher && B=tools/webos-cli/node_modules/.bin
$B/ares-package -n ../helper/build/stage/app ../helper/build/stage/service -o ../helper/dist
python3 -I ../helper/src/packaging/fix-package-data.py ../helper/dist/*.ipk
$B/ares-install --device tv ../helper/dist/com.local.premiumhome.homehelper_*_arm.ipk
$B/ares-launch  --device tv com.local.premiumhome.homehelper     # starts it (Premium Home comes to the front)
```
**Recovery, from your computer, without the remote:**
```bash
$B/ares-install --device tv --remove com.local.premiumhome.homehelper
```
If the computer can't reach the TV: use the LG ThinQ app or the TV's power button to go to standby and back. Last resort: turn Developer Mode off in LG's Developer Mode app (removes all developer apps; reinstall afterwards).

Fork of [Clean Your TV for LG webOS](https://github.com/Razdva122/clean-your-tv-lg-webos) (MIT); see `helper/FORK-NOTES.md` for what changed and `helper/RISK-REPORT.md` for the full risk analysis.
