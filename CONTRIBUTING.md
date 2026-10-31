# Contributing

- **Bugs:** open an issue with the "Bug report" template (TV model, webOS version, app version, steps).
- **Ideas:** open an issue with the "Feature request" template, or start a discussion.
- **Pull requests:** welcome. Keep the app plain HTML/CSS/JS with no build step, run `node --test tests/config.test.js` and `python3 -B tools/run-browser-tests.py` in `launcher/`, and don't add anything that fakes a result on the TV (no invented launches, settings, weather or "installed" states).
- **Never commit:** TV addresses, passphrases, keys, personal names or photos, or brand logo files (they're fetched by `tools/fetch-logos.py`).
- **The helper** takes over the remote. Changes to `helper/` need the Docker test run (`sh tools/run-all.sh`) to pass, and a note on what was tested on real hardware.
