# Install Premium Home on an LG webOS TV

Tested on an LG OLED65C4PUA (webOS 25, firmware 33.31.69). Other 2022+ OLEDs on webOS 22–25 should behave the same, but only the C4 has been tried.

## 1. Developer Mode on the TV
1. Install **Developer Mode** from LG's app store and sign in with an LG developer account (free, at webostv.developer.lge.com).
2. Turn **Developer Mode** on and **Key Server** on. Note the passphrase shown on screen.
3. The session runs out after a while. Press **Extend** in the Developer Mode app now and then; if it expires, the TV removes every Developer Mode app (this launcher included) and you reinstall.

## 2. LG's CLI on your computer
```bash
cd launcher
sh tools/setup-webos-cli.sh             # installs @webos-tools/cli into tools/webos-cli (needs Node.js 18+)
B=tools/webos-cli/node_modules/.bin
$B/ares-setup-device                    # add your TV: name it (e.g. "tv"), its IP, port 9922, user prisoner
$B/ares-novacom --device tv --getkey    # type the passphrase from the TV when asked
$B/ares-device --device tv --system-info
```

## 3. Build and install
```bash
python3 -I tools/fetch-logos.py         # optional: downloads the brand logos (see BRAND-ASSET-SOURCES.md)
python3 -B tools/package-ipk.py         # writes dist/local.lgc4.premiumhome_<version>_all.ipk and prints its SHA-256
$B/ares-install --device tv dist/local.lgc4.premiumhome_*_all.ipk
$B/ares-launch  --device tv local.lgc4.premiumhome
```
Open it from LG Home › Apps › Premium Home, or assign it a Quick Access number key (hold a number while it's open).

## 4. First settings
- **Settings › Clock & weather:** your greeting names (kept on the TV only), 12/24-hour time, the weather city and consent.
- **Settings › Wallpaper & theme:** photo pool, favourites, daily change.
- **Settings › Ambient & OLED care:** the 90 s / 10 min / 45 min / 60 min schedule.
- Press Back twice from the dock for "Exit Premium Home?"; the remote's Home button is LG's unless you install the helper.

## 5. Uninstall
```bash
$B/ares-install --device tv --remove local.lgc4.premiumhome
```
or LG Home › Apps › Edit › Delete.

## Preview on your computer
`python3 tools/serve.py` (or double-click `Start Preview.command` on a Mac) serves the app at http://127.0.0.1:8642/ with simulated launches, so you can try the design without a TV.
