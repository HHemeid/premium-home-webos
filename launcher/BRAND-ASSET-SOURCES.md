# Brand asset sources

**Not bundled in this repository.** Run `python3 -I tools/fetch-logos.py` once: it downloads each original from the source below, verifies its SHA-256, and builds `app/assets/brands/*.svg` with only the colour changes listed here. Without it the launcher shows monogram tiles.

## Trademark notice (applies to all six)
- These logos are **trademarks of their owners**: Google (YouTube), Netflix, Disney, Stremio, Amazon, Tubi/Fox. None of them endorses this project.
- They're used only to label shortcuts in a **personal, non-commercial** launcher, so you can recognise which app a tile opens.
- A licence on the image file (CC0, or public domain as a "text logo") does **not** remove trademark rights.
- Don't use these files for anything else, and don't publish the app with them without checking each brand's current guidelines.
- A logo on a tile does **not** mean the app is installed or launchable. Launches are still simulated.

## Files

| Tile | Output file | Source (downloaded original) | Licence / status of the file | Original SHA-256 |
|---|---|---|---|---|
| YouTube | `youtube.svg` | Simple Icons `icons/youtube.svg`. Simple Icons lists the brand source and guidelines as <https://www.youtube.com/howyoutubeworks/resources/brand-resources/#logos-icons-and-colors> | Simple Icons project CC0; trademark of Google | `5038808acbbc4e6edda16cbeb1cc6dec80e4e4ee4e227e039c41229fa222aa8c` |
| Netflix | `netflix.svg` | Simple Icons `icons/netflix.svg`. Source and guidelines: <https://brand.netflix.com/en/assets/logos> | Simple Icons CC0; trademark of Netflix | `67dbc495988bd5667a09ed4f56e14db4070a44c7a74e297b146c229f70fd6f6e` |
| Stremio | `stremio.svg` | Simple Icons `icons/stremio.svg`. Source: Stremio's own brand repo (`Stremio/stremio-brand`, icon-only full colour) | Simple Icons CC0; trademark of Stremio | `88b47bc8690fee5b98ba89972446d4ad86c7f14f77dc6a1260ec1ba8f506130b` |
| Tubi | `tubi.svg` | Simple Icons `icons/tubi.svg`. Source listed: <https://gdpr.tubi.tv> | Simple Icons CC0; trademark of Tubi | `676ed4e503226dd4399405e80c99e97119809e5b6d5c31b9c413edf59d8b6b76` |
| Disney+ | `disneyplus.svg` | Wikimedia Commons `File:Disney+_logo.svg` (<https://upload.wikimedia.org/wikipedia/commons/3/3e/Disney%2B_logo.svg>). Author: Disney Enterprises, Inc. | Commons: **public domain (PD-textlogo)**, plus a trademark notice | `ad0ea07cb6627c268dae721d9647019e6e3ce1b51c8f4ba8ec8ddf4618546140` |
| Prime Video | `primevideo.svg` | Wikimedia Commons `File:Amazon_Prime_Video_logo.svg` (<https://upload.wikimedia.org/wikipedia/commons/1/11/Amazon_Prime_Video_logo.svg>). Author: Amazon | Commons: **public domain (PD-textlogo)**, plus a trademark notice | `8aaa625b2e8a8ba5247e1035e111b73feb312df08c9ff04e2ef59240595f29a2` |

Simple Icons repository: <https://github.com/simple-icons/simple-icons> (`develop` branch, 2026-10-27). Its disclaimer says the project's CC0 doesn't cover individual brands' rights, and that users must follow each brand's guidelines.

**Not in Simple Icons:** Disney+ and Prime Video. Their icons returned 404, apparently removed, so they came from Wikimedia Commons instead.

## Changes made (by `tools/brand-assets.py`, reproducible)

| File | Change | Why |
|---|---|---|
| all | Sanitized: removed comments, metadata, inline styles, and any scripts or external references; dropped fixed width/height | Safety and scaling |
| YouTube, Netflix, Stremio | Filled with each brand's colour from Simple Icons' data (`#FF0000`, `#E50914`, `#685CEE`) | Simple Icons files have no colour |
| YouTube, Stremio | Added a white triangle under the play cut-out | Matches the brands' full-colour icons (white play mark) |
| Tubi | Wordmark rendered **white** on a Tubi-purple (`#7408FF`) tile; viewBox cropped to the wordmark (no scaling or distortion) | Purple-on-black is unreadable at TV distance. **Deviation:** check Tubi's current guidance before any wider use. |
| Disney+ | All colours rendered **white** on a deep-blue tile | The original navy is invisible on black. **Deviation:** a light-on-dark presentation. |
| Prime Video | Navy text (`#232F3E`) → white; the blue smile (`#00A8E1`) kept | Same reason. **Deviation:** a light-on-dark presentation. |

Aspect ratios are never changed. Logos scale proportionally inside a fixed box.

## How to regenerate or replace
1. Download the originals from the URLs above into a new, empty folder.
2. Run `python3 -I tools/brand-assets.py <that folder>`.

Replacement official files from a brand's press kit also work: keep the same file names, and update this table.

## Added 2026-10-31 (v0.9.4): every shortcut gets an icon
| Tile | Output file | Source (downloaded original) | Licence / status | Original SHA-256 |
|---|---|---|---|---|
| Twitch | `twitch.svg` | Simple Icons `icons/twitch.svg` (`develop`, 2026-10-31) | Simple Icons CC0; trademark of Twitch/Amazon. Change: `fill="#ffffff"` added (white glyph on a purple plate) | `dbe27bc02a01b8d89b6259cacef328c9fa70bb13c29f38c36eb1421863f6f0b6` |
| Xbox | `xbox.svg` | Wikimedia Commons `File:Xbox_logo_(2019).svg`, author Microsoft | Commons: **public domain** (text/simple-shape logo), marked **trademarked**. Changes: `fill="#ffffff"`, and `viewBox` added in place of fixed width/height | `3125ef256b609370346686a681d821b52f043e0e16996e190e90b1b59b78f377` |
| GeForce NOW | `geforcenow.svg` | Wikimedia Commons `File:GeForce_Now_logo_(2022).svg`, author Nvidia | Commons: **public domain** (text logo), marked **trademarked**. Unchanged | `7d0d92eabc36f8c3873a081356de0c7c1e3e04c93d2bfe8f9ba363570a48b96c` |
| Web Browser, Live TV, HDMI 1–4 | `browser.svg`, `livetv.svg`, `hdmi1.svg`…`hdmi4.svg` | Drawn for this app (line glyphs, no brand) | Part of this project | — |

- Simple Icons no longer carries Xbox or GeForce NOW icons (404), so those came from Commons like Disney+ and Prime Video.
- All downloaded files were checked for scripts, event handlers, external references and `foreignObject`: none.
