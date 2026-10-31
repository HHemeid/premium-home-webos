# Build record: Premium Home Helper 0.1.0 (offline)

- **Built:** 2026-10-28.
- **Where:** in Docker Desktop on Apple Silicon (linux/arm64 VM, kernel `6.10.14-linuxkit`).
- **Sources:** everything is built from `src/`. No upstream prebuilt binaries are used (`native/published/` was not read for this build).
- **No package:** no ipk was produced. Packaging uses `ares-package` (an `ares-*` command) and is left for a separately approved phase.
- **Staged tree:** `build/stage/` holds the exact ipk tree.

## Reproduce
```sh
cd HOME-HELPER-OFFLINE
sh tools/run-all.sh          # docker build + build + stage + every test; evidence -> test-output/
```

**Container image.**
- `hh-offline:bookworm` comes from `tools/Dockerfile`, which uses `debian:bookworm-slim` (`debian@sha256:99c0b25c46d0214d5a2091092e7908907dcaecd6a962cde0ac700acee222b6f3`) plus Debian packages only.
- Built image: `sha256:9824497852d00b8fbd394fe701932c166a885f72a4c05996516ecefdd6e35bac`.

**Toolchain** (from `test-output/build-info.txt`):

| Package | Version |
|---|---|
| gcc-arm-linux-gnueabihf / gcc-12-arm-linux-gnueabihf | 4:12.2.0-3 / 12.2.0-14cross1 (`arm-linux-gnueabihf-gcc (Debian 12.2.0-14) 12.2.0`) |
| libc6-dev-armhf-cross (static glibc linked into the TV binaries) | 2.36-8cross1 |
| gcc / libc6-dev (arm64) | 12.2.0-14+deb12u1 / 2.36-9+deb12u14 |
| qemu-user (ARMv7 unit tests) | 1:7.2+dfsg-7+deb12u18+b3 |
| nodejs (tests) / python3-evdev (simulation) | 18.20.4+dfsg-1~deb12u3 / 1.6.1+dfsg-1+b2 |

## Flags
```
TV (armv7):       arm-linux-gnueabihf-gcc -std=gnu99 -Wall -Wextra -Os -static -s -ffile-prefix-map=/work=. -fno-ident
                  -march=armv7-a -mfloat-abi=hard -mfpu=vfpv3-d16 -mthumb
native (arm64):   gcc -std=gnu99 -Wall -Wextra -Os -static -s -ffile-prefix-map=/work=. -fno-ident
arm64-sim:        native flags + -DHELPER_HOME_CODE=172                          (simulation only)
arm64-sim-noecho: native flags + -DHELPER_HOME_CODE=172 -DHELPER_NO_ECHO_CHECK   (simulation only; upstream-equivalent relay)
inputs:           relay = src/native/prototype/relay.c + filter.c ; detach = src/native/app/detach.c
```

**Compile warnings:** none.

**Reproducibility.**
- `build.sh` rebuilds the ARMv7 binaries a second time and compares them with `cmp`: they are byte-identical.
- A complete second `run-all.sh` produced the same SHA-256 for every artifact.

## Artifacts
| Artifact | Size | SHA-256 | `file` |
|---|---|---|---|
| `build/armv7/relay` (**TV**) | 371044 | `e16e1a3dcce7e95801109df1c76af53f658a974206a7d89e844332cdcc50cc06` | ELF 32-bit LSB executable, ARM, EABI5 version 1 (SYSV), statically linked, for GNU/Linux 3.2.0, stripped |
| `build/armv7/detach` (**TV**) | 371080 | `291bd1a1179e268a3fea6600b6a7bfb739953de020e709e0b708253726680bb3` | ELF 32-bit LSB executable, ARM, EABI5 version 1 (SYSV), statically linked, for GNU/Linux 3.2.0, stripped |
| `build/arm64/relay` | 600128 | `092da298c2bd1b88efa7e64c54b78fd5d0766ad9024bab03129e5c21d4dddb5c` | ELF 64-bit LSB executable, ARM aarch64, version 1 (SYSV), statically linked, for GNU/Linux 3.7.0, stripped |
| `build/arm64/detach` | 600136 | `3d5c0d15a4873f54b9bd6525e3844bdd70cea78ae79c681bf5e0ebcfb43a88f0` | same as above |
| `build/arm64-sim/relay` (sim only) | — | `b2089bc047bbbc234382b7095faf136d60ce6ee57a3466b6bb70271c1166d17e` | ELF 64-bit aarch64, static, stripped |
| `build/arm64-sim/detach` (sim) | — | `3d5c0d15…88f0` (identical to arm64) | — |
| `build/arm64-sim-noecho/relay` (sim only) | — | `e598a8600830793b49cbb0b4116e67264277db52300a370e03d3593bcadfbc11` | ELF 64-bit aarch64, static, stripped |

