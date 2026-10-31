# Weather: how it works, data and privacy (v0.3)

## Provider
- **Open-Meteo** forecast API (`https://api.open-meteo.com/v1/forecast`). It's HTTPS and needs **no API key**, so there's no secret in the app.
- **Terms** (open-meteo.com/en/terms, checked 2026-10-27):
  - The free tier is for **non-commercial use only**; a personal home launcher qualifies.
  - Limits: under 10,000 calls a day, 5,000 an hour and 600 a minute.
  - The data is licensed **CC BY 4.0**.
- **Attribution** ("Weather data by Open-Meteo.com · CC BY 4.0") appears in Weather Details and in Settings → Clock & weather.

## Consent and what is sent
- **Off by default.** Before you consent, Premium Home makes **zero** weather requests (checked by a browser test).
- **Turning it on:** the weather card or Settings → Clock & weather → Live weather shows a consent dialog that explains exactly what is sent. **Cancel** is the default choice.
- **What a request contains:** the chosen city's **approximate centre coordinates**, rounded to 2 decimals. For Toronto, ON, that's `latitude=43.65&longitude=-79.38`, plus the list of fields wanted.
  - There's no GPS, IP lookup, address, account or device ID.
  - As with any internet request, Open-Meteo can see your network's IP address.
- **Changing city:** you pick from a fixed list (`app/js/places.js`). There's no free-text geocoding, so nothing you type is sent anywhere.
- **Old files:** a v0.1/v0.2 config that said "weather on" is **not** treated as consent, and migrates to off. That flag only ever meant "show the placeholder".

## Requests, caching and offline
| Behaviour | Value |
|---|---|
| Refresh | At most every **30 minutes**, only while the app is visible and not in the screensaver |
| After a failure | Waits **5 minutes** before retrying automatically; "Refresh now" retries at once |
| Timeout | 10 s |
| Cache | One trimmed reading (current + 4 days; about 450 bytes) in `localStorage` under `premiumHome.weather.v1`. No history and no coordinates. Settings → Clear weather cache deletes it; turning weather off also clears it. |
| Status shown | **Live · Open-Meteo · time**, **Last updated time** (older than 30 min), **Offline · Last updated…** (failed, cache shown), **Offline · no weather data yet** (failed, no cache: **no numbers shown**) |
| Worst case | 48 scheduled requests a day; failures add at most 12 retries an hour. Both are far below the free limits. |

## Conditions and scenes
- **WMO codes are mapped to these scene families:**
  - clear (0–1), partly cloudy (2), overcast (3), fog (45, 48)
  - drizzle (51–57, shown with the rain scene), rain (61–67, 80–82)
  - snow (71–77, 85–86), thunderstorm (95–99)
- **Day and night** come from `is_day`.
- **Unknown codes** show "Conditions unavailable" and a calm scene, never a guess.

## Demo preview (testing only)
- Settings → Clock & weather → **Preview weather scenes (demo)** cycles through fixed sample conditions (clear day/night, partly cloudy, overcast, fog, rain, snow, thunder).
- Every demo shows a **DEMO** badge and "sample conditions, not live". Demos are never saved and never fetch anything.

## CORS and the TV (not yet verified)
- Open-Meteo replied with `access-control-allow-origin: *` (checked 2026-10-27), so browsers may read the response.
- LG says webOS TV follows the CORS standard. Whether a **packaged** app (`file://` origin) can call it must be checked on the TV.
- No proxy or CORS workaround is used or planned.

## Live test record (2026-10-27, Mac only, with the owner's approval)
- **Call 1:** command line, the author's city. HTTP 200, 973 bytes, `access-control-allow-origin: *`; parsed −2 °C, overcast, feels −5 °C.
- **Call 2:** the real in-app flow in the built-in browser (test storage). Card → OK → consent → **Turn on** → exactly one request → "Live · Open-Meteo · 11:12 a.m." Details showed a 4-day forecast; Back returned focus to the card.
- **Automated tests never contact Open-Meteo.** They use a stubbed `fetch` and a saved copy of call 1 (`tests/browser/fixtures/open-meteo-fort-mcmurray.json`).
