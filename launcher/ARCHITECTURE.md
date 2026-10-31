# Premium Home: Architecture (v0.3.2)

**Status (2026-10-27):** a local prototype that runs on the Mac.
- **It has not been deployed to the TV.** Nothing has connected to the TV and Developer Mode isn't enabled.
- App launches are **simulated**.
- Live weather from Open-Meteo works in the Mac preview **after consent** (off by default).
- v0.3 applies the second outside review: a cinematic Home, real brand logos and live weather. See "Changes in v0.3" at the end.

---

## 1. What kind of app this is

Premium Home is built as an **LG webOS packaged web app**: plain HTML, CSS and JavaScript, with no build step, no framework and no network dependencies. It also runs in any desktop browser for previewing.

What it **can't** be, based on LG's public documentation:
- **It can't replace LG's own Home or launcher.** No public API does that. It would be a normal app opened from LG's launcher, and replacing the launcher would need root (out of scope).
- **It can't list installed apps.** Application Manager only launches or checks a **known** app ID (`launch`, `getAppLoadStatus`), so shortcuts come from a curated catalog (`app/js/catalog.js`).

## 2. Platform facts this design relies on

| Fact | Source | How the design uses it |
|---|---|---|
| Web apps run at **1920×1080 or 1280×720**; UHD isn't supported for web apps. | [appinfo.json](https://webostv.developer.lge.com/develop/references/appinfo-json) | Fixed **1920×1080 canvas**, upscaled by the TV to 4K. The Mac preview scales the same canvas to fit the window. |
| webOS 25 uses **Chromium 120**. | [Web engine](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine) | Modern CSS/JS, including `:has()`. Glass (`backdrop-filter`) performance on the TV is unknown, so it can be turned off. |
| Keys: arrows 37–40, OK 13, **Back 461**, colour keys 403–406 (some remotes only). | [Magic Remote](https://webostv.developer.lge.com/develop/guides/magic-remote) | `platform.js`. The Mac preview also maps Esc/Backspace to Back and **O** to Options. |
| `disableBackHistoryAPI: true` → the app handles Back itself. | [appinfo.json](https://webostv.developer.lge.com/develop/references/appinfo-json) | Back chain: dialog → edit mode → tab bar → Home → **one** exit prompt. |
| On webOS 6+, `webOS.platformBack()` shows the **system** exit popup. An app with its own exit popup should call **`window.close()`** instead. | [Back button guide](https://webostv.developer.lge.com/develop/guides/back-button), [webOSTV.js](https://webostv.developer.lge.com/develop/references/webostvjs-webos) | v0.2 calls `window.close()` after our confirmation and never `platformBack()`, so only one prompt appears. Covered by a smoke test with stubs; untested on the TV. |
| Application Manager: `launch {id}`, `getAppLoadStatus {appId}` (webOS 4+). | [Application Manager](https://webostv.developer.lge.com/develop/references/application-manager) | Native path written but off: `MODE = 'simulate'`, **and** only IDs in `PH.VERIFIED_APP_IDS` (empty) could ever launch natively. |
| ACG: **not supported on webOS 25 and lower**, optional on webOS 26 Re:New, **mandatory on webOS 27+**. | [ACG guide](https://webostv.developer.lge.com/develop/guides/acg-guide) | Nothing needed for this TV. `application.launcher` / `application.query` are documented in `DEPLOYMENT-READINESS.md` §4 in case the TV is ever upgraded. |

### Not confirmed (check on the TV before relying on it)
- **App IDs.** YouTube/Netflix/Prime/Disney+ come from community lists (~2020–2021); HDMI, Live TV and Browser are unverified. **Stremio and Tubi: unknown.**
- **Stremio availability** varies by region.
- Persistence of `localStorage` in a packaged app; glass and motion performance; whether the remote sends repeat keydowns or a long OK press; how `window.close()` behaves.
- Exporting files from the TV (disabled there for now).

## 3. Folder layout

```
CUSTOM-HOME/
├── Start Preview.command    double-click: local server on 127.0.0.1:8642, opens the browser
├── README.md · ARCHITECTURE.md · DEPLOYMENT-READINESS.md · TEST-RESULTS.md · WEATHER.md · BRAND-ASSET-SOURCES.md
├── app/                     ← future webOS package root (only this folder would be packaged)
│   ├── appinfo.json         id local.lgc4.premiumhome, 0.2.0, 1920x1080, handles Back
│   ├── index.html, icon.png, largeIcon.png
│   ├── assets/brands/       6 brand logo SVGs, 18 KB (sources: BRAND-ASSET-SOURCES.md)
│   ├── css/tokens.css, css/app.css
│   └── js/  util · catalog · places · config · platform · focus · widgets · oled · weather · scene · ui · launcher · backup · weather-ui · ambient · views · settings · main
├── tests/
│   ├── config.test.js       Node unit tests (20)
│   └── browser/             smoke tests served at /__tests__/ (22) + fixtures/, never packaged
├── tools/serve.py           local preview server (127.0.0.1 only, no caching, serves /__tests__/)
├── tools/run-browser-tests.py  runs the smoke tests in headless Chrome and prints PASS/FAIL
├── tools/make-icons.py      regenerates the icons (Python stdlib only)
├── tools/brand-assets.py    rebuilds and sanitizes the brand logos from downloaded originals
└── screenshots/             v0.3 Mac-preview captures (not TV captures)
```

## 4. Configuration and restore
- **Schema:** `lg-c4-premium-home/config`, **version 2**.
  - v2 adds `appearance.background` / `effects`, motion `off` and `weather.cityId`.
  - v1 files (v0.1/v0.2) migrate automatically. A v1 `weather.enabled` is reset to off, because it was never consent to go online.
- **Validation never throws.** Wrong file type, newer versions and invalid JSON are rejected with nothing changed.
- **Shortcut and favorite IDs** must be strings **and own keys** of the catalog:
  - `PH.catalogById` is a null-prototype map and `PH.isCatalogId` does an own-property check.
  - Duplicate tracking uses `Set`s.
  - `constructor`, `__proto__`, `toString` and similar are rejected **with a warning**.
  - Non-string IDs and duplicates are reported too. Intentionally empty lists stay empty.
- **Storage:** `localStorage` key `premiumHome.config.v1`. Smoke tests use `…v1.test`, so they never touch your layout.
- **Export / restore:**
  - Export downloads a JSON file (Mac preview only).
  - Restore shows a summary of anything skipped, and focus starts on **Cancel**.
  - This covers Premium Home's own layout only. It is **not** a TV settings backup and not a firmware backup.

## 5. Navigation model
- **Stable keys:** every focusable element has a stable `data-key` and a `data-group`, and re-renders restore focus by key.
- **Left/Right:** stays in the current row (it must overlap the row vertically) and stops at the row's end. The one exception is crossing between `data-region` columns: Settings categories → panel.
- **Up/Down:** goes to the nearest row, then the closest item in it. Inside a region it stays in that column, and leaves only to the tab bar.
- **Tab bar:** entered only with Up or Back. Entering it lands on the **active** tab.
- **Groups:** a row remembers its last-focused item.
- **OK:** acts on release. Holding OK for ≥ 550 ms opens Options; so do **O** and the red key. Apps → Edit shortcuts makes plain OK open the edit menu.

## 6. Design, 4K and OLED (v0.2)
- **Look:** black and charcoal with an icy-blue accent (Glacier and Graphite are alternatives). The Home hero is balanced: time on the left, weekday and date on the right, text only.
- **Tiles:** **original artwork**, not provider logos.
  - Glossy brand-colour monogram badge, plus a large faint monogram mark in the corner and a brand-tinted gradient.
  - **Focus:** crisp double ring (dark gap + accent), slight lift, and the rest of the row recedes.
- **Home rows:**
  - **Favorites:** YouTube, Netflix, Disney+, Stremio, Prime Video, Tubi.
  - **Quick access:** Live TV, Browser, HDMI 1–4, All apps.
  - The row-based layout leaves room for future custom rows.
- **Safe area and text:** everything sits inside the 5% title-safe area. Text is at least 22 px on the 1080p canvas.
- **Burn-in care (app only):**
  - pixel shift ≤ 3 px every 2 min
  - idle dim after 45 s
  - screensaver (default 5 min)
  - text-only hero; bright colour limited to small badges
- The TV's own OLED Care is never read or changed.

## 7. Working vs simulated (v0.2)

| Feature | State |
|---|---|
| Home / Apps / Gaming / Settings; remote-style navigation | Working (Mac preview) |
| Add, remove, hide, unhide, rearrange; Home favorites; Quick access | Working, saved locally |
| Clock and date (12/24 h) | Working (Mac clock) |
| Weather | **Live from Open-Meteo after consent** (tested on the Mac with 2 real calls). Off by default; °C; a default city you can change; 30-min refresh; cache; honest Offline / Last-updated states. Demo scenes are always labelled DEMO. See WEATHER.md |
| Brand logos | Working: 6 bundled SVGs, shown offline; text label kept; falls back to the monogram if a file fails to load |
| Home background | Dynamic weather scene / Cinematic aurora / Minimal; Motion Full / Reduced / Off |
| Opening apps / HDMI inputs | **Simulated** |
| Exit | Preview: simulated. webOS path: our prompt → `window.close()` (stub-tested, **not tested on the TV**) |
| Export / restore | Working in the Mac preview; disabled on the TV |
| Screensaver, pixel shift, idle dim | Working |
| Running on the TV | **Not done.** See `DEPLOYMENT-READINESS.md` |

## 8. Changes in v0.2 (from the review)
1. Hardened config validation: null-prototype catalog, own-key checks, `Set`s, type checks, warnings for everything skipped. Regression tests added.
2. One exit prompt: `window.close()` replaces `platformBack()`.
3. Weather is °C by default, off by default, and shows "Weather not connected" with no numbers.
4. Saved browser smoke tests (15) alongside the Node unit tests (13).
5. Design pass: tiles, focus ring, balanced hero, Quick access row.
6. Navigation fixes found by the new tests: Right at a row's end no longer jumps rows; Up from content lands on the active tab.
7. Per-app native launch allow-list (`PH.VERIFIED_APP_IDS`, empty).
8. New documents: `DEPLOYMENT-READINESS.md` (not executed), the two-tier `../BACKUP-CHECKLIST.md`, `../PRIVACY-DEBLOAT-RESEARCH.md` (research only), and `../RECOVERY/PROJECT-SOURCE-RECOVERY.md`.

## 9. Changes in v0.3 (from the second review)
1. **Cinematic Home:**
   - an original CSS/SVG scene behind the hero: weather-driven skies, sun or moon with a slow drift, stars, clouds, fog, light rain or snow (≤ 36 particles), a boreal-forest silhouette
   - a "Cinematic" aurora mode and "Minimal"
   - no image or video files
2. **Real brand logos** for YouTube, Netflix, Disney+, Stremio, Prime Video and Tubi:
   - downloaded with the owner's approval, then sanitized
   - the light-on-dark adjustments are documented in BRAND-ASSET-SOURCES.md
3. **Live weather** (`weather.js`, `weather-ui.js`, `places.js`):
   - consent-gated, city-level only, CORS-friendly HTTPS, no key, cache and offline states
   - a Weather Details dialog with a 4-day forecast and attribution
4. **Settings:** background style, motion Off, weather effects, live weather on/off, city, refresh, clear cache, demo scene preview.
5. **Schema v2** with migration; the v1 weather flag is never treated as consent.
6. **Remote hints** fade after 6 s of no input.
7. **Tests:** unit 20, browser 21. Screenshots: 12 headless, plus 2 live captures.

## 10. Changes in v0.3.1 (owner request)
1. **Ambient view** (`js/ambient.js`):
   - **How it opens:** press Up once more from the tab bar on Home.
   - **What it shows:** the weather scene fills the screen with large time, date, temperature, condition and city. No icons, tiles or menus.
   - **Getting out:** Back, Down or OK (or a click) returns to Home, with focus on the Home tab.
   - **Settings:** Appearance → Ambient view (On by default).
2. **OLED care:**
   - the text drifts ±60 px over 7 minutes, and pixel shift also applies
   - after 45 s idle it dims to 72%, but the scene keeps moving
   - the screensaver still takes over after its timeout
   - demo data still shows **DEMO**
3. Removed the "Premium Home" label from the top bar. The tabs now line up with the content edge.
4. Tests: browser smoke 22 (new: ambient open/close, no icons, tab bar hidden, setting off, no label).

## 11. Changes in v0.3.2 (third review: pilot preparation)
1. **F2: the screensaver always pauses animation.**
   - Bug: the ambient view's "keep moving when idle" rule outranked the screensaver pause, so **41 animations kept running invisibly** under the screensaver.
   - Fix: a `#stage.saver-on` rule now outranks every class rule.
   - Regression test runs with Full, Reduced and Off motion; resumes after waking.
2. **F3: ambient OLED care.**
   - The ambient view dims to 55% after **30 s**.
   - It always reaches the screensaver: after your setting, or after **10 min** if the screensaver is Off (outside the ambient view, Off still means off).
   - Waking keeps you in the ambient view; Back returns to the Home tab.
   - None of this guarantees burn-in prevention; keep the TV's OLED Care on.
3. **F1: packaging.**
   - LG's official `@webos-tools/cli` 3.2.6 is installed project-locally.
   - `tools/package-ipk.py` validates and builds the `.ipk`, deriving the name and commands from `appinfo.json`.
   - Stale `0.2.0` / `0.3.0` references are removed.
4. **F5: docs.** Precise Developer Mode facts (reboot, limited sessions, apps removed on expiry) and what rollback does and doesn't restore.
5. **Tests:** unit 20, browser smoke 24.

## 12. Changes in v0.4 (consolidated owner brief)

**Config schema v3.** New sections are `ambientMode`, `theme`, `wallpaper`, `watching`, `recents` and `gaming`, plus `oledCare.saverClock`. The `scenic` and `photo` backgrounds are new values for `appearance.background`.
- **Migration:** v2→v3 only adds defaults. v2's `weather.enabled` was real consent, so it is kept (unlike v1's).
- **Validation:** HDMI names go through `PH.cleanLabel`, which strips control and bidi-override characters and caps at 24 characters.
- **Not exported:** Recent, saved titles and the photo live outside the config and are never exported.

**New modules** (plain scripts, same `PH` namespace, no build step):

| File | Role |
|---|---|
| `wallpapers.js` | Catalog of the six bundled scenic SVGs (generated by `tools/make-wallpapers.py`) |
| `daypart.js` | Pure day/night decision: manual, owner hours on the TV clock, or Open-Meteo's `is_day` when weather is on (no extra request) |
| `recents.js` | Launches made **through Premium Home** only; `demo` vs `native` (native = launch request accepted, not playback) |
| `cw.js` / `cw-ui.js` | Continue Watching: provider-agnostic `normalize` / `merge`, manual "Saved for later", declared but unconnected Trakt and Plex/Jellyfin, DEV DEMO fixtures only in test mode |
| `photo.js` | "My photo": checks, downscale, JPEG re-encode (drops EXIF), IndexedDB store, object-URL lifecycle |
| `backdrop.js` | The `#wallpaper` layer: scenic or photo, gallery preview, optional rotation (never counts as input, never saved) |
| `gallery.js` | Bottom-sheet gallery with live full-screen preview |
| `quick.js` | Quick settings side panel (⚙ in the top bar, green key, Q) and the shared option lists (`PH.OPTS`) |
| `gaming.js` | Gaming dashboard: named HDMI inputs, favourite input, game apps, "Unavailable until supported" feature chips |
| `vpn.js` | VPN status with an empty adapter slot: always `not-configured`, never controllable (see VPN-GATEWAY-DESIGN.md) |

**Continue Watching adapter contract** (`cw.js`, adapted from the brief):
- Items carry `provider`, `providerItemId`, `title`, `subtitle`, `serviceId` (catalog id or null), `updatedAt` (ISO; future dates rejected), `isManuallySaved`, `progressPercent` + `progressSource`, `artwork` and `note`.
  - `progressPercent` and `progressSource` are only kept for a non-manual provider that names its source, and only for values 0–100.
  - `artwork` accepts bundled local paths only. A remote-art allow-list comes with a real provider.
- A provider adapter must return documented-API data only. Tokens live in a companion bridge, never in this app.

**OLED policy:**
- **Auto ambient:** 90 s by default; options Off, 30 s, 1, 1.5, 2, 5 and 10 min. Runs only on Home with nothing open, the app visible and no text field active.
- **Ambient dimming:** dims 30 s after the view opens (Low / Medium / Strong).
- **Screensaver:** always reached, with a 10-min fallback. It can be fully black (clock off), with no timer running.
- **Hidden app:** all animation pauses while the app is hidden.
- **Never** fakes input, plays hidden media, sets `screenSaverProperties` or touches LG's OLED Care.

**Magic Remote:**
- **Pointer:** `cursorStateChange` toggles pointer mode, and a D-pad key leaves it. Pointer moves count as input only after 12 px from the last counted position.
- **Wheel:** steps along a row and continues to the next row at the end (140 ms throttle).
- **Held arrows:** throttled to one move per 110 ms.
- **Text fields:** own the keys while focused. Backspace is never Back; OK or Down go to Save.
- **System keys:** Home, volume, power, Settings and voice are never mapped.

**Home layout:** Home scrolls vertically and snaps to whole sections (hero → Favorites → Continue Watching/Saved → Recent → Quick access). `focus.js` scrolls nested containers.

**Wallpaper scrim:** `.wallpaper` has its own stacking context (`z-index: 0`), so its scrim can never cover the tiles. This was a bug caught in the screenshot review.