**ARMv7 ELF attributes (relay).**
- `Tag_CPU_arch: v7`
- `Tag_CPU_arch_profile: Application`
- `Tag_THUMB_ISA_use: Thumb-2`
- `Tag_FP_arch: VFPv3`
- `Tag_ABI_VFP_args: VFP registers`
- Header flags `0x5000400, Version5 EABI, hard-float ABI`
- No dynamic section.

The BuildID values are in `test-output/build-info.txt`.

**Staged JS and data (`build/stage/`).** All hashes are in `test-output/stage-manifest.txt`. The key ones:

| File | SHA-256 |
|---|---|
| `native.js` | `5d449dae4834d9323ba7545596248785da95ddc49d6d13250996e4dacbad1deb` |
| `helper-entry.js` | `d225acc95d56efd05fbffe0c3d21558f00e89012deccf5f85d0fabbe2bfcc8ac` |
| `config.js` | `3f89a9b3b1a53842f8e6771c73725d42db4971a1742755fba8b22b88603add55` |
| `service.js` | `c2e775bf05ffe7da801c32fae728dc36e2b97caad4e8390345b1165dff44e95a` |
| `appinfo.json` | `edf06cb5a0216cf968c51fa74dfeac1244bbebfc89f675309d015cb91f939cdd` |

Packaging must also apply `src/packaging/fix-package-data.py`. It makes the two `state/` directories prisoner:jailer 0770, as upstream does, and was tested on a synthetic ipk in `test-output/packaging.txt`.

## Assumptions (not verifiable offline)
- **CPU / ABI.**
  - The TV runs a 32-bit ARM userland able to execute ARMv7-A, Thumb-2 and VFPv3-D16 code. Upstream's helper runs on webOS 24/25 TVs as 32-bit ARM, which supports this.
  - Hard-float only changes the calling convention inside our own static binary. It does not need the TV's libc.
  - Upstream used `zig cc -target arm-linux-musleabi`: musl and the soft-float calling convention. Ours is glibc static and hard-float.
- **libc.** Not used at runtime: both binaries are statically linked. The exact TV libc is unknown and irrelevant here.
- **Kernel.** The binaries require Linux 3.2 or later (ELF note). The kernel must report `struct input_event` in the 32-bit layout (16 bytes) to a 32-bit process; this is the upstream ABI, and `test_filter_fork` asserts `sizeof(struct ev)==16` on the ARMv7 build.
- **Home key code.** LG's kernel must allow code 773, which is above stock KEY_MAX. Upstream reports Home working on C4 / C5.
- **Node.**
  - The TV's Node version is unknown. Upstream requires Node 0.12.2 or later for its Babel-compiled helper.
  - Our JS is hand-written ES5 and checked with an acorn `ecmaVersion:5` parse plus a scan for banned post-ES5 APIs. It uses only `fs`, `child_process`, `process.hrtime` and `JSON`.
  - It was **executed only on Node 18.20.4**, never on Node 0.12.
  - It assumes `/usr/bin/node`, `/usr/lib/node_modules/webos-service` and `/usr/bin/luna-send-pub` exist, as upstream does.
- **Install path.** `/media/developer/apps/usr/palm/applications/com.local.premiumhome.homehelper`, which is Developer Mode's standard location, is compiled into `detach` and `relay` (`paths.h`) and written in `config.js`.

---

## v2 hardening build (2026-10-28)
- **Changes:**
  - helper ID renamed to `com.local.premiumhome.homehelper` (service `com.local.premiumhome.homehelper.service`); the target is still `local.lgc4.premiumhome`
  - new independent `guard` binary
  - Mac-side `state/disabled` revert latch
- **Toolchain:** same as before (Debian bookworm gcc 12.2, static glibc, `-Os -static -s`). The rebuild is **byte-identical** (`REPRODUCIBLE: armv7 relay+detach+guard`).

| Artifact (ARMv7 hard-float, static) | SHA-256 |
|---|---|
| `relay` | `d76f11f4a71053844688996a688a4554daf80ec28d6e2207d83b1cf71562cd4c` |
| `detach` | `83ca9318f0a36e7a03bd99ac182db1adc58ed285ed0041a18f08730b27f502bf` |
| `guard` | `8d0c50c6c8466f81b2ab365266c08fe5b67bf105b270c042139a14891d50ec2c` |

The earlier v1 hashes above are superseded.

---

## v0.9 pilot package (2026-10-28): built, NOT installed, NOT activated
- **Command** (LG CLI 3.2.6, on the Mac, offline): `ares-package -n build/stage/app build/stage/service -o dist-pilot`, then `python3 src/packaging/fix-package-data.py dist-pilot/*.ipk`.
- **Package:** `dist-pilot/com.local.premiumhome.homehelper_0.1.0_arm.ipk`, 728,848 bytes, SHA-256 `9dae3a9f2c5062566b58603c46a6a10f0c201d2e6075e2389695e8fe3695e62a`.
  - The ipk's own bytes are not reproducible, because `ares-package` stamps file times.
  - Its contents are: every file inside is byte-identical to `build/stage/` (relay `d76f11f4…`, detach `83ca9318…`, guard `8d0c50c6…`). Both `state/` directories are `prisoner:jailer 0770`.
- **Fork:** upstream `Razdva122/clean-your-tv-lg-webos` at commit `b473faeb944eeaff89df083d840bb90126e49253` (see `FORK-NOTES.md`).
  - **Emergency gesture in THIS fork:** **triple Home** (3 taps within 2 s), which releases the remote and latches the helper off. **Hold Back 1.2 s** opens LG Home once.
  - Newer upstream versions may use a different gesture (e.g. long Home); this package does not.
- **Static review of the package:**
  - **Node modules:** `fs`, `child_process` and `webos-service` only. No network modules, URLs, sockets or HTTP.
  - **luna calls:** `com.webos.applicationManager/launch` (Premium Home / LG Home) and `com.palm.activitymanager/create|cancel` (start once per boot) only.
  - **Files written:** only the helper's own `state/` directories (pid, log, heartbeat, `blocked` latch).
  - **No secrets:** no pairing keys, passphrases, tokens or credentials anywhere in it.
- **Install status:** NOT installed. It needs the owner's words "approve a supervised Home-helper pilot" (`HOME-HELPER-PILOT-APPROVAL-REQUEST.md`).

---

## Re-audit against upstream (2026-10-31)
Upstream `Razdva122/clean-your-tv-lg-webos` `main` is **325 commits** past our fork point `b473faeb`. Most of them are themes, the installer and the Root edition. The helper-relevant ones:

| Upstream change | Effect on our build |
|---|---|
| `3586dfe4` "support TV Node 0.10.25" (C4-class TVs may ship Node 0.10) | Our JS was checked by **API inventory**. It uses only `fs.readFileSync/writeFileSync/appendFileSync/existsSync/statSync/renameSync/unlinkSync`, `child_process.spawn/execFile`, `process.hrtime`, `JSON` and `Date.now`, all present in Node 0.10. The syntax was already ES5-checked (acorn `ecmaVersion:5`). **Not executed on Node 0.10**: Docker's amd64 emulation on this Mac refused the old image |
| `e0d3c244` "bounded recovery after watchdog timeouts": the relay writes a separate `watchdog` latch and the service treats it as blocked | Our relay already writes the `blocked` latch for every non-normal exit, including the watchdog (`reason 20`), and our service won't re-arm on it. Equivalent fail-closed behaviour; no change needed |
| `3308d13d` / `098ab716` (state-directory ownership and settings IPC in the service jail) | Our `fix-package-data.py` already sets both `state/` directories to `prisoner:jailer 0770`. Our helper has no settings IPC |
| Upstream helper 0.6.21 | Not adopted. Its binaries aren't reviewed here, and transplanting them would void this audit |

**Conclusion:** the packaged candidate (`dist-pilot/…_0.1.0_arm.ipk`, `9dae3a9f…`) stays as it is: **prepared, not installed**. Status: `HOME_HELPER_PREPARED_AWAITING_SUPERVISED_APPROVAL`.
